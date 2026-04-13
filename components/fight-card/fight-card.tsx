'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FighterPortrait } from './fighter-portrait'
import { OddsDisplay } from './odds-display'
import { PredictionPicker } from './prediction-picker'
import { CountdownTimer } from './countdown-timer'
import { FightStatusBadge } from './fight-status-badge'
import { cn } from '@/lib/utils'
import type { FightWithDetails } from '@/types/database'

interface FightCardProps {
  fight: FightWithDetails
  userPick?: string | null          // predicted_winner_id
  userId?: string
  isPending?: boolean
  onPredict: (fightId: string, winnerId: string) => Promise<void>
}

export function FightCard({ fight, userPick, userId, isPending = false, onPredict }: FightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [localPick, setLocalPick] = useState<string | null>(userPick ?? null)

  const isCompleted = fight.status === 'completed'
  const isLive      = fight.status === 'live'
  const isLocked    = new Date(fight.fight_time).getTime() - Date.now() <= 5 * 60 * 1000

  const pickCorrect   = isCompleted && localPick !== null && localPick === fight.winner_id
  const pickIncorrect = isCompleted && localPick !== null && localPick !== fight.winner_id

  async function handlePredict(winnerId: string) {
    setLocalPick(winnerId)
    await onPredict(fight.id, winnerId)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-2xl overflow-hidden border transition-all duration-300',
        fight.is_main_event
          ? 'border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.08)]'
          : 'border-zinc-800/60',
        isLive && 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.18)] animate-pulse-red',
        isCompleted && 'border-zinc-800/30 opacity-90',
        'bg-gradient-to-b from-zinc-900 to-[#0d0d0d]'
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 flex-wrap">
          {fight.is_title_fight && (
            <Badge variant="warning" className="gap-1 text-[11px]">
              <Trophy className="h-2.5 w-2.5" /> Title Fight
            </Badge>
          )}
          {fight.is_main_event && (
            <Badge variant="destructive" className="text-[11px]">Main Event</Badge>
          )}
          <span className="text-zinc-500 text-[11px] font-semibold uppercase tracking-widest">
            {fight.weight_class}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pickCorrect && (
            <Badge variant="success" className="gap-1 text-[11px]">
              <CheckCircle className="h-3 w-3" /> +10 pts
            </Badge>
          )}
          {pickIncorrect && (
            <Badge variant="destructive" className="gap-1 text-[11px]">
              <XCircle className="h-3 w-3" /> Incorrect
            </Badge>
          )}
          <FightStatusBadge status={fight.status} />
        </div>
      </div>

      {/* Fighters row */}
      <div className="grid grid-cols-[1fr,72px,1fr]">
        <FighterPortrait
          fighter={fight.fighter1}
          side="left"
          isPicked={localPick === fight.fighter1.id}
          isWinner={isCompleted && fight.winner_id === fight.fighter1.id}
          isLoser={isCompleted && !!fight.winner_id && fight.winner_id !== fight.fighter1.id}
          odds={fight.odds_f1}
        />

        {/* Center column */}
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <OddsDisplay odds1={fight.odds_f1} odds2={fight.odds_f2} />
          <div className="text-zinc-600 font-black text-xl">VS</div>
          {!isCompleted && !isLive && (
            <CountdownTimer fightTime={fight.fight_time} />
          )}
        </div>

        <FighterPortrait
          fighter={fight.fighter2}
          side="right"
          isPicked={localPick === fight.fighter2.id}
          isWinner={isCompleted && fight.winner_id === fight.fighter2.id}
          isLoser={isCompleted && !!fight.winner_id && fight.winner_id !== fight.fighter2.id}
          odds={fight.odds_f2}
        />
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors border-t border-zinc-800/40"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? 'Hide' : 'Stats & Analysis'}
      </button>

      {/* Expandable stats + analysis */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="stats"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/40 pt-4">
              {/* Stats comparison */}
              <div>
                <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">
                  Stats Comparison
                </h4>
                <div className="space-y-1.5">
                  {[
                    { label: 'Height', f1: fight.fighter1.height_cm ? `${fight.fighter1.height_cm}cm` : null, f2: fight.fighter2.height_cm ? `${fight.fighter2.height_cm}cm` : null },
                    { label: 'Reach',  f1: fight.fighter1.reach_cm  ? `${fight.fighter1.reach_cm}cm`  : null, f2: fight.fighter2.reach_cm  ? `${fight.fighter2.reach_cm}cm`  : null },
                    { label: 'Age',    f1: fight.fighter1.age        ? String(fight.fighter1.age)       : null, f2: fight.fighter2.age        ? String(fight.fighter2.age)       : null },
                    { label: 'Style',  f1: fight.fighter1.fighting_style ?? null, f2: fight.fighter2.fighting_style ?? null },
                  ].filter((row) => row.f1 || row.f2).map((row) => (
                    <div key={row.label} className="grid grid-cols-[1fr,60px,1fr] text-xs items-center">
                      <span className="text-zinc-200 font-semibold">{row.f1 ?? '?'}</span>
                      <span className="text-zinc-600 text-center text-[10px] uppercase tracking-wider">{row.label}</span>
                      <span className="text-zinc-200 font-semibold text-right">{row.f2 ?? '?'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Analysis */}
              {(fight.analysis_f1 || fight.analysis_f2) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fight.analysis_f1 && (
                    <div className="rounded-lg bg-zinc-800/50 p-3">
                      <p className="text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
                        {fight.fighter1.name.split(' ').pop()}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{fight.analysis_f1}</p>
                    </div>
                  )}
                  {fight.analysis_f2 && (
                    <div className="rounded-lg bg-zinc-800/50 p-3">
                      <p className="text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
                        {fight.fighter2.name.split(' ').pop()}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">{fight.analysis_f2}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result banner */}
      {isCompleted && fight.winner_id && (
        <div className="px-4 py-2.5 bg-zinc-800/30 border-t border-zinc-800/40 flex items-center justify-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-sm text-zinc-300">
            <span className="font-bold text-white">
              {fight.winner_id === fight.fighter1.id ? fight.fighter1.name : fight.fighter2.name}
            </span>
            {fight.method && (
              <span className="text-zinc-500 ml-1 text-xs">
                via {fight.method}
                {fight.round && ` (R${fight.round}`}
                {fight.time_of_finish && ` ${fight.time_of_finish})`}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Prediction picker */}
      {!isCompleted && (
        <PredictionPicker
          fighter1={fight.fighter1}
          fighter2={fight.fighter2}
          currentPick={localPick}
          isLocked={isLocked}
          isPending={isPending}
          userId={userId}
          onPick={handlePredict}
        />
      )}
    </motion.div>
  )
}
