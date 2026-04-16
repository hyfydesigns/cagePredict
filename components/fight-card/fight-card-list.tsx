'use client'

import { FightCard } from './fight-card'
import { usePredictions, type PredictionMap } from '@/hooks/use-predictions'
import type { FightWithDetails, CommentWithProfile } from '@/types/database'

interface FightCardListProps {
  fights: FightWithDetails[]
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
}

export function FightCardList({ fights, userPicks, userId, commentsByFight = {} }: FightCardListProps) {
  const { picks, predict, toggleLock, isPending, lockedFightId } = usePredictions(userPicks)

  return (
    <div className="space-y-4">
      {fights.map((fight) => {
        const pick = picks[fight.id]
        return (
          <FightCard
            key={fight.id}
            fight={fight}
            userPick={pick?.winnerId ?? null}
            isConfidence={pick?.isConfidence ?? false}
            lockTaken={lockedFightId !== null && lockedFightId !== fight.id}
            userId={userId}
            isPending={isPending}
            initialComments={commentsByFight[fight.id] ?? []}
            onPredict={predict}
            onToggleLock={toggleLock}
          />
        )
      })}
    </div>
  )
}
