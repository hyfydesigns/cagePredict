import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { BarChart2, Trophy } from 'lucide-react'
import { fetchUfcRankings } from '@/lib/apis/ufc-rankings'
import type { UfcDivisionRankings } from '@/lib/apis/ufc-rankings'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'UFC Standings | CagePredict',
  description: 'Official UFC fighter rankings by weight class.',
}

// Revalidate every 6 hours — rankings update weekly at most
export const revalidate = 21600

// Canonical division display order
const DIVISION_ORDER = [
  "Men's Pound-for-Pound Top Rank",
  'Heavyweight',
  'Light Heavyweight',
  'Middleweight',
  'Welterweight',
  'Lightweight',
  'Featherweight',
  'Bantamweight',
  'Flyweight',
  "Women's Pound-for-Pound Top Rank",
  "Women's Bantamweight",
  "Women's Flyweight",
  "Women's Strawweight",
]

function normDiv(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

function sortDivisions(divisions: UfcDivisionRankings[]): UfcDivisionRankings[] {
  const ordered: UfcDivisionRankings[] = []
  const seen = new Set<string>()

  for (const canonical of DIVISION_ORDER) {
    const match = divisions.find(
      (d) => normDiv(d.division) === normDiv(canonical)
    )
    if (match) {
      ordered.push(match)
      seen.add(match.division)
    }
  }

  // Append any unrecognised divisions alphabetically
  const extras = divisions
    .filter((d) => !seen.has(d.division))
    .sort((a, b) => a.division.localeCompare(b.division))
  ordered.push(...extras)

  return ordered
}

function rankBadgeClass(rank: number, isChampion: boolean): string {
  if (isChampion) return 'bg-amber-500/20 text-amber-500 border-amber-500/40'
  if (rank === 1)  return 'bg-surface-3/60 text-foreground border-border/60'
  return 'bg-transparent text-foreground-secondary border-border/40'
}

// Build a lookup: normalised name → internal fighter id
function buildNameIndex(fighters: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const f of fighters) {
    map.set(f.name.toLowerCase().trim(), f.id)
  }
  return map
}

export default async function StandingsPage() {
  // Fetch UFC rankings + our DB fighters in parallel
  const supabase = await createClient()

  const [divisions, { data: dbFighters }] = await Promise.all([
    fetchUfcRankings(),
    supabase.from('fighters').select('id, name'),
  ])

  const nameIndex = buildNameIndex((dbFighters ?? []) as { id: string; name: string }[])
  const sorted = sortDivisions(divisions)

  const isEmpty = sorted.length === 0

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-10">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-black text-foreground">UFC Standings</h1>
        </div>
        <p className="text-foreground-secondary text-sm pl-9">
          Official UFC rankings by weight class — updated weekly
        </p>
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-foreground-muted">
          <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-foreground-secondary">Rankings unavailable right now</p>
          <p className="text-sm mt-1">Could not reach ufc.com — try again shortly.</p>
        </div>
      )}

      {sorted.map(({ division, isPap, champion, ranked }) => (
        <section key={division}>
          {/* Section header */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-foreground">{division}</h2>
            <Badge variant="outline" className="text-xs font-medium text-foreground-secondary">
              {ranked.length + (champion ? 1 : 0)} fighter{(ranked.length + (champion ? 1 : 0)) !== 1 ? 's' : ''}
            </Badge>
          </div>

          <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 px-4 py-2.5 border-b border-border bg-surface">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">#</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">Fighter</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted text-right">
                {isPap ? 'P4P' : 'Division'}
              </span>
            </div>

            {/* Champion row */}
            {champion && (
              <FighterRow
                rank={0}
                name={champion.name}
                isChampion
                isInterim={champion.isInterim}
                isPap={isPap}
                fighterId={nameIndex.get(champion.name.toLowerCase().trim())}
              />
            )}

            {/* Contender rows */}
            {ranked.map((fighter) => (
              <FighterRow
                key={fighter.slug}
                rank={fighter.rank}
                name={fighter.name}
                isChampion={false}
                isInterim={false}
                isPap={isPap}
                fighterId={nameIndex.get(fighter.name.toLowerCase().trim())}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fighter row component
// ---------------------------------------------------------------------------

function FighterRow({
  rank,
  name,
  isChampion,
  isInterim,
  isPap,
  fighterId,
}: {
  rank:       number
  name:       string
  isChampion: boolean
  isInterim:  boolean
  isPap:      boolean
  fighterId?: string
}) {
  const label = isChampion
    ? isInterim ? 'IC' : 'C'
    : String(rank)

  const nameEl = fighterId ? (
    <Link
      href={`/fighters/${fighterId}`}
      className="text-sm font-semibold text-foreground truncate leading-tight hover:text-primary transition-colors"
    >
      {name}
    </Link>
  ) : (
    <p className="text-sm font-semibold text-foreground truncate leading-tight">
      {name}
    </p>
  )

  return (
    <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-surface-2/30 transition-colors">
      {/* Rank badge */}
      <div className="flex items-center justify-center">
        {isChampion ? (
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border bg-amber-500/20 text-amber-500 border-amber-500/40">
            {label}
          </span>
        ) : (
          <span className={[
            'inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border',
            rankBadgeClass(rank, false),
          ].join(' ')}>
            {label}
          </span>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0 flex items-center gap-2">
        {nameEl}
        {isChampion && (
          <Trophy className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        )}
      </div>

      {/* Right label */}
      <div className="text-right">
        {isChampion ? (
          <span className="text-xs font-semibold text-amber-500">
            {isInterim ? 'Interim Champ' : isPap ? 'P4P #1' : 'Champion'}
          </span>
        ) : (
          <span className="text-xs text-foreground-muted">
            #{rank}
          </span>
        )}
      </div>
    </div>
  )
}
