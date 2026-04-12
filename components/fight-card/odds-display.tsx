import { oddsToImplied, formatOdds } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface OddsDisplayProps {
  odds1: number
  odds2: number
  layout?: 'vertical' | 'horizontal'
}

export function OddsDisplay({ odds1, odds2, layout = 'vertical' }: OddsDisplayProps) {
  const implied1 = oddsToImplied(odds1)
  const implied2 = oddsToImplied(odds2)

  if (layout === 'horizontal') {
    return (
      <div className="flex items-center gap-3">
        <OddsChip odds={odds1} implied={implied1} />
        <span className="text-zinc-600 text-xs">vs</span>
        <OddsChip odds={odds2} implied={implied2} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <OddsChip odds={odds1} implied={implied1} label="F1" />
      <OddsChip odds={odds2} implied={implied2} label="F2" />
    </div>
  )
}

function OddsChip({ odds, implied, label }: { odds: number; implied: number; label?: string }) {
  const isFav = odds < 0
  return (
    <div className="flex flex-col items-center">
      <span className={cn(
        'text-sm font-black leading-none',
        isFav ? 'text-green-400' : 'text-red-400'
      )}>
        {formatOdds(odds)}
      </span>
      <span className="text-[10px] text-zinc-600 leading-none mt-0.5">
        {implied}%
      </span>
    </div>
  )
}
