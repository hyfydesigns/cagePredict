'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Lock } from 'lucide-react'
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
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  if (predictions.length === 0) {
    return (
      <div className="text-center py-12 text-foreground-muted">
        <p className="text-sm">No predictions yet — make your first picks!</p>
      </div>
    )
  }

  // Group by event, preserving insertion order (predictions already sorted newest first)
  const groups: { eventId: string; eventName: string; eventDate: string; preds: PredictionWithFight[] }[] = []
  const seen = new Map<string, number>()
  for (const pred of predictions) {
    const eid = pred.fight.event.id
    if (!seen.has(eid)) {
      seen.set(eid, groups.length)
      groups.push({
        eventId: eid,
        eventName: pred.fight.event.name,
        eventDate: pred.fight.event.date,
        preds: [],
      })
    }
    groups[seen.get(eid)!].preds.push(pred)
  }

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2 mt-2">
      {groups.map(({ eventId, eventName, eventDate, preds }) => {
        const isOpen = openIds.has(eventId)
        const totalPts = preds.reduce((s, p) => s + (p.points_earned ?? 0), 0)
        const correct = preds.filter((p) => p.is_correct === true).length
        const scored = preds.filter((p) => p.is_correct !== null).length
        const pending = preds.filter((p) => p.is_correct === null).length

        const date = new Date(eventDate.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        })

        return (
          <div key={eventId} className="rounded-xl border border-border overflow-hidden">
            {/* Accordion header */}
            <button
              onClick={() => toggle(eventId)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface/40 hover:bg-surface-2/40 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{eventName}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-xs text-foreground-muted">{date}</p>
                  {scored > 0 && (
                    <span className="text-[10px] text-foreground-muted">
                      {correct}/{scored} correct
                      {totalPts > 0 && <span className="text-green-400 font-bold ml-1">+{totalPts} pts</span>}
                    </span>
                  )}
                  {pending > 0 && (
                    <span className="text-[10px] text-foreground-muted">{pending} pending</span>
                  )}
                  <span className="text-[10px] text-foreground-muted">{preds.length} pick{preds.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                : <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
              }
            </button>

            {/* Expanded predictions */}
            {isOpen && (
              <div className="border-t border-border divide-y divide-border/50">
                {preds.map((pred) => {
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
                        'flex items-center gap-3 px-4 py-3 transition-colors',
                        pred.is_correct === true && 'bg-green-500/5',
                        pred.is_correct === false && 'bg-red-500/5',
                        pred.is_correct === null && 'bg-surface/30'
                      )}
                    >
                      {/* Status icon */}
                      <div className="shrink-0">
                        {pred.is_correct === true && <CheckCircle className="h-4 w-4 text-green-400" />}
                        {pred.is_correct === false && <XCircle className="h-4 w-4 text-red-400" />}
                        {pred.is_correct === null && <Clock className="h-4 w-4 text-foreground-muted" />}
                      </div>

                      {/* Fight info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-semibold line-clamp-1">
                          <span className="text-foreground">{pickedFighter.name}</span>
                          <span className="text-foreground-muted mx-1">vs</span>
                          <span className="text-foreground-muted">{opponent.name}</span>
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
            )}
          </div>
        )
      })}
    </div>
  )
}
