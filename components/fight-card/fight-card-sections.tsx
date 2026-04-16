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
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">{label}</span>
      </div>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  )
}

interface FightCardSectionsProps {
  fights: FightWithDetails[]
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
}

export function FightCardSections({ fights, userPicks, userId, commentsByFight = {} }: FightCardSectionsProps) {
  const maincard     = fights.filter((f) => (f as any).fight_type === 'maincard')
  const prelims      = fights.filter((f) => (f as any).fight_type === 'prelims')
  const earlyPrelims = fights.filter((f) =>
    (f as any).fight_type === 'earlyprelims' || (f as any).fight_type === 'early_prelims'
  )
  const ungrouped = fights.filter((f) => !(f as any).fight_type)

  // If nothing is categorised at all, render flat (no dividers)
  const hasSections = maincard.length > 0 || prelims.length > 0 || earlyPrelims.length > 0
  if (!hasSections) {
    return <FightCardList fights={ungrouped} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
  }

  return (
    <div className="space-y-3">
      {maincard.length > 0 && (
        <>
          <SectionDivider label="Main Card" icon={<Star className="h-3.5 w-3.5 text-primary fill-primary" />} />
          <FightCardList fights={maincard} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
        </>
      )}
      {prelims.length > 0 && (
        <>
          <SectionDivider label="Prelims" icon={<Tv className="h-3.5 w-3.5 text-zinc-300" />} />
          <FightCardList fights={prelims} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
        </>
      )}
      {earlyPrelims.length > 0 && (
        <>
          <SectionDivider label="Early Prelims" icon={<Radio className="h-3.5 w-3.5 text-zinc-300" />} />
          <FightCardList fights={earlyPrelims} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
        </>
      )}
      {ungrouped.length > 0 && (
        <FightCardList fights={ungrouped} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
      )}
    </div>
  )
}
