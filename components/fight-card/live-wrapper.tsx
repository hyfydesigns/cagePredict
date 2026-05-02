'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Radio, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { MapPin, Calendar, ExternalLink } from 'lucide-react'
import Image from 'next/image'
import { getActiveEvents, getPicksStats, type EventStats } from '@/lib/actions/events'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import type { EventWithFights, CommentWithProfile } from '@/types/database'
import { usePredictions, type PredictionMap } from '@/hooks/use-predictions'
import { FightCardSections } from './fight-card-sections'

interface LiveWrapperProps {
  initialEvents: EventWithFights[]
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
  initialDbStats?: EventStats | null
}

export function LiveWrapper({ initialEvents, userPicks, userId, commentsByFight = {}, initialDbStats = null }: LiveWrapperProps) {
  const [events, setEvents] = useState(initialEvents)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  // Live points_earned map — updated in realtime when predictions are scored.
  // Keyed by fight_id. Starts from the server-fetched values in userPicks.
  const [liveEarned, setLiveEarned] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      Object.entries(userPicks)
        .filter(([, v]) => (v.pointsEarned ?? 0) > 0)
        .map(([fightId, v]) => [fightId, v.pointsEarned!])
    )
  )

  const isLive = events.some((e) => e.status === 'live')

  // Track the active event by ID (not index) so array re-orders never lose focus.
  // Always prefer the live event; fall back to first upcoming, then last in list.
  const pickActiveId = (list: EventWithFights[]) =>
    list.find((e) => e.status === 'live')?.id ??
    list.find((e) => e.status === 'upcoming')?.id ??
    list[list.length - 1]?.id ??
    null

  const [activeEventId, setActiveEventId] = useState<string | null>(() => pickActiveId(initialEvents))

  // Derive the display index from the ID so prev/next arrows keep working.
  const activeIndex = Math.max(0, events.findIndex((e) => e.id === activeEventId))
  const activeEvent = events.find((e) => e.id === activeEventId) ?? events[events.length - 1]

  const hasPrev = activeIndex > 0
  const hasNext = activeIndex < events.length - 1

  // Helper: update events + snap to live if one exists, otherwise keep current selection.
  const applyFreshEvents = (fresh: EventWithFights[]) => {
    setEvents(fresh)
    const liveEvent = fresh.find((e) => e.status === 'live')
    if (liveEvent) {
      setActiveEventId(liveEvent.id)
    } else {
      // Keep current selection if still in list; fall back gracefully
      setActiveEventId((prev) => fresh.find((e) => e.id === prev)?.id ?? pickActiveId(fresh))
    }
  }

  // ── DB-authoritative stats scoped to the ACTIVE event only ──────────────────
  // Using all-events fight IDs caused all-time stats to show when completed
  // events were included in the list. Scoping to activeEvent ensures W/L/D
  // always match "X fights done" (which is also per active event).
  // Seeded from server-fetched initialDbStats (also scoped to active event in
  // page.tsx) so the strip is visible immediately on page load with no delay.
  const [dbStats, setDbStats] = useState<EventStats | null>(initialDbStats ?? null)
  const activeEventFightIds  = (activeEvent?.fights ?? []).map((f: any) => f.id as string)
  const activeEventCompleted = (activeEvent?.fights ?? []).some((f: any) => f.status === 'completed')

  useEffect(() => {
    if (!userId || !activeEventCompleted || !activeEvent) { setDbStats(null); return }
    getPicksStats(activeEventFightIds, userId).then(setDbStats)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeEvent?.id, activeEventCompleted, activeEventFightIds.join(',')])

  // Sync whenever initialEvents prop changes (e.g. after a server revalidation).
  useEffect(() => {
    applyFreshEvents(initialEvents)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvents])

  // ── Supabase realtime: instant fight result updates ───────────────────────
  // When sync-results cron calls complete_fight(), the DB change is broadcast
  // here immediately — no polling delay for fight results.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('fights-live-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fights' },
        (payload) => {
          const wasCompleted = payload.new.status === 'completed'
          setEvents((prev) =>
            prev.map((event) => ({
              ...event,
              fights: event.fights.map((fight) =>
                fight.id === payload.new.id
                  ? {
                      ...fight,
                      // Only merge scalar result fields; keep joined fighter objects intact
                      status:         payload.new.status    ?? fight.status,
                      winner_id:      payload.new.winner_id ?? fight.winner_id,
                      method:         payload.new.method    ?? fight.method,
                      round:          payload.new.round     ?? fight.round,
                      time_of_finish: payload.new.time_of_finish ?? fight.time_of_finish,
                    }
                  : fight
              ),
            }))
          )
          setLastRefresh(new Date())
          // When a fight completes, soft-refresh so server components
          // (navbar points badge, profile stats) pick up the scored results.
          if (wasCompleted) {
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Supabase realtime: catch points_earned updates when fights are scored ───
  // complete_fight() writes points_earned to predictions immediately after
  // updating the fight row. Subscribe here so the live stats strip reflects
  // the true total (base + streak) without waiting for a page reload.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel  = supabase
      .channel('predictions-live-scored')
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'predictions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const { fight_id, points_earned } = payload.new as { fight_id: string; points_earned: number }
          if (fight_id && points_earned != null) {
            setLiveEarned((prev) => ({ ...prev, [fight_id]: points_earned }))
            // Soft-refresh server components (navbar points, profile page, dashboard)
            // without unmounting the client tree — no flicker or loading states
            router.refresh()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── Polling fallback: catches event status changes (upcoming→live→completed) ─
  // Runs every 60s always, every 30s when live. The go-live cron handles the
  // actual status flip; this just pulls the updated event list into the UI.
  useEffect(() => {
    const intervalMs = isLive ? 30_000 : 60_000
    const interval = setInterval(() => {
      startTransition(async () => {
        try {
          const fresh = await getActiveEvents()
          applyFreshEvents(fresh)
          setRefreshError(false)
        } catch {
          setRefreshError(true)
        }
      })
    }, intervalMs)
    return () => clearInterval(interval)
  }, [isLive])

  if (!activeEvent) return null

  return (
    <div className="space-y-4">
      {/* Live indicator */}
      {isLive && (
        <div className="flex items-center justify-center gap-2 text-xs text-primary font-semibold">
          <Radio className="h-3.5 w-3.5 animate-pulse-red" />
          Live — results update automatically
          <span className="text-foreground-muted font-normal">
            {refreshError
              ? '· sync error'
              : lastRefresh
              ? `· last update ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : ''}
          </span>
        </div>
      )}

      {/* Event navigation — arrows on each side, event name + date in centre */}
      {events.length > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveEventId(events[Math.max(0, activeIndex - 1)]?.id ?? activeEventId)}
            disabled={!hasPrev}
            aria-label="Previous event"
            className="shrink-0 h-8 w-8 rounded-lg border border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:border-border transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            {activeEvent.status === 'live' && (
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-red shrink-0" />
            )}
            <span className="text-sm font-semibold text-foreground truncate">
              {activeEvent.name.split(':')[0].trim()}
            </span>
            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              activeEvent.status === 'live'
                ? 'bg-primary/20 text-primary'
                : activeEvent.status === 'completed'
                ? 'bg-surface-2 text-foreground-muted'
                : 'bg-surface-2/80 text-foreground-muted'
            }`}>
              {activeEvent.status === 'live' ? 'LIVE' : format(new Date(activeEvent.date), 'MMM d')}
            </span>
            {events.length > 1 && (
              <span className="shrink-0 text-[10px] text-foreground-muted">
                {activeIndex + 1}/{events.length}
              </span>
            )}
          </div>

          <button
            onClick={() => setActiveEventId(events[Math.min(events.length - 1, activeIndex + 1)]?.id ?? activeEventId)}
            disabled={!hasNext}
            aria-label="Next event"
            className="shrink-0 h-8 w-8 rounded-lg border border-border flex items-center justify-center text-foreground-muted hover:text-foreground hover:border-border transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Active event */}
      <EventSectionClient
        event={activeEvent}
        userPicks={userPicks}
        userId={userId}
        dbStats={dbStats}
        commentsByFight={commentsByFight}
        liveEarned={liveEarned}
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
  const textColor   = allDone ? 'text-green-400' : hasNone ? 'text-foreground-muted' : 'text-amber-600 dark:text-amber-400'
  const bgColor     = allDone ? 'bg-green-500/10 border-green-500/30' : hasNone ? 'bg-surface-2/80 border-border/60' : 'bg-amber-500/10 border-amber-600 dark:border-amber-500/30'

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
        <p className="text-[10px] text-foreground-muted leading-none mt-0.5">
          {allDone ? 'All picked!' : 'Picks'}
        </p>
      </div>
    </div>
  )
}

function EventSectionClient({
  event, userPicks, userId, commentsByFight = {}, liveEarned = {}, dbStats = null,
}: {
  event: EventWithFights
  userPicks: PredictionMap
  userId?: string
  commentsByFight?: Record<string, CommentWithProfile[]>
  liveEarned?: Record<string, number>
  dbStats?: EventStats | null
}) {
  // Lift prediction state here so the picks counter and fight cards stay in sync
  const { picks, predict, toggleLock, isPending, lockedFightId } = usePredictions(userPicks)

  // During a live event, identify which fight is happening right now:
  // the first non-completed, non-cancelled fight in chronological card order.
  // Use a stable string key so the memo doesn't re-run on every new array reference.
  const fightStatusKey = event.fights.map((f) => `${f.id}:${f.status}`).join(',')
  const happeningNowId = useMemo(() => {
    if (event.status !== 'live') return null
    const sectionPriority: Record<string, number> = {
      earlyprelims: 0, early_prelims: 0,
      prelims: 1,
      maincard: 2,
    }
    const sorted = [...event.fights].sort((a, b) => {
      const pa = sectionPriority[(a as any).fight_type] ?? 1
      const pb = sectionPriority[(b as any).fight_type] ?? 1
      if (pa !== pb) return pa - pb
      const oa = (a as any).display_order ?? 0
      const ob = (b as any).display_order ?? 0
      if (oa !== ob) return oa - ob
      // Fallback: non-main-event fights come before the main event
      return (a.is_main_event ? 1 : 0) - (b.is_main_event ? 1 : 0)
    })
    // Prefer a fight explicitly marked live by sync-results (api confirmed in-progress)
    const liveFight = sorted.find((f) => f.status === 'live')
    if (liveFight) return liveFight.id
    // Fall back to the first fight that hasn't finished yet
    return sorted.find((f) => f.status !== 'completed' && f.status !== 'cancelled')?.id ?? null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.status, fightStatusKey])

  const fightIds    = event.fights.map((f) => f.id)
  // Scope the lock to this event only — a confidence pick on another event's
  // fight should not block the lock button here
  const eventLockedFightId = lockedFightId && fightIds.includes(lockedFightId) ? lockedFightId : null
  const totalFights = fightIds.length
  const pickedCount = fightIds.filter((id) => picks[id]?.winnerId).length

  return (
    <section>
      <div className="rounded-2xl overflow-hidden border border-border/60 mb-4">
        <div className="relative h-32 sm:h-40 bg-surface">
          {event.image_url && (
            <Image src={event.image_url} alt={event.name} fill className="object-cover opacity-40" sizes="760px" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-end justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Badge variant={event.status === 'live' ? 'live' : 'outline'} className="mb-2 text-[11px]">
                  {event.status === 'live' ? '🔴 LIVE NOW' : 'Upcoming'}
                </Badge>
                <h2 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
                  <span className="truncate">{event.name}</span>
                  <Link
                    href={`/events/${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
                    className="text-foreground-muted hover:text-foreground-secondary transition-colors shrink-0"
                    title="Event page"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-foreground-muted flex-wrap">
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
          <div className="h-1 bg-surface-2 w-full">
            <div
              className={`h-full transition-all duration-500 ${
                pickedCount === totalFights ? 'bg-green-500' : pickedCount > 0 ? 'bg-amber-500' : 'bg-surface-3'
              }`}
              style={{ width: `${(pickedCount / totalFights) * 100}%` }}
            />
          </div>
        )}

        {/* Live stats strip — shown during live/completed events for logged-in users */}
        {userId && (event.status === 'live' || event.status === 'completed') && dbStats && dbStats.correct + dbStats.wrong + dbStats.draws > 0 && (() => {
          const { correct, wrong, draws, basePts, streakPts, totalPts } = dbStats
          const completedFights = event.fights.filter((f: any) => f.status === 'completed')

          return (
            <div className="border-t border-border/60 bg-surface/60 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              {/* Points breakdown — read from DB via getEventStats, always accurate */}
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="text-foreground-muted font-semibold">Points:</span>
                <span className="text-foreground font-bold">{basePts}</span>
                <span className="text-foreground-muted">base</span>
                <span className="text-foreground-muted">+</span>
                <span className={streakPts > 0 ? 'text-orange-400 font-bold' : 'text-foreground-muted font-bold'}>{streakPts}</span>
                <span className="text-foreground-muted">streak</span>
                <span className="text-foreground-muted">=</span>
                <span className="text-amber-600 dark:text-amber-400 font-black">{totalPts}</span>
                <span className="text-foreground-muted">total</span>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-surface-2 hidden sm:block" />

              {/* Record */}
              <div className="flex items-center gap-3 text-sm font-bold">
                <span className="text-green-400">{correct}W</span>
                <span className="text-foreground-muted">·</span>
                <span className="text-red-400">{wrong}L</span>
                {draws > 0 && <>
                  <span className="text-foreground-muted">·</span>
                  <span className="text-foreground-muted">{draws}D</span>
                </>}
                <span className="text-foreground-muted font-normal text-xs">/ {completedFights.length} fights done</span>
              </div>

              {/* Divider */}
              <div className="h-8 w-px bg-surface-2 hidden sm:block" />

              {/* Per-fight mini results */}
              <div className="flex items-center gap-1 flex-wrap">
                {completedFights.map((fight: any) => {
                  const pick = picks[fight.id]
                  if (!pick?.winnerId) return (
                    <div key={fight.id} title="No pick" className="w-5 h-5 rounded-full bg-surface-2 border border-border flex items-center justify-center text-[9px] text-foreground-muted">–</div>
                  )
                  if (!fight.winner_id) return (
                    <div key={fight.id} title="Draw" className="w-5 h-5 rounded-full bg-surface-3 border border-border flex items-center justify-center text-[9px] text-foreground-muted">D</div>
                  )
                  const won    = pick.winnerId === fight.winner_id
                  const earned = liveEarned[fight.id] ?? pick.pointsEarned ?? (pick.isConfidence ? 20 : 10)
                  return (
                    <div
                      key={fight.id}
                      title={won ? `+${earned} pts` : '0 pts'}
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border ${
                        won
                          ? pick.isConfidence
                            ? 'bg-amber-500/20 border-amber-600 dark:border-amber-500/50 text-amber-600 dark:text-amber-400'
                            : 'bg-green-500/20 border-green-500/50 text-green-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      {won ? (pick.isConfidence ? '🔒' : '✓') : '✗'}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
      <FightCardSections
        fights={event.fights}
        picks={picks}
        predict={predict}
        toggleLock={toggleLock}
        isPending={isPending}
        lockedFightId={eventLockedFightId}
        userId={userId}
        commentsByFight={commentsByFight}
        happeningNowId={happeningNowId}
      />
    </section>
  )
}
