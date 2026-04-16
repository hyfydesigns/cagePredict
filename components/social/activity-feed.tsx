import { formatDistanceToNow } from 'date-fns'
import { CheckCircle, XCircle, Clock, Lock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface FeedItem {
  id: string
  userId: string
  username: string
  displayName: string | null
  avatarEmoji: string | null
  pickedFighterName: string
  opponentName: string
  eventName: string
  isConfidence: boolean
  isCorrect: boolean | null
  createdAt: string
}

interface ActivityFeedProps {
  items: FeedItem[]
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-600 py-6">
        No activity yet — add friends to see their picks here.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3',
          item.isCorrect === true  && 'border-green-500/20 bg-green-500/5',
          item.isCorrect === false && 'border-red-500/20 bg-red-500/5',
          item.isCorrect === null  && 'border-zinc-800/60 bg-zinc-900/40',
        )}>
          {/* Avatar */}
          <Link href={`/profile/${item.username}`} className="shrink-0 h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-base leading-none hover:border-zinc-500 transition-colors">
            {item.avatarEmoji ?? '🥊'}
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 leading-snug">
              <Link href={`/profile/${item.username}`} className="font-bold text-white hover:text-primary transition-colors">
                {item.displayName ?? item.username}
              </Link>
              {' '}picked{' '}
              <span className="font-semibold text-white">{item.pickedFighterName}</span>
              {' '}to beat{' '}
              <span className="text-zinc-400">{item.opponentName}</span>
              {item.isConfidence && (
                <span className="inline-flex items-center gap-0.5 ml-1 text-amber-400 text-xs font-bold">
                  <Lock className="h-2.5 w-2.5" />Lock
                </span>
              )}
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">
              {item.eventName} · {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </p>
          </div>

          {/* Result icon */}
          <div className="shrink-0">
            {item.isCorrect === true  && <CheckCircle className="h-4 w-4 text-green-400" />}
            {item.isCorrect === false && <XCircle className="h-4 w-4 text-red-400" />}
            {item.isCorrect === null  && <Clock className="h-4 w-4 text-zinc-700" />}
          </div>
        </div>
      ))}
    </div>
  )
}
