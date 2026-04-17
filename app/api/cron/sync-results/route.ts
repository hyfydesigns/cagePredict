import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/sync-results
 *
 * For every live event, fetches the RapidAPI MMA schedule for that date,
 * detects finished fights, and automatically calls complete_fight() to
 * score predictions — no admin interaction required.
 *
 * Run every 3–5 minutes while an event is live.
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 *
 * RapidAPI fight result fields used:
 *   fight.winnerCode  — 1 = homeTeam won, 2 = awayTeam won, 0 = no result yet
 *   fight.winType     — UD / SD / MD / TKO / KO / SUB / DQ / NC / RTD
 *   fight.finalRound  — round number the fight ended
 */

// ── Helpers (mirrors lib/actions/admin.ts, kept local to avoid server-action constraints) ──

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

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) {
    return NextResponse.json({ error: 'RAPIDAPI_KEY not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()

  // Fetch all live events with their fights
  const { data: liveEvents, error: evErr } = await supabase
    .from('events')
    .select('id, date, name, fights(id, status, fighter1_id, fighter2_id, winner_id)')
    .eq('status', 'live')

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 500 })
  if (!liveEvents?.length) {
    return NextResponse.json({ message: 'No live events to sync', synced: 0 })
  }

  let synced = 0
  const errors: string[] = []
  const log: string[] = []

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []

    // Parse UTC date components for the RapidAPI URL
    const d     = new Date(event.date)
    const day   = d.getUTCDate()
    const month = d.getUTCMonth() + 1
    const year  = d.getUTCFullYear()

    // ── Fetch RapidAPI schedule for this event's date ──────────────────────
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
    } catch (e: any) {
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    // ── Process each fight that has a result ──────────────────────────────
    for (const apiFight of apiFights) {
      // winnerCode 0 = no result yet
      if (!apiFight.winnerCode || apiFight.winnerCode === 0) continue

      const fightUuid = apiIdToUuid(apiFight.id, 'fight')

      // Skip if already scored
      const dbFight = dbFights.find((f: any) => f.id === fightUuid)
      if (!dbFight || dbFight.status === 'completed') continue

      // Resolve winner — homeTeam = fighter1, awayTeam = fighter2
      const winnerApiId = apiFight.winnerCode === 1
        ? apiFight.homeTeam?.id
        : apiFight.awayTeam?.id
      if (!winnerApiId) continue
      const winnerUuid = apiIdToUuid(winnerApiId, 'fighter')

      const method = apiFight.winType   ? mapMethod(apiFight.winType) : null
      const round  = apiFight.finalRound ?? null

      // Call the complete_fight RPC — scores all predictions, updates streaks/points
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
        const home = apiFight.homeTeam?.name ?? '?'
        const away = apiFight.awayTeam?.name ?? '?'
        const winner = apiFight.winnerCode === 1 ? home : away
        log.push(`✓ ${home} vs ${away} → ${winner} (${method ?? 'unknown method'}, R${round ?? '?'})`)
      }
    }
  }

  if (synced > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/leaderboard')
    revalidatePath('/admin')
  }

  return NextResponse.json({ success: true, synced, errors, log, checkedAt: new Date().toISOString() })
}
