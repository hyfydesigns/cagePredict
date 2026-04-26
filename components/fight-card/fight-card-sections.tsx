'use client'

import { Star, Tv, Radio } from 'lucide-react'
import { FightCardList } from './fight-card-list'
import type { FightWithDetails, CommentWithProfile } from '@/types/database'
import type { PredictionMap } from '@/hooks/use-predictions'

function SectionDivider({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex items-center gap-2 shrink-0">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-foreground-secondary">{label}</span>
      </div>
      <div className="flex-1 h-px bg-surface-2" />
    </div>
  )
}

interface FightCardSectionsProps {
  fights: FightWithDetails[]
  picks: PredictionMap
  predict: (fightId: string, winnerId: string) => Promise<void>
  toggleLock: (fightId: string, isConfidence: boolean) => Promise<void>
  isPending: boolean
  lockedFightId: string | null
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
  happeningNowId?: string | null
}

export function FightCardSections({
  fights, picks, predict, toggleLock, isPending, lockedFightId, userId, commentsByFight = {},
  happeningNowId = null,
}: FightCardSectionsProps) {
  const listProps = { picks, predict, toggleLock, isPending, lockedFightId, userId, commentsByFight, happeningNowId }

  const maincard     = fights.filter((f) => (f as any).fight_type === 'maincard')
  const prelims      = fights.filter((f) => (f as any).fight_type === 'prelims')
  const earlyPrelims = fights.filter((f) =>
    (f as any).fight_type === 'earlyprelims' || (f as any).fight_type === 'early_prelims'
  )
  const ungrouped = fights.filter((f) => !(f as any).fight_type)

  const hasSections = maincard.length > 0 || prelims.length > 0 || earlyPrelims.length > 0
  if (!hasSections) {
    return <FightCardList fights={ungrouped} {...listProps} />
  }

  return (
    <div className="space-y-3">
      {maincard.length > 0 && (
        <>
          <SectionDivider label="Main Card" icon={<Star className="h-3.5 w-3.5 text-primary fill-primary" />} />
          <FightCardList fights={maincard} {...listProps} />
        </>
      )}
      {prelims.length > 0 && (
        <>
          <SectionDivider label="Prelims" icon={<Tv className="h-3.5 w-3.5 text-foreground-secondary" />} />
          <FightCardList fights={prelims} {...listProps} />
        </>
      )}
      {earlyPrelims.length > 0 && (
        <>
          <SectionDivider label="Early Prelims" icon={<Radio className="h-3.5 w-3.5 text-foreground-secondary" />} />
          <FightCardList fights={earlyPrelims} {...listProps} />
        </>
      )}
      {ungrouped.length > 0 && (
        <FightCardList fights={ungrouped} {...listProps} />
      )}
    </div>
  )
}
