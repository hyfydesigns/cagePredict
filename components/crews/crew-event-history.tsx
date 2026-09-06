'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, CheckCircle, XCircle, Clock, Lock, Trophy } from 'lucide-react'
import { getCrewEventBreakdown } from '@/lib/actions/crews'
import type { CrewFight, CrewMemberPick } from '@/lib/actions/crews'

interface CompletedEvent {
  id: string
  name: string
  date: string
}

interface MemberInfo {
  userId: string
  username: string
  displayName: string | null
  avatarEmoji: string | null
}

interface Props {
  events: CompletedEvent[]
  members: MemberInfo[]
  currentUserId?: string
}

interface BreakdownCache {
  [eventId: string]: { fights: CrewFight[]; picks: CrewMemberPick[] } | 'loading' | 'error'
}

function shortName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function PickCell({
  fight,
  pick,
}: {
  fight: CrewFight
  pick: CrewMemberPick | undefined
}) {
  if (!pick) {
    return <span className="text-foreground-muted text-xs">—</span>
  }

  const pickedFighter =
    pick.predictedWinnerId === fight.fighter1.id
      ? fight.fighter1
      : pick.predictedWinnerId === fight.fighter2.id
      ? fight.fighter2
      : null

  const name = pickedFighter ? shortName(pickedFighter.name) : '?'
  const scored = pick.isCorrect !== null

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {pick.isConfidence && (
          <Lock className="h-2.5 w-2.5 text-amber-500 shrink-0" />
        )}
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

function EventBreakdown({
  data,
  members,
  currentUserId,
}: {
  data: { fights: CrewFight[]; picks: CrewMemberPick[] }
  members: MemberInfo[]
  currentUserId?: string
}) {
  const { fights, picks } = data

  if (fights.length === 0) {
    return <p className="text-center text-sm text-foreground-muted py-4">No fight data available.</p>
  }

  const pickMap = new Map<string, CrewMemberPick>()
  for (const p of picks) pickMap.set(`${p.userId}::${p.fightId}`, p)

  // Compute per-member event totals for the header
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

  return (
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
                {/* Fight column */}
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
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </p>
                    )}
                  </div>
                </td>
                {/* Pick columns */}
                {members.map((m) => (
                  <td key={m.userId} className="px-3 py-2.5 text-center align-middle">
                    <PickCell
                      fight={fight}
                      pick={pickMap.get(`${m.userId}::${fight.id}`)}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CrewEventHistory({ events, members, currentUserId }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [cache, setCache] = useState<BreakdownCache>({})
  const [, startTransition] = useTransition()

  const memberUserIds = members.map((m) => m.userId)

  function toggle(eventId: string) {
    if (openId === eventId) { setOpenId(null); return }
    setOpenId(eventId)
    if (cache[eventId]) return
    setCache((c) => ({ ...c, [eventId]: 'loading' }))
    startTransition(async () => {
      const result = await getCrewEventBreakdown(memberUserIds, eventId)
      setCache((c) => ({ ...c, [eventId]: result }))
    })
  }

  if (events.length === 0) {
    return (
      <p className="text-center text-sm text-foreground-muted py-6">
        No completed events yet.
      </p>
    )
  }

  return (
    <div className="space-y-2 mt-6">
      <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5" /> Past Events
      </p>
      {events.map((ev) => {
        const isOpen = openId === ev.id
        const data = cache[ev.id]
        const date = new Date(ev.date.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        })

        return (
          <div key={ev.id} className="rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => toggle(ev.id)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-surface/40 hover:bg-surface-2/40 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-foreground">{ev.name}</p>
                <p className="text-xs text-foreground-muted">{date}</p>
              </div>
              {isOpen
                ? <ChevronDown className="h-4 w-4 text-foreground-muted shrink-0" />
                : <ChevronRight className="h-4 w-4 text-foreground-muted shrink-0" />
              }
            </button>

            {isOpen && (
              <div className="border-t border-border p-3">
                {data === 'loading' && (
                  <p className="text-center text-sm text-foreground-muted py-4">Loading…</p>
                )}
                {data === 'error' && (
                  <p className="text-center text-sm text-red-400 py-4">Failed to load. Try again.</p>
                )}
                {data && data !== 'loading' && data !== 'error' && (
                  <EventBreakdown data={data} members={members} currentUserId={currentUserId} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
