'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PredictionWithFight } from '@/types/database'

interface PredictionHistoryProps {
  predictions: PredictionWithFight[]
}

function methodLabel(method: string | null | undefined): string | null {
  if (!method) return null
  if (method === 'ko_tko') return 'KO/TKO'
  if (method === 'submission') return 'Submission'
  if (method === 'decision') return 'Decision'
  return method
}

export function PredictionHistory({ predictions }: PredictionHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Group by event, preserving insertion order (newest first)
  const groups: { eventId: string; eventName: string; eventDate: string; preds: PredictionWithFight[] }[] = []
  const seen = new Map<string, number>()
  for (const pred of predictions) {
    const eid = pred.fight.event.id
    if (!seen.has(eid)) {
      seen.set(eid, groups.length)
      groups.push({ eventId: eid, eventName: pred.fight.event.name, eventDate: pred.fight.event.date, preds: [] })
    }
    groups[seen.get(eid)!].preds.push(pred)
  }

  const [activeIdx, setActiveIdx] = useState(0)

  if (predictions.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted">
        <p className="text-sm">No predictions yet — make your first picks!</p>
      </div>
    )
  }

  const active = groups[activeIdx]
  const totalPts = active.preds.reduce((s, p) => s + (p.points_earned ?? 0), 0)
  const correct = active.preds.filter((p) => p.is_correct === true).length
  const scored  = active.preds.filter((p) => p.is_correct !== null).length
  const pending = active.preds.filter((p) => p.is_correct === null).length

  return (
    <div className="mt-2 space-y-3">
      {/* Tab strip */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {groups.map((g, i) => {
          const isActive = i === activeIdx
          const shortName = g.eventName.replace(/^UFC\s+/i, 'UFC ')
          const date = new Date(g.eventDate.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, {
            month: 'short', day: 'numeric',
          })
          return (
            <button
              key={g.eventId}
              onClick={() => setActiveIdx(i)}
              className={cn(
                'shrink-0 flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all duration-150',
                isActive
                  ? 'border-primary/60 bg-primary/10 text-foreground'
                  : 'border-border/60 bg-surface/40 text-foreground-muted hover:border-border hover:text-foreground-secondary'
              )}
            >
              <span className={cn('text-xs font-bold leading-tight max-w-[120px] truncate', isActive && 'text-primary')}>
                {shortName}
              </span>
              <span className="text-[10px] mt-0.5 text-foreground-muted">{date}</span>
            </button>
          )
        })}
      </div>

      {/* Event summary bar */}
      <div className="flex items-center gap-3 px-1 flex-wrap">
        <span className="text-xs text-foreground-muted">
          {active.preds.length} pick{active.preds.length !== 1 ? 's' : ''}
        </span>
        {scored > 0 && (
          <>
            <span className="text-foreground-muted/40 text-xs">·</span>
            <span className="text-xs text-foreground-muted">
              {correct}/{scored} correct
            </span>
            {totalPts > 0 && (
              <>
                <span className="text-foreground-muted/40 text-xs">·</span>
                <span className="text-xs font-bold text-green-400">+{totalPts} pts</span>
              </>
            )}
          </>
        )}
        {pending > 0 && (
          <>
            <span className="text-foreground-muted/40 text-xs">·</span>
            <span className="text-xs text-foreground-muted">{pending} pending</span>
          </>
        )}
      </div>

      {/* Prediction rows */}
      <div className="space-y-1.5">
        {active.preds.map((pred) => {
          const isCompleted = pred.fight.status === 'completed'
          const pickedFighter =
            pred.predicted_winner_id === pred.fight.fighter1_id
              ? pred.fight.fighter1
              : pred.fight.fighter2
          const opponent =
            pred.predicted_winner_id === pred.fight.fighter1_id
              ? pred.fight.fighter2
              : pred.fight.fighter1
          const mLabel = methodLabel(pred.predicted_method)

          return (
            <div
              key={pred.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                pred.is_correct === true  && 'border-green-500/20 bg-green-500/5',
                pred.is_correct === false && 'border-red-500/20 bg-red-500/5',
                pred.is_correct === null  && 'border-border/60 bg-surface/60'
              )}
            >
              {/* Status icon */}
              <div className="shrink-0">
                {pred.is_correct === true  && <CheckCircle className="h-4 w-4 text-green-400" />}
                {pred.is_correct === false && <XCircle    className="h-4 w-4 text-red-400" />}
                {pred.is_correct === null  && <Clock      className="h-4 w-4 text-foreground-muted" />}
              </div>

              {/* Fight info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground line-clamp-1">
                  {pickedFighter.name}
                  <span className="text-foreground-muted font-normal mx-1">vs</span>
                  <span className="text-foreground-muted font-normal">{opponent.name}</span>
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {pred.is_confidence && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-500">
                      <Lock className="h-2.5 w-2.5" />Lock
                    </span>
                  )}
                  {mLabel && (
                    <span className="text-[10px] text-foreground-muted">
                      {mLabel}{pred.predicted_round ? ` · R${pred.predicted_round}` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="text-right shrink-0">
                {isCompleted ? (
                  pred.is_correct ? (
                    <p className="text-green-400 text-xs font-bold">+{pred.points_earned} pts</p>
                  ) : (
                    <p className="text-red-400 text-xs font-bold">0 pts</p>
                  )
                ) : (
                  <Badge variant="outline" className="text-[10px]">Pending</Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
