'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { RankBadge } from './rank-badge'
import { rankLabel, rankColor } from '@/lib/utils'
import { useRealtimeLeaderboard } from '@/hooks/use-realtime-leaderboard'
import { Flame, Target } from 'lucide-react'
import type { LeaderboardEntry } from '@/types/database'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  currentUserId?: string
  highlightedIds?: string[]   // friend IDs to highlight
}

export function LeaderboardTable({ entries, currentUserId, highlightedIds }: LeaderboardTableProps) {
  const live = useRealtimeLeaderboard(entries)

  return (
    <div className="space-y-1.5">
      {live.map((entry, i) => {
        const isMe = entry.id === currentUserId
        const isFriend = highlightedIds?.includes(entry.id)

        return (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <Link
              href={`/profile/${entry.username}`}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-all duration-200 group
                ${isMe
                  ? 'bg-primary/10 border-primary/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                  : 'bg-zinc-900/60 border-zinc-800/40 hover:bg-zinc-800/60 hover:border-zinc-700/60'
                }`}
            >
              {/* Rank */}
              <RankBadge rank={entry.rank} />

              {/* Avatar */}
              <Avatar className="h-9 w-9 shrink-0 border border-zinc-700">
                <AvatarImage src={entry.avatar_url ?? undefined} />
                <AvatarFallback className="bg-zinc-800 text-base">
                  {entry.avatar_emoji}
                </AvatarFallback>
              </Avatar>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-bold text-sm truncate ${isMe ? 'text-primary' : 'text-white'}`}>
                    {entry.display_name ?? entry.username}
                    {isMe && <span className="text-zinc-300 font-normal ml-1">(you)</span>}
                  </span>
                  {entry.rank <= 3 && (
                    <Badge variant="warning" className="text-[10px] px-1.5">
                      {rankLabel(entry.rank)}
                    </Badge>
                  )}
                  {isFriend && (
                    <Badge variant="outline" className="text-[10px] px-1.5 text-blue-400 border-blue-500/40">
                      Friend
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-zinc-300">
                    <Target className="h-3 w-3 inline mr-0.5" />
                    {entry.win_rate}% accuracy
                  </span>
                  {entry.current_streak > 2 && (
                    <span className="text-[11px] text-orange-400 flex items-center gap-0.5">
                      <Flame className="h-3 w-3" />
                      {entry.current_streak} streak
                    </span>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="text-right shrink-0">
                <p className="text-white font-black text-base">{entry.total_points}</p>
                <p className="text-zinc-400 text-[11px]">pts</p>
              </div>
            </Link>
          </motion.div>
        )
      })}

      {live.length === 0 && (
        <div className="text-center py-12 text-zinc-400">
          <p className="text-sm">No rankings yet — be the first!</p>
        </div>
      )}
    </div>
  )
}
