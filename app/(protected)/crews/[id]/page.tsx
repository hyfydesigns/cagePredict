import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { leaveCrew } from '@/lib/actions/crews'
import { crewInviteUrl } from '@/lib/utils'
import { Users, Crown, LogOut } from 'lucide-react'
import { InviteCopy } from '@/components/crews/invite-copy'
import type { LeaderboardEntry, ProfileRow } from '@/types/database'

interface Props { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('crews').select('name').eq('id', id).single()
  return { title: (data as any)?.name ?? 'Crew' }
}

export default async function CrewDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: crewRaw } = await supabase
    .from('crews')
    .select('*')
    .eq('id', id)
    .single()

  const crew = crewRaw as any
  if (!crew) notFound()

  const isOwner = crew.owner_id === user?.id

  // Check membership with a direct query (avoids FK join ambiguity with auth.users)
  const { data: membershipRaw } = await supabase
    .from('crew_members')
    .select('user_id')
    .eq('crew_id', id)

  const memberships = (membershipRaw ?? []) as any[]
  const isMember = memberships.some((m) => m.user_id === user?.id)
  if (!isMember) notFound()

  // Fetch member profiles separately
  const memberUserIds = memberships.map((m) => m.user_id)
  const { data: memberProfilesRaw } = await supabase
    .from('profiles')
    .select('*')
    .in('id', memberUserIds)

  const memberProfiles: ProfileRow[] = (memberProfilesRaw ?? []) as ProfileRow[]
  const leaderboard: LeaderboardEntry[] = memberProfiles
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => ({
      ...p,
      rank: i + 1,
      win_rate: p.total_picks > 0 ? Math.round((p.correct_picks / p.total_picks) * 100) : 0,
    }))

  const inviteUrl = crewInviteUrl(crew.invite_code)
  const memberCount = memberships.length

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-white">{crew.name}</h1>
              {isOwner && (
                <Badge variant="warning" className="gap-1">
                  <Crown className="h-2.5 w-2.5" />Owner
                </Badge>
              )}
            </div>
            {crew.description && (
              <p className="text-zinc-400 text-sm mt-1">{crew.description}</p>
            )}
            <p className="text-zinc-600 text-sm mt-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {memberCount} / {crew.max_members} members
            </p>
          </div>

          {!isOwner && (
            <form action={async () => { 'use server'; await leaveCrew(id) }}>
              <Button type="submit" variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                <LogOut className="h-4 w-4 mr-1.5" />
                Leave
              </Button>
            </form>
          )}
        </div>

        {/* Invite link */}
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 mb-2">Invite Link</p>
          <InviteCopy inviteUrl={inviteUrl} inviteCode={crew.invite_code} />
        </div>
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Crew Standings</h2>
        <LeaderboardTable entries={leaderboard} currentUserId={user?.id} />
      </div>
    </div>
  )
}
