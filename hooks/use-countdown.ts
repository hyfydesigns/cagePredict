'use client'

import { useState, useEffect } from 'react'

// Picks lock 2 hours before fight time (matches isFightLocked in lib/utils.ts)
const PICK_LOCK_MS = 2 * 60 * 60 * 1_000

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  isLocked: boolean        // fight has started
  isPicksLocked: boolean   // picks are closed (within 2h of fight)
  formatted: string        // countdown to fight start
  formattedLock: string    // countdown to picks lock
  lockUrgency: 'normal' | 'soon' | 'urgent'  // color cue
}

export function useCountdown(targetDate: string): CountdownResult {
  const [remaining, setRemaining] = useState(() => calcRemaining(targetDate))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(calcRemaining(targetDate))
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return remaining
}

function fmt(ms: number): string {
  if (ms <= 0) return '0s'
  const days    = Math.floor(ms / 86_400_000)
  const hours   = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)

  if (days > 0)   return `${days}d ${hours}h`
  if (hours > 0)  return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function calcRemaining(targetDate: string): CountdownResult {
  const fightMs  = new Date(targetDate).getTime()
  const now      = Date.now()
  const diff     = fightMs - now          // ms to fight start
  const lockDiff = fightMs - PICK_LOCK_MS - now  // ms to picks lock

  if (diff <= 0) {
    return {
      days: 0, hours: 0, minutes: 0, seconds: 0,
      isExpired: true, isLocked: true, isPicksLocked: true,
      formatted: 'Started', formattedLock: 'Locked',
      lockUrgency: 'urgent',
    }
  }

  const isPicksLocked = lockDiff <= 0

  // Urgency for lock countdown
  let lockUrgency: 'normal' | 'soon' | 'urgent' = 'normal'
  if (!isPicksLocked) {
    if (lockDiff <= 15 * 60_000) lockUrgency = 'urgent'   // < 15 min
    else if (lockDiff <= 60 * 60_000) lockUrgency = 'soon' // < 1 hour
  } else {
    lockUrgency = 'urgent'
  }

  return {
    days:    Math.floor(diff / 86_400_000),
    hours:   Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1_000),
    isExpired:    false,
    isLocked:     false,
    isPicksLocked,
    formatted:    fmt(diff),
    formattedLock: isPicksLocked ? 'Locked' : fmt(lockDiff),
    lockUrgency,
  }
}
