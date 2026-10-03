'use client'

import { Zap, Target, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FightBreakdown } from '@/lib/actions/admin'

interface Props {
  breakdown: FightBreakdown
  f1Name: string
  f2Name: string
}

export function FightBreakdownPanel({ breakdown, f1Name, f2Name }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">AI Fight Breakdown</span>
          <span className="text-[10px] text-foreground-muted hidden sm:inline">— {breakdown.headline}</span>
        </div>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 text-foreground-muted" />
          : <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-primary/10">
          {/* Headline */}
          <p className="text-sm font-semibold text-foreground pt-3 leading-snug">{breakdown.headline}</p>

          {/* Styles matchup */}
          <div>
            <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-1.5">Styles Matchup</p>
            <p className="text-[12px] text-foreground-secondary leading-relaxed">{breakdown.styles_matchup}</p>
          </div>

          {/* Key factors */}
          {breakdown.key_factors.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-2">Key Factors</p>
              <ul className="space-y-1.5">
                {breakdown.key_factors.map((factor, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Target className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-[12px] text-foreground-secondary leading-relaxed">{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Paths to victory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {breakdown.f1_path && (
              <PathCard name={f1Name} path={breakdown.f1_path} side="f1" />
            )}
            {breakdown.f2_path && (
              <PathCard name={f2Name} path={breakdown.f2_path} side="f2" />
            )}
          </div>

          {/* X-factor */}
          {breakdown.x_factor && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">X-Factor</p>
              </div>
              <p className="text-[12px] text-foreground-secondary leading-relaxed">{breakdown.x_factor}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PathCard({ name, path, side }: { name: string; path: string; side: 'f1' | 'f2' }) {
  return (
    <div className={cn(
      'rounded-lg p-3',
      side === 'f1' ? 'bg-blue-500/5 border border-blue-500/20' : 'bg-red-500/5 border border-red-500/20',
    )}>
      <p className={cn(
        'text-[10px] font-bold uppercase tracking-wider mb-1.5',
        side === 'f1' ? 'text-blue-400' : 'text-red-400',
      )}>
        {name.split(' ').pop()} wins if…
      </p>
      <p className="text-[12px] text-foreground-secondary leading-relaxed">{path}</p>
    </div>
  )
}
