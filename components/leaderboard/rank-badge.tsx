import { cn, rankLabel, rankColor } from '@/lib/utils'
import { Crown } from 'lucide-react'

interface RankBadgeProps {
  rank: number
  showLabel?: boolean
  className?: string
}

export function RankBadge({ rank, showLabel = false, className }: RankBadgeProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className={cn(
        'flex items-center justify-center rounded-full border font-black text-sm',
        rank === 1 ? 'h-8 w-8 text-base' : 'h-7 w-7',
        rankColor(rank)
      )}>
        {rank === 1 ? <Crown className="h-3.5 w-3.5 text-amber-400" /> : rank}
      </div>
      {showLabel && (
        <span className={cn('text-xs font-semibold', rankColor(rank).split(' ')[0])}>
          {rankLabel(rank)}
        </span>
      )}
    </div>
  )
}
