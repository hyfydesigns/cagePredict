'use client'

import { useState, useOptimistic, useTransition } from 'react'
import { upsertPrediction } from '@/lib/actions/predictions'
import { useToast } from '@/components/ui/use-toast'

/** Maps fight_id → predicted_winner_id */
type PredictionMap = Record<string, string>

export function usePredictions(initial: PredictionMap) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [optimisticPicks, updateOptimistic] = useOptimistic(
    initial,
    (state: PredictionMap, { fightId, winnerId }: { fightId: string; winnerId: string }) => ({
      ...state,
      [fightId]: winnerId,
    })
  )

  const predict = (fightId: string, winnerId: string): Promise<void> => {
    return new Promise((resolve) => {
      startTransition(async () => {
        updateOptimistic({ fightId, winnerId })
        const result = await upsertPrediction(fightId, winnerId)
        if (result.error) {
          toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
          toast({ title: 'Pick saved!', description: 'Your prediction is locked in.', duration: 2000 })
        }
        resolve()
      })
    })
  }

  return { picks: optimisticPicks, predict, isPending }
}
