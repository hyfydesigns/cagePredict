'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

// ── Converters ─────────────────────────────────────────────────
function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54
  const ft = Math.floor(totalIn / 12)
  const inches = Math.round(totalIn % 12)
  return `${ft}' ${inches}"`
}
function cmToIn(cm: number): string {
  return `${Math.round(cm / 2.54)}"`
}
function lastResult(form: string | null | undefined): string {
  if (!form) return '—'
  return form.replace(/[^WLDwld]/g, '').toUpperCase()[0] ?? '—'
}
function formatOdds(o: number): string {
  return o > 0 ? `+${o}` : `${o}`
}
function impliedProb(o: number): number {
  return o > 0
    ? Math.round((100 / (o + 100)) * 100)
    : Math.round((Math.abs(o) / (Math.abs(o) + 100)) * 100)
}

// ── Sub-components ─────────────────────────────────────────────

function ResultPill({ r }: { r: string }) {
  if (r === 'W') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-emerald-500/20 text-emerald-400">Win</span>
  if (r === 'L') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-red-500/20 text-red-400">Loss</span>
  if (r === 'D') return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-zinc-600/40 text-zinc-400">Draw</span>
  return <span className="text-zinc-500 text-sm">—</span>
}

/** A single horizontal stat row: [f1 value] [LABEL] [f2 value] */
function StatRow({
  f1,
  label,
  f2,
  f1Edge,
  f2Edge,
}: {
  f1: React.ReactNode
  label: string
  f2: React.ReactNode
  /** true = highlight this fighter's value in their team colour */
  f1Edge?: boolean
  f2Edge?: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 py-3 border-b border-zinc-800/40 last:border-0">
      <span className={cn('text-sm font-bold', f1Edge ? 'text-red-400' : 'text-zinc-200')}>
        {f1}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">
        {label}
      </span>
      <span className={cn('text-sm font-bold text-right', f2Edge ? 'text-blue-400' : 'text-zinc-200')}>
        {f2}
      </span>
    </div>
  )
}

/** Comparative bar — fills proportionally based on two numeric values */
function CompBar({
  f1,
  f2,
  f1Label,
  f2Label,
  lowerBetter,
  suffix = '',
}: {
  f1: number | null
  f2: number | null
  f1Label: string
  f2Label: string
  lowerBetter?: boolean
  suffix?: string
}) {
  if (f1 === null && f2 === null) return null
  const v1 = f1 ?? 0
  const v2 = f2 ?? 0
  const total = v1 + v2
  const f1Pct = total > 0 ? Math.round((v1 / total) * 100) : 50
  const f2Pct = 100 - f1Pct
  const f1Wins = lowerBetter ? v1 <= v2 : v1 >= v2
  const f2Wins = lowerBetter ? v2 <= v1 : v2 >= v1

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn('font-bold', f1Wins ? 'text-red-400' : 'text-zinc-400')}>
          {f1 !== null ? `${v1}${suffix}` : '—'}
        </span>
        <span className={cn('font-bold', f2Wins ? 'text-blue-400' : 'text-zinc-400')}>
          {f2 !== null ? `${v2}${suffix}` : '—'}
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        <div
          className={cn('h-full rounded-l-full transition-all', f1Wins ? 'bg-red-500' : 'bg-zinc-700')}
          style={{ width: `${f1Pct}%` }}
        />
        <div
          className={cn('h-full rounded-r-full transition-all', f2Wins ? 'bg-blue-500' : 'bg-zinc-700')}
          style={{ width: `${f2Pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">
        <span>{f1Label}</span>
        <span>{f2Label}</span>
      </div>
    </div>
  )
}

/** Win-rate bar for a single fighter */
function WinRateBar({
  wins,
  losses,
  draws,
  side,
  name,
}: {
  wins: number | null
  losses: number | null
  draws: number | null
  side: 'left' | 'right'
  name: string
}) {
  const w = wins ?? 0
  const l = losses ?? 0
  const d = draws ?? 0
  const total = w + l + d
  if (total === 0) return null
  const wPct = Math.round((w / total) * 100)
  const lPct = Math.round((l / total) * 100)
  const dPct = 100 - wPct - lPct
  const color = side === 'left' ? 'text-red-400' : 'text-blue-400'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn('font-bold', color)}>{name}</span>
        <span className="text-zinc-400">{w}W · {l}L{d > 0 ? ` · ${d}D` : ''}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${wPct}%` }} title={`${wPct}% wins`} />
        {dPct > 0 && (
          <div className="h-full bg-zinc-600 transition-all" style={{ width: `${dPct}%` }} title={`${dPct}% draws`} />
        )}
        <div className="h-full bg-red-500/70 transition-all" style={{ width: `${lPct}%` }} title={`${lPct}% losses`} />
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-500">
        <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle" />{wPct}% wins</span>
        {dPct > 0 && <span><span className="inline-block w-2 h-2 rounded-full bg-zinc-600 mr-1 align-middle" />{dPct}% draws</span>}
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500/70 mr-1 align-middle" />{lPct}% losses</span>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────

interface FightMatchupTabsProps {
  fighter1: FighterRow
  fighter2: FighterRow
  odds1?: number | null
  odds2?: number | null
  odds1Open?: number | null
  odds2Open?: number | null
}

export function FightMatchupTabs({
  fighter1,
  fighter2,
  odds1,
  odds2,
  odds1Open,
  odds2Open,
}: FightMatchupTabsProps) {
  const f1Last = lastResult(fighter1.last_5_form)
  const f2Last = lastResult(fighter2.last_5_form)
  const f1LastName = fighter1.name.split(' ').pop() ?? fighter1.name
  const f2LastName = fighter2.name.split(' ').pop() ?? fighter2.name

  const hasStriking  = fighter1.striking_accuracy  != null || fighter2.striking_accuracy  != null
                    || fighter1.sig_str_landed      != null || fighter2.sig_str_landed      != null
  const hasGrappling = fighter1.td_avg != null || fighter2.td_avg != null
                    || fighter1.sub_avg != null || fighter2.sub_avg != null
  const hasOdds = odds1 != null || odds2 != null

  return (
    <Tabs defaultValue="matchup" className="w-full">
      <TabsList className="w-full grid grid-cols-5 h-auto p-0.5 rounded-xl">
        <TabsTrigger value="matchup"   className="text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 px-0.5 rounded-lg">Stats</TabsTrigger>
        <TabsTrigger value="winby"     className="text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 px-0.5 rounded-lg">Win By</TabsTrigger>
        <TabsTrigger value="striking"  className="text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 px-0.5 rounded-lg">Striking</TabsTrigger>
        <TabsTrigger value="grappling" className="text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 px-0.5 rounded-lg">Grappling</TabsTrigger>
        <TabsTrigger value="odds"      className="text-[9px] sm:text-[10px] uppercase tracking-wider py-1.5 px-0.5 rounded-lg">Odds</TabsTrigger>
      </TabsList>

      {/* ── MATCHUP STATS ───────────────────────────────────────── */}
      <TabsContent value="matchup" className="mt-0">
        <div>
          {/* Fighter name header bar */}
          <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 pb-2 mb-1 border-b border-zinc-700/60">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{f1LastName}</span>
            <span />
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide text-right">{f2LastName}</span>
          </div>

          <StatRow
            f1={`${fighter1.wins ?? 0}-${fighter1.losses ?? 0}-${fighter1.draws ?? 0}`}
            label="Record"
            f2={`${fighter2.wins ?? 0}-${fighter2.losses ?? 0}-${fighter2.draws ?? 0}`}
            f1Edge={(fighter1.wins ?? 0) > (fighter2.wins ?? 0)}
            f2Edge={(fighter2.wins ?? 0) > (fighter1.wins ?? 0)}
          />

          <StatRow
            f1={<ResultPill r={f1Last} />}
            label="Last Fight"
            f2={<ResultPill r={f2Last} />}
          />

          {(fighter1.nationality || fighter2.nationality) && (
            <StatRow
              f1={fighter1.nationality ?? '—'}
              label="Country"
              f2={fighter2.nationality ?? '—'}
            />
          )}

          {(fighter1.height_cm || fighter2.height_cm) && (
            <StatRow
              f1={fighter1.height_cm ? cmToFtIn(fighter1.height_cm) : '—'}
              label="Height"
              f2={fighter2.height_cm ? cmToFtIn(fighter2.height_cm) : '—'}
              f1Edge={(fighter1.height_cm ?? 0) > (fighter2.height_cm ?? 0)}
              f2Edge={(fighter2.height_cm ?? 0) > (fighter1.height_cm ?? 0)}
            />
          )}

          {(fighter1.reach_cm || fighter2.reach_cm) && (
            <StatRow
              f1={fighter1.reach_cm ? cmToIn(fighter1.reach_cm) : '—'}
              label="Reach"
              f2={fighter2.reach_cm ? cmToIn(fighter2.reach_cm) : '—'}
              f1Edge={(fighter1.reach_cm ?? 0) > (fighter2.reach_cm ?? 0)}
              f2Edge={(fighter2.reach_cm ?? 0) > (fighter1.reach_cm ?? 0)}
            />
          )}

          {(fighter1.age || fighter2.age) && (
            <StatRow
              f1={fighter1.age ? `${fighter1.age} yrs` : '—'}
              label="Age"
              f2={fighter2.age ? `${fighter2.age} yrs` : '—'}
            />
          )}

          {(fighter1.fighting_style || fighter2.fighting_style) && (
            <StatRow
              f1={fighter1.fighting_style ?? '—'}
              label="Style"
              f2={fighter2.fighting_style ?? '—'}
            />
          )}
        </div>
      </TabsContent>

      {/* ── WIN BY ──────────────────────────────────────────────── */}
      <TabsContent value="winby" className="mt-0">
        <div>
          <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 pb-2 mb-1 border-b border-zinc-700/60">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{f1LastName}</span>
            <span />
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide text-right">{f2LastName}</span>
          </div>

          {(fighter1.ko_tko_wins != null || fighter2.ko_tko_wins != null) ? (
            <div className="py-2 space-y-5">
              {/* KO / TKO */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">
                  KO / TKO
                </p>
                <CompBar
                  f1={fighter1.ko_tko_wins}
                  f2={fighter2.ko_tko_wins}
                  f1Label={f1LastName}
                  f2Label={f2LastName}
                  suffix=" wins"
                />
              </div>

              {/* Submission */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">
                  Submission
                </p>
                <CompBar
                  f1={fighter1.sub_wins}
                  f2={fighter2.sub_wins}
                  f1Label={f1LastName}
                  f2Label={f2LastName}
                  suffix=" wins"
                />
              </div>

              {/* Decision */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">
                  Decision
                </p>
                <CompBar
                  f1={fighter1.dec_wins}
                  f2={fighter2.dec_wins}
                  f1Label={f1LastName}
                  f2Label={f2LastName}
                  suffix=" wins"
                />
              </div>

              {/* Per-fighter method breakdown bars */}
              <div className="border-t border-zinc-800/40 pt-4 space-y-4">
                {[
                  { fighter: fighter1, side: 'left'  as const },
                  { fighter: fighter2, side: 'right' as const },
                ].map(({ fighter, side }) => {
                  const ko  = fighter.ko_tko_wins ?? 0
                  const sub = fighter.sub_wins    ?? 0
                  const dec = fighter.dec_wins    ?? 0
                  const total = ko + sub + dec
                  if (total === 0) return null
                  const koPct  = Math.round((ko  / total) * 100)
                  const subPct = Math.round((sub / total) * 100)
                  const decPct = 100 - koPct - subPct
                  const color  = side === 'left' ? 'text-red-400' : 'text-blue-400'
                  return (
                    <div key={fighter.id} className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className={cn('font-bold', color)}>{fighter.name}</span>
                        <span className="text-zinc-500 text-[10px]">{total} wins</span>
                      </div>
                      <div className="flex h-3 rounded-full overflow-hidden gap-px">
                        {koPct  > 0 && <div className="h-full bg-red-500"    style={{ width: `${koPct}%`  }} title={`KO/TKO ${koPct}%`} />}
                        {subPct > 0 && <div className="h-full bg-amber-500"  style={{ width: `${subPct}%` }} title={`Sub ${subPct}%`} />}
                        {decPct > 0 && <div className="h-full bg-blue-500"   style={{ width: `${decPct}%` }} title={`Dec ${decPct}%`} />}
                      </div>
                      <div className="flex gap-3 text-[10px] text-zinc-500">
                        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500   mr-1 align-middle" />{koPct}% KO/TKO</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1 align-middle" />{subPct}% Sub</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500  mr-1 align-middle" />{decPct}% Dec</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Fallback: overall W/L/D rate bars until backfill runs */
            <div className="py-3 space-y-4">
              <WinRateBar wins={fighter1.wins} losses={fighter1.losses} draws={fighter1.draws} side="left"  name={fighter1.name} />
              <WinRateBar wins={fighter2.wins} losses={fighter2.losses} draws={fighter2.draws} side="right" name={fighter2.name} />
              <p className="text-[10px] text-zinc-600 text-center pt-1">KO/TKO · Sub · Decision detail loading…</p>
            </div>
          )}
        </div>
      </TabsContent>

      {/* ── STRIKING ────────────────────────────────────────────── */}
      <TabsContent value="striking" className="mt-0">
        <div>
          <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 pb-2 mb-1 border-b border-zinc-700/60">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{f1LastName}</span>
            <span />
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide text-right">{f2LastName}</span>
          </div>

          {hasStriking ? (
            <div className="py-2 space-y-5">
              {(fighter1.sig_str_landed != null || fighter2.sig_str_landed != null) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">Sig. Str. Landed / min</p>
                  <CompBar
                    f1={fighter1.sig_str_landed}
                    f2={fighter2.sig_str_landed}
                    f1Label={f1LastName}
                    f2Label={f2LastName}
                  />
                </div>
              )}

              {(fighter1.striking_accuracy != null || fighter2.striking_accuracy != null) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">Striking Accuracy</p>
                  <CompBar
                    f1={fighter1.striking_accuracy}
                    f2={fighter2.striking_accuracy}
                    f1Label={f1LastName}
                    f2Label={f2LastName}
                    suffix="%"
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-zinc-600 text-xs py-6">No striking data available</p>
          )}
        </div>
      </TabsContent>

      {/* ── GRAPPLING ───────────────────────────────────────────── */}
      <TabsContent value="grappling" className="mt-0">
        <div>
          <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 pb-2 mb-1 border-b border-zinc-700/60">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{f1LastName}</span>
            <span />
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide text-right">{f2LastName}</span>
          </div>

          {hasGrappling ? (
            <div className="py-2 space-y-5">
              {(fighter1.td_avg != null || fighter2.td_avg != null) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">Takedown Avg / 15 min</p>
                  <CompBar
                    f1={fighter1.td_avg}
                    f2={fighter2.td_avg}
                    f1Label={f1LastName}
                    f2Label={f2LastName}
                  />
                </div>
              )}

              {(fighter1.sub_avg != null || fighter2.sub_avg != null) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">Submission Avg / 15 min</p>
                  <CompBar
                    f1={fighter1.sub_avg}
                    f2={fighter2.sub_avg}
                    f1Label={f1LastName}
                    f2Label={f2LastName}
                  />
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-zinc-600 text-xs py-6">No grappling data available</p>
          )}
        </div>
      </TabsContent>

      {/* ── ODDS ────────────────────────────────────────────────── */}
      <TabsContent value="odds" className="mt-0">
        <div>
          <div className="grid grid-cols-[1fr,7rem,1fr] items-center gap-2 pb-2 mb-1 border-b border-zinc-700/60">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{f1LastName}</span>
            <span />
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide text-right">{f2LastName}</span>
          </div>

          {hasOdds ? (
            <div className="space-y-0">
              {(odds1 != null || odds2 != null) && (
                <StatRow
                  f1={
                    odds1 != null ? (
                      <span className={odds1 < 0 ? 'text-emerald-400' : 'text-zinc-300'}>
                        {formatOdds(odds1)}
                      </span>
                    ) : '—'
                  }
                  label="Moneyline"
                  f2={
                    odds2 != null ? (
                      <span className={odds2 < 0 ? 'text-emerald-400' : 'text-zinc-300'}>
                        {formatOdds(odds2)}
                      </span>
                    ) : '—'
                  }
                />
              )}

              {(odds1 != null || odds2 != null) && (
                <StatRow
                  f1={odds1 != null ? `${impliedProb(odds1)}%` : '—'}
                  label="Implied Prob."
                  f2={odds2 != null ? `${impliedProb(odds2)}%` : '—'}
                  f1Edge={odds1 != null && odds2 != null && impliedProb(odds1) > impliedProb(odds2)}
                  f2Edge={odds1 != null && odds2 != null && impliedProb(odds2) > impliedProb(odds1)}
                />
              )}

              {(odds1Open != null || odds2Open != null) && (
                <StatRow
                  f1={odds1Open != null ? formatOdds(odds1Open) : '—'}
                  label="Opening"
                  f2={odds2Open != null ? formatOdds(odds2Open) : '—'}
                />
              )}

              {/* Probability bar */}
              {odds1 != null && odds2 != null && (() => {
                const p1 = impliedProb(odds1)
                const p2 = impliedProb(odds2)
                return (
                  <div className="pt-4">
                    <div className="flex h-3 rounded-full overflow-hidden gap-px">
                      <div className="h-full bg-red-500 transition-all" style={{ width: `${p1}%` }} />
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${p2}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-zinc-500">
                      <span>{p1}% {f1LastName}</span>
                      <span>{f2LastName} {p2}%</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <p className="text-center text-zinc-600 text-xs py-6">No odds available yet</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
