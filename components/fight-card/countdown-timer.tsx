'use client'

import { useCountdown } from '@/hooks/use-countdown'
import { Lock, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  fightTime: string
  compact?: boolean
}

export function CountdownTimer({ fightTime, compact = false }: CountdownTimerProps) {
  const { formatted, isExpired, isPicksLocked, formattedLock, lockUrgency } = useCountdown(fightTime)

  if (isExpired) return null

  // Colour palette keyed by urgency
  const urgencyText = {
    normal: 'text-foreground-muted',
    soon:   'text-amber-400',
    urgent: 'text-red-400',
  }[lockUrgency]

  const urgencyBg = {
    normal: 'bg-surface-2/60 border-border/60',
    soon:   'bg-amber-500/10 border-amber-500/30',
    urgent: 'bg-red-500/10 border-red-500/30',
  }[lockUrgency]

  if (compact) {
    return (
      <span className={cn('flex items-center gap-1 text-xs', urgencyText)}>
        <Lock className="h-3 w-3" />
        {isPicksLocked ? 'Picks Locked' : `Locks ${formattedLock}`}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1 mt-1 w-full px-1">
      {/* Lock countdown pill — always visible */}
      <div className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 border',
        urgencyBg,
      )}>
        <Lock className={cn('h-2.5 w-2.5 shrink-0', urgencyText)} />
        <span className={cn('text-[10px] font-bold tabular-nums leading-none', urgencyText)}>
          {isPicksLocked ? 'Picks Locked' : `Locks ${formattedLock}`}
        </span>
      </div>

      {/* Fight start time (secondary, shown only when picks are still open) */}
      {!isPicksLocked && (
        <div className="flex items-center gap-1 text-foreground-muted">
          <Clock className="h-2.5 w-2.5" />
          <span className="text-[9px] tabular-nums leading-none">Starts {formatted}</span>
        </div>
      )}
    </div>
  )
}
