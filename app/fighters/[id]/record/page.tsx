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
          .filter((f) => {
            const statusLong = typeof f.status === 'object' && f.status !== null
              ? (f.status.long ?? f.status.short ?? '')
              : String(f.status ?? '')
            return statusLong === 'Finished' || statusLong === 'Final'
          })
          .map((f) => {
            const isFirst = f.fighters.first?.id === n
            const opp     = isFirst ? f.fighters.second : f.fighters.first
            const won = f.fighters.first?.winner
              ? f.fighters.first.id === n
              : f.fighters.second?.winner
                ? f.fighters.second.id === n
                : f.winner?.id === n
            const isNC   = f.result?.type?.toLowerCase().includes('no contest') ?? false
            const isDraw = f.result?.type?.toLowerCase().includes('draw') ?? false
            const eventName = f.slug ?? f.event?.name ?? 'Unknown Event'
            return {
              result:       isNC ? 'NC' : isDraw ? 'D' : won ? 'W' : 'L',
              opponent:     opp?.name ?? 'Unknown',
              opponentHref: null,
              eventName,
              date:         f.date?.slice(0, 10) ?? null,
              method:       f.result?.type ?? null,
              round:        f.result?.round ?? null,
              time:         f.result?.clock ?? null,
              isUFC:        isUFCEvent(eventName),
            } as CareerFight
          })
          .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        if (fights.length > 0) return { fights, source: 'api-sports.io' }
      }
    } catch { /* fall through */ }
  }

  return { fights: [], source: '' }
}

/** Load fights we already have in our DB for this fighter as a last-resort fallback. */
async function getDbFights(fighterId: string): Promise<CareerFight[]> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('fights')
    .select('fighter1_id, fighter2_id, fight_time, status, winner_id, method, round, time_of_finish, event_id')
    .or(`fighter1_id.eq.${fighterId},fighter2_id.eq.${fighterId}`)
    .eq('status', 'completed')
    .order('fight_time', { ascending: false })

  if (!rows?.length) return []

  const opponentIds = rows.map((r) => r.fighter1_id === fighterId ? r.fighter2_id : r.fighter1_id)
  const eventIds    = rows.map((r) => r.event_id)

  const [{ data: opponents }, { data: events }] = await Promise.all([
    supabase.from('fighters').select('id, name').in('id', [...new Set(opponentIds)]),
    supabase.from('events').select('id, name').in('id', [...new Set(eventIds)]),
  ])

  return rows.map((r) => {
    const oppId   = r.fighter1_id === fighterId ? r.fighter2_id : r.fighter1_id
    const opp     = opponents?.find((o) => o.id === oppId)
    const event   = events?.find((e) => e.id === r.event_id)
    const won     = r.winner_id === fighterId
    const lost    = r.winner_id && r.winner_id !== fighterId
    const result: CareerFight['result'] = won ? 'W' : lost ? 'L' : 'D'
    return {
      result,
      opponent:    opp?.name ?? 'Unknown',
      opponentHref: opp ? `/fighters/${opp.id}` : null,
      eventName:   event?.name ?? null,
      date:        r.fight_time?.slice(0, 10) ?? null,
      method:      r.method,
      round:       r.round,
      time:        r.time_of_finish,
      isUFC:       isUFCEvent(event?.name ?? null),
    }
  })
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
    result === 'NC' ? 'bg-surface-3/40 border-border text-foreground-muted' :
                     'bg-surface-3/40 border-border text-foreground-muted'
  return (
    <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border ${cls}`}>
      {result}
    </span>
  )
}

function StatCell({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-foreground font-black text-2xl leading-none">{value}</p>
      {sub && <p className="text-foreground-muted text-[10px] mt-0.5">{sub}</p>}
      <p className="text-foreground-muted text-[11px] mt-1">{label}</p>
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

  const [externalResult, dbFights] = await Promise.all([
    getCareerFights(f),
    getDbFights(id),
  ])

  // Prefer external (Sherdog/api-sports) for completeness; fall back to DB
  let fights  = externalResult.fights
  let source  = externalResult.source
  if (fights.length === 0 && dbFights.length > 0) {
    fights = dbFights
    source = 'CagePredict database'
  }

  if (fights.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-16">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/60">
          <div className="max-w-2xl mx-auto px-4 h-12 flex items-center gap-4">
            <Link href={`/fighters/${id}`} className="text-sm text-foreground-muted hover:text-foreground transition-colors">
              ← {f.name}
            </Link>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-4 pt-16 text-center space-y-4">
          <p className="text-foreground-muted text-sm">No career records found for <span className="text-foreground font-bold">{f.name}</span>.</p>
          <a
            href={`https://www.sherdog.com/stats/fightfinder?SearchTxt=${encodeURIComponent(f.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-foreground-muted hover:text-foreground border border-border hover:border-border rounded-lg px-4 py-2 transition-colors"
          >
            Search on Sherdog →
          </a>
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
    <div className="min-h-screen bg-background pb-16">
      {/* Nav */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/60">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <Link href={`/fighters/${id}`} className="text-sm text-foreground-muted hover:text-foreground transition-colors shrink-0">
            ← {f.name}
          </Link>
          <p className="text-sm font-bold text-foreground truncate">Full Career Record</p>
          <span className="text-[10px] text-foreground-muted shrink-0">{fights.length} fights</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">

        {/* Hero record */}
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-black text-foreground">{f.name}</h1>
              {f.weight_class && <p className="text-foreground-muted text-xs mt-0.5">{f.weight_class}</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-foreground">{stats.wins}-{stats.losses}-{stats.draws}</p>
              <p className="text-foreground-muted text-[10px] mt-0.5">W · L · D{stats.nc > 0 ? ` · ${stats.nc} NC` : ''}</p>
            </div>
          </div>

          {/* Win/loss bars */}
          <div className="space-y-2.5">
            {/* Wins breakdown */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-foreground-muted">Wins ({stats.wins})</span>
                <span className="text-[11px] text-foreground-muted">
                  KO/TKO {stats.winsByKO} · Sub {stats.winsBySub} · Dec {stats.winsByDec}
                </span>
              </div>
              {stats.wins > 0 && (
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-2 gap-px">
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
                <span className="flex items-center gap-1 text-[10px] text-foreground-muted"><span className="w-2 h-2 rounded-sm bg-red-500 shrink-0" />KO/TKO</span>
                <span className="flex items-center gap-1 text-[10px] text-foreground-muted"><span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0" />Sub</span>
                <span className="flex items-center gap-1 text-[10px] text-foreground-muted"><span className="w-2 h-2 rounded-sm bg-blue-500 shrink-0" />Decision</span>
              </div>
            </div>

            {/* Losses breakdown */}
            {stats.losses > 0 && (
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-foreground-muted">Losses ({stats.losses})</span>
                  <span className="text-[11px] text-foreground-muted">
                    KO/TKO {stats.lossByKO} · Sub {stats.lossBySub} · Dec {stats.lossByDec}
                  </span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-surface-2 gap-px">
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
          <div className="rounded-2xl border border-border bg-surface py-4 px-2 text-center">
            <p className="text-foreground font-black text-2xl leading-none">{pct(stats.winsByKO + stats.winsBySub, stats.wins)}</p>
            <p className="text-foreground-muted text-[10px] mt-1.5">Finish<br/>Rate</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface py-4 px-2 text-center">
            <p className="text-foreground font-black text-2xl leading-none">{stats.firstRoundFinishes}</p>
            <p className="text-foreground-muted text-[10px] mt-1.5">Rd 1<br/>Finishes</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface py-4 px-2 text-center">
            <p className="text-foreground font-black text-2xl leading-none">{stats.longestWinStreak}</p>
            <p className="text-foreground-muted text-[10px] mt-1.5">Best<br/>Streak</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface py-4 px-2 text-center">
            <p className={`font-black text-2xl leading-none ${stats.currentStreak > 0 ? 'text-green-400' : stats.currentStreak < 0 ? 'text-red-400' : 'text-foreground-muted'}`}>
              {stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak < 0 ? stats.currentStreak : '—'}
            </p>
            <p className="text-foreground-muted text-[10px] mt-1.5">Current<br/>Streak</p>
          </div>
        </div>

        {/* Promotion breakdown */}
        {ufcFights.length > 0 && otherFights.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-surface p-4 text-center">
              <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest mb-2">UFC Career</p>
              <p className="text-foreground font-black text-xl">
                {ufcFights.filter(f => f.result === 'W').length}–{ufcFights.filter(f => f.result === 'L').length}
                {ufcFights.filter(f => f.result === 'D').length > 0 ? `–${ufcFights.filter(f => f.result === 'D').length}` : ''}
              </p>
              <p className="text-foreground-muted text-[10px] mt-0.5">{ufcFights.length} fights</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 text-center">
              <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest mb-2">Other Orgs</p>
              <p className="text-foreground font-black text-xl">
                {otherFights.filter(f => f.result === 'W').length}–{otherFights.filter(f => f.result === 'L').length}
                {otherFights.filter(f => f.result === 'D').length > 0 ? `–${otherFights.filter(f => f.result === 'D').length}` : ''}
              </p>
              <p className="text-foreground-muted text-[10px] mt-0.5">{otherFights.length} fights</p>
            </div>
          </div>
        )}

        {/* Fight history by year */}
        {years.map((year) => {
          const yearFights = byYear.get(year)!
          const yearW = yearFights.filter(f => f.result === 'W').length
          const yearL = yearFights.filter(f => f.result === 'L').length
          return (
            <div key={year} className="rounded-2xl border border-border bg-surface overflow-hidden">
              {/* Year header */}
              <div className="px-5 py-3 bg-surface-2/50 border-b border-border flex items-center justify-between">
                <p className="text-sm font-black text-foreground">{year}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-foreground-muted">{yearFights.length} fight{yearFights.length !== 1 ? 's' : ''}</span>
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
                        <span className="text-foreground-muted text-xs">vs</span>
                        {fight.opponentHref ? (
                          <a
                            href={fight.opponentHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground text-sm font-bold hover:text-primary transition-colors"
                          >
                            {fight.opponent}
                          </a>
                        ) : (
                          <span className="text-foreground text-sm font-bold">{fight.opponent}</span>
                        )}
                        {fight.isUFC && (
                          <span className="text-[9px] font-bold text-foreground-muted bg-surface-2 border border-border px-1.5 py-0.5 rounded-full">UFC</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {fight.eventName && (
                          <span className="text-foreground-muted text-[11px] truncate max-w-[200px]">{fight.eventName}</span>
                        )}
                        {fight.eventName && fight.date && (
                          <span className="text-foreground-muted text-[11px]">·</span>
                        )}
                        {fight.date && (
                          <span className="text-foreground-muted text-[11px]">{formatDate(fight.date)}</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right min-w-[80px]">
                      {fight.method && (
                        <p className="text-foreground-secondary text-xs font-semibold leading-tight">{fight.method}</p>
                      )}
                      {fight.round && (
                        <p className="text-foreground-muted text-[11px] mt-0.5">
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
          <p className="text-center text-foreground-muted text-[11px] pt-2">
            Records sourced from{' '}
            {source?.startsWith('http') ? (
              <a href={source} target="_blank" rel="noopener noreferrer" className="hover:text-foreground-muted underline underline-offset-2 transition-colors">
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
