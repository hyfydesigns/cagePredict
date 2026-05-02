'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isFightLocked } from '@/lib/utils'

type ActionResult = { error?: string; success?: boolean }

export async function upsertPrediction(
  fightId: string,
  predictedWinnerId: string,
  predictedMethod?: string | null,
  predictedRound?: number | null,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be logged in to make predictions' }

  const { data: fight } = await supabase
    .from('fights')
    .select('id, fight_time, status, fighter1_id, fighter2_id, event_id')
    .eq('id', fightId)
    .single()

  const f = fight as any
  if (!f) return { error: 'Fight not found' }
  if (isFightLocked(f.fight_time, null, f.status)) return { error: 'Picks are locked for this fight' }
  if (predictedWinnerId !== f.fighter1_id && predictedWinnerId !== f.fighter2_id) {
    return { error: 'Invalid fighter selection' }
  }

  // Round only makes sense for finishes; Decision never has a round
  const cleanRound =
    predictedMethod && predictedMethod !== 'decision' ? (predictedRound ?? null) : null

  const { error } = await supabase
    .from('predictions')
    .upsert(
      {
        user_id: user.id,
        fight_id: fightId,
        predicted_winner_id: predictedWinnerId,
        predicted_method: predictedMethod ?? null,
        predicted_round: cleanRound,
      },
      { onConflict: 'user_id,fight_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function toggleConfidencePick(
  fightId: string,
  isConfidence: boolean,
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Check the fight exists and isn't locked
  const { data: fight } = await supabase
    .from('fights')
    .select('id, fight_time, status, event_id')
    .eq('id', fightId)
    .single()

  const f = fight as any
  if (!f) return { error: 'Fight not found' }
  if (isFightLocked(f.fight_time, null, f.status)) return { error: 'Picks are locked for this fight' }

  // Enforce one confidence pick per event
  if (isConfidence) {
    const { data: existing } = await supabase
      .from('predictions')
      .select('fight_id, fights!inner(event_id)')
      .eq('user_id', user.id)
      .eq('is_confidence', true)
      .eq('fights.event_id', f.event_id)
      .neq('fight_id', fightId)
      .limit(1)

    if (existing && existing.length > 0) {
      return { error: 'You already have a Lock pick for this event. Remove it first.' }
    }
  }

  const { error } = await supabase
    .from('predictions')
    .update({ is_confidence: isConfidence })
    .eq('user_id', user.id)
    .eq('fight_id', fightId)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getUserPredictionsForEvent(
  eventId: string
): Promise<{ data: Record<string, { winnerId: string; isConfidence: boolean; method: string | null; round: number | null }> | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null }

  const { data, error } = await supabase
    .from('predictions')
    .select('fight_id, predicted_winner_id, is_confidence, predicted_method, predicted_round, fights!inner(event_id)')
    .eq('user_id', user.id)
    .eq('fights.event_id', eventId)

  if (error) return { data: null, error: error.message }

  const map: Record<string, { winnerId: string; isConfidence: boolean; method: string | null; round: number | null }> = {}
  ;(data ?? []).forEach((p: any) => {
    map[p.fight_id] = {
      winnerId:    p.predicted_winner_id,
      isConfidence: p.is_confidence ?? false,
      method:      p.predicted_method ?? null,
      round:       p.predicted_round  ?? null,
    }
  })
  return { data: map }
}
