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
      <p className="text-center text-sm text-zinc-600 py-8">
        No picks made for {eventName} yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-3">{eventName}</p>
      {sorted.map((member, i) => {
        const total = member.correct + member.incorrect + member.pending
        const isYou = member.userId === currentUserId
        return (
          <Link
            key={member.userId}
            href={`/profile/${member.username}`}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:border-zinc-600 ${
              isYou ? 'border-primary/30 bg-primary/5' : 'border-zinc-800 bg-zinc-900/40'
            }`}
          >
            {/* Rank */}
            <span className={`text-sm font-black w-5 text-center ${
              i === 0 ? 'text-amber-400' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-zinc-600'
            }`}>
              {i + 1}
            </span>

            {/* Avatar */}
            <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base leading-none">
              {member.avatarEmoji ?? '🥊'}
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {member.displayName ?? member.username}
                {isYou && <span className="text-zinc-500 font-normal ml-1">(you)</span>}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-0.5 text-[11px] text-green-400">
                  <CheckCircle className="h-3 w-3" />{member.correct}
                </span>
                <span className="flex items-center gap-0.5 text-[11px] text-red-400">
                  <XCircle className="h-3 w-3" />{member.incorrect}
                </span>
                <span className="flex items-center gap-0.5 text-[11px] text-zinc-600">
                  <Clock className="h-3 w-3" />{member.pending}
                </span>
                {member.lockCorrect > 0 && (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-400">
                    <Lock className="h-3 w-3" />{member.lockCorrect}
                  </span>
                )}
              </div>
            </div>

            {/* Event points */}
            <div className="text-right shrink-0">
              <p className="text-lg font-black text-white">{member.eventPoints}</p>
              <p className="text-[10px] text-zinc-600">pts · {total} picks</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
