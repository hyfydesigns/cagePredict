import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { ProfileHeader } from '@/components/profile/profile-header'
import { BadgeShelf } from '@/components/profile/badge-shelf'
import { ActivityFeed } from '@/components/social/activity-feed'
import { PredictionHistory } from '@/components/profile/prediction-history'
import { Button } from '@/components/ui/button'
import { acceptFriendRequest } from '@/lib/actions/crews'
import { Swords, Trophy, Users, ChevronRight, Bell, Calendar, Swords as SwordsIcon } from 'lucide-react'
import type { ProfileRow, PredictionWithFight, UserBadgeWithDefinition } from '@/types/database'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profile first — needed for redirect check and as input to subsequent queries
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileRaw as ProfileRow | null
  if (!profile) redirect('/onboarding')

  // All independent queries in parallel
  const [
    { count: aheadCount },
    { data: predsRaw },
    { data: badgesRaw },
    { data: upcomingRaw },
    { data: pendingRaw },
    { data: friendLinks },
  ] = await Promise.all([
    // Rank
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gt('total_points', profile.total_points),
    // Recent predictions
    supabase
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
      .limit(10),
    // Badges
    supabase
      .from('user_badges')
      .select('*, definition:badge_definitions(*)')
      .eq('user_id', user.id),
    // Upcoming events
    supabase
      .from('events')
      .select('id, name, date, fights(id)')
      .eq('status', 'upcoming')
      .order('date', { ascending: true })
      .limit(3),
    // Pending friend requests
    supabase
      .from('friends')
      .select('id, user_id, profiles!friends_user_id_fkey(username, avatar_emoji, display_name)')
      .eq('friend_id', user.id)
      .eq('status', 'pending')
      .limit(5),
    // Accepted friends
    supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted'),
  ])

  const rank          = (aheadCount ?? 0) + 1
  const predictions   = (predsRaw ?? []) as unknown as PredictionWithFight[]
  const badges        = (badgesRaw ?? []) as unknown as UserBadgeWithDefinition[]
  const upcomingEvents = (upcomingRaw ?? []) as { id: string; name: string; date: string; fights: { id: string }[] }[]
  const pendingRequests = (pendingRaw ?? []) as any[]

  const friendIds = ((friendLinks ?? []) as any[]).map((f) =>
    f.user_id === user.id ? f.friend_id : f.user_id
  )

  // Friend activity feed — only if friends exist (separate query, depends on friendIds)
  const feedItems: any[] = []
  if (friendIds.length > 0) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: feedRaw } = await supabase
      .from('predictions')
      .select(`
        id, is_confidence, is_correct, created_at, predicted_winner_id,
        profile:profiles!predictions_user_id_fkey(id, username, display_name, avatar_emoji),
        fight:fights(
          id, fighter1_id, fighter2_id,
          event:events(name),
          fighter1:fighters!fights_fighter1_id_fkey(id, name),
          fighter2:fighters!fights_fighter2_id_fkey(id, name)
        )
      `)
      .in('user_id', friendIds)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25)

    ;(feedRaw ?? []).forEach((p: any) => {
      const picked   = p.predicted_winner_id === p.fight?.fighter1_id ? p.fight?.fighter1 : p.fight?.fighter2
      const opponent = p.predicted_winner_id === p.fight?.fighter1_id ? p.fight?.fighter2 : p.fight?.fighter1
      feedItems.push({
        id:                p.id,
        userId:            p.profile?.id,
        username:          p.profile?.username,
        displayName:       p.profile?.display_name,
        avatarEmoji:       p.profile?.avatar_emoji,
        pickedFighterName: picked?.name ?? '?',
        opponentName:      opponent?.name ?? '?',
        eventName:         p.fight?.event?.name ?? '',
        isConfidence:      p.is_confidence,
        isCorrect:         p.is_correct,
        createdAt:         p.created_at,
      })
    })
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <ProfileHeader profile={profile} rank={rank} isOwn />
      <BadgeShelf earned={badges} />

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/"
          className="group rounded-xl border border-border bg-surface p-4 hover:border-border hover:bg-surface-2/60 transition-all text-center"
        >
          <Swords className="h-5 w-5 mx-auto mb-2 text-primary" />
          <p className="text-xs font-semibold text-foreground">Fight Card</p>
          <p className="text-[11px] text-foreground-secondary mt-0.5">Make picks</p>
        </Link>
        <Link
          href="/leaderboard"
          className="group rounded-xl border border-border bg-surface p-4 hover:border-border hover:bg-surface-2/60 transition-all text-center"
        >
          <Trophy className="h-5 w-5 mx-auto mb-2 text-amber-600 dark:text-amber-400" />
          <p className="text-xs font-semibold text-foreground">Leaderboard</p>
          <p className="text-[11px] text-foreground-secondary mt-0.5">Rank #{rank}</p>
        </Link>
        <Link
          href="/crews"
          className="group rounded-xl border border-border bg-surface p-4 hover:border-border hover:bg-surface-2/60 transition-all text-center"
        >
          <Users className="h-5 w-5 mx-auto mb-2 text-foreground-secondary" />
          <p className="text-xs font-semibold text-foreground">Crews</p>
          <p className="text-[11px] text-foreground-secondary mt-0.5">Private leagues</p>
        </Link>
      </div>

      {/* Friend requests */}
      {pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-amber-600 dark:border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="font-semibold text-foreground text-sm">
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
            <h2 className="font-bold text-foreground">Upcoming Events</h2>
            <Link href="/" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                href="/"
                className="flex items-center justify-between rounded-xl border border-border bg-surface/60 px-4 py-3 hover:border-border hover:bg-surface-2/40 transition-all"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{event.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-foreground-secondary">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(event.date), 'MMM d, yyyy')}
                    </span>
                    <span>{event.fights?.length ?? 0} fights</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-foreground-muted" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Friends activity */}
      {friendIds.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-foreground-secondary" /> Friends&apos; Picks
            </h2>
          </div>
          {feedItems.length > 0 ? (
            <ActivityFeed items={feedItems} />
          ) : (
            <div className="rounded-xl border border-border/60 bg-surface/40 py-8 text-center">
              <p className="text-foreground-secondary text-sm">No picks from friends in the last 7 days.</p>
              <p className="text-foreground-muted text-xs mt-1">Check back after the next event!</p>
            </div>
          )}
        </div>
      )}

      {/* Recent picks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-foreground">Recent Predictions</h2>
          <Link
            href={`/profile/${profile.username}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            Full history <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {predictions.length > 0 ? (
          <PredictionHistory predictions={predictions} />
        ) : (
          <div className="rounded-xl border border-border/60 bg-surface/40 py-10 text-center">
            <SwordsIcon className="h-8 w-8 mx-auto mb-3 text-foreground-secondary" />
            <p className="text-foreground-secondary text-sm font-semibold">No picks yet</p>
            <p className="text-foreground-muted text-xs mt-1 mb-4">Head to the fight card and make your first prediction.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold px-4 py-2 hover:bg-primary/20 transition-colors"
            >
              <Swords className="h-3.5 w-3.5" /> View Fight Card
            </Link>
          </div>
        )}
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
        <span className="text-sm text-foreground font-medium">
          {prof?.display_name ?? prof?.username}
        </span>
        <span className="text-xs text-foreground-secondary">@{prof?.username}</span>
      </div>
      <form action={async () => { 'use server'; await acceptFriendRequest(request.id) }}>
        <Button type="submit" size="sm" className="h-7 text-xs px-3">Accept</Button>
      </form>
    </div>
  )
}
