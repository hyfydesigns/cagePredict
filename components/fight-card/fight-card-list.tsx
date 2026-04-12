'use client'

import { FightCard } from './fight-card'
import { usePredictions } from '@/hooks/use-predictions'
import type { FightWithDetails } from '@/types/database'

interface FightCardListProps {
  fights: FightWithDetails[]
  userPicks: Record<string, string>
  userId?: string
}

export function FightCardList({ fights, userPicks, userId }: FightCardListProps) {
  const { picks, predict, isPending } = usePredictions(userPicks)

  return (
    <div className="space-y-4">
      {fights.map((fight) => (
        <FightCard
          key={fight.id}
          fight={fight}
          userPick={picks[fight.id] ?? null}
          userId={userId}
          isPending={isPending}
          onPredict={predict}
        />
      ))}
    </div>
  )
}
