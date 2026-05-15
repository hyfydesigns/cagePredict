'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { Crown, TrendingUp, ExternalLink } from 'lucide-react'
import { cn, formatOdds, oddsToImplied } from '@/lib/utils'
import type { FighterRow } from '@/types/database'
import { DEFAULT_BOOKMAKER } from '@/lib/affiliates'

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
      isPicked && isWinner  && 'bg-green-500/5',
      isPicked && isLoser   && 'bg-red-500/5',
      isPicked && !isWinner && !isLoser && 'bg-blue-500/5',
      !isPicked && isWinner && 'bg-green-500/5',
      isLoser && 'opacity-50'
    )}>
      {/* Winner crown — in normal flow so it doesn't overlap the image.
          Spacer shown for the loser side so both columns stay the same height. */}
      {isWinner ? (
        <div className={cn(
          'flex items-center gap-1 bg-amber-500/20 border border-amber-600 dark:border-amber-500/40 rounded-full px-2 py-0.5 mb-2',
          isLeft ? 'self-start' : 'self-end'
        )}>
          <Crown className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">WINNER</span>
        </div>
      ) : isLoser ? (
        <div className="h-[22px] mb-2" />
      ) : null}

      {/* Fighter image */}
      <Link href={`/fighters/${fighter.id}`} className="block group">
        <div className={cn(
          'relative w-24 h-28 sm:w-28 sm:h-32 rounded-xl overflow-hidden border-2 transition-all duration-300 group-hover:scale-[1.03]',
          isPicked && isWinner  ? 'border-green-400 dark:shadow-[0_0_20px_rgba(34,197,94,0.4)] group-hover:border-green-300'
          : isPicked && isLoser ? 'border-red-400 dark:shadow-[0_0_20px_rgba(239,68,68,0.35)] group-hover:border-red-300'
          : isPicked            ? 'border-blue-400 dark:shadow-[0_0_20px_rgba(96,165,250,0.35)] group-hover:border-blue-300'
          : isWinner            ? 'border-amber-400 dark:shadow-[0_0_20px_rgba(245,158,11,0.35)] group-hover:border-amber-300'
          :                       'border-border group-hover:border-primary/60',
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
            <div className="w-full h-full bg-gradient-to-b from-surface-3 to-surface flex items-center justify-center">
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
        <p className="text-foreground font-black text-sm sm:text-base leading-tight line-clamp-1">
          {fighter.name.split(' ').pop()}
        </p>
        <p className="text-foreground font-black text-xs leading-tight line-clamp-1 hidden sm:block">
          {fighter.name.split(' ').slice(0, -1).join(' ')}
        </p>
        {fighter.nickname && (
          <p className="text-foreground-secondary text-[10px] italic mt-0.5 line-clamp-1">
            "{fighter.nickname}"
          </p>
        )}
        <div className={cn('flex items-center gap-1.5 mt-1', isLeft ? '' : 'justify-end')}>
          <span className="text-foreground-secondary text-[11px] font-medium">{fighter.record}</span>
        </div>

        {/* Odds — only render when there's a real line (0 = no data) */}
        {odds !== 0 && (
          <div className={cn('flex items-center gap-1 mt-1.5', isLeft ? '' : 'justify-end')}>
            <a
              href={DEFAULT_BOOKMAKER.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center gap-0.5 group"
              title={`Bet at ${DEFAULT_BOOKMAKER.name}`}
            >
              <span className={cn(
                'text-sm font-black leading-none group-hover:underline underline-offset-2',
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
              <ExternalLink className="h-2.5 w-2.5 text-foreground-muted opacity-0 group-hover:opacity-70 transition-opacity" />
            </a>
            <span className="text-foreground-muted text-[10px] leading-none">{implied}%</span>
          </div>
        )}

        {/* Picked indicator */}
        {isPicked && !isWinner && !isLoser && (
          <div className={cn(
            'flex items-center gap-1 mt-1',
            isLeft ? '' : 'justify-end'
          )}>
            <TrendingUp className="h-3 w-3 text-blue-400" />
            <span className="text-[10px] text-blue-400 font-bold">YOUR PICK</span>
          </div>
        )}
      </div>
    </div>
  )
}
