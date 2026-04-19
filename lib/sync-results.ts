import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function apiIdToUuid(id: number, type: 'fighter' | 'event' | 'fight'): string {
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

export type SyncResultsOutput = {
  success: boolean
  synced: number
  errors: string[]
  log: string[]
  skipped: string[]
  checkedAt: string
  error?: string
}

export async function runSyncResults(): Promise<SyncResultsOutput> {
  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'

  if (!key) {
    return { success: false, synced: 0, errors: ['RAPIDAPI_KEY not configured'], log: [], skipped: [], checkedAt: new Date().toISOString() }
  }

  const supabase = createServiceClient()

  const { data: liveEvents, error: evErr } = await supabase
    .from('events')
    .select('id, date, name, fights(id, status, fighter1_id, fighter2_id, winner_id)')
    .eq('status', 'live')

  if (evErr) {
    return { success: false, synced: 0, errors: [evErr.message], log: [], skipped: [], checkedAt: new Date().toISOString() }
  }

  if (!liveEvents?.length) {
    return { success: true, synced: 0, errors: [], log: ['No live events to sync'], skipped: [], checkedAt: new Date().toISOString() }
  }

  let synced = 0
  const errors: string[] = []
  const log: string[] = []
  const skipped: string[] = []

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []

    const d     = new Date(event.date)
    const day   = d.getUTCDate()
    const month = d.getUTCMonth() + 1
    const year  = d.getUTCFullYear()

    log.push(`Checking ${event.name} (${dbFights.length} DB fights) for ${year}-${month}-${day}`)

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
      const fightUuid = apiIdToUuid(apiFight.id, 'fight')
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
        const { error: cancelErr } = await supabase
          .from('fights').update({ status: 'cancelled' }).eq('id', fightUuid)
        if (cancelErr) errors.push(`cancel(${fightUuid}): ${cancelErr.message}`)
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
        const { error: drawErr } = await supabase.rpc('complete_fight', {
          p_fight_id:  fightUuid,
          p_winner_id: null,
          p_method:    method ?? 'Draw',
          p_round:     round,
          p_time:      null,
        } as any)
        if (drawErr) errors.push(`draw(${fightUuid}): ${drawErr.message}`)
        else log.push(`🤝 ${home} vs ${away} → Draw (${method ?? 'Draw'})`)
        continue
      }

      if (!apiFight.winnerCode) {
        log.push(`  ⚠ ${home} vs ${away} — finished but winnerCode is null/undefined`)
        continue
      }

      const winnerApiId = apiFight.winnerCode === 1
        ? apiFight.homeTeam?.id
        : apiFight.awayTeam?.id
      if (!winnerApiId) {
        errors.push(`No winner team ID for fight ${apiFight.id} (${home} vs ${away})`)
        continue
      }
      const winnerUuid = apiIdToUuid(winnerApiId, 'fighter')

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  fightUuid,
        p_winner_id: winnerUuid,
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

  if (synced > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/leaderboard')
    revalidatePath('/admin')
  }

  return { success: true, synced, errors, log, skipped, checkedAt: new Date().toISOString() }
}
