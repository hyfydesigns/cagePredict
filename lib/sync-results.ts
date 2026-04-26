import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  isConfigured as isApiSportsConfigured,
  getFightsByDate,
  apiSportsIdToUuid,
  uuidToApiSportsId,
  UFC_LEAGUE_ID,
} from '@/lib/apis/api-sports'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Offset a YYYY-MM-DD string by ±N days */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // noon UTC avoids DST edge cases
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

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
      // Try the stored date first; if it returns nothing, also try ±1 day
      // (handles timezone offsets introduced during import)
      const datesToTry = [dateStr, offsetDate(dateStr, -1), offsetDate(dateStr, 1)]
      let foundFights: typeof apiFights = []

      for (const tryDate of datesToTry) {
        const allFights = await getFightsByDate(tryDate, false)
        const ufcFights = allFights.filter(
          (f: any) =>
            f.league?.id === UFC_LEAGUE_ID ||
            f.league?.name?.toLowerCase().includes('ufc') ||
            f.event?.name?.toLowerCase().includes('ufc') ||
            f.slug?.toLowerCase().includes('ufc') ||       // new api-sports format
            f.competition?.name?.toLowerCase().includes('ufc') ||
            f.tournament?.name?.toLowerCase().includes('ufc') ||
            // Last resort: if no discriminating field at all, include everything
            (!f.league && !f.event && !f.slug)
        )
        log.push(`  [${tryDate}] ${allFights.length} total, ${ufcFights.length} UFC`)
        if (allFights.length > 0 && ufcFights.length === 0) {
          const sample = allFights[0]
          log.push(`  Sample fight keys: ${Object.keys(sample).join(', ')}`)
          log.push(`  Sample event: ${JSON.stringify((sample as any).event ?? (sample as any).competition ?? (sample as any).tournament ?? 'none')}`)
        }
        if (ufcFights.length > 0) {
          foundFights = ufcFights
          break
        }
      }
      apiFights = foundFights
    } catch (e: any) {
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    for (const apiFight of apiFights) {
      const fightUuid = apiSportsIdToUuid(apiFight.id, 'fight')
      const f1Name    = apiFight.fighters.first?.name ?? 'TBA'
      const f2Name    = apiFight.fighters.second?.name ?? 'TBA'

      // Primary match: by UUID (api-sports imported events)
      let dbFight = dbFights.find((f: any) => f.id === fightUuid)

      // Fallback: match by fighter names (handles RapidAPI-imported events where
      // UUIDs use a different prefix and will never match directly)
      if (!dbFight) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
        const f1n = norm(f1Name)
        const f2n = norm(f2Name)
        dbFight = dbFights.find((f: any) => {
          const d1 = norm(f.fighter1?.name ?? '')
          const d2 = norm(f.fighter2?.name ?? '')
          return (d1 === f1n && d2 === f2n) || (d1 === f2n && d2 === f1n)
        })
        if (dbFight) {
          log.push(`  Name-matched ${f1Name} vs ${f2Name} → DB fight ${dbFight.id}`)
        }
      }

      if (!dbFight) {
        skipped.push(`No DB match for api-sports fight ${apiFight.id} (${f1Name} vs ${f2Name})`)
        continue
      }

      // status is { long, short } object in new api-sports format (or null)
      const statusLong = (typeof apiFight.status === 'object' && apiFight.status !== null
        ? apiFight.status.long ?? apiFight.status.short ?? ''
        : String(apiFight.status ?? '')).toLowerCase()
      const isFinished  = ['finished', 'final', 'fin'].includes(statusLong)
      const isCancelled = ['cancelled', 'canceled', 'postponed', 'canc'].includes(statusLong)
      const method     = mapResultType(apiFight.result?.type ?? null)
      const round      = apiFight.result?.round ?? null
      const clockTime  = apiFight.result?.clock ?? null

      if (isCancelled && dbFight.status !== 'cancelled') {
        const { error } = await supabase.from('fights').update({ status: 'cancelled' }).eq('id', dbFight.id)
        if (error) errors.push(`cancel(${dbFight.id}): ${error.message}`)
        else log.push(`✗ ${f1Name} vs ${f2Name} → cancelled`)
        continue
      }

      if (dbFight.status === 'completed') {
        log.push(`  ⏭ ${f1Name} vs ${f2Name} already completed`)
        continue
      }

      if (!isFinished) {
        log.push(`  ⏳ ${f1Name} vs ${f2Name} — status: "${statusLong}"`)
        continue
      }

      // Determine winner UUID (draw / no contest = null winner)
      // New format: fighters.first.winner / fighters.second.winner booleans
      // Legacy format: apiFight.winner object
      const resultType = apiFight.result?.type?.toLowerCase() ?? ''
      const isDraw = resultType.includes('draw') || resultType.includes('no contest') ||
        (!apiFight.fighters.first?.winner && !apiFight.fighters.second?.winner && !apiFight.winner)

      let winnerUuid: string | null = null
      if (!isDraw) {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
        // New format: use winner boolean flags
        if (apiFight.fighters.first?.winner) {
          const apiWinnerName = apiFight.fighters.first.name
          winnerUuid = norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)
            ? dbFight.fighter1?.id
            : norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)
              ? dbFight.fighter2?.id
              : apiSportsIdToUuid(apiFight.fighters.first.id, 'fighter')
        } else if (apiFight.fighters.second?.winner) {
          const apiWinnerName = apiFight.fighters.second.name
          winnerUuid = norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)
            ? dbFight.fighter2?.id
            : norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)
              ? dbFight.fighter1?.id
              : apiSportsIdToUuid(apiFight.fighters.second.id, 'fighter')
        } else if (apiFight.winner) {
          // Legacy format fallback
          const apiWinnerId   = apiFight.winner.id
          const apiWinnerName = apiFight.winner.name
          const apiWinnerUuid = apiSportsIdToUuid(apiWinnerId, 'fighter')
          if (norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)) {
            winnerUuid = dbFight.fighter1?.id
          } else if (norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)) {
            winnerUuid = dbFight.fighter2?.id
          } else {
            winnerUuid = apiWinnerUuid
          }
        }
      }

      const dbFightId = dbFight.id  // use actual DB fight ID (may differ from fightUuid if name-matched)

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  dbFightId,
        p_winner_id: winnerUuid,
        p_method:    isDraw ? (method ?? 'Draw') : method,
        p_round:     round,
        p_time:      clockTime,
      } as any)

      if (rpcErr) {
        errors.push(`complete_fight(${dbFightId}): ${rpcErr.message}`)
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
