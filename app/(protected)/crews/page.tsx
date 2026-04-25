import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CrewCard } from '@/components/crews/crew-card'
import { CreateCrewDialog } from '@/components/crews/create-crew-dialog'
import { JoinCrewForm } from '@/components/crews/join-crew-form'
import { PendingInvites } from '@/components/crews/pending-invites'
import { Users } from 'lucide-react'
import type { CrewWithMembers, CrewInviteWithDetails } from '@/types/database'

export const metadata: Metadata = { title: 'Crews' }

export default async function CrewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch pending crew invites for the current user
  const { data: inviteRows } = await supabase
    .from('crew_invites')
    .select('id, crew_id, invited_by, invited_user, status, created_at, crew:crews(id, name, owner_id)')
    .eq('invited_user', user!.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const rawInvites = (inviteRows ?? []) as any[]

  // Fetch inviters' profiles separately (no FK join through auth.users)
  const inviterIds = [...new Set(rawInvites.map((inv) => inv.invited_by as string))]
  let inviterProfiles: { id: string; username: string; avatar_emoji: string }[] = []
  if (inviterIds.length > 0) {
    const { data: inviterData } = await supabase
      .from('profiles')
      .select('id, username, avatar_emoji')
      .in('id', inviterIds)
    inviterProfiles = (inviterData ?? []) as { id: string; username: string; avatar_emoji: string }[]
  }
  const inviterById = Object.fromEntries(inviterProfiles.map((p) => [p.id, p]))

  const pendingInvites: CrewInviteWithDetails[] = rawInvites
    .filter((inv) => inv.crew)
    .map((inv) => ({
      id: inv.id,
      crew_id: inv.crew_id,
      invited_by: inv.invited_by,
      invited_user: inv.invited_user,
      status: inv.status,
      created_at: inv.created_at,
      crew: Array.isArray(inv.crew) ? inv.crew[0] : inv.crew,
      inviter: inviterById[inv.invited_by] ?? { username: 'unknown', avatar_emoji: '👤' },
    }))

  // Get IDs of crews the user belongs to
  const { data: memberRows } = await supabase
    .from('crew_members')
    .select('crew_id')
    .eq('user_id', user!.id)

  const myCrewIds = ((memberRows ?? []) as { crew_id: string }[]).map((r) => r.crew_id)

  let myCrews: CrewWithMembers[] = []
  if (myCrewIds.length > 0) {
    // Fetch crews first
    const { data: crewData } = await supabase
      .from('crews')
      .select('*')
      .in('id', myCrewIds)
      .order('created_at', { ascending: false })

    if (crewData && crewData.length > 0) {
      // Fetch all members for these crews
      const { data: allMembers } = await supabase
        .from('crew_members')
        .select('*')
        .in('crew_id', myCrewIds)

      // Fetch profiles for all member user IDs
      const memberUserIds = [...new Set(((allMembers ?? []) as any[]).map((m) => m.user_id))]
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', memberUserIds)

      const profilesById = Object.fromEntries(
        ((profileData ?? []) as any[]).map((p) => [p.id, p])
      )

      myCrews = (crewData as any[]).map((crew) => {
        const members = ((allMembers ?? []) as any[])
          .filter((m) => m.crew_id === crew.id)
          .map((m) => ({ ...m, profile: profilesById[m.user_id] ?? null }))
        return {
          ...crew,
          crew_members: members,
          member_count: members.length,
        }
      }) as CrewWithMembers[]
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            Crews
          </h1>
          <p className="text-foreground-muted text-sm mt-1">
            Create or join private leagues with friends
          </p>
        </div>
        <CreateCrewDialog />
      </div>

      <JoinCrewForm />

      {pendingInvites.length > 0 && <PendingInvites invites={pendingInvites} />}

      <div>
        <h2 className="text-sm font-semibold text-foreground-muted uppercase tracking-wider mb-3">
          Your Crews ({myCrews.length})
        </h2>
        {myCrews.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border text-foreground-muted">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No crews yet</p>
            <p className="text-sm mt-1">Create one or join with an invite code</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myCrews.map((crew) => (
              <CrewCard
                key={crew.id}
                crew={crew}
                isOwner={crew.owner_id === user?.id}
                isMember
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
