import { CheckCircle, Clock, XCircle, Lock } from 'lucide-react'
import Link from 'next/link'

interface MemberEventScore {
  userId: string
  username: string
  displayName: string | null
  avatarEmoji: string | null
  correct: number
  incorrect: number
  pending: number
  eventPoints: number
  lockCorrect: number
}

interface CrewEventScoresProps {
  members: MemberEventScore[]
  eventName: string
  currentUserId?: string
}

export function CrewEventScores({ members, eventName, currentUserId }: CrewEventScoresProps) {
  const sorted = [...members].sort((a, b) => b.eventPoints - a.eventPoints)

  if (sorted.length === 0 || sorted.every((m) => m.correct + m.incorrect + m.pending === 0)) {
    return (
      <p className="text-center text-sm text-foreground-muted py-8">
        No picks made for {eventName} yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-foreground-muted font-semibold uppercase tracking-wider mb-3">{eventName}</p>
      {sorted.map((member, i) => {
        const total = member.correct + member.incorrect + member.pending
        const isYou = member.userId === currentUserId
        return (
          <Link
            key={member.userId}
            href={`/profile/${member.username}`}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-border ${
              isYou ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface/40'
            }`}
          >
            {/* Rank */}
            <span className={`text-sm font-black w-5 text-center ${
              i === 0 ? 'text-amber-600 dark:text-amber-400' : i === 1 ? 'text-foreground-muted' : i === 2 ? 'text-amber-700' : 'text-foreground-muted'
            }`}>
              {i + 1}
            </span>

            {/* Avatar */}
            <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2 border border-border flex items-center justify-center text-base leading-none">
              {member.avatarEmoji ?? '🥊'}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                {member.displayName ?? member.username}
                {isYou && <span className="text-foreground-muted font-normal ml-1">(you)</span>}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-0.5 text-[11px] text-green-400">
                  <CheckCircle className="h-3 w-3" />{member.correct}
                </span>
                <span className="flex items-center gap-0.5 text-[11px] text-red-400">
                  <XCircle className="h-3 w-3" />{member.incorrect}
                </span>
                <span className="flex items-center gap-0.5 text-[11px] text-foreground-muted">
                  <Clock className="h-3 w-3" />{member.pending}
                </span>
                {member.lockCorrect > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" />{member.lockCorrect}
                  </span>
                )}
              </div>
            </div>

            {/* Event points */}
            <div className="text-right shrink-0">
              <p className="text-lg font-black text-foreground">{member.eventPoints}</p>
              <p className="text-[10px] text-foreground-muted">pts · {total} picks</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
