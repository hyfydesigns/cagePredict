'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

interface FighterComparisonSliderProps {
  fighter1: FighterRow
  fighter2: FighterRow
}

interface StatRow {
  label: string
  f1: number | null
  f2: number | null
  unit?: string
  /** Lower is better (e.g. age when younger = more gas tank) */
  lowerBetter?: boolean
  /** Format display value */
  format?: (v: number) => string
}

function cmToInches(cm: number) { return Math.round(cm / 2.54) }
function cmToFtIn(cm: number) {
  const totalIn = cm / 2.54
  const ft = Math.floor(totalIn / 12)
  const inches = Math.round(totalIn % 12)
  return `${ft}'${inches}"`
}

export function FighterComparisonSlider({ fighter1, fighter2 }: FighterComparisonSliderProps) {
  // Slider 0–100: 50 = centre, <50 = favour F1, >50 = favour F2
  const [sliderVal, setSliderVal] = useState(50)

  const allStats: StatRow[] = [
    {
      label: 'Height',
      f1: fighter1.height_cm,
      f2: fighter2.height_cm,
      format: (v: number) => cmToFtIn(v),
    },
    {
      label: 'Reach',
      f1: fighter1.reach_cm,
      f2: fighter2.reach_cm,
      format: (v: number) => `${cmToInches(v)}"`,
    },
    {
      label: 'Age',
      f1: fighter1.age,
      f2: fighter2.age,
      lowerBetter: true,
      format: (v: number) => String(v),
    },
    {
      label: 'Wins',
      f1: fighter1.wins,
      f2: fighter2.wins,
      format: (v: number) => String(v),
    },
    {
      label: 'Losses',
      f1: fighter1.losses,
      f2: fighter2.losses,
      lowerBetter: true,
      format: (v: number) => String(v),
    },
  ]
  const stats = allStats.filter((s) => s.f1 !== null && s.f2 !== null) as (StatRow & { f1: number; f2: number })[]

  if (stats.length < 2) return null

  // Spotlight opacity: at 50 = even, towards 0 = f1 is highlighted, towards 100 = f2 highlighted
  const f1Alpha = Math.max(0, Math.min(1, (50 - sliderVal) / 50 + 0.4))
  const f2Alpha = Math.max(0, Math.min(1, (sliderVal - 50) / 50 + 0.4))

  const f1Last = fighter1.name.split(' ').pop() ?? fighter1.name
  const f2Last = fighter2.name.split(' ').pop() ?? fighter2.name

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest">
          Fighter Comparison
        </h4>
        <span className="text-[10px] text-foreground-secondary">drag to spotlight</span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={100}
          value={sliderVal}
          onChange={(e) => setSliderVal(Number(e.target.value))}
          className="w-full h-1.5 appearance-none cursor-pointer rounded-full bg-surface-2 outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-grab
            [&::-webkit-slider-thumb]:active:cursor-grabbing"
        />
        {/* Labels */}
        <div className="flex justify-between mt-1 text-[10px] font-bold">
          <span style={{ opacity: f1Alpha + 0.4 }} className="text-primary transition-opacity duration-150">
            {f1Last}
          </span>
          <span style={{ opacity: f2Alpha + 0.4 }} className="text-primary transition-opacity duration-150">
            {f2Last}
          </span>
        </div>
      </div>

      {/* Stat rows */}
      <div className="space-y-2">
        {stats.map((stat) => {
          const f1Val = stat.f1 as number
          const f2Val = stat.f2 as number
          const total = f1Val + f2Val
          const f1Pct = total > 0 ? Math.round((f1Val / total) * 100) : 50
          const f2Pct = 100 - f1Pct
          const f1Wins = stat.lowerBetter ? f1Val <= f2Val : f1Val >= f2Val
          const f2Wins = stat.lowerBetter ? f2Val <= f1Val : f2Val >= f1Val

          const displayF1 = stat.format ? stat.format(f1Val) : String(f1Val)
          const displayF2 = stat.format ? stat.format(f2Val) : String(f2Val)

          return (
            <div key={stat.label}>
              <div className="flex items-center justify-between text-[10px] text-foreground-muted mb-0.5">
                <span
                  style={{ opacity: sliderVal < 50 ? 1 : 0.45 }}
                  className={cn('font-bold transition-opacity duration-150', f1Wins && 'text-foreground-secondary')}
                >
                  {displayF1}
                </span>
                <span className="uppercase tracking-wider">{stat.label}</span>
                <span
                  style={{ opacity: sliderVal > 50 ? 1 : 0.45 }}
                  className={cn('font-bold transition-opacity duration-150', f2Wins && 'text-foreground-secondary')}
                >
                  {displayF2}
                </span>
              </div>
              {/* Dual bar */}
              <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                <div
                  className={cn(
                    'h-full rounded-l-full transition-all duration-150',
                    f1Wins ? 'bg-primary' : 'bg-surface-3'
                  )}
                  style={{
                    width: `${f1Pct}%`,
                    opacity: sliderVal <= 50 ? 1 : 0.4 + (f1Alpha * 0.6),
                  }}
                />
                <div
                  className={cn(
                    'h-full rounded-r-full transition-all duration-150',
                    f2Wins ? 'bg-primary' : 'bg-surface-3'
                  )}
                  style={{
                    width: `${f2Pct}%`,
                    opacity: sliderVal >= 50 ? 1 : 0.4 + (f2Alpha * 0.6),
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
