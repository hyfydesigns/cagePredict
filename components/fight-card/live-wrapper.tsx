'use client'

import { useEffect, useState, useTransition } from 'react'
import { Radio } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { MapPin, Calendar, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { getActiveEvents } from '@/lib/actions/events'
import { Badge } from '@/components/ui/badge'
import type { EventWithFights, CommentWithProfile } from '@/types/database'
import { usePredictions, type PredictionMap } from '@/hooks/use-predictions'
import { FightCardSections } from './fight-card-sections'

interface LiveWrapperProps {
  initialEvents: EventWithFights[]
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
}

export function LiveWrapper({ initialEvents, userPicks, userId, commentsByFight = {} }: LiveWrapperProps) {
  const [events, setEvents] = useState(initialEvents)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const [, startTransition] = useTransition()

  const isLive = events.some((e) => e.status === 'live')

  // Default to the live event, otherwise the first one
  const defaultId = (events.find((e) => e.status === 'live') ?? events[0])?.id ?? ''
  const [activeId, setActiveId] = useState(defaultId)

  // Keep active tab valid if events list changes
  useEffect(() => {
    setEvents(initialEvents)
  }, [initialEvents])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(() => {
      startTransition(async () => {
        try {
          const fresh = await getActiveEvents()
          setEvents(fresh)
          setLastRefresh(new Date())
          setRefreshError(false)
        } catch {
          setRefreshError(true)
        }
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [isLive])

  const activeEvent = events.find((e) => e.id === activeId) ?? events[0]

  if (!activeEvent) return null

  // Only show tabs when there are multiple events
  const multiEvent = events.length > 1

  return (
    <div className="space-y-4">
      {/* Live refresh indicator */}
      {isLive && (
        <div className="flex items-center justify-center gap-2 text-xs text-primary font-semibold">
          <Radio className="h-3.5 w-3.5 animate-pulse-red" />
          Live — updating every 30s
          <span className="text-zinc-400 font-normal">
            {refreshError
              ? '· refresh error'
              : lastRefresh
              ? `· ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : ''}
          </span>
        </div>
      )}

      {/* Event tab switcher */}
      {multiEvent && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {events.map((event) => {
            const live = event.status === 'live'
            const active = event.id === activeId
            return (
              <button
                key={event.id}
                onClick={() => setActiveId(event.id)}
                className={`
                  shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
                  border transition-all whitespace-nowrap
                  ${active
                    ? 'bg-zinc-800 border-zinc-600 text-white shadow-sm'
                    : 'bg-transparent border-zinc-800 text-zinc-300 hover:text-zinc-200 hover:border-zinc-700'}
                `}
              >
                {live && (
                  <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-red shrink-0" />
                )}
                {/* Shorten "UFC 315: Pereira vs Ankalaev" → "UFC 315" on small screens */}
                <span className="hidden sm:inline">{event.name}</span>
                <span className="sm:hidden">{event.name.split(':')[0].trim()}</span>
                <span className={`
                  text-[10px] font-bold px-1.5 py-0.5 rounded-md
                  ${live
                    ? 'bg-primary/20 text-primary'
                    : active
                    ? 'bg-zinc-700 text-zinc-300'
                    : 'bg-zinc-800/80 text-zinc-400'}
                `}>
                  {live ? 'LIVE' : format(new Date(event.date), 'MMM d')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Active event */}
      <EventSectionClient
        event={activeEvent}
        userPicks={userPicks}
        userId={userId}
        commentsByFight={commentsByFight}
      />
    </div>
  )
}

function PicksProgressBadge({ total, picked }: { total: number; picked: number }) {
  const allDone   = picked === total && total > 0
  const hasNone   = picked === 0
  const pct       = total > 0 ? Math.round((picked / total) * 100) : 0

  // SVG circle params
  const r  = 16
  const cx = 20
  const cy = 20
  const circumference = 2 * Math.PI * r

  const strokeColor = allDone ? '#22c55e' : hasNone ? '#71717a' : '#f59e0b'
  const textColor   = allDone ? 'text-green-400' : hasNone ? 'text-zinc-400' : 'text-amber-400'
  const bgColor     = allDone ? 'bg-green-500/10 border-green-500/30' : hasNone ? 'bg-zinc-800/80 border-zinc-700/60' : 'bg-amber-500/10 border-amber-500/30'

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 backdrop-blur-sm ${bgColor}`}>
      {/* Circular progress */}
      <div className="relative shrink-0">
        <svg width="40" height="40" className="-rotate-90">
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (pct / 100) * circumference}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        {/* Centre number */}
        <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black leading-none ${textColor}`}>
          {picked}
        </span>
      </div>

      {/* Label */}
      <div className="leading-tight">
        <p className={`text-xs font-black leading-none ${textColor}`}>
          {picked}/{total}
        </p>
        <p className="text-[10px] text-zinc-500 leading-none mt-0.5">
          {allDone ? 'All picked!' : 'Picks'}
        </p>
      </div>
    </div>
  )
}

function EventSectionClient({
  event, userPicks, userId, commentsByFight = {},
}: {
  event: EventWithFights
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
}) {
  // Lift prediction state here so the picks counter and fight cards stay in sync
  const { picks, predict, toggleLock, isPending, lockedFightId } = usePredictions(userPicks)

  const fightIds    = event.fights.map((f) => f.id)
  const totalFights = fightIds.length
  const pickedCount = fightIds.filter((id) => picks[id]?.winnerId).length

  return (
    <section>
      <div className="rounded-2xl overflow-hidden border border-zinc-800/60 mb-4">
        <div className="relative h-32 sm:h-40 bg-zinc-900">
          {event.image_url && (
            <Image src={event.image_url} alt={event.name} fill className="object-cover opacity-40" sizes="760px" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Badge variant={event.status === 'live' ? 'live' : 'outline'} className="mb-2 text-[11px]">
                  {event.status === 'live' ? '🔴 LIVE NOW' : 'Upcoming'}
                </Badge>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  <span className="truncate">{event.name}</span>
                  <Link
                    href={`/events/${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                    className="text-zinc-400 hover:text-zinc-300 transition-colors shrink-0"
                    title="Event page"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(event.date), 'EEEE, MMMM d, yyyy')}
                  </span>
                  {event.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {event.venue}, {event.location}
                    </span>
                  )}
                </div>
              </div>

              {/* Picks progress — only shown to logged-in users */}
              {userId && (
                <PicksProgressBadge total={totalFights} picked={pickedCount} />
              )}
            </div>
          </div>
        </div>

        {/* Progress bar along the bottom of the banner */}
        {userId && totalFights > 0 && (
          <div className="h-1 bg-zinc-800 w-full">
            <div
              className={`h-full transition-all duration-500 ${
                pickedCount === totalFights ? 'bg-green-500' : pickedCount > 0 ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
              style={{ width: `${(pickedCount / totalFights) * 100}%` }}
            />
          </div>
        )}
      </div>
      <FightCardSections
        fights={event.fights}
        picks={picks}
        predict={predict}
        toggleLock={toggleLock}
        isPending={isPending}
        lockedFightId={lockedFightId}
        userId={userId}
        commentsByFight={commentsByFight}
      />
    </section>
  )
}
