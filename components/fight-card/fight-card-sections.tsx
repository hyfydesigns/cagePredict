'use client'

import { Star, Tv } from 'lucide-react'
import { FightCardList } from './fight-card-list'
import type { FightWithDetails, CommentWithProfile } from '@/types/database'
import type { PredictionMap } from '@/hooks/use-predictions'

function SectionDivider({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex items-center gap-2 shrink-0">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</span>
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

  if (ungrouped.length > 0) {
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
          <SectionDivider label="Prelims" icon={<Tv className="h-3.5 w-3.5 text-zinc-500" />} />
          <FightCardList fights={prelims} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
        </>
      )}
      {earlyPrelims.length > 0 && (
        <>
          <SectionDivider label="Early Prelims" icon={<Tv className="h-3.5 w-3.5 text-zinc-600" />} />
          <FightCardList fights={earlyPrelims} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
        </>
      )}
    </div>
  )
}
