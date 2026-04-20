'use client'

import { useOptimistic, useTransition } from 'react'
import { upsertPrediction, toggleConfidencePick } from '@/lib/actions/predictions'
import { useToast } from '@/components/ui/use-toast'

export type PredictionEntry = {
  winnerId: string
  isConfidence: boolean
  method: string | null
  round: number | null
  pointsEarned?: number
}
export type PredictionMap = Record<string, PredictionEntry>

export function usePredictions(initial: PredictionMap) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [optimisticPicks, updateOptimistic] = useOptimistic(
    initial,
    (state: PredictionMap, update: Partial<PredictionMap>): PredictionMap => ({ ...state, ...update } as PredictionMap)
  )

  // The fight ID that has is_confidence=true, if any
  const lockedFightId = Object.entries(optimisticPicks).find(([, v]) => v.isConfidence)?.[0] ?? null

  const predict = (
    fightId: string,
    winnerId: string,
    method?: string | null,
    round?: number | null,
  ): Promise<void> => {
    return new Promise((resolve) => {
      startTransition(async () => {
        const prev = optimisticPicks[fightId]
        updateOptimistic({
          [fightId]: {
            winnerId,
            isConfidence: prev?.isConfidence ?? false,
            method: method ?? null,
            round:  round  ?? null,
          },
        })
        const result = await upsertPrediction(fightId, winnerId, method, round)
        if (result.error) {
          toast({ title: 'Error', description: result.error, variant: 'destructive' })
        } else {
          toast({ title: 'Pick saved!', description: 'Your prediction is locked in.', duration: 2000 })
        }
        resolve()
      })
    })
  }

  const toggleLock = (fightId: string, isConfidence: boolean): Promise<void> => {
    return new Promise((resolve) => {
      startTransition(async () => {
        const prev = optimisticPicks[fightId]
        if (!prev) { resolve(); return }

        // Optimistically update: clear old lock, set new one
        const update: PredictionMap = {}
        if (isConfidence && lockedFightId && lockedFightId !== fightId) {
          update[lockedFightId] = { ...optimisticPicks[lockedFightId], isConfidence: false }
        }
        update[fightId] = { ...prev, isConfidence }
        updateOptimistic(update)

        const result = await toggleConfidencePick(fightId, isConfidence)
        if (result.error) {
          toast({ title: 'Lock failed', description: result.error, variant: 'destructive' })
          // Revert
          updateOptimistic({ [fightId]: prev })
        } else {
          toast({
            title: isConfidence ? '🔒 Lock set — 2× points!' : 'Lock removed',
            description: isConfidence
              ? 'This is your confidence pick for the event.'
              : 'Your lock pick has been removed.',
            duration: 2500,
          })
        }
        resolve()
      })
    })
  }

  return { picks: optimisticPicks, predict, toggleLock, isPending, lockedFightId }
}
