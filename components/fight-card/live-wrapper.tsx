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
import type { PredictionMap } from '@/hooks/use-predictions'
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

  return (
    <>
      {isLive && (
        <div className="flex items-center justify-center gap-2 text-xs text-primary font-semibold -mt-6 mb-2">
          <Radio className="h-3.5 w-3.5 animate-pulse-red" />
          Live — updating every 30s
          <span className="text-zinc-600 font-normal">
            {refreshError
              ? '· refresh error'
              : lastRefresh
              ? `· ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : ''}
          </span>
        </div>
      )}
      {events.map((event) => (
        <EventSectionClient key={event.id} event={event} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
      ))}
    </>
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
  return (
    <section>
      <div className="rounded-2xl overflow-hidden border border-zinc-800/60 mb-4">
        <div className="relative h-32 sm:h-40 bg-zinc-900">
          {event.image_url && (
            <Image src={event.image_url} alt={event.name} fill className="object-cover opacity-40" sizes="760px" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-start justify-between">
              <div>
                <Badge variant={event.status === 'live' ? 'live' : 'outline'} className="mb-2 text-[11px]">
                  {event.status === 'live' ? '🔴 LIVE NOW' : 'Upcoming'}
                </Badge>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  {event.name}
                  <Link
                    href={`/events/${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors"
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
            </div>
          </div>
        </div>
      </div>
      <FightCardSections fights={event.fights} userPicks={userPicks} userId={userId} commentsByFight={commentsByFight} />
    </section>
  )
}
