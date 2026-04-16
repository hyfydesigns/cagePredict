import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { MapPin, Calendar, ChevronRight, Trophy, Swords } from 'lucide-react'
import { createClient, createBuildClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { slugify } from '@/lib/utils'
import type { EventWithFights } from '@/types/database'

export const revalidate = 3600 // Re-generate every hour

// ─── Static params for ISR ────────────────────────────────────────────────────
export async function generateStaticParams() {
  // Must use a cookie-free client — generateStaticParams runs at build time
  // without an HTTP request, so cookies() is unavailable.
  const supabase = createBuildClient()
  const { data: events } = await supabase
    .from('events')
    .select('name')
    .order('date', { ascending: false })
    .limit(20)

  return (events ?? []).map((e: { name: string }) => ({ slug: slugify(e.name) }))
}

// ─── Metadata ─────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) return { title: 'Event Not Found' }

  const fights  = (event.fights ?? []) as any[]
  const main    = fights.find((f) => f.is_main_event)
  const f1Name  = main?.fighter1?.name ?? ''
  const f2Name  = main?.fighter2?.name ?? ''
  const dateStr = format(new Date(event.date), 'MMMM d, yyyy')

  const title       = `${event.name} Predictions & Fight Card | CagePredict`
  const description = main
    ? `${event.name} fight card — ${f1Name} vs ${f2Name} on ${dateStr}${event.venue ? ` at ${event.venue}` : ''}. Pick the winners and compete on the global leaderboard.`
    : `${event.name} full fight card on ${dateStr}. Make your UFC predictions and compete free.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type:   'website',
      url:    `https://cagepredict.com/events/${slug}`,
      images: event.image_url ? [{ url: event.image_url, width: 1200, height: 630 }] : [],
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      event.image_url ? [event.image_url] : [],
    },
    alternates: {
      canonical: `https://cagepredict.com/events/${slug}`,
    },
  }
}

// ─── Data fetching ────────────────────────────────────────────────────────────
async function getEventBySlug(slug: string) {
  const supabase = await createClient()

  // Fetch all upcoming + recent events and find by slug match
  const { data: events } = await supabase
    .from('events')
    .select(`
      *,
      fights(
        *,
        fighter1:fighters!fights_fighter1_id_fkey(*),
        fighter2:fighters!fights_fighter2_id_fkey(*)
      )
    `)
    .order('date', { ascending: false })
    .limit(30)

  const match = (events ?? []).find((e) => slugify(e.name) === slug)
  if (!match) return null

  // Sort fights by display_order descending
  match.fights = ((match.fights ?? []) as any[]).sort(
    (a: any, b: any) => b.display_order - a.display_order
  )

  return match as unknown as EventWithFights
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default async function EventPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  const [event, { data: { user } }] = await Promise.all([
    getEventBySlug(slug),
    supabase.auth.getUser(),
  ])

  if (!event) notFound()

  const fights  = (event.fights ?? []) as any[]
  const mainFight = fights.find((f) => f.is_main_event)
  const isLive    = event.status === 'live'
  const isCompleted = event.status === 'completed'

  // Section groups
  const maincard    = fights.filter((f) => f.fight_type === 'maincard')
  const prelims     = fights.filter((f) => f.fight_type === 'prelims')
  const earlyPrelims = fights.filter((f) =>
    f.fight_type === 'earlyprelims' || f.fight_type === 'early_prelims'
  )
  const ungrouped = fights.filter((f) => !f.fight_type)
  const hasSections = maincard.length > 0 || prelims.length > 0 || earlyPrelims.length > 0

  // Schema.org structured data
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    startDate: event.date,
    location: event.venue
      ? { '@type': 'Place', name: event.venue, address: event.location ?? '' }
      : undefined,
    image: event.image_url ?? undefined,
    description: mainFight
      ? `${mainFight.fighter1?.name} vs ${mainFight.fighter2?.name}`
      : event.name,
    url: `https://cagepredict.com/events/${slug}`,
    organizer: { '@type': 'Organization', name: 'UFC' },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <div className="container mx-auto py-8 max-w-3xl space-y-8">

        {/* Event hero banner */}
        <div className="rounded-2xl overflow-hidden border border-zinc-800/60">
          <div className="relative h-48 sm:h-64 bg-zinc-900">
            {event.image_url && (
              <Image
                src={event.image_url}
                alt={event.name}
                fill
                className="object-cover opacity-40"
                priority
                sizes="(max-width: 768px) 100vw, 768px"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {isLive && <Badge variant="live">🔴 LIVE NOW</Badge>}
                {isCompleted && <Badge variant="secondary">Completed</Badge>}
                {!isLive && !isCompleted && <Badge variant="outline">Upcoming</Badge>}
                {mainFight?.is_title_fight && (
                  <Badge variant="warning"><Trophy className="h-3 w-3 mr-1" />Title Fight</Badge>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
                {event.name}
              </h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {format(new Date(event.date), 'EEEE, MMMM d, yyyy')}
                </span>
                {event.venue && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {event.venue}{event.location ? `, ${event.location}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main event matchup callout */}
        {mainFight && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center">
            <p className="text-[11px] font-bold text-primary uppercase tracking-widest mb-3">
              Main Event · {mainFight.weight_class}
            </p>
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              <div>
                <p className="text-2xl sm:text-3xl font-black text-white">
                  {mainFight.fighter1?.name.split(' ').pop()}
                </p>
                <p className="text-sm text-zinc-500">{mainFight.fighter1?.name}</p>
                <p className="text-xs text-zinc-600 mt-1">
                  {mainFight.fighter1?.wins ?? 0}–{mainFight.fighter1?.losses ?? 0}
                </p>
              </div>
              <span className="text-2xl font-black text-zinc-700">VS</span>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-white">
                  {mainFight.fighter2?.name.split(' ').pop()}
                </p>
                <p className="text-sm text-zinc-500">{mainFight.fighter2?.name}</p>
                <p className="text-xs text-zinc-600 mt-1">
                  {mainFight.fighter2?.wins ?? 0}–{mainFight.fighter2?.losses ?? 0}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* CTA for logged-out users */}
        {!user && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-white">Make your picks for {event.name}</p>
              <p className="text-sm text-zinc-500 mt-0.5">
                Free to play · Earn points · Climb the global leaderboard
              </p>
            </div>
            <Link
              href="/signup"
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-bold text-white text-sm hover:bg-primary-hover transition-colors shadow-[0_0_16px_rgba(239,68,68,0.3)]"
            >
              Join Free <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
        {user && (
          <div className="text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 text-primary font-semibold text-sm px-5 py-2.5 hover:bg-primary/20 transition-colors"
            >
              <Swords className="h-4 w-4" /> Go to Fight Card to Make Picks
            </Link>
          </div>
        )}

        {/* Fight card */}
        <div className="space-y-6">
          <h2 className="text-xl font-black text-white">
            Full Fight Card
            <span className="ml-2 text-sm font-normal text-zinc-500">
              {fights.length} fights
            </span>
          </h2>

          {hasSections ? (
            <div className="space-y-6">
              {maincard.length > 0 && (
                <FightSection label="Main Card" fights={maincard} />
              )}
              {prelims.length > 0 && (
                <FightSection label="Prelims" fights={prelims} />
              )}
              {earlyPrelims.length > 0 && (
                <FightSection label="Early Prelims" fights={earlyPrelims} />
              )}
              {ungrouped.length > 0 && (
                <FightSection label="" fights={ungrouped} />
              )}
            </div>
          ) : (
            <FightSection label="" fights={fights} />
          )}
        </div>

        {/* Bottom CTA */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-6 text-center space-y-3">
          <p className="text-white font-bold">Want to predict these fights?</p>
          <p className="text-zinc-500 text-sm">
            Join CagePredict free — pick every fight, earn points, and compete on the global leaderboard.
          </p>
          <Link
            href={user ? '/' : '/signup'}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors shadow-[0_0_16px_rgba(239,68,68,0.3)]"
          >
            {user ? 'Make Picks Now' : 'Start Predicting Free'}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </>
  )
}

// ─── Fight section ─────────────────────────────────────────────────────────────
function FightSection({ label, fights }: { label: string; fights: any[] }) {
  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>
      )}
      <div className="space-y-2">
        {fights.map((fight) => (
          <FightRow key={fight.id} fight={fight} />
        ))}
      </div>
    </div>
  )
}

// ─── Fight row ─────────────────────────────────────────────────────────────────
function FightRow({ fight }: { fight: any }) {
  const f1 = fight.fighter1
  const f2 = fight.fighter2
  const hasWinner = !!fight.winner_id

  return (
    <div className={`
      rounded-xl border px-4 py-3
      ${fight.is_main_event
        ? 'border-primary/20 bg-primary/5'
        : 'border-zinc-800/60 bg-zinc-900/40'}
    `}>
      <div className="flex items-center justify-between gap-3">
        {/* Fighter 1 */}
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-sm truncate ${
            hasWinner
              ? fight.winner_id === f1?.id ? 'text-white' : 'text-zinc-500 line-through decoration-zinc-600'
              : 'text-white'
          }`}>
            {f1?.name ?? 'TBA'}
          </p>
          <p className="text-xs text-zinc-600">
            {f1?.wins ?? 0}–{f1?.losses ?? 0}
          </p>
        </div>

        {/* Center */}
        <div className="text-center shrink-0 px-2">
          <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-0.5">
            {fight.weight_class}
          </p>
          {hasWinner ? (
            <p className="text-[10px] font-semibold text-zinc-500">
              {fight.method ?? 'DEC'}
              {fight.round ? ` R${fight.round}` : ''}
            </p>
          ) : (
            <p className="text-xs font-black text-zinc-700">VS</p>
          )}
        </div>

        {/* Fighter 2 */}
        <div className="flex-1 min-w-0 text-right">
          <p className={`font-bold text-sm truncate ${
            hasWinner
              ? fight.winner_id === f2?.id ? 'text-white' : 'text-zinc-500 line-through decoration-zinc-600'
              : 'text-white'
          }`}>
            {f2?.name ?? 'TBA'}
          </p>
          <p className="text-xs text-zinc-600">
            {f2?.wins ?? 0}–{f2?.losses ?? 0}
          </p>
        </div>
      </div>
    </div>
  )
}
