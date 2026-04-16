import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RankBadge } from '@/components/leaderboard/rank-badge'
import { rankLabel, rankColor, winRate } from '@/lib/utils'
import { Edit, Flame, Target, Trophy, TrendingUp } from 'lucide-react'
import type { ProfileRow } from '@/types/database'

interface ProfileHeaderProps {
  profile: ProfileRow
  rank?: number
  isOwn?: boolean
}

export function ProfileHeader({ profile, rank, isOwn }: ProfileHeaderProps) {
  const wr = winRate(profile.correct_picks, profile.total_picks)

  return (
    <div className="relative rounded-2xl overflow-hidden border border-zinc-800/60 bg-zinc-900">
      {/* Background glow */}
      <div className="absolute inset-0 bg-hero-gradient opacity-40" />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <Avatar className="h-20 w-20 border-2 border-zinc-700 shadow-xl">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-zinc-800 text-4xl">
                {profile.avatar_emoji}
              </AvatarFallback>
            </Avatar>
            {rank === 1 && (
              <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                <Trophy className="h-4 w-4 text-white" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-white">
                  {profile.display_name ?? profile.username}
                </h1>
                <p className="text-zinc-500 text-sm">@{profile.username}</p>
                {profile.bio && (
                  <p className="text-zinc-400 text-sm mt-1 max-w-md">{profile.bio}</p>
                )}
              </div>
              {isOwn && (
                <Link href="/profile/edit">
                  <Button variant="outline" size="sm" className="shrink-0">
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                </Link>
              )}
            </div>

            {/* Badges row */}
            <div className="flex items-center flex-wrap gap-2 mt-3">
              {rank && <RankBadge rank={rank} showLabel />}
              {profile.current_streak >= 2 && (
                <Badge variant="warning" className="gap-1">
                  <Flame className="h-3 w-3" />
                  {profile.current_streak} streak
                </Badge>
              )}
              {profile.favorite_fighter && (
                <Badge variant="outline" className="text-zinc-400">
                  Fan of {profile.favorite_fighter}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
            <Trophy className="h-4 w-4 mx-auto mb-1 text-amber-400" />
            <p className="text-white font-black text-lg leading-none">{profile.total_points}</p>
            <p className="text-zinc-500 text-[11px] mt-1">Points</p>
          </div>
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
            <Target className="h-4 w-4 mx-auto mb-1 text-emerald-400" />
            <p className="text-white font-black text-lg leading-none">{wr}</p>
            <p className="text-zinc-500 text-[11px] mt-1">Win Rate</p>
          </div>
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-white font-black text-lg leading-none">{profile.total_picks}</p>
            <p className="text-zinc-500 text-[11px] mt-1">Picks</p>
          </div>
          <div className="rounded-xl bg-zinc-800/60 border border-zinc-700/40 p-3 text-center">
            <Flame className="h-4 w-4 mx-auto mb-1 text-orange-400" />
            <p className="text-white font-black text-lg leading-none">{profile.longest_streak}</p>
            <p className="text-zinc-500 text-[11px] mt-1">Best Streak</p>
          </div>
        </div>
      </div>
    </div>
  )
}
