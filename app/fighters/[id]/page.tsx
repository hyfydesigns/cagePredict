import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { FighterRow, EventRow } from '@/types/database'

export const revalidate = 3600

type Props = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('fighters').select('name, weight_class').eq('id', id).single()
  return {
    title: data ? `${(data as any).name} · CagePredict` : 'Fighter',
    description: data
      ? `${(data as any).name} UFC fighter profile, stats, and analysis`
      : '',
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54
  return `${Math.floor(totalIn / 12)}'${Math.round(totalIn % 12)}"`
}
function cmToIn(cm: number) {
  return `${Math.round(cm / 2.54)}"`
}

function formatOdds(odds: number): string {
  return odds >= 0 ? `+${odds}` : `${odds}`
}

function formatDate(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

// ---------------------------------------------------------------------------
// Google News RSS
// ---------------------------------------------------------------------------
async function fetchFighterNews(
  name: string
): Promise<{ title: string; link: string; pubDate: string; source: string }[]> {
  try {
    const query = encodeURIComponent(`${name} UFC MMA`)
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const xml = await res.text()
    const items: { title: string; link: string; pubDate: string; source: string }[] = []
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g)
    for (const match of itemMatches) {
      const item = match[1]
      const title =
        item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
        item.match(/<title>(.*?)<\/title>/)?.[1] ??
        ''
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? ''
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? ''
      const source = item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? ''
      if (title && link)
        items.push({
          title: title
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>'),
          link,
          pubDate,
          source,
        })
      if (items.length >= 6) break
    }
    return items
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Inline sub-components
// ---------------------------------------------------------------------------
function StatBar({
  label,
  value,
  max,
  unit,
}: {
  label: string
  value: number | null
  max: number
  unit?: string
}) {
  if (!value) return null
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className="text-xs font-bold text-white">
          {value}
          {unit ?? ''}
        </span>
      </div>
      <div className="bg-zinc-800 rounded-full h-1.5">
        <div
          className="bg-primary rounded-full h-1.5 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function FormPills({ form }: { form: string | null }) {
  if (!form) return null
  return (
    <div className="flex gap-1.5 flex-wrap">
      {form
        .toUpperCase()
        .split('')
        .map((char, i) => (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
              char === 'W'
                ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                : char === 'L'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-zinc-700 text-zinc-400 border border-zinc-600'
            }`}
          >
            {char}
          </span>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function FighterProfilePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch fighter
  const { data: fighter } = await supabase
    .from('fighters')
    .select('*')
    .eq('id', id)
    .single()

  if (!fighter) notFound()

  const f = fighter as FighterRow

  // Fetch recent/upcoming fights
  const { data: fightRows } = await supabase
    .from('fights')
    .select(
      'id, fight_time, status, odds_f1, odds_f2, fighter1_id, fighter2_id, event_id, weight_class, is_main_event, is_title_fight'
    )
    .or(`fighter1_id.eq.${id},fighter2_id.eq.${id}`)
    .neq('status', 'cancelled')
    .order('fight_time', { ascending: false })
    .limit(3)

  // Batch-fetch opponents and events
  let fights: Array<{
    id: string
    fight_time: string
    status: string
    odds_f1: number
    odds_f2: number
    fighter1_id: string
    fighter2_id: string
    event_id: string
    weight_class: string | null
    is_main_event: boolean
    is_title_fight: boolean
    opponent: FighterRow | null
    event: EventRow | null
  }> = []

  if (fightRows && fightRows.length > 0) {
    const opponentIds = fightRows.map((f) =>
      f.fighter1_id === id ? f.fighter2_id : f.fighter1_id
    )
    const eventIds = fightRows.map((f) => f.event_id)

    const [{ data: opponents }, { data: events }] = await Promise.all([
      supabase.from('fighters').select('*').in('id', opponentIds),
      supabase.from('events').select('*').in('id', eventIds),
    ])

    fights = fightRows.map((fight) => {
      const opponentId = fight.fighter1_id === id ? fight.fighter2_id : fight.fighter1_id
      return {
        ...fight,
        opponent: (opponents?.find((o) => o.id === opponentId) as FighterRow) ?? null,
        event: (events?.find((e) => e.id === fight.event_id) as EventRow) ?? null,
      }
    })
  }

  const primaryFight = fights[0] ?? null
  const isF1 = primaryFight?.fighter1_id === id
  const myOdds = primaryFight ? (isF1 ? primaryFight.odds_f1 : primaryFight.odds_f2) : null

  // Fetch news
  const news = await fetchFighterNews(f.name)

  return (
    <div className="min-h-screen bg-zinc-950 pb-16">
      {/* Top nav */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            ← Back to fights
          </Link>
          <p className="text-sm font-bold text-white truncate">{f.name}</p>
          <span className="text-xs text-zinc-500 shrink-0">{f.weight_class}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        {/* HERO */}
        <div className="relative h-48 sm:h-64 bg-zinc-900 rounded-2xl overflow-hidden">
          {f.image_url ? (
            <Image
              src={f.image_url}
              alt={f.name}
              fill
              className="object-cover object-top opacity-65"
              sizes="(max-width: 672px) 100vw, 672px"
              priority
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-8xl">{f.flag_emoji ?? '🥊'}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

          {/* Name + badges */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                {f.nickname && (
                  <p className="text-zinc-400 text-xs italic mb-0.5">"{f.nickname}"</p>
                )}
                <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                  {f.name}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  {f.flag_emoji && <span className="text-lg">{f.flag_emoji}</span>}
                  <span className="text-zinc-300 text-sm font-medium">{f.nationality}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-block bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-white font-black text-lg">
                  {f.record}
                </span>
                <p className="text-zinc-500 text-[10px] mt-1">W-L-D</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats + Social */}
        <div className="grid grid-cols-2 gap-4">
          {/* Stats */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-3">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Stats
            </p>
            {f.age && (
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Age</span>
                <span className="text-white font-bold text-xs">{f.age}</span>
              </div>
            )}
            {f.height_cm && (
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Height</span>
                <span className="text-white font-bold text-xs">{cmToFtIn(f.height_cm)}</span>
              </div>
            )}
            {f.reach_cm && (
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Reach</span>
                <span className="text-white font-bold text-xs">{cmToIn(f.reach_cm)}</span>
              </div>
            )}
            {f.fighting_style && (
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Style</span>
                <span className="text-white font-bold text-xs text-right max-w-[100px] leading-tight">
                  {f.fighting_style}
                </span>
              </div>
            )}
            {f.wins !== undefined && (
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Record</span>
                <span className="text-white font-bold text-xs">
                  {f.wins}W {f.losses}L {f.draws}D
                </span>
              </div>
            )}
          </div>

          {/* Social / Links */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Links
            </p>
            <div className="space-y-3">
              {(f as any).x_handle && (
                <a
                  href={`https://x.com/${(f as any).x_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  <span className="font-black text-base">𝕏</span>
                  <span className="text-xs">@{(f as any).x_handle}</span>
                </a>
              )}
              {(f as any).instagram_handle && (
                <a
                  href={`https://instagram.com/${(f as any).instagram_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  <span className="text-base">📸</span>
                  <span className="text-xs">@{(f as any).instagram_handle}</span>
                </a>
              )}
              {(f as any).ufc_url && (
                <a
                  href={(f as any).ufc_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  <span className="text-base">🔗</span>
                  <span className="text-xs">UFC Profile</span>
                </a>
              )}
              {!(f as any).x_handle && !(f as any).instagram_handle && !(f as any).ufc_url && (
                <p className="text-zinc-600 text-xs">No links yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Form */}
        {f.last_5_form && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Last 5 Form
            </p>
            <FormPills form={f.last_5_form} />
          </div>
        )}

        {/* Performance stats */}
        {(f.striking_accuracy || f.td_avg || f.sub_avg) && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Performance
            </p>
            <StatBar
              label="Striking Accuracy"
              value={f.striking_accuracy}
              max={100}
              unit="%"
            />
            <StatBar label="Takedown Avg / 15min" value={f.td_avg} max={10} />
            <StatBar label="Submission Avg / 15min" value={f.sub_avg} max={5} />
          </div>
        )}

        {/* Analysis */}
        {f.analysis && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Analysis
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed">{f.analysis}</p>
          </div>
        )}

        {/* Next / Recent fight */}
        {primaryFight && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              {primaryFight.status === 'upcoming' ? 'Next Fight' : 'Recent Fight'}
            </p>
            <div className="space-y-2">
              {primaryFight.event && (
                <p className="text-white font-bold text-sm">{primaryFight.event.name}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-400 text-xs">
                  {new Date(primaryFight.fight_time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {primaryFight.opponent && (
                  <>
                    <span className="text-zinc-600">vs</span>
                    <Link
                      href={`/fighters/${primaryFight.opponent.id}`}
                      className="text-primary text-xs font-bold hover:underline"
                    >
                      {primaryFight.opponent.name}
                    </Link>
                  </>
                )}
                {primaryFight.weight_class && (
                  <span className="text-zinc-500 text-xs">{primaryFight.weight_class}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {primaryFight.is_title_fight && (
                  <span className="bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    TITLE FIGHT
                  </span>
                )}
                {primaryFight.is_main_event && (
                  <span className="bg-zinc-700 text-zinc-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    MAIN EVENT
                  </span>
                )}
                {myOdds !== null && (
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      myOdds < 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    {formatOdds(myOdds)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent News */}
        {news.length > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Recent News
            </p>
            <div className="space-y-4">
              {news.map((item, i) => (
                <a
                  key={i}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <p className="text-sm text-zinc-200 group-hover:text-white font-medium leading-snug line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {item.source}
                    {item.pubDate ? ` · ${formatDate(item.pubDate)}` : ''}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
