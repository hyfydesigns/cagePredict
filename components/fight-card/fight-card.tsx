'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useAnimate } from 'framer-motion'
import { Trophy, CheckCircle, XCircle, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { FighterPortrait } from './fighter-portrait'
import { PredictionPicker } from './prediction-picker'
import { CountdownTimer } from './countdown-timer'
import { FightStatusBadge } from './fight-status-badge'
import { FightComments } from './fight-comments'
import { PickDistribution } from './pick-distribution'
import { FightMatchupTabs } from './fight-matchup-tabs'
import { cn, isFightLocked } from '@/lib/utils'
import type { FightWithDetails, CommentWithProfile } from '@/types/database'

function cmToFtIn(cm: number): string {
  const totalIn = cm / 2.54
  const ft = Math.floor(totalIn / 12)
  const inches = Math.round(totalIn % 12)
  return `${ft}'${inches}"`
}

function cmToIn(cm: number): string {
  return `${Math.round(cm / 2.54)}"`
}

// ── Form pills ────────────────────────────────────────────────
function FormPills({ form }: { form: string | null | undefined }) {
  if (!form) return <span className="text-[10px] text-foreground-secondary">—</span>
  // e.g. "WLWWW" or "W,L,W,W,W"
  const results = form.replace(/[^WLDwld]/g, '').toUpperCase().split('').slice(-5)
  if (!results.length) return <span className="text-[10px] text-foreground-secondary">—</span>
  return (
    <div className="flex gap-0.5">
      {results.map((r, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center justify-center rounded text-[9px] font-black w-4 h-4',
            r === 'W' && 'bg-emerald-500/20 text-emerald-400',
            r === 'L' && 'bg-red-500/20 text-red-400',
            r === 'D' && 'bg-surface-3/40 text-foreground-muted',
          )}
        >
          {r}
        </span>
      ))}
    </div>
  )
}

// ── H2H display ───────────────────────────────────────────────
function H2HDisplay({
  f1Name, f2Name, h2h,
}: { f1Name: string; f2Name: string; h2h: { f1Wins: number; f2Wins: number } | null }) {
  const f1Last = f1Name.split(' ').pop() ?? f1Name
  const f2Last = f2Name.split(' ').pop() ?? f2Name
  const hasH2H = h2h && (h2h.f1Wins + h2h.f2Wins > 0)
  return (
    <div>
      <h4 className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-2">
        Head to Head
      </h4>
      {hasH2H ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-foreground">{f1Last}</span>
          <span className="text-foreground-secondary">{h2h!.f1Wins}–{h2h!.f2Wins}</span>
          <span className="font-bold text-foreground">{f2Last}</span>
        </div>
      ) : (
        <p className="text-[11px] text-foreground-muted">First meeting</p>
      )}
    </div>
  )
}

interface FightCardProps {
  fight: FightWithDetails
  eventDate?: string | null
  userPick?: string | null
  userMethod?: string | null
  userRound?: number | null
  isConfidence?: boolean
  lockTaken?: boolean
  userId?: string
  isPending?: boolean
  initialComments?: CommentWithProfile[]
  onPredict: (fightId: string, winnerId: string, method?: string | null, round?: number | null) => Promise<void>
  onToggleLock: (fightId: string, isConfidence: boolean) => Promise<void>
}

export function FightCard({
  fight, eventDate, userPick, userMethod = null, userRound = null,
  isConfidence = false, lockTaken = false,
  userId, isPending = false, initialComments = [], onPredict, onToggleLock,
}: FightCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [localPick, setLocalPick]     = useState<string | null>(userPick   ?? null)
  const [localMethod, setLocalMethod] = useState<string | null>(userMethod ?? null)
  const [localRound, setLocalRound]   = useState<number | null>(userRound  ?? null)
  const [scope, animate] = useAnimate()
  const flashedRef = useRef(false)

  const isCompleted  = fight.status === 'completed'
  const isLive       = fight.status === 'live'
  const isCancelled  = fight.status === 'cancelled'
  const isLocked     = isFightLocked(fight.fight_time, eventDate)

  const pickCorrect   = isCompleted && localPick !== null && localPick === fight.winner_id
  const pickIncorrect = isCompleted && localPick !== null && localPick !== fight.winner_id
  const pointsEarned  = pickCorrect ? (isConfidence ? 20 : 10) : 0

  // Post-fight result flash animation — fires once when result becomes known
  useEffect(() => {
    if (!isCompleted || !localPick || flashedRef.current) return
    flashedRef.current = true

    const color = pickCorrect
      ? ['rgba(34,197,94,0)', 'rgba(34,197,94,0.25)', 'rgba(34,197,94,0)']
      : ['rgba(239,68,68,0)',  'rgba(239,68,68,0.20)',  'rgba(239,68,68,0)']

    animate(scope.current, {
      backgroundColor: color,
    }, { duration: 1.2, times: [0, 0.4, 1], ease: 'easeOut' })
  }, [isCompleted, localPick, pickCorrect, animate, scope])

  async function handlePredict(winnerId: string, method?: string | null, round?: number | null) {
    setLocalPick(winnerId)
    setLocalMethod(method ?? null)
    setLocalRound(round  ?? null)
    await onPredict(fight.id, winnerId, method, round)
  }

  return (
    <motion.div
      ref={scope}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-2xl overflow-hidden border transition-all duration-300',
        fight.is_main_event
          ? 'border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.08)]'
          : 'border-border/60',
        isLive && 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.18)] animate-pulse-red',
        isCompleted && pickCorrect  && 'border-emerald-500/40',
        isCompleted && pickIncorrect && 'border-red-500/20',
        !pickCorrect && !pickIncorrect && isCompleted && 'border-border/30 opacity-90',
        'bg-gradient-to-b from-surface to-background'
      )}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2 flex-wrap">
          {fight.is_title_fight && (
            <Badge variant="warning" className="gap-1 text-[11px]">
              <Trophy className="h-2.5 w-2.5" /> Title Fight
            </Badge>
          )}
          {fight.is_main_event && (
            <Badge variant="destructive" className="text-[11px]">Main Event</Badge>
          )}
          <span className="text-foreground-secondary text-[11px] font-semibold uppercase tracking-widest">
            {fight.weight_class}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isConfidence && !isCompleted && (
            <Badge className="gap-1 text-[11px] bg-amber-500/20 text-amber-400 border-amber-500/40">
              🔒 2× pts
            </Badge>
          )}
          {pickCorrect && (
            <Badge variant="success" className="gap-1 text-[11px]">
              <CheckCircle className="h-3 w-3" /> +{pointsEarned} pts
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
      <div className={cn('grid grid-cols-[1fr,72px,1fr]', isCancelled && 'opacity-40 grayscale')}>
        <FighterPortrait
          fighter={fight.fighter1}
          side="left"
          isPicked={localPick === fight.fighter1.id}
          isWinner={isCompleted && fight.winner_id === fight.fighter1.id}
          isLoser={isCompleted && !!fight.winner_id && fight.winner_id !== fight.fighter1.id}
          odds={fight.odds_f1}
          oddsOpen={fight.odds_f1_open}
        />

        {/* Center column — VS + countdown only */}
        <div className="flex flex-col items-center justify-center py-4 gap-2">
          <div className="text-foreground-muted font-black text-xl">VS</div>
          {!isCompleted && !isLive && !isCancelled && (
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
          oddsOpen={fight.odds_f2_open}
        />
      </div>

      {/* Expand toggles */}
      <div className="border-t border-border/40">
        <button
          onClick={() => { setExpanded(!expanded); setShowComments(false) }}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-foreground-muted hover:text-foreground-secondary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Stats & Analysis
        </button>
        {/* Chat button hidden — re-enable when chat is ready
        <button
          onClick={() => { setShowComments(!showComments); setExpanded(false) }}
          className="flex items-center justify-center gap-1.5 py-2 text-xs text-foreground-muted hover:text-foreground-secondary transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          {showComments ? 'Hide' : `Chat${initialComments.length > 0 ? ` (${initialComments.length})` : ''}`}
        </button>
        */}
      </div>

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
            <div className="px-4 pb-4 space-y-4 border-t border-border/40 pt-4">
              {/* Pick distribution — show after voting or when fight is completed */}
              {(localPick || isCompleted) && (
                <PickDistribution
                  f1Name={fight.fighter1.name}
                  f2Name={fight.fighter2.name}
                  f1Id={fight.fighter1_id}
                  f2Id={fight.fighter2_id}
                  pickCounts={(fight as any)._pickCounts ?? {}}
                />
              )}

              {/* Fighter form + division rank */}
              <div>
                <h4 className="text-[10px] font-bold text-foreground-muted uppercase tracking-widest mb-2">
                  Recent Form
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {/* Fighter 1 */}
                  <div className="space-y-1">
                    <p className="text-[10px] text-foreground-secondary font-semibold">
                      {fight.fighter1.name.split(' ').pop()}
                      {(fight as any)._f1Rank && (
                        <span className="ml-1.5 text-amber-400">#{(fight as any)._f1Rank}</span>
                      )}
                    </p>
                    <FormPills form={fight.fighter1.last_5_form} />
                  </div>
                  {/* Fighter 2 */}
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] text-foreground-secondary font-semibold">
                      {(fight as any)._f2Rank && (
                        <span className="mr-1.5 text-amber-400">#{(fight as any)._f2Rank}</span>
                      )}
                      {fight.fighter2.name.split(' ').pop()}
                    </p>
                    <div className="flex justify-end">
                      <FormPills form={fight.fighter2.last_5_form} />
                    </div>
                  </div>
                </div>
              </div>

              {/* H2H record */}
              <H2HDisplay
                f1Name={fight.fighter1.name}
                f2Name={fight.fighter2.name}
                h2h={(fight as any)._h2h ?? null}
              />

              {/* Tabbed matchup stats — Matchup | Win By | Striking | Grappling | Odds */}
              <FightMatchupTabs
                fighter1={fight.fighter1}
                fighter2={fight.fighter2}
                odds1={fight.odds_f1}
                odds2={fight.odds_f2}
                odds1Open={fight.odds_f1_open}
                odds2Open={fight.odds_f2_open}
              />

              {/* Analysis */}
              {(fight.analysis_f1 || fight.analysis_f2) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fight.analysis_f1 && (
                    <div className="rounded-lg bg-surface-2/50 p-3">
                      <p className="text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
                        {fight.fighter1.name.split(' ').pop()}
                      </p>
                      <p className="text-[11px] text-foreground-muted leading-relaxed">{fight.analysis_f1}</p>
                    </div>
                  )}
                  {fight.analysis_f2 && (
                    <div className="rounded-lg bg-surface-2/50 p-3">
                      <p className="text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
                        {fight.fighter2.name.split(' ').pop()}
                      </p>
                      <p className="text-[11px] text-foreground-muted leading-relaxed">{fight.analysis_f2}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comments section — hidden until chat is re-enabled
      <AnimatePresence initial={false}>
        {showComments && (
          <motion.div
            key="comments"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 border-t border-border/40">
              <FightComments
                fightId={fight.id}
                initialComments={initialComments}
                currentUserId={userId}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      */}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="px-4 py-2.5 bg-surface-2/40 border-t border-border/40 flex items-center justify-center gap-2">
          <XCircle className="h-3.5 w-3.5 text-foreground-muted" />
          <span className="text-sm text-foreground-muted font-semibold">Fight Cancelled — picks voided, no points awarded</span>
        </div>
      )}

      {/* Result banner */}
      {isCompleted && fight.winner_id && (
        <div className="px-4 py-2.5 bg-surface-2/30 border-t border-border/40 flex items-center justify-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-sm text-foreground-secondary">
            <span className="font-bold text-foreground">
              {fight.winner_id === fight.fighter1.id ? fight.fighter1.name : fight.fighter2.name}
            </span>
            {fight.method && (
              <span className="text-foreground-secondary ml-1 text-xs">
                via {fight.method}
                {fight.round && ` (R${fight.round}`}
                {fight.time_of_finish && ` ${fight.time_of_finish})`}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Draw banner */}
      {isCompleted && !fight.winner_id && (
        <div className="px-4 py-2.5 bg-surface-2/30 border-t border-border/40 flex items-center justify-center gap-2">
          <span className="text-base">🤝</span>
          <span className="text-sm font-bold text-foreground-secondary">
            Draw
            {fight.method && (
              <span className="font-normal text-foreground-muted ml-1 text-xs">— {fight.method}</span>
            )}
          </span>
          <span className="text-[10px] text-foreground-muted ml-1">picks voided, no points awarded</span>
        </div>
      )}

      {/* Prediction picker */}
      {!isCompleted && !isCancelled && (
        <PredictionPicker
          fighter1={fight.fighter1}
          fighter2={fight.fighter2}
          currentPick={localPick}
          currentMethod={localMethod}
          currentRound={localRound}
          isConfidence={isConfidence}
          lockTaken={lockTaken}
          isLocked={isLocked}
          isPending={isPending}
          maxRounds={(fight.is_main_event || fight.is_title_fight) ? 5 : 3}
          userId={userId}
          onPick={handlePredict}
          onToggleLock={(conf) => onToggleLock(fight.id, conf)}
        />
      )}
    </motion.div>
  )
}
