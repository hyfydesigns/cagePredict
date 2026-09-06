'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle, XCircle, Clock, Lock, RefreshCw } from 'lucide-react'
import { getCrewEventBreakdown } from '@/lib/actions/crews'
import type { CrewFight, CrewMemberPick } from '@/lib/actions/crews'

interface MemberInfo {
  userId: string
  username: string
  displayName: string | null
  avatarEmoji: string | null
}

interface Props {
  eventId: string
  eventName: string
  eventStatus: string
  initialFights: any[]
  initialPicks: any[]
  members: MemberInfo[]
  memberUserIds: string[]
  currentUserId?: string
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function PickCell({ fight, pick }: { fight: CrewFight; pick: CrewMemberPick | undefined }) {
  if (!pick) return <span className="text-foreground-muted text-xs">—</span>

  const pickedFighter =
    pick.predictedWinnerId === fight.fighter1.id ? fight.fighter1 :
    pick.predictedWinnerId === fight.fighter2.id ? fight.fighter2 : null

  const name = pickedFighter ? shortName(pickedFighter.name) : '?'
  const scored = pick.isCorrect !== null

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {pick.isConfidence && <Lock className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
        <span className={`text-xs font-medium leading-tight text-center ${
          !scored ? 'text-foreground-secondary' :
          pick.isCorrect ? 'text-green-400' : 'text-red-400'
        }`}>
          {name}
        </span>
        {scored && (
          pick.isCorrect
            ? <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
            : <XCircle className="h-3 w-3 text-red-400 shrink-0" />
        )}
      </div>
      {scored && pick.pointsEarned > 0 && (
        <span className="text-[10px] text-foreground-muted">+{pick.pointsEarned}</span>
      )}
    </div>
  )
}

function toCrewFight(raw: any): CrewFight {
  return {
    id:           raw.id,
    displayOrder: raw.display_order,
    isMainEvent:  raw.is_main_event,
    fighter1:     { id: raw.fighter1?.id ?? '', name: raw.fighter1?.name ?? '?' },
    fighter2:     { id: raw.fighter2?.id ?? '', name: raw.fighter2?.name ?? '?' },
    winnerId:     raw.winner_id,
    status:       raw.status,
    method:       raw.method,
    round:        raw.round,
  }
}

function toCrewPick(raw: any): CrewMemberPick {
  return {
    userId:             raw.user_id,
    fightId:            raw.fight_id,
    predictedWinnerId:  raw.predicted_winner_id,
    isConfidence:       raw.is_confidence ?? false,
    isCorrect:          raw.is_correct,
    pointsEarned:       raw.points_earned ?? 0,
  }
}

export function CrewLiveEvent({
  eventId, eventName, eventStatus,
  initialFights, initialPicks,
  members, memberUserIds, currentUserId,
}: Props) {
  const [fights, setFights] = useState<CrewFight[]>(initialFights.map(toCrewFight))
  const [picks,  setPicks]  = useState<CrewMemberPick[]>(initialPicks.map(toCrewPick))
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isPending, startTransition]  = useTransition()

  const isLive = eventStatus === 'live'

  function refresh() {
    startTransition(async () => {
      const result = await getCrewEventBreakdown(memberUserIds, eventId)
      setFights(result.fights)
      setPicks(result.picks)
      setLastRefresh(new Date())
    })
  }

  // Poll every 30s while event is live
  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(refresh, 30_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, eventId])

  const pickMap = new Map<string, CrewMemberPick>()
  for (const p of picks) pickMap.set(`${p.userId}::${p.fightId}`, p)

  const memberTotals = members.map((m) => {
    let pts = 0, correct = 0, total = 0
    for (const f of fights) {
      const p = pickMap.get(`${m.userId}::${f.id}`)
      if (!p) continue
      total++
      if (p.isCorrect === true) { correct++; pts += p.pointsEarned }
    }
    return { userId: m.userId, pts, correct, total }
  })

  if (fights.length === 0) {
    return (
      <p className="text-center text-sm text-foreground-muted py-8">
        No fights found for {eventName}.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {/* Event header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
            {eventName}
          </p>
          {isLive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={isPending}
          className="flex items-center gap-1 text-[11px] text-foreground-muted hover:text-foreground transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${isPending ? 'animate-spin' : ''}`} />
          {isLive ? `Auto-refreshing` : `Refresh`}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              <th className="text-left px-3 py-2 font-semibold text-foreground-muted w-48">Fight</th>
              {members.map((m) => {
                const t = memberTotals.find((x) => x.userId === m.userId)
                const isYou = m.userId === currentUserId
                return (
                  <th key={m.userId} className={`px-3 py-2 text-center ${isYou ? 'text-primary' : 'text-foreground-secondary'}`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base leading-none">{m.avatarEmoji ?? '🥊'}</span>
                      <span className="font-semibold text-[11px] truncate max-w-[80px]">
                        {m.displayName ?? m.username}{isYou ? ' ★' : ''}
                      </span>
                      {t && (
                        <span className="text-[10px] text-foreground-muted font-normal">
                          {t.pts}pts · {t.correct}/{t.total}
                        </span>
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {fights.map((fight, idx) => {
              const isCompleted = fight.status === 'completed'
              const isCancelled = fight.status === 'cancelled'
              return (
                <tr
                  key={fight.id}
                  className={`border-b border-border/50 last:border-0 ${
                    idx % 2 === 0 ? 'bg-surface/30' : 'bg-surface/10'
                  } ${fight.isMainEvent ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      {fight.isMainEvent && (
                        <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Main Event</span>
                      )}
                      <p className="font-semibold text-foreground leading-tight text-[11px]">
                        {fight.fighter1.name}
                      </p>
                      <p className="text-foreground-muted text-[10px]">vs</p>
                      <p className="font-semibold text-foreground leading-tight text-[11px]">
                        {fight.fighter2.name}
                      </p>
                      {isCompleted && fight.winnerId && (
                        <p className="text-[10px] text-green-400 font-medium mt-0.5">
                          W: {shortName(
                            fight.winnerId === fight.fighter1.id
                              ? fight.fighter1.name
                              : fight.fighter2.name
                          )}
                          {fight.method ? ` · ${fight.method}${fight.round ? ` R${fight.round}` : ''}` : ''}
                        </p>
                      )}
                      {isCancelled && (
                        <p className="text-[10px] text-foreground-muted">Cancelled</p>
                      )}
                      {!isCompleted && !isCancelled && (
                        <p className="text-[10px] text-foreground-muted flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> Upcoming
                        </p>
                      )}
                    </div>
                  </td>
                  {members.map((m) => (
                    <td key={m.userId} className="px-3 py-2.5 text-center align-middle">
                      <PickCell fight={fight} pick={pickMap.get(`${m.userId}::${fight.id}`)} />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isLive && (
        <p className="text-[10px] text-foreground-muted text-center">
          Last updated {lastRefresh.toLocaleTimeString()} · refreshes every 30s
        </p>
      )}
    </div>
  )
}
