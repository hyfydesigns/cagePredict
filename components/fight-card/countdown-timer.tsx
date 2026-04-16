'use client'

import { useCountdown } from '@/hooks/use-countdown'
import { Lock, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CountdownTimerProps {
  fightTime: string
  compact?: boolean
}

export function CountdownTimer({ fightTime, compact = false }: CountdownTimerProps) {
  const { formatted, isExpired, isLocked } = useCountdown(fightTime)

  if (isExpired) return null

  if (compact) {
    return (
      <span className={cn(
        'flex items-center gap-1 text-xs',
        isLocked ? 'text-red-400' : 'text-zinc-300'
      )}>
        {isLocked ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
        {isLocked ? 'Locks soon' : formatted}
      </span>
    )
  }

  return (
    <div className={cn(
      'flex flex-col items-center gap-0.5 mt-1',
      isLocked ? 'text-red-400' : 'text-zinc-300'
    )}>
      {isLocked ? (
        <>
          <Lock className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Locking</span>
          <span className="text-xs font-bold">{formatted}</span>
        </>
      ) : (
        <>
          <Clock className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">Starts in</span>
          <span className="text-xs font-bold">{formatted}</span>
        </>
      )}
    </div>
  )
}
