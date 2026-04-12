import Link from 'next/link'
import { Users, Trophy, Crown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CrewWithMembers } from '@/types/database'

interface CrewCardProps {
  crew: CrewWithMembers
  isOwner?: boolean
  isMember?: boolean
}

export function CrewCard({ crew, isOwner, isMember }: CrewCardProps) {
  return (
    <Link
      href={`/crews/${crew.id}`}
      className="block rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-white group-hover:text-primary transition-colors">
              {crew.name}
            </h3>
            {isOwner && (
              <Badge variant="warning" className="gap-1 text-[10px]">
                <Crown className="h-2.5 w-2.5" /> Owner
              </Badge>
            )}
            {isMember && !isOwner && (
              <Badge variant="secondary" className="text-[10px]">Member</Badge>
            )}
          </div>
          {crew.description && (
            <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{crew.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 text-sm text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {crew.member_count} / {crew.max_members} members
        </span>
        <span className="flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5" />
          Invite: <span className="font-mono text-zinc-400">{crew.invite_code}</span>
        </span>
      </div>
    </Link>
  )
}
