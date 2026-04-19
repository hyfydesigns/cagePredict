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
 */
export async function getEventStats(eventId: string, userId: string): Promise<EventStats> {
  const supabase = await createClient()

  // Get all completed fights for this event with the user's predictions
  const { data } = await supabase
    .from('fights')
    .select(`
      id,
      winner_id,
      predictions!inner(
        predicted_winner_id,
        is_confidence,
        is_correct,
        points_earned
      )
    `)
    .eq('event_id', eventId)
    .eq('status', 'completed')
    .eq('predictions.user_id', userId)

  const rows = (data ?? []) as any[]

  let correct = 0, wrong = 0, draws = 0, basePts = 0, streakPts = 0

  for (const fight of rows) {
    const pred = fight.predictions?.[0]
    if (!pred) continue

    if (!fight.winner_id) {
      // Draw — prediction voided
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
