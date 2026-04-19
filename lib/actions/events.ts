'use server'

import { createClient } from '@/lib/supabase/server'
import type { EventWithFights } from '@/types/database'

export type EventStats = {
  correct: number
  wrong: number
  draws: number
  basePts: number
  streakPts: number
  totalPts: number
}

/**
 * Fetch authoritative points breakdown for a user's picks in a specific event.
 * Reads directly from predictions.points_earned (set by complete_fight RPC)
 * so base + streak are always accurate without any client-side computation.
 *
 * Uses two separate queries joined in JS to avoid unreliable embedded-table
 * filters in PostgREST (`.eq('predictions.user_id', …)` can return wrong rows).
 */
export async function getEventStats(eventId: string, userId: string): Promise<EventStats> {
  const supabase = await createClient()

  // 1. ALL fights for this event (any status — we don't filter by 'completed'
  //    because complete_fight() may have scored predictions without the fight
  //    status being updated if there was a partial failure)
  const { data: fights } = await supabase
    .from('fights')
    .select('id, winner_id, status')
    .eq('event_id', eventId)

  if (!fights?.length) {
    return { correct: 0, wrong: 0, draws: 0, basePts: 0, streakPts: 0, totalPts: 0 }
  }

  const fightMap = Object.fromEntries((fights as any[]).map((f) => [f.id, f]))

  // 2. This user's predictions for those fights
  const { data: preds } = await supabase
    .from('predictions')
    .select('fight_id, is_confidence, is_correct, points_earned')
    .eq('user_id', userId)
    .in('fight_id', fights.map((f: any) => f.id))

  let correct = 0, wrong = 0, draws = 0, basePts = 0, streakPts = 0

  for (const pred of (preds ?? []) as any[]) {
    const fight = fightMap[pred.fight_id]
    if (!fight) continue

    // Only include scored predictions (either completed fight or points already earned)
    const isScored = fight.status === 'completed' || pred.points_earned > 0 || pred.is_correct === true || pred.is_correct === false

    // Skip fights that haven't finished yet (upcoming/live with no result)
    if (fight.status !== 'completed' && pred.is_correct === null) continue

    if (!fight.winner_id && fight.status === 'completed') {
      draws++
      continue
    }

    const base = pred.is_confidence ? 20 : 10

    if (pred.is_correct) {
      correct++
      const earned = pred.points_earned > 0 ? pred.points_earned : base
      basePts   += base
      streakPts += Math.max(0, earned - base)
    } else if (pred.is_correct === false) {
      wrong++
    }
  }

  return { correct, wrong, draws, basePts, streakPts, totalPts: basePts + streakPts }
}

export async function getActiveEvents(): Promise<EventWithFights[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('events')
    .select(`
      *,
      fights(
        *,
        fighter1:fighters!fights_fighter1_id_fkey(*),
        fighter2:fighters!fights_fighter2_id_fkey(*)
      )
    `)
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })
    .limit(4)

  return ((data ?? []) as any[]).map((e: any) => ({
    ...e,
    fights: ((e.fights ?? []) as any[]).sort((a: any, b: any) => b.display_order - a.display_order),
  })) as EventWithFights[]
}
