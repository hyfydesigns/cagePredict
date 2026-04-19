'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Crown, TrendingUp } from 'lucide-react'
import { cn, formatOdds, oddsToImplied } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

interface FighterPortraitProps {
  fighter: FighterRow
  side: 'left' | 'right'
  isPicked: boolean
  isWinner?: boolean
  isLoser?: boolean
  odds: number
  oddsOpen?: number | null
}

function movementArrow(open: number, current: number): '↑' | '↓' | null {
  const openImp = open < 0 ? Math.abs(open) / (Math.abs(open) + 100) : 100 / (open + 100)
  const curImp  = current < 0 ? Math.abs(current) / (Math.abs(current) + 100) : 100 / (current + 100)
  const delta = curImp - openImp
  if (Math.abs(delta) < 0.005) return null
  return delta > 0 ? '↑' : '↓'
}

export function FighterPortrait({
  fighter, side, isPicked, isWinner, isLoser, odds, oddsOpen,
}: FighterPortraitProps) {
  const isLeft = side === 'left'
  const [imgError, setImgError] = useState(false)

  const isFav   = odds < 0
  const implied = oddsToImplied(odds)
  const arrow   = oddsOpen != null ? movementArrow(oddsOpen, odds) : null

  return (
    <div className={cn(
      'relative flex flex-col items-center p-4 transition-all duration-300',
      isLeft ? 'items-start' : 'items-end',
      isPicked && 'bg-primary/5',
      isWinner && 'bg-green-500/5',
      isLoser && 'opacity-50'
    )}>
      {/* Winner crown — in normal flow so it doesn't overlap the image.
          Spacer shown for the loser side so both columns stay the same height. */}
      {isWinner ? (
        <div className={cn(
          'flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 rounded-full px-2 py-0.5 mb-2',
          isLeft ? 'self-start' : 'self-end'
        )}>
          <Crown className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400">WINNER</span>
        </div>
      ) : isLoser ? (
        <div className="h-[22px] mb-2" />
      ) : null}

      {/* Fighter image */}
      <Link href={`/fighters/${fighter.id}`} className="block group">
        <div className={cn(
          'relative w-24 h-28 sm:w-28 sm:h-32 rounded-xl overflow-hidden border-2 transition-all duration-300 group-hover:border-primary/60 group-hover:scale-[1.03]',
          isPicked ? 'border-primary shadow-[0_0_20px_rgba(239,68,68,0.35)]' : 'border-zinc-700',
          isWinner ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.35)]' : '',
        )}>
          {fighter.image_url && !imgError ? (
            <Image
              src={fighter.image_url}
              alt={fighter.name}
              fill
              className="object-cover object-top"
              sizes="(max-width: 640px) 96px, 112px"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-zinc-700 to-zinc-900 flex items-center justify-center">
              <span className="text-4xl">{fighter.flag_emoji ?? '🥊'}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className={cn(
            'absolute inset-0',
            isLeft ? 'bg-fighter-gradient-right' : 'bg-fighter-gradient-left'
          )} />
          {/* Flag */}
          {fighter.flag_emoji && (
            <div className={cn(
              'absolute bottom-1 text-base leading-none',
              isLeft ? 'left-1' : 'right-1'
            )}>
              {fighter.flag_emoji}
            </div>
          )}
        </div>
      </Link>

      {/* Fighter info */}
      <div className={cn('mt-2 w-full', isLeft ? 'text-left' : 'text-right')}>
        <p className="text-white font-black text-sm sm:text-base leading-tight line-clamp-1">
          {fighter.name.split(' ').pop()}
        </p>
        <p className="text-white font-black text-xs leading-tight line-clamp-1 hidden sm:block">
          {fighter.name.split(' ').slice(0, -1).join(' ')}
        </p>
        {fighter.nickname && (
          <p className="text-zinc-300 text-[10px] italic mt-0.5 line-clamp-1">
            "{fighter.nickname}"
          </p>
        )}
        <div className={cn('flex items-center gap-1.5 mt-1', isLeft ? '' : 'justify-end')}>
          <span className="text-zinc-300 text-[11px] font-medium">{fighter.record}</span>
        </div>

        {/* Odds */}
        <div className={cn('flex items-center gap-1 mt-1.5', isLeft ? '' : 'justify-end')}>
          <span className={cn(
            'text-sm font-black leading-none',
            isFav ? 'text-green-400' : 'text-red-400'
          )}>
            {formatOdds(odds)}
          </span>
          {arrow && (
            <span className={cn(
              'text-[10px] font-bold leading-none',
              arrow === '↑' ? 'text-green-400' : 'text-red-400'
            )}>
              {arrow}
            </span>
          )}
          <span className="text-zinc-500 text-[10px] leading-none">{implied}%</span>
        </div>

        {/* Picked indicator */}
        {isPicked && !isWinner && !isLoser && (
          <div className={cn(
            'flex items-center gap-1 mt-1',
            isLeft ? '' : 'justify-end'
          )}>
            <TrendingUp className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-bold">YOUR PICK</span>
          </div>
        )}
      </div>
    </div>
  )
}
