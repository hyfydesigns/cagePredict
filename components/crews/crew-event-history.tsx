interface MemberInfo {
  userId: string
  username: string
  displayName: string | null
  avatarEmoji: string | null
}

interface MemberStat {
  userId: string
  picks: number
  correct: number
  points: number
}

interface EventSummary {
  eventId: string
  eventName: string
  date: string
  memberStats: MemberStat[]
}

interface Props {
  eventSummaries: EventSummary[]
  members: MemberInfo[]
  currentUserId?: string
}

export function CrewEventHistory({ eventSummaries, members, currentUserId }: Props) {
  if (eventSummaries.length === 0) {
    return (
      <p className="text-center text-sm text-foreground-muted py-6">
        No completed events yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {eventSummaries.map((ev) => {
        const date = new Date(ev.date.slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        })

        return (
          <div key={ev.eventId} className="rounded-xl border border-border bg-surface/40 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-foreground">{ev.eventName}</p>
              <p className="text-xs text-foreground-muted">{date}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const stats = ev.memberStats.find((s) => s.userId === m.userId)
                const isYou = m.userId === currentUserId
                const winRate = stats && stats.picks > 0
                  ? Math.round((stats.correct / stats.picks) * 100)
                  : null

                return (
                  <div
                    key={m.userId}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                      isYou
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-surface-2/60 border border-border/40'
                    }`}
                  >
                    <span className="text-lg leading-none">{m.avatarEmoji ?? '🥊'}</span>
                    <div>
                      <p className={`text-xs font-semibold leading-tight ${isYou ? 'text-primary' : 'text-foreground'}`}>
                        {m.displayName ?? m.username}{isYou ? ' ★' : ''}
                      </p>
                      {stats && stats.picks > 0 ? (
                        <p className="text-[11px] text-foreground-muted leading-tight">
                          {stats.correct}/{stats.picks} correct · {stats.points} pts
                          {winRate !== null && ` · ${winRate}%`}
                        </p>
                      ) : (
                        <p className="text-[11px] text-foreground-muted leading-tight">No picks</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
