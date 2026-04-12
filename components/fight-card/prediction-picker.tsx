'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, CheckCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

interface PredictionPickerProps {
  fighter1: FighterRow
  fighter2: FighterRow
  currentPick: string | null
  isLocked: boolean
  isPending: boolean
  userId?: string
  onPick: (winnerId: string) => Promise<void>
}

export function PredictionPicker({
  fighter1, fighter2, currentPick, isLocked, isPending, userId, onPick
}: PredictionPickerProps) {
  const [showConfidence, setShowConfidence] = useState(false)
  const [confidence, setConfidence] = useState(50)

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
        <Lock className="h-3.5 w-3.5 text-zinc-600" />
      </div>
    )
  }

  return (
    <div className="border-t border-zinc-800/50">
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider text-center">
          Who wins?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <PickButton
            fighter={fighter1}
            isSelected={currentPick === fighter1.id}
            isPending={isPending}
            onClick={async () => {
              await onPick(fighter1.id)
              setShowConfidence(true)
            }}
          />
          <PickButton
            fighter={fighter2}
            isSelected={currentPick === fighter2.id}
            isPending={isPending}
            onClick={async () => {
              await onPick(fighter2.id)
              setShowConfidence(true)
            }}
          />
        </div>

        {/* Confidence slider — shows after a pick */}
        <AnimatePresence>
          {showConfidence && currentPick && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 overflow-hidden"
            >
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Confidence</span>
                <span className="text-primary font-bold">{confidence}%</span>
              </div>
              <Slider
                min={10}
                max={100}
                step={5}
                value={[confidence]}
                onValueChange={([v]) => setConfidence(v)}
                className="w-full"
              />
              <p className="text-[10px] text-zinc-600 text-center">
                {confidence < 40 ? 'Not sure — could go either way' :
                 confidence < 70 ? 'Fairly confident' :
                 confidence < 90 ? 'Very confident' : 'Lock it in! 🔥'}
              </p>
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
