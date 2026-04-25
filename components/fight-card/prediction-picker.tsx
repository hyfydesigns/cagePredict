'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Lock, CheckCircle, Loader2, LockOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FighterRow } from '@/types/database'

// ── Types ──────────────────────────────────────────────────────
type Method = 'ko_tko' | 'submission' | 'decision'

interface PredictionPickerProps {
  fighter1: FighterRow
  fighter2: FighterRow
  currentPick:   string | null
  currentMethod: string | null
  currentRound:  number | null
  isConfidence: boolean
  lockTaken:  boolean   // another fight already has the lock
  isLocked:   boolean   // picks closed (fight starting soon)
  isPending:  boolean
  maxRounds:  3 | 5    // 5 for main events / title fights, 3 otherwise
  userId?: string
  onPick:       (winnerId: string, method?: string | null, round?: number | null) => Promise<void>
  onToggleLock: (isConfidence: boolean) => Promise<void>
}

// ── Constants ──────────────────────────────────────────────────
const METHODS: { value: Method; label: string; emoji: string }[] = [
  { value: 'ko_tko',     label: 'KO/TKO',     emoji: '🥊' },
  { value: 'submission', label: 'Submission',  emoji: '🤼' },
  { value: 'decision',   label: 'Decision',   emoji: '📋' },
]

/** Points a pick is worth given method + round selection */
function previewPts(isConf: boolean, method: string | null, round: number | null): string {
  const base    = isConf ? 20 : 10
  const mBonus  = method ? 5 : 0
  const rBonus  = method && method !== 'decision' && round ? 5 : 0
  const total   = base + mBonus + rBonus
  if (mBonus + rBonus === 0) return `${total} pts`
  return `${total} pts (+${mBonus + rBonus} bonus)`
}

/** Human-readable label for a saved method/round */
function methodLabel(method: string | null, round: number | null): string {
  if (!method) return ''
  const m = METHODS.find((x) => x.value === method)
  const label = m ? `${m.emoji} ${m.label}` : method
  return round && method !== 'decision' ? `${label} · R${round}` : label
}

// ── Sub-components ─────────────────────────────────────────────
function PickButton({
  fighter, isSelected, isPending, onClick,
}: {
  fighter: FighterRow
  isSelected: boolean
  isPending: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={isPending}
      className={cn(
        'relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-3 font-bold text-sm transition-all duration-200',
        isSelected
          ? 'border-primary bg-primary/15 text-foreground shadow-[0_0_20px_rgba(239,68,68,0.3)] scale-[1.02]'
          : 'border-border bg-surface-2/50 text-foreground-secondary hover:border-border hover:bg-surface-3/50 hover:text-foreground',
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
      {fighter.flag_emoji && <span className="text-base">{fighter.flag_emoji}</span>}
    </motion.button>
  )
}

function MethodButton({
  method, selected, onClick,
}: {
  method: typeof METHODS[number]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-2 text-[11px] font-bold transition-all duration-150',
        selected
          ? 'border-amber-600 dark:border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-border bg-surface-2/40 text-foreground-muted hover:border-border hover:text-foreground-secondary',
      )}
    >
      <span className="text-base leading-none">{method.emoji}</span>
      <span className="uppercase tracking-wide leading-tight">{method.label}</span>
    </button>
  )
}

function RoundButton({ r, selected, onClick }: { r: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg border py-1.5 text-xs font-black uppercase tracking-wide transition-all duration-150',
        selected
          ? 'border-amber-600 dark:border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-border bg-surface-2/40 text-foreground-muted hover:border-border hover:text-foreground-secondary',
      )}
    >
      R{r}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────
export function PredictionPicker({
  fighter1, fighter2,
  currentPick, currentMethod, currentRound,
  isConfidence, lockTaken, isLocked, isPending,
  maxRounds, userId, onPick, onToggleLock,
}: PredictionPickerProps) {

  // ── Not signed in ──
  if (!userId) {
    return (
      <div className="px-4 py-3 border-t border-border/50 flex items-center justify-center">
        <p className="text-sm text-foreground-secondary">
          <a href="/login" className="text-primary hover:underline">Sign in</a> to make predictions
        </p>
      </div>
    )
  }

  // ── Locked, no pick ──
  if (isLocked && !currentPick) {
    return (
      <div className="px-4 py-3 border-t border-border/50 flex items-center justify-center gap-2">
        <Lock className="h-4 w-4 text-foreground-muted" />
        <span className="text-sm text-foreground-muted">Picks are locked</span>
      </div>
    )
  }

  // ── Locked, has pick ──
  if (isLocked && currentPick) {
    const picked = currentPick === fighter1.id ? fighter1 : fighter2
    const ml = methodLabel(currentMethod, currentRound)
    return (
      <div className="px-4 py-3 border-t border-border/50 flex flex-wrap items-center justify-center gap-2">
        <CheckCircle className="h-4 w-4 text-primary" />
        <span className="text-sm text-foreground-secondary">
          Locked in: <span className="text-foreground font-semibold">{picked.name}</span>
        </span>
        {ml && (
          <span className="text-[11px] text-foreground-muted bg-surface-2 rounded px-1.5 py-0.5">{ml}</span>
        )}
        {isConfidence && (
          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5">
            🔒 2× pts
          </span>
        )}
      </div>
    )
  }

  // ── Active picking state ──
  const selectedMethod = currentMethod as Method | null
  const needsRound = selectedMethod === 'ko_tko' || selectedMethod === 'submission'

  function handlePickFighter(winnerId: string) {
    // Switching fighter resets method + round
    if (winnerId !== currentPick) {
      onPick(winnerId, null, null)
    } else {
      onPick(winnerId, currentMethod, currentRound)
    }
  }

  function handlePickMethod(m: Method) {
    const next = m === selectedMethod ? null : m
    // Decision can't have a round
    const nextRound = next === 'decision' ? null : currentRound
    onPick(currentPick!, next, nextRound)
  }

  function handlePickRound(r: number) {
    const next = r === currentRound ? null : r
    onPick(currentPick!, selectedMethod, next)
  }

  return (
    <div className="border-t border-border/50">
      <div className="px-4 py-3 space-y-3">

        {/* ── Who wins? ── */}
        <p className="text-xs font-semibold text-foreground-secondary uppercase tracking-wider text-center">
          Who wins?
        </p>

        <div className="grid grid-cols-2 gap-3">
          <PickButton
            fighter={fighter1}
            isSelected={currentPick === fighter1.id}
            isPending={isPending}
            onClick={() => handlePickFighter(fighter1.id)}
          />
          <PickButton
            fighter={fighter2}
            isSelected={currentPick === fighter2.id}
            isPending={isPending}
            onClick={() => handlePickFighter(fighter2.id)}
          />
        </div>

        {/* ── Bonus: method + round (slides in after fighter is picked) ── */}
        <AnimatePresence initial={false}>
          {currentPick && (
            <motion.div
              key="bonus"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden space-y-2.5"
            >
              {/* Divider + label */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-surface-2" />
                <span className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest whitespace-nowrap">
                  Bonus prediction
                </span>
                <div className="flex-1 h-px bg-surface-2" />
              </div>

              {/* Method selector */}
              <div className="flex gap-2">
                {METHODS.map((m) => (
                  <MethodButton
                    key={m.value}
                    method={m}
                    selected={selectedMethod === m.value}
                    onClick={() => handlePickMethod(m.value)}
                  />
                ))}
              </div>

              {/* Round selector — only for finishes */}
              <AnimatePresence initial={false}>
                {needsRound && (
                  <motion.div
                    key="rounds"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-1.5 pt-0.5">
                      {Array.from({ length: maxRounds }, (_, i) => i + 1).map((r) => (
                        <RoundButton
                          key={r}
                          r={r}
                          selected={currentRound === r}
                          onClick={() => handlePickRound(r)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Points preview */}
              <p className="text-[10px] text-foreground-muted text-center">
                🎯 Playing for{' '}
                <span className="text-foreground-secondary font-semibold">
                  {previewPts(isConfidence, currentMethod, currentRound)}
                </span>
                {!currentMethod && (
                  <span className="ml-1">(+5 method · +5 round if correct)</span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Lock button ── */}
        <AnimatePresence>
          {currentPick && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {isConfidence ? (
                <button
                  onClick={() => onToggleLock(false)}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-amber-600 dark:border-amber-500/60 bg-amber-500/10 py-2 text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all"
                >
                  <Lock className="h-4 w-4" />
                  Your Lock — 2× base pts
                  <span className="text-[10px] font-normal text-amber-500/70 ml-1">(tap to remove)</span>
                </button>
              ) : lockTaken ? (
                <div className="w-full flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs text-foreground-muted cursor-not-allowed">
                  <Lock className="h-3.5 w-3.5" />
                  Lock used on another fight
                </div>
              ) : (
                <button
                  onClick={() => onToggleLock(true)}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2/50 py-2 text-sm font-semibold text-foreground-secondary hover:border-amber-600 dark:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400 transition-all group"
                >
                  <LockOpen className="h-4 w-4 group-hover:hidden" />
                  <Lock className="h-4 w-4 hidden group-hover:block" />
                  Lock it — 2× base pts
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
