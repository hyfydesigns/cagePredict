import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import type { FighterRow } from '@/types/database'
import { notFound } from 'next/navigation'

export const revalidate = 86400   // revalidate daily (Sherdog cache matches)

type Props = { params: Promise<{ id: string }> }

// ─── Data fetching ────────────────────────────────────────────────────────────

interface CareerFight {
  result:      'W' | 'L' | 'D' | 'NC'
  opponent:    string
  opponentHref: string | null
  eventName:   string | null
  date:        string | null       // ISO "YYYY-MM-DD"
  method:      string | null
  round:       number | null
  time:        string | null
  /** True if this fight was in the UFC/DWCS */
  isUFC:       boolean
}

interface CareerStats {
  wins:       number
  losses:     number
  draws:      number
  nc:         number
  winsByKO:   number
  winsBySub:  number
  winsByDec:  number
  lossByKO:   number
  lossBySub:  number
  lossByDec:  number
  firstRoundFinishes: number
  longestWinStreak:   number
  currentStreak:      number   // positive = wins, negative = losses
}

function computeStats(fights: CareerFight[]): CareerStats {
  let wins = 0, losses = 0, draws = 0, nc = 0
  let winsByKO = 0, winsBySub = 0, winsByDec = 0
  let lossByKO = 0, lossBySub = 0, lossByDec = 0
  let firstRoundFinishes = 0

  for (const f of fights) {
    const m = (f.method ?? '').toLowerCase()
    if (f.result === 'W') {
      wins++
      if (m.includes('ko') || m.includes('tko')) { winsByKO++; if (f.round === 1) firstRoundFinishes++ }
      else if (m.includes('sub') || m.includes('choke') || m.includes('lock') || m.includes('triangle')) { winsBySub++; if (f.round === 1) firstRoundFinishes++ }
      else winsByDec++
    } else if (f.result === 'L') {
      losses++
      if (m.includes('ko') || m.includes('tko')) lossByKO++
      else if (m.includes('sub') || m.includes('choke') || m.includes('lock') || m.includes('triangle')) lossBySub++
      else lossByDec++
    } else if (f.result === 'D') draws++
    else nc++
  }

  // Longest win streak (fights are newest-first; reverse for chronological)
  const chrono = [...fights].reverse()
  let maxStreak = 0, cur = 0
  for (const f of chrono) {
    if (f.result === 'W') { cur++; maxStreak = Math.max(maxStreak, cur) }
    else cur = 0
  }

  // Current streak (from most recent fight)
  let currentStreak = 0
  for (const f of fights) {
    if (f.result === 'W') {
      if (currentStreak < 0) break
      currentStreak++
    } else if (f.result === 'L') {
      if (currentStreak > 0) break
      currentStreak--
    } else break  // draw/NC resets
  }

  return { wins, losses, draws, nc, winsByKO, winsBySub, winsByDec, lossByKO, lossBySub, lossByDec, firstRoundFinishes, longestWinStreak: maxStreak, currentStreak }
}

function isUFCEvent(eventName: string | null): boolean {
  if (!eventName) return false
  const n = eventName.toLowerCase()
  return n.includes('ufc') || n.includes('ultimate fighting') || n.includes('contender series') || n.includes('dwcs') || n.includes('the ultimate fighter') || n.includes('tuf')
}

async function getCareerFights(fighter: FighterRow): Promise<{ fights: CareerFight[]; source: string }> {
  // Always try Sherdog first — it has the most complete career records
  try {
    const { getSherdogData } = await import('@/lib/apis/sherdog')
    const { fights, sourceUrl } = await getSherdogData(fighter.name)
    if (fights.length > 0) {
      return {
        source: sourceUrl ?? 'Sherdog',
        fights: fights.map((f) => ({
          result:       f.result,
          opponent:     f.opponent,
          opponentHref: f.opponentUrl ? `https://www.sherdog.com${f.opponentUrl}` : null,
          eventName:    f.eventName,
          date:         f.dateIso,
          method:       f.method,
          round:        f.round,
          time:         f.time,
          isUFC:        isUFCEvent(f.eventName),
        })),
      }
    }
  } catch { /* fall through */ }

  // Fallback: api-sports.io or RapidAPI from UUID
  const parts = fighter.id.split('-')
  if (parts.length === 5 && parts[2] === '0004') {
    try {
      const n = parseInt(parts[4], 10)
      if (!isNaN(n) && n !== 0) {
        const { getFighterFights } = await import('@/lib/apis/api-sports')
        const raw = await getFighterFights(n)
        const fights: CareerFight[] = raw
          .filter((f) => f.status === 'Finished' || f.status === 'Final')
          .map((f) => {
            const isFirst = f.fighters.first.id === n
            const opp     = isFirst ? f.fighters.second : f.fighters.first
            const won     = f.winner?.id === n
            const isNC    = f.result?.type?.toLowerCase().includes('no contest') ?? false
            const isDraw  = f.result?.type?.toLowerCase().includes('draw') ?? false
            return {
              result:       isNC ? 'NC' : isDraw ? 'D' : won ? 'W' : 'L',
              opponent:     opp.name,
              opponentHref: null,
              eventName:    f.event.name,
              date:         f.date?.slice(0, 10) ?? null,
              method:       f.result?.type ?? null,
              round:        f.result?.round ?? null,
              time:         f.result?.clock ?? null,
              isUFC:        isUFCEvent(f.event.name),
            } as CareerFight
          })
          .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        if (fights.length > 0) return { fights, source: 'api-sports.io' }
      }
    } catch { /* fall through */ }
  }

  return { fights: [], source: '' }
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('fighters').select('name').eq('id', id).single()
  const name = (data as any)?.name ?? 'Fighter'
  return {
    title: `${name} — Full Career Record · CagePredict`,
    description: `Complete professional MMA career record for ${name}, including pre-UFC fights.`,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number): string {
  if (!den) return '0%'
  return `${Math.round((num / den) * 100)}%`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: 'W' | 'L' | 'D' | 'NC' }) {
  const cls =
    result === 'W'  ? 'bg-green-500/20 border-green-500/40 text-green-400' :
    result === 'L'  ? 'bg-red-500/20 border-red-500/40 text-red-400' :
    result === 'NC' ? 'bg-zinc-700/40 border-zinc-600 text-zinc-500' :
                     'bg-zinc-700/40 border-zinc-600 text-zinc-400'
  return (
    <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border ${cls}`}>
      {result}
    </span>
  )
}

function StatCell({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-white font-black text-2xl leading-none">{value}</p>
      {sub && <p className="text-zinc-500 text-[10px] mt-0.5">{sub}</p>}
      <p className="text-zinc-500 text-[11px] mt-1">{label}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function FighterRecordPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: fighter } = await supabase
    .from('fighters')
    .select('*')
    .eq('id', id)
    .single()

  if (!fighter) notFound()
  const f = fighter as FighterRow

  const { fights, source } = await getCareerFights(f)

  if (fights.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 pb-16">
        <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60">
          <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-4">
            <Link href={`/fighters/${id}`} className="text-sm text-zinc-400 hover:text-white transition-colors">
              ← {f.name}
            </Link>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pt-16 text-center">
          <p className="text-zinc-500 text-sm">No career records found for {f.name}.</p>
        </div>
      </div>
    )
  }

  const stats    = computeStats(fights)
  const ufcFights  = fights.filter((f) => f.isUFC)
  const otherFights = fights.filter((f) => !f.isUFC)

  // Group all fights by year for timeline display
  const byYear = new Map<string, CareerFight[]>()
  for (const fight of fights) {
    const year = fight.date?.slice(0, 4) ?? 'Unknown'
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(fight)
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a))

  const sourceLabel = typeof source === 'string' && source.startsWith('http')
    ? 'Sherdog.com'
    : source

  return (
    <div className="min-h-screen bg-zinc-950 pb-16">
      {/* Nav */}
      <div className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <Link href={`/fighters/${id}`} className="text-sm text-zinc-400 hover:text-white transition-colors shrink-0">
            ← {f.name}
          </Link>
          <p className="text-sm font-bold text-white truncate">Full Career Record</p>
          <span className="text-[10px] text-zinc-600 shrink-0">{fights.length} fights</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Hero record */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-black text-white">{f.name}</h1>
              {f.weight_class && <p className="text-zinc-500 text-xs mt-0.5">{f.weight_class}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-white">{stats.wins}-{stats.losses}-{stats.draws}</p>
              <p className="text-zinc-500 text-[10px] mt-0.5">W · L · D{stats.nc > 0 ? ` · ${stats.nc} NC` : ''}</p>
            </div>
          </div>

          {/* Win/loss bars */}
          <div className="space-y-2.5">
            {/* Wins breakdown */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-zinc-500">Wins ({stats.wins})</span>
                <span className="text-[11px] text-zinc-500">
                  KO/TKO {stats.winsByKO} · Sub {stats.winsBySub} · Dec {stats.winsByDec}
                </span>
              </div>
              {stats.wins > 0 && (
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 gap-px">
                  {stats.winsByKO > 0 && (
                    <div className="bg-red-500" style={{ width: pct(stats.winsByKO, stats.wins) }} title={`KO/TKO: ${stats.winsByKO}`} />
                  )}
                  {stats.winsBySub > 0 && (
                    <div className="bg-amber-500" style={{ width: pct(stats.winsBySub, stats.wins) }} title={`Sub: ${stats.winsBySub}`} />
                  )}
                  {stats.winsByDec > 0 && (
                    <div className="bg-blue-500" style={{ width: pct(stats.winsByDec, stats.wins) }} title={`Decision: ${stats.winsByDec}`} />
                  )}
                </div>
              )}
              <div className="flex gap-3 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-zinc-600"><span className="w-2 h-2 rounded-sm bg-red-500 shrink-0" />KO/TKO</span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-600"><span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0" />Sub</span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-600"><span className="w-2 h-2 rounded-sm bg-blue-500 shrink-0" />Decision</span>
              </div>
            </div>

            {/* Losses breakdown */}
            {stats.losses > 0 && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-zinc-500">Losses ({stats.losses})</span>
                  <span className="text-[11px] text-zinc-500">
                    KO/TKO {stats.lossByKO} · Sub {stats.lossBySub} · Dec {stats.lossByDec}
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800 gap-px">
                  {stats.lossByKO > 0 && (
                    <div className="bg-red-800" style={{ width: pct(stats.lossByKO, stats.losses) }} />
                  )}
                  {stats.lossBySub > 0 && (
                    <div className="bg-amber-800" style={{ width: pct(stats.lossBySub, stats.losses) }} />
                  )}
                  {stats.lossByDec > 0 && (
                    <div className="bg-blue-900" style={{ width: pct(stats.lossByDec, stats.losses) }} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick stat grid */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-4 px-2 text-center">
            <p className="text-white font-black text-2xl leading-none">{pct(stats.winsByKO + stats.winsBySub, stats.wins)}</p>
            <p className="text-zinc-500 text-[10px] mt-1.5">Finish<br/>Rate</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-4 px-2 text-center">
            <p className="text-white font-black text-2xl leading-none">{stats.firstRoundFinishes}</p>
            <p className="text-zinc-500 text-[10px] mt-1.5">Rd 1<br/>Finishes</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-4 px-2 text-center">
            <p className="text-white font-black text-2xl leading-none">{stats.longestWinStreak}</p>
            <p className="text-zinc-500 text-[10px] mt-1.5">Best<br/>Streak</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 py-4 px-2 text-center">
            <p className={`font-black text-2xl leading-none ${stats.currentStreak > 0 ? 'text-green-400' : stats.currentStreak < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
              {stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak < 0 ? stats.currentStreak : '—'}
            </p>
            <p className="text-zinc-500 text-[10px] mt-1.5">Current<br/>Streak</p>
          </div>
        </div>

        {/* Promotion breakdown */}
        {ufcFights.length > 0 && otherFights.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">UFC Career</p>
              <p className="text-white font-black text-xl">
                {ufcFights.filter(f => f.result === 'W').length}–{ufcFights.filter(f => f.result === 'L').length}
                {ufcFights.filter(f => f.result === 'D').length > 0 ? `–${ufcFights.filter(f => f.result === 'D').length}` : ''}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">{ufcFights.length} fights</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Other Orgs</p>
              <p className="text-white font-black text-xl">
                {otherFights.filter(f => f.result === 'W').length}–{otherFights.filter(f => f.result === 'L').length}
                {otherFights.filter(f => f.result === 'D').length > 0 ? `–${otherFights.filter(f => f.result === 'D').length}` : ''}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">{otherFights.length} fights</p>
            </div>
          </div>
        )}

        {/* Fight history by year */}
        {years.map((year) => {
          const yearFights = byYear.get(year)!
          const yearW = yearFights.filter(f => f.result === 'W').length
          const yearL = yearFights.filter(f => f.result === 'L').length
          return (
            <div key={year} className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              {/* Year header */}
              <div className="px-5 py-3 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-sm font-black text-white">{year}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">{yearFights.length} fight{yearFights.length !== 1 ? 's' : ''}</span>
                  <span className="text-[11px] text-green-400 font-bold">{yearW}W</span>
                  {yearL > 0 && <span className="text-[11px] text-red-400 font-bold">{yearL}L</span>}
                </div>
              </div>

              <div className="divide-y divide-zinc-800/60">
                {yearFights.map((fight, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                    <ResultBadge result={fight.result} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-zinc-500 text-xs">vs</span>
                        {fight.opponentHref ? (
                          <a
                            href={fight.opponentHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white text-sm font-bold hover:text-primary transition-colors"
                          >
                            {fight.opponent}
                          </a>
                        ) : (
                          <span className="text-white text-sm font-bold">{fight.opponent}</span>
                        )}
                        {fight.isUFC && (
                          <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-full">UFC</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {fight.eventName && (
                          <span className="text-zinc-500 text-[11px] truncate max-w-[200px]">{fight.eventName}</span>
                        )}
                        {fight.eventName && fight.date && (
                          <span className="text-zinc-700 text-[11px]">·</span>
                        )}
                        {fight.date && (
                          <span className="text-zinc-600 text-[11px]">{formatDate(fight.date)}</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right min-w-[80px]">
                      {fight.method && (
                        <p className="text-zinc-300 text-xs font-semibold leading-tight">{fight.method}</p>
                      )}
                      {fight.round && (
                        <p className="text-zinc-600 text-[11px] mt-0.5">
                          R{fight.round}{fight.time ? ` · ${fight.time}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Source attribution */}
        {sourceLabel && (
          <p className="text-center text-zinc-700 text-[11px] pt-2">
            Records sourced from{' '}
            {source?.startsWith('http') ? (
              <a href={source} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-500 underline underline-offset-2 transition-colors">
                {sourceLabel}
              </a>
            ) : (
              sourceLabel
            )}
          </p>
        )}
      </div>
    </div>
  )
}
