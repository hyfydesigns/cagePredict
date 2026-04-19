import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  isConfigured as isApiSportsConfigured,
  getFightsByDate,
  apiSportsIdToUuid,
  uuidToApiSportsId,
} from '@/lib/apis/api-sports'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Convert a RapidAPI integer ID to a deterministic UUID (legacy) */
function rapidApiIdToUuid(id: number, type: 'fighter' | 'event' | 'fight'): string {
  const prefix = type === 'fighter' ? '1' : type === 'event' ? '2' : '3'
  const padded = String(id).padStart(12, '0')
  return `00000000-0000-000${prefix}-0000-${padded}`
}

function mapMethod(winType: string): string {
  const map: Record<string, string> = {
    UD: 'Decision (Unanimous)', SD: 'Decision (Split)', MD: 'Decision (Majority)',
    TKO: 'TKO', KO: 'KO', SUB: 'Submission', DQ: 'Disqualification', NC: 'No Contest', RTD: 'RTD',
  }
  return map[winType] ?? winType
}

function mapResultType(type: string | null): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    'KO/TKO': 'KO/TKO',
    'KO': 'KO',
    'TKO': 'TKO',
    'Submission': 'Submission',
    'Decision': 'Decision',
    'Unanimous Decision': 'Decision (Unanimous)',
    'Split Decision': 'Decision (Split)',
    'Majority Decision': 'Decision (Majority)',
    'Draw': 'Draw',
    'No Contest': 'No Contest',
    'DQ': 'Disqualification',
    'RTD': 'RTD',
  }
  return map[type] ?? type
}

export type SyncResultsOutput = {
  success: boolean
  synced: number
  errors: string[]
  log: string[]
  skipped: string[]
  checkedAt: string
  provider: 'api-sports' | 'rapidapi'
  error?: string
}

// ─── api-sports.io sync ───────────────────────────────────────────────────────

async function syncViaApiSports(
  liveEvents: any[],
  supabase: ReturnType<typeof createServiceClient>,
  log: string[],
  errors: string[],
  skipped: string[],
): Promise<number> {
  let synced = 0

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []
    const d     = new Date(event.date)
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    log.push(`[api-sports] Checking ${event.name} (${dbFights.length} DB fights) for ${dateStr}`)

    let apiFights: Awaited<ReturnType<typeof getFightsByDate>>
    try {
      apiFights = await getFightsByDate(dateStr, true)
      log.push(`  API returned ${apiFights.length} fight(s)`)
    } catch (e: any) {
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    for (const apiFight of apiFights) {
      const fightUuid = apiSportsIdToUuid(apiFight.id, 'fight')
      const dbFight   = dbFights.find((f: any) => f.id === fightUuid)
      const f1Name    = apiFight.fighters.first.name
      const f2Name    = apiFight.fighters.second.name

      if (!dbFight) {
        skipped.push(`No DB match for api-sports fight ${apiFight.id} (${f1Name} vs ${f2Name}) → ${fightUuid}`)
        continue
      }

      const status     = apiFight.status.toLowerCase()
      const isFinished = ['finished', 'final'].includes(status)
      const isCancelled = ['cancelled', 'canceled', 'postponed'].includes(status)
      const method     = mapResultType(apiFight.result?.type ?? null)
      const round      = apiFight.result?.round ?? null
      const clockTime  = apiFight.result?.clock ?? null

      if (isCancelled && dbFight.status !== 'cancelled') {
        const { error } = await supabase.from('fights').update({ status: 'cancelled' }).eq('id', fightUuid)
        if (error) errors.push(`cancel(${fightUuid}): ${error.message}`)
        else log.push(`✗ ${f1Name} vs ${f2Name} → cancelled`)
        continue
      }

      if (dbFight.status === 'completed') {
        log.push(`  ⏭ ${f1Name} vs ${f2Name} already completed`)
        continue
      }

      if (!isFinished) {
        log.push(`  ⏳ ${f1Name} vs ${f2Name} — status: "${apiFight.status}"`)
        continue
      }

      // Determine winner UUID (draw / no contest = null winner)
      const isDraw = !apiFight.winner ||
        apiFight.result?.type?.toLowerCase().includes('draw') ||
        apiFight.result?.type?.toLowerCase().includes('no contest')

      let winnerUuid: string | null = null
      if (!isDraw && apiFight.winner) {
        const winnerId = apiFight.winner.id
        winnerUuid = apiSportsIdToUuid(winnerId, 'fighter')
      }

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  fightUuid,
        p_winner_id: winnerUuid,
        p_method:    isDraw ? (method ?? 'Draw') : method,
        p_round:     round,
        p_time:      clockTime,
      } as any)

      if (rpcErr) {
        errors.push(`complete_fight(${fightUuid}): ${rpcErr.message}`)
      } else {
        synced++
        const winner = isDraw ? 'Draw' : apiFight.winner?.name ?? '?'
        log.push(`✓ ${f1Name} vs ${f2Name} → ${winner} (${method ?? 'unknown'}, R${round ?? '?'})`)
      }
    }
  }

  return synced
}

// ─── RapidAPI sync (legacy fallback) ─────────────────────────────────────────

async function syncViaRapidApi(
  liveEvents: any[],
  supabase: ReturnType<typeof createServiceClient>,
  log: string[],
  errors: string[],
  skipped: string[],
): Promise<number> {
  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'

  if (!key) {
    errors.push('RAPIDAPI_KEY not configured')
    return 0
  }

  let synced = 0

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []
    const d     = new Date(event.date)
    const day   = d.getUTCDate()
    const month = d.getUTCMonth() + 1
    const year  = d.getUTCFullYear()

    log.push(`[rapidapi] Checking ${event.name} (${dbFights.length} DB fights) for ${year}-${month}-${day}`)

    const url = `https://${host}/api/mma/unique-tournament/19906/schedules/${day}/${month}/${year}`
    let apiFights: any[]
    try {
      const res = await fetch(url, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
        cache: 'no-store',
      })
      if (!res.ok) {
        errors.push(`API ${res.status} for ${event.name}`)
        continue
      }
      const data = await res.json()
      apiFights  = data.events ?? []
      log.push(`  API returned ${apiFights.length} fights`)
    } catch (e: any) {
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    for (const apiFight of apiFights) {
      const fightUuid = rapidApiIdToUuid(apiFight.id, 'fight')
      const dbFight   = dbFights.find((f: any) => f.id === fightUuid)
      const home      = apiFight.homeTeam?.name ?? '?'
      const away      = apiFight.awayTeam?.name ?? '?'

      if (!dbFight) {
        skipped.push(`No DB match for API fight ${apiFight.id} (${home} vs ${away}) → uuid ${fightUuid}`)
        continue
      }

      const apiStatus  = (apiFight.status?.type ?? apiFight.statusType ?? '').toLowerCase()
      const isFinished = ['finished', 'complete', 'ended', 'after'].includes(apiStatus)
      const method     = apiFight.winType ? mapMethod(apiFight.winType) : null
      const round      = apiFight.finalRound ?? null

      if (['cancelled', 'canceled', 'postponed', 'abandoned'].includes(apiStatus) && dbFight.status !== 'cancelled') {
        const { error } = await supabase.from('fights').update({ status: 'cancelled' }).eq('id', fightUuid)
        if (error) errors.push(`cancel(${fightUuid}): ${error.message}`)
        else log.push(`✗ ${home} vs ${away} → cancelled`)
        continue
      }

      if (dbFight.status === 'completed') {
        log.push(`  ⏭ ${home} vs ${away} already completed in DB`)
        continue
      }

      if (!isFinished) {
        log.push(`  ⏳ ${home} vs ${away} — API status: "${apiStatus}", winnerCode: ${apiFight.winnerCode ?? 'null'}`)
        continue
      }

      if (apiFight.winnerCode === 0) {
        const { error } = await supabase.rpc('complete_fight', {
          p_fight_id:  fightUuid,
          p_winner_id: null,
          p_method:    method ?? 'Draw',
          p_round:     round,
          p_time:      null,
        } as any)
        if (error) errors.push(`draw(${fightUuid}): ${error.message}`)
        else log.push(`🤝 ${home} vs ${away} → Draw (${method ?? 'Draw'})`)
        continue
      }

      if (!apiFight.winnerCode) {
        log.push(`  ⚠ ${home} vs ${away} — finished but winnerCode is null/undefined`)
        continue
      }

      const winnerApiId = apiFight.winnerCode === 1 ? apiFight.homeTeam?.id : apiFight.awayTeam?.id
      if (!winnerApiId) {
        errors.push(`No winner team ID for fight ${apiFight.id} (${home} vs ${away})`)
        continue
      }

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  fightUuid,
        p_winner_id: rapidApiIdToUuid(winnerApiId, 'fighter'),
        p_method:    method,
        p_round:     round,
        p_time:      null,
      } as any)

      if (rpcErr) {
        errors.push(`complete_fight(${fightUuid}): ${rpcErr.message}`)
      } else {
        synced++
        const winner = apiFight.winnerCode === 1 ? home : away
        log.push(`✓ ${home} vs ${away} → ${winner} (${method ?? 'unknown'}, R${round ?? '?'})`)
      }
    }
  }

  return synced
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runSyncResults(): Promise<SyncResultsOutput> {
  const provider: 'api-sports' | 'rapidapi' = isApiSportsConfigured() ? 'api-sports' : 'rapidapi'

  // Check at least one API key is available
  if (provider === 'rapidapi' && !process.env.RAPIDAPI_KEY) {
    return {
      success: false, synced: 0, provider,
      errors: ['No API key configured — set APISPORTS_KEY (preferred) or RAPIDAPI_KEY'],
      log: [], skipped: [], checkedAt: new Date().toISOString(),
    }
  }

  const supabase = createServiceClient()

  const { data: liveEvents, error: evErr } = await supabase
    .from('events')
    .select('id, date, name, fights(id, status, fighter1_id, fighter2_id, winner_id)')
    .eq('status', 'live')

  if (evErr) {
    return { success: false, synced: 0, provider, errors: [evErr.message], log: [], skipped: [], checkedAt: new Date().toISOString() }
  }

  if (!liveEvents?.length) {
    return { success: true, synced: 0, provider, errors: [], log: ['No live events to sync'], skipped: [], checkedAt: new Date().toISOString() }
  }

  const errors: string[] = []
  const log: string[] = []
  const skipped: string[] = []

  const synced = provider === 'api-sports'
    ? await syncViaApiSports(liveEvents, supabase, log, errors, skipped)
    : await syncViaRapidApi(liveEvents, supabase, log, errors, skipped)

  if (synced > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/leaderboard')
    revalidatePath('/admin')
  }

  return { success: true, synced, provider, errors, log, skipped, checkedAt: new Date().toISOString() }
}
