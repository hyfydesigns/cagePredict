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

  // 1. All completed fights for this event
  const { data: fights } = await supabase
    .from('fights')
    .select('id, winner_id')
    .eq('event_id', eventId)
    .eq('status', 'completed')

  if (!fights?.length) {
    return { correct: 0, wrong: 0, draws: 0, basePts: 0, streakPts: 0, totalPts: 0 }
  }

  // 2. This user's predictions for those fights
  const { data: preds } = await supabase
    .from('predictions')
    .select('fight_id, is_confidence, is_correct, points_earned')
    .eq('user_id', userId)
    .in('fight_id', fights.map((f) => f.id))

  const predMap = Object.fromEntries((preds ?? []).map((p: any) => [p.fight_id, p]))

  let correct = 0, wrong = 0, draws = 0, basePts = 0, streakPts = 0

  for (const fight of fights as any[]) {
    const pred = predMap[fight.id]
    if (!pred) continue

    if (!fight.winner_id) {
      draws++
      continue
    }

    const base = pred.is_confidence ? 20 : 10

    if (pred.is_correct) {
      correct++
      const earned = pred.points_earned > 0 ? pred.points_earned : base
      basePts   += base
      streakPts += Math.max(0, earned - base)
    } else {
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
