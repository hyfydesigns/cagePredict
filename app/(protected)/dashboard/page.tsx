import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ProfileHeader } from '@/components/profile/profile-header'
import { PredictionHistory } from '@/components/profile/prediction-history'
import { Button } from '@/components/ui/button'
import { acceptFriendRequest } from '@/lib/actions/crews'
import { Swords, Trophy, Users, ChevronRight, Bell } from 'lucide-react'
import type { ProfileRow, PredictionWithFight } from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as ProfileRow | null
  if (!profile) redirect('/onboarding')

  // Rank
  const { count: aheadCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gt('total_points', profile.total_points)
  const rank = (aheadCount ?? 0) + 1

  // Recent predictions (last 10)
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
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const predictions = (predsRaw ?? []) as unknown as PredictionWithFight[]

  // Upcoming events
  const { data: upcomingRaw } = await supabase
    .from('events')
    .select('id, name, date, fights(id)')
    .eq('status', 'upcoming')
    .order('date', { ascending: true })
    .limit(3)

  const upcomingEvents = (upcomingRaw ?? []) as any[]

  // Pending friend requests
  const { data: pendingRaw } = await supabase
    .from('friends')
    .select('id, user_id, profiles!friends_user_id_fkey(username, avatar_emoji, display_name)')
    .eq('friend_id', user.id)
    .eq('status', 'pending')
    .limit(5)

  const pendingRequests = (pendingRaw ?? []) as any[]

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <ProfileHeader profile={profile} rank={rank} isOwn />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link href="/" className="group rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all text-center">
          <Swords className="h-5 w-5 mx-auto mb-2 text-primary" />
          <p className="text-xs font-semibold text-white">Fight Card</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Make picks</p>
        </Link>
        <Link href="/leaderboard" className="group rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all text-center">
          <Trophy className="h-5 w-5 mx-auto mb-2 text-amber-400" />
          <p className="text-xs font-semibold text-white">Leaderboard</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Rank #{rank}</p>
        </Link>
        <Link href="/crews" className="group rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-800/60 transition-all text-center">
          <Users className="h-5 w-5 mx-auto mb-2 text-blue-400" />
          <p className="text-xs font-semibold text-white">Crews</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Private leagues</p>
        </Link>
      </div>

      {/* Friend requests */}
      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-amber-400" />
            <h3 className="font-semibold text-white text-sm">
              Friend Requests ({pendingRequests.length})
            </h3>
          </div>
          <div className="space-y-2">
            {pendingRequests.map((req: any) => (
              <FriendRequestRow key={req.id} request={req} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white">Upcoming Events</h2>
            <Link href="/" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                href="/"
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-800/40 transition-all"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{event.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {Array.isArray(event.fights) ? event.fights.length : 0} fights
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent picks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-white">Recent Predictions</h2>
          <Link
            href={`/profile/${profile.username}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Full history <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <PredictionHistory predictions={predictions} />
      </div>
    </div>
  )
}

function FriendRequestRow({ request }: { request: any }) {
  const prof = request.profiles
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">{prof?.avatar_emoji ?? '🥊'}</span>
        <span className="text-sm text-white font-medium">
          {prof?.display_name ?? prof?.username}
        </span>
        <span className="text-xs text-zinc-500">@{prof?.username}</span>
      </div>
      <form action={async () => { 'use server'; await acceptFriendRequest(request.id) }}>
        <Button type="submit" size="sm" className="h-7 text-xs px-3">Accept</Button>
      </form>
    </div>
  )
}
