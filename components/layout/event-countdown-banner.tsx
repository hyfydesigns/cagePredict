'use client'

import { useEffect, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EventCountdownBannerProps {
  eventName: string
  /** ISO timestamp of the first upcoming fight */
  fightTime: string
}

function getTimeLeft(target: Date) {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  const totalSecs = Math.floor(diff / 1000)
  const days  = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins  = Math.floor((totalSecs % 3600) / 60)
  const secs  = totalSecs % 60
  return { days, hours, mins, secs, totalSecs }
}

// Scoped to event name so a new event automatically resets the dismissed state
function storageKey(name: string) {
  return `cagepredict:banner-dismissed:${name}`
}

export function EventCountdownBanner({ eventName, fightTime }: EventCountdownBannerProps) {
  const target = new Date(fightTime)
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(target))
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Read sessionStorage only on the client to avoid SSR/hydration mismatch
  useEffect(() => {
    setMounted(true)
    if (sessionStorage.getItem(storageKey(eventName)) === '1') {
      setDismissed(true)
    }
  }, [eventName])

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft(target)), 1000)
    return () => clearInterval(id)
  }, [fightTime])

  function dismiss() {
    setDismissed(true)
    sessionStorage.setItem(storageKey(eventName), '1')
  }

  // Wait for client mount so dismissed state is accurate before first paint
  if (!mounted) return null
  // Hide if dismissed, expired, or more than 7 days away
  if (dismissed || !timeLeft || timeLeft.totalSecs > 7 * 24 * 3600) return null

  const isImminent = timeLeft.totalSecs < 3600 // < 1 hour

  const parts: string[] = []
  if (timeLeft.days > 0) parts.push(`${timeLeft.days}d`)
  if (timeLeft.hours > 0 || timeLeft.days > 0) parts.push(`${timeLeft.hours}h`)
  parts.push(`${String(timeLeft.mins).padStart(2, '0')}m`)
  if (timeLeft.days === 0) parts.push(`${String(timeLeft.secs).padStart(2, '0')}s`)
  const countdownStr = parts.join(' ')

  return (
    <div
      className={cn(
        'relative z-30 w-full border-b px-4 py-2 text-center text-xs font-semibold transition-colors',
        isImminent
          ? 'bg-primary/10 border-primary/30 text-primary'
          : 'bg-zinc-900 border-zinc-800 text-zinc-300'
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <Clock className={cn('h-3.5 w-3.5 shrink-0', isImminent && 'animate-pulse')} />
        <span>
          <span className="text-zinc-300 font-normal">
            {isImminent ? '🥊 Starting soon — ' : `${eventName} · `}
          </span>
          <span className={cn('tabular-nums', isImminent ? 'text-primary font-black' : 'text-white font-bold')}>
            {countdownStr}
          </span>
          {!isImminent && (
            <span className="text-zinc-300 font-normal"> until main card</span>
          )}
        </span>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss banner"
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-400 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
