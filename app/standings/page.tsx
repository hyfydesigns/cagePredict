import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { formatRecord } from '@/lib/utils'
import { BarChart2 } from 'lucide-react'
import type { FighterRow } from '@/types/database'

export const metadata: Metadata = {
  title: 'Weight Class Standings | CagePredict',
  description: 'Fighter standings grouped by weight class, ranked by wins.',
}

export const revalidate = 3600

// Canonical order — unrecognised classes are appended after
const WEIGHT_CLASS_ORDER = [
  'Heavyweight',
  'Light Heavyweight',
  'Middleweight',
  'Welterweight',
  'Lightweight',
  'Featherweight',
  'Bantamweight',
  'Flyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
]

const TOP_N = 15

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseForm(form: string | null): Array<'W' | 'L' | 'D'> {
  if (!form) return []
  return form
    .toUpperCase()
    .split('')
    .filter((c): c is 'W' | 'L' | 'D' => c === 'W' || c === 'L' || c === 'D')
}

function formPillClass(letter: 'W' | 'L' | 'D'): string {
  if (letter === 'W') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
  if (letter === 'L') return 'bg-red-500/15 text-red-400 border border-red-500/25'
  return 'bg-surface-3/50 text-foreground-muted border border-border/40'
}

function rankBadgeClass(rank: number): string {
  if (rank === 1)  return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-600 dark:border-amber-500/30'
  if (rank <= 3)   return 'bg-surface-3/60 text-foreground border-border/40'
  return 'bg-transparent text-foreground-secondary border-border/50'
}

type WeightClassGroup = {
  weightClass: string
  fighters: FighterRow[]
}

function groupAndSort(fighters: FighterRow[]): WeightClassGroup[] {
  const map = new Map<string, FighterRow[]>()

  for (const f of fighters) {
    const wc = f.weight_class ?? 'Unknown'
    if (!map.has(wc)) map.set(wc, [])
    map.get(wc)!.push(f)
  }

  // Sort each group by wins DESC, then losses ASC as tiebreaker
  for (const [, group] of map) {
    group.sort((a, b) => b.wins - a.wins || a.losses - b.losses)
  }

  // Order groups by canonical list
  const ordered: WeightClassGroup[] = []
  const seen = new Set<string>()

  for (const wc of WEIGHT_CLASS_ORDER) {
    if (map.has(wc)) {
      ordered.push({ weightClass: wc, fighters: map.get(wc)! })
      seen.add(wc)
    }
  }

  // Append any unrecognised classes alphabetically
  const extras = [...map.keys()].filter((k) => !seen.has(k)).sort()
  for (const wc of extras) {
    ordered.push({ weightClass: wc, fighters: map.get(wc)! })
  }

  return ordered
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StandingsPage() {
  const supabase = await createClient()

  const { data: rawFighters, error } = await supabase
    .from('fighters')
    .select('*')
    .order('wins', { ascending: false })

  if (error) {
    return (
      <div className="container mx-auto py-16 text-center">
        <p className="text-foreground-secondary">Failed to load standings. Please try again later.</p>
      </div>
    )
  }

  const fighters = ((rawFighters ?? []) as FighterRow[]).filter(
    (f) => f.wins + f.losses > 0
  )

  const groups = groupAndSort(fighters)

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-10">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-black text-foreground">Standings</h1>
        </div>
        <p className="text-foreground-secondary text-sm pl-9">
          Fighter rankings by weight class — sorted by wins
        </p>
      </div>

      {groups.length === 0 && (
        <div className="text-center py-16 text-foreground-muted">
          <BarChart2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-foreground-secondary">No fighter data available yet</p>
        </div>
      )}

      {/* Weight class sections */}
      {groups.map(({ weightClass, fighters: groupFighters }) => {
        const shown = groupFighters.slice(0, TOP_N)

        return (
          <section key={weightClass}>
            {/* Section header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{weightClass}</h2>
                <Badge variant="outline" className="text-xs font-medium text-foreground-secondary">
                  {groupFighters.length} fighter{groupFighters.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {groupFighters.length > TOP_N && (
                <span className="text-xs text-foreground-muted">
                  Showing top {TOP_N} of {groupFighters.length}
                </span>
              )}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2.5rem_1fr_auto_auto] md:grid-cols-[2.5rem_1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2.5 border-b border-border bg-surface">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">#</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">Fighter</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted text-right">Record</span>
                <span className="hidden md:block text-[10px] font-semibold uppercase tracking-wider text-foreground-muted text-right">Form</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted text-right">W</span>
              </div>

              {/* Rows */}
              {shown.map((fighter, index) => {
                const rank = index + 1
                const form = parseForm(fighter.last_5_form)
                const record = formatRecord(fighter.wins, fighter.losses, fighter.draws)

                return (
                  <div
                    key={fighter.id}
                    className="grid grid-cols-[2.5rem_1fr_auto_auto] md:grid-cols-[2.5rem_1fr_auto_auto_auto] items-center gap-x-3 px-4 py-3 border-b border-border/60 last:border-b-0 hover:bg-surface-2/30 transition-colors"
                  >
                    {/* Rank */}
                    <div className="flex items-center justify-center">
                      <span
                        className={[
                          'inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold border',
                          rankBadgeClass(rank),
                        ].join(' ')}
                      >
                        {rank}
                      </span>
                    </div>

                    {/* Fighter name + nickname */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate leading-tight">
                        {fighter.name}
                      </p>
                      {fighter.nickname && (
                        <p className="text-[11px] text-foreground-secondary truncate leading-tight mt-0.5">
                          &quot;{fighter.nickname}&quot;
                        </p>
                      )}
                    </div>

                    {/* Record */}
                    <div className="text-right">
                      <span className="text-sm font-mono font-medium text-foreground-secondary">
                        {record}
                      </span>
                      <div className="flex items-center justify-end gap-0.5 mt-0.5">
                        <span className="text-[10px] text-foreground-muted">W-L{fighter.draws > 0 ? '-D' : ''}</span>
                      </div>
                    </div>

                    {/* Last 5 form — hidden on mobile */}
                    <div className="hidden md:flex items-center justify-end gap-1">
                      {form.length > 0 ? (
                        form.map((letter, i) => (
                          <span
                            key={i}
                            className={[
                              'inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold',
                              formPillClass(letter),
                            ].join(' ')}
                          >
                            {letter}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-foreground-secondary">—</span>
                      )}
                    </div>

                    {/* Wins count */}
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-400">{fighter.wins}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
