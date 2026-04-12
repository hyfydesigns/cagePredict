import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ProfileHeader } from '@/components/profile/profile-header'
import { PredictionHistory } from '@/components/profile/prediction-history'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { sendFriendRequest } from '@/lib/actions/crews'
import { UserPlus, History, BarChart3 } from 'lucide-react'
import type { ProfileRow, PredictionWithFight } from '@/types/database'

interface Props { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  return { title: `@${username}` }
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  const profile = profileRaw as ProfileRow | null
  if (!profile) notFound()

  const isOwn = user?.id === profile.id

  // Rank = count of profiles with more points + 1
  const { count: aheadCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('total_points', profile.total_points)
  const rank = (aheadCount ?? 0) + 1

  // Prediction history
  const { data: predsRaw } = await supabase
    .from('predictions')
    .select(`
      *,
      fight:fights(
        *,
        event:events(*),
        fighter1:fighters!fights_fighter1_id_fkey(*),
        fighter2:fighters!fights_fighter2_id_fkey(*)
      )
    `)
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(30)

  const predictions = (predsRaw ?? []) as unknown as PredictionWithFight[]

  // Friend status
  let isFriend = false
  let hasPendingRequest = false
  if (user && !isOwn) {
    const { data: friendLink } = await supabase
      .from('friends')
      .select('status')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${profile.id}),and(user_id.eq.${profile.id},friend_id.eq.${user.id})`)
      .single()
    const fl = friendLink as { status: string } | null
    if (fl?.status === 'accepted') isFriend = true
    if (fl?.status === 'pending') hasPendingRequest = true
  }

  const winRatePct = profile.total_picks > 0
    ? `${Math.round((profile.correct_picks / profile.total_picks) * 100)}%`
    : '0%'

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <ProfileHeader profile={profile} rank={rank} isOwn={isOwn} />

      {/* Add friend button */}
      {user && !isOwn && !isFriend && (
        <form action={async () => { 'use server'; await sendFriendRequest(profile.id) }}>
          <Button type="submit" variant="outline" disabled={hasPendingRequest} className="w-full">
            <UserPlus className="h-4 w-4 mr-2" />
            {hasPendingRequest ? 'Request Sent' : 'Add Friend'}
          </Button>
        </form>
      )}

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-3.5 w-3.5" /> Prediction History
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-3.5 w-3.5" /> Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <PredictionHistory predictions={predictions} />
        </TabsContent>

        <TabsContent value="stats">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Points',   value: profile.total_points },
              { label: 'Total Picks',    value: profile.total_picks },
              { label: 'Correct Picks',  value: profile.correct_picks },
              { label: 'Win Rate',       value: winRatePct },
              { label: 'Current Streak', value: profile.current_streak },
              { label: 'Best Streak',    value: profile.longest_streak },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-2xl font-black text-white">{value}</p>
                <p className="text-xs text-zinc-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
