'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isFightLocked } from '@/lib/utils'

type ActionResult = { error?: string; success?: boolean }

export async function upsertPrediction(
  fightId: string,
  predictedWinnerId: string,
  confidence = 50
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be logged in to make predictions' }

  const { data: fight } = await supabase
    .from('fights')
    .select('id, fight_time, status, fighter1_id, fighter2_id')
    .eq('id', fightId)
    .single()

  const f = fight as any
  if (!f) return { error: 'Fight not found' }
  if (f.status === 'completed') return { error: 'Fight is already completed' }
  if (isFightLocked(f.fight_time)) return { error: 'Picks are locked for this fight' }
  if (predictedWinnerId !== f.fighter1_id && predictedWinnerId !== f.fighter2_id) {
    return { error: 'Invalid fighter selection' }
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(
      { user_id: user.id, fight_id: fightId, predicted_winner_id: predictedWinnerId, confidence },
      { onConflict: 'user_id,fight_id' }
    )

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getUserPredictionsForEvent(
  eventId: string
): Promise<{ data: Record<string, string> | null; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null }

  const { data, error } = await supabase
    .from('predictions')
    .select('fight_id, predicted_winner_id, fights!inner(event_id)')
    .eq('user_id', user.id)
    .eq('fights.event_id', eventId)

  if (error) return { data: null, error: error.message }

  const map: Record<string, string> = {}
  ;(data ?? []).forEach((p: any) => { map[p.fight_id] = p.predicted_winner_id })
  return { data: map }
}
