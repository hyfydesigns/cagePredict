'use client'

import { FightCard } from './fight-card'
import type { PredictionMap } from '@/hooks/use-predictions'
import type { FightWithDetails, CommentWithProfile } from '@/types/database'

interface FightCardListProps {
  fights: FightWithDetails[]
  picks: PredictionMap
  predict: (fightId: string, winnerId: string, method?: string | null, round?: number | null) => Promise<void>
  toggleLock: (fightId: string, isConfidence: boolean) => Promise<void>
  isPending: boolean
  lockedFightId: string | null
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
  happeningNowId?: string | null
}

export function FightCardList({
  fights, picks, predict, toggleLock, isPending, lockedFightId, userId, commentsByFight = {},
  happeningNowId = null,
}: FightCardListProps) {
  return (
    <div className="space-y-4">
      {fights.map((fight) => {
        const pick = picks[fight.id]
        return (
          <FightCard
            key={fight.id}
            fight={fight}
            userPick={pick?.winnerId ?? null}
            userMethod={pick?.method ?? null}
            userRound={pick?.round   ?? null}
            isConfidence={pick?.isConfidence ?? false}
            lockTaken={lockedFightId !== null && lockedFightId !== fight.id}
            userId={userId}
            isPending={isPending}
            isHappeningNow={fight.id === happeningNowId}
            initialComments={commentsByFight[fight.id] ?? []}
            onPredict={predict}
            onToggleLock={toggleLock}
          />
        )
      })}
    </div>
  )
}
