import { format } from 'date-fns'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PredictionWithFight } from '@/types/database'

interface PredictionHistoryProps {
  predictions: PredictionWithFight[]
}

export function PredictionHistory({ predictions }: PredictionHistoryProps) {
  if (predictions.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600">
        <p className="text-sm">No predictions yet — make your first picks!</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {predictions.map((pred) => {
        const isCompleted = pred.fight.status === 'completed'
        const pickedFighter =
          pred.predicted_winner_id === pred.fight.fighter1_id
            ? pred.fight.fighter1
            : pred.fight.fighter2
        const opponent =
          pred.predicted_winner_id === pred.fight.fighter1_id
            ? pred.fight.fighter2
            : pred.fight.fighter1

        return (
          <div
            key={pred.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
              pred.is_correct === true && 'border-green-500/20 bg-green-500/5',
              pred.is_correct === false && 'border-red-500/20 bg-red-500/5',
              pred.is_correct === null && 'border-zinc-800/60 bg-zinc-900/60'
            )}
          >
            {/* Status icon */}
            <div className="shrink-0">
              {pred.is_correct === true && <CheckCircle className="h-5 w-5 text-green-400" />}
              {pred.is_correct === false && <XCircle className="h-5 w-5 text-red-400" />}
              {pred.is_correct === null && <Clock className="h-5 w-5 text-zinc-600" />}
            </div>

            {/* Fight info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-semibold line-clamp-1">
                {pred.fight.event.name}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                <span className="text-zinc-300">{pickedFighter.name}</span>
                <span className="text-zinc-600 mx-1.5">vs</span>
                {opponent.name}
              </p>
            </div>

            {/* Date + result */}
            <div className="text-right shrink-0">
              <p className="text-[11px] text-zinc-500">
                {format(new Date(pred.fight.fight_time), 'MMM d')}
              </p>
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
  )
}
