'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Lock, CheckCircle, Loader2, LockOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

interface PredictionPickerProps {
  fighter1: FighterRow
  fighter2: FighterRow
  currentPick: string | null
  isConfidence: boolean
  lockTaken: boolean        // another fight in this event already has the lock
  isLocked: boolean         // picks closed (fight starting soon)
  isPending: boolean
  userId?: string
  onPick: (winnerId: string) => Promise<void>
  onToggleLock: (isConfidence: boolean) => Promise<void>
}

export function PredictionPicker({
  fighter1, fighter2, currentPick, isConfidence, lockTaken,
  isLocked, isPending, userId, onPick, onToggleLock,
}: PredictionPickerProps) {
  if (!userId) {
    return (
      <div className="px-4 py-3 border-t border-zinc-800/50 flex items-center justify-center">
        <p className="text-sm text-zinc-500">
          <a href="/login" className="text-primary hover:underline">Sign in</a> to make predictions
        </p>
      </div>
    )
  }

  if (isLocked && !currentPick) {
    return (
      <div className="px-4 py-3 border-t border-zinc-800/50 flex items-center justify-center gap-2">
        <Lock className="h-4 w-4 text-zinc-600" />
        <span className="text-sm text-zinc-600">Picks are locked</span>
      </div>
    )
  }

  if (isLocked && currentPick) {
    const pickedFighter = currentPick === fighter1.id ? fighter1 : fighter2
    return (
      <div className="px-4 py-3 border-t border-zinc-800/50 flex items-center justify-center gap-2">
        <CheckCircle className="h-4 w-4 text-primary" />
        <span className="text-sm text-zinc-300">
          Locked in: <span className="text-white font-semibold">{pickedFighter.name}</span>
        </span>
        {isConfidence && (
          <span className="text-[11px] font-bold text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5">
            🔒 2× pts
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="border-t border-zinc-800/50">
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider text-center">
          Who wins?
        </p>

        {/* Pick buttons */}
        <div className="grid grid-cols-2 gap-3">
          <PickButton
            fighter={fighter1}
            isSelected={currentPick === fighter1.id}
            isPending={isPending}
            onClick={() => onPick(fighter1.id)}
          />
          <PickButton
            fighter={fighter2}
            isSelected={currentPick === fighter2.id}
            isPending={isPending}
            onClick={() => onPick(fighter2.id)}
          />
        </div>

        {/* Lock button — appears after a pick */}
        <AnimatePresence>
          {currentPick && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {isConfidence ? (
                // Currently locked — show remove option
                <button
                  onClick={() => onToggleLock(false)}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-amber-500/60 bg-amber-500/10 py-2 text-sm font-bold text-amber-400 hover:bg-amber-500/20 transition-all"
                >
                  <Lock className="h-4 w-4" />
                  Your Lock — 2× points
                  <span className="text-[10px] font-normal text-amber-500/70 ml-1">(tap to remove)</span>
                </button>
              ) : lockTaken ? (
                // Lock is used on another fight
                <div className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-800 py-2 text-xs text-zinc-600 cursor-not-allowed">
                  <Lock className="h-3.5 w-3.5" />
                  Lock used on another fight
                </div>
              ) : (
                // Available to lock
                <button
                  onClick={() => onToggleLock(true)}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/50 py-2 text-sm font-semibold text-zinc-400 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400 transition-all group"
                >
                  <LockOpen className="h-4 w-4 group-hover:hidden" />
                  <Lock className="h-4 w-4 hidden group-hover:block" />
                  Lock it — 2× points
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function PickButton({
  fighter, isSelected, isPending, onClick
}: {
  fighter: FighterRow
  isSelected: boolean
  isPending: boolean
  onClick: () => Promise<void>
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={isPending}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-3 font-bold text-sm transition-all duration-200',
        isSelected
          ? 'border-primary bg-primary/15 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] scale-[1.02]'
          : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700/50 hover:text-white'
      )}
    >
      {isPending && isSelected ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSelected ? (
        <CheckCircle className="h-4 w-4 text-primary" />
      ) : null}
      <span className="text-xs font-black uppercase tracking-wide line-clamp-1">
        {fighter.name.split(' ').pop()}
      </span>
      {fighter.flag_emoji && (
        <span className="text-base">{fighter.flag_emoji}</span>
      )}
    </motion.button>
  )
}
