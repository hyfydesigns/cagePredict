import { format } from 'date-fns'
import { MapPin, Calendar, ChevronRight, Swords } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { FightCardList } from '@/components/fight-card/fight-card-list'
import { Badge } from '@/components/ui/badge'
import type { EventWithFights, FightWithDetails } from '@/types/database'

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch upcoming events with fights + fighters
  const { data: eventsRaw } = await supabase
    .from('events')
    .select(`
      *,
      fights(
        *,
        fighter1:fighters!fights_fighter1_id_fkey(*),
        fighter2:fighters!fights_fighter2_id_fkey(*)
      )
    `)
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })
    .limit(4)

  // Fetch user picks for all displayed fights
  let userPicks: Record<string, string> = {}
  const events = (eventsRaw ?? []) as any[]

  if (user && events.length > 0) {
    const fightIds = events.flatMap((e: any) => (e.fights ?? []).map((f: any) => f.id as string))
    if (fightIds.length > 0) {
      const { data: preds } = await supabase
        .from('predictions')
        .select('fight_id, predicted_winner_id')
        .eq('user_id', user.id)
        .in('fight_id', fightIds)
      ;(preds ?? []).forEach((p: any) => { userPicks[p.fight_id] = p.predicted_winner_id })
    }
  }

  const typedEvents = events.map((e: any) => ({
    ...e,
    fights: ((e.fights ?? []) as any[]).sort((a: any, b: any) => a.display_order - b.display_order),
  })) as EventWithFights[]

  return (
    <div className="container mx-auto py-8 space-y-12 max-w-3xl">
      {/* Hero */}
      <div className="text-center space-y-3 py-6 relative">
        <div className="absolute inset-0 bg-hero-gradient -z-10" />
        <Badge variant="destructive" className="mb-2">
          <Swords className="h-3 w-3 mr-1" /> Free to Play
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
          Predict.<br />
          <span className="text-gradient-red">Compete.</span><br />
          Climb the Rankings.
        </h1>
        <p className="text-zinc-400 text-base max-w-md mx-auto">
          Pick the winner of every UFC fight. Earn points for correct predictions. Rise to the top of the global leaderboard.
        </p>
        {!user && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors shadow-[0_0_20px_rgba(239,68,68,0.35)]"
            >
              Start Predicting Free
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Events */}
      {typedEvents.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Swords className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No upcoming events</p>
          <p className="text-sm mt-1">Check back soon or visit the admin panel to seed events.</p>
        </div>
      ) : (
        typedEvents.map((event) => (
          <EventSection key={event.id} event={event} userPicks={userPicks} userId={user?.id} />
        ))
      )}
    </div>
  )
}

function EventSection({
  event, userPicks, userId,
}: {
  event: EventWithFights
  userPicks: Record<string, string>
  userId?: string
}) {
  return (
    <section>
      <div className="rounded-2xl overflow-hidden border border-zinc-800/60 mb-4">
        <div className="relative h-32 sm:h-40 bg-zinc-900">
          {event.image_url && (
            <Image
              src={event.image_url}
              alt={event.name}
              fill
              className="object-cover opacity-40"
              sizes="(max-width: 768px) 100vw, 760px"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-start justify-between">
              <div>
                <Badge
                  variant={event.status === 'live' ? 'live' : 'outline'}
                  className="mb-2 text-[11px]"
                >
                  {event.status === 'live' ? '🔴 LIVE NOW' : 'Upcoming'}
                </Badge>
                <h2 className="text-xl sm:text-2xl font-black text-white">{event.name}</h2>
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

      <FightCardList fights={event.fights} userPicks={userPicks} userId={userId} />
    </section>
  )
}
