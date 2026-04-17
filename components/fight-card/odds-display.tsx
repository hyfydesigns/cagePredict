import { oddsToImplied, formatOdds } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { OddsSnapshot } from '@/lib/actions/odds'

interface OddsDisplayProps {
  odds1: number
  odds2: number
  odds1Open?: number | null
  odds2Open?: number | null
  oddsHistory?: OddsSnapshot[] | null
  layout?: 'vertical' | 'horizontal'
}

export function OddsDisplay({
  odds1, odds2,
  odds1Open, odds2Open,
  oddsHistory,
  layout = 'vertical',
}: OddsDisplayProps) {
  const implied1 = oddsToImplied(odds1)
  const implied2 = oddsToImplied(odds2)

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-3">
        <OddsChip odds={odds1} implied={implied1} oddsOpen={odds1Open} />
        <span className="text-zinc-400 text-xs">vs</span>
        <OddsChip odds={odds2} implied={implied2} oddsOpen={odds2Open} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <OddsChip odds={odds1} implied={implied1} oddsOpen={odds1Open} label="F1" />
      <OddsChip odds={odds2} implied={implied2} oddsOpen={odds2Open} label="F2" />
      {oddsHistory && oddsHistory.length > 1 && (
        <OddsSparkline history={oddsHistory} />
      )}
    </div>
  )
}

// ─── OddsChip ────────────────────────────────────────────────────────────────

function OddsChip({
  odds, implied, oddsOpen, label,
}: {
  odds: number
  implied: number
  oddsOpen?: number | null
  label?: string
}) {
  const isFav = odds < 0
  const movement = oddsOpen != null ? getMovement(oddsOpen, odds) : null

  return (
    <div className="flex flex-col items-center">
      {/* Current odds + trend arrow */}
      <div className="flex items-center gap-0.5">
        <span className={cn(
          'text-sm font-black leading-none',
          isFav ? 'text-green-400' : 'text-red-400',
        )}>
          {formatOdds(odds)}
        </span>
        {movement && (
          <MovementArrow direction={movement.direction} />
        )}
      </div>

      {/* Implied probability */}
      <span className="text-[10px] text-zinc-400 leading-none mt-0.5">
        {implied}%
      </span>

      {/* Opening odds (if different from current) */}
      {movement && movement.delta !== 0 && (
        <span className="text-[9px] text-zinc-600 leading-none mt-0.5" title="Opening odds">
          open {formatOdds(oddsOpen!)}
        </span>
      )}
    </div>
  )
}

// ─── Movement helpers ────────────────────────────────────────────────────────

type Direction = 'up' | 'down' | 'flat'

/**
 * For American odds:
 *  - Favourite moves from -200 → -150: got LESS likely (delta > 0 = worse for bettors → arrow down for favourite)
 *  - Underdog moves from +200 → +150: got MORE likely (became more fav)
 *
 * Simpler interpretation for UI: show whether the PAYOUT got better (↑) or worse (↓).
 * For favourites: odds going from -200 → -150 = better payout (↑ green)
 * For underdogs:  odds going from +150 → +200 = better payout (↑ green)
 * Essentially: is the current implied win% lower than opening? → odds drifted (↓ for them).
 */
function getMovement(open: number, current: number): { direction: Direction; delta: number } {
  // Compare implied probabilities
  const openImplied   = open < 0 ? Math.abs(open) / (Math.abs(open) + 100) : 100 / (current + 100)
  const currentImplied = current < 0 ? Math.abs(current) / (Math.abs(current) + 100) : 100 / (current + 100)
  const delta = currentImplied - openImplied

  // Threshold: ignore tiny movements (<0.5%)
  if (Math.abs(delta) < 0.005) return { direction: 'flat', delta: 0 }
  return { direction: delta > 0 ? 'up' : 'down', delta }
}

function MovementArrow({ direction }: { direction: Direction }) {
  if (direction === 'flat') return null
  return (
    <span className={cn(
      'text-[10px] leading-none font-bold',
      direction === 'up'   ? 'text-green-400' : 'text-red-400',
    )}>
      {direction === 'up' ? '↑' : '↓'}
    </span>
  )
}

// ─── Mini sparkline ──────────────────────────────────────────────────────────

function OddsSparkline({ history }: { history: OddsSnapshot[] }) {
  const WIDTH  = 64
  const HEIGHT = 20
  const maxPoints = 20
  const slice = history.slice(-maxPoints)

  // Use fighter 1's implied probability as the sparkline series
  const values = slice.map((s) => {
    const o = s.odds_f1
    return o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100)
  })

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 0.01

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * WIDTH
    const y = HEIGHT - ((v - min) / range) * HEIGHT
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const first  = values[0]
  const last   = values[values.length - 1]
  const trending = last > first ? 'up' : last < first ? 'down' : 'flat'

  return (
    <div className="mt-1 flex flex-col items-center gap-0.5">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="overflow-visible"
      >
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={trending === 'up' ? '#4ade80' : trending === 'down' ? '#f87171' : '#71717a'}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[8px] text-zinc-600 leading-none">
        {slice.length} snapshots
      </span>
    </div>
  )
}
