import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CrewCard } from '@/components/crews/crew-card'
import { CreateCrewDialog } from '@/components/crews/create-crew-dialog'
import { JoinCrewForm } from '@/components/crews/join-crew-form'
import { Users } from 'lucide-react'
import type { CrewWithMembers } from '@/types/database'

export const metadata: Metadata = { title: 'Crews' }

export default async function CrewsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            Crews
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Create or join private leagues with friends
          </p>
        </div>
        <CreateCrewDialog />
      </div>

      <JoinCrewForm />

      <div>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          Your Crews ({myCrews.length})
        </h2>
        {myCrews.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-zinc-800 text-zinc-600">
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
