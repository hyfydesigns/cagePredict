'use client'

import { useState, useEffect } from 'react'

interface CountdownResult {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
  isLocked: boolean   // within 5 min
  formatted: string
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

function calcRemaining(targetDate: string): CountdownResult {
  const diff = new Date(targetDate).getTime() - Date.now()
  const LOCK_BUFFER = 5 * 60 * 1000

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true, isLocked: true, formatted: 'Started' }
  }

  const days    = Math.floor(diff / 86_400_000)
  const hours   = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  const seconds = Math.floor((diff % 60_000) / 1_000)

  let formatted: string
  if (days > 0) formatted = `${days}d ${hours}h`
  else if (hours > 0) formatted = `${hours}h ${minutes}m`
  else formatted = `${minutes}m ${seconds}s`

  return {
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    isLocked: diff <= LOCK_BUFFER,
    formatted,
  }
}
