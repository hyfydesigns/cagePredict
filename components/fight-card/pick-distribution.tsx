'use client'

interface PickDistributionProps {
  f1Name: string
  f2Name: string
  f1Id: string
  f2Id: string
  pickCounts: Record<string, number>
}

export function PickDistribution({ f1Name, f2Name, f1Id, f2Id, pickCounts }: PickDistributionProps) {
  const f1Picks = pickCounts[f1Id] ?? 0
  const f2Picks = pickCounts[f2Id] ?? 0
  const total   = f1Picks + f2Picks

  if (total === 0) return null

  const f1Pct = Math.round((f1Picks / total) * 100)
  const f2Pct = 100 - f1Pct

  const f1Last = f1Name.split(' ').pop() ?? f1Name
  const f2Last = f2Name.split(' ').pop() ?? f2Name

  return (
    <div className="space-y-1">
      <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
        Community Picks · {total} vote{total !== 1 ? 's' : ''}
      </h4>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-12 text-right font-bold text-zinc-200">{f1Pct}%</span>
        <div className="flex-1 flex h-2 rounded-full overflow-hidden bg-zinc-800">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${f1Pct}%` }}
          />
        </div>
        <span className="w-12 font-bold text-zinc-200">{f2Pct}%</span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-400">
        <span className="w-12 text-right">{f1Last}</span>
        <div className="flex-1" />
        <span className="w-12">{f2Last}</span>
      </div>
    </div>
  )
}
