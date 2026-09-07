import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { leaveCrew, deleteCrew } from '@/lib/actions/crews'
import { crewInviteUrl } from '@/lib/utils'
import { Users, Crown, LogOut, Trash2 } from 'lucide-react'
import { DeleteCrewButton } from '@/components/crews/delete-crew-button'
import { InviteCopy } from '@/components/crews/invite-copy'
import { InviteUserForm } from '@/components/crews/invite-user-form'
import { CrewEventHistory } from '@/components/crews/crew-event-history'
import { CrewLiveEvent } from '@/components/crews/crew-live-event'
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

  // Completed events for the "All Time" history accordion
  const { data: completedEventsRaw } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('status', 'completed')
    .order('date', { ascending: false })
    .limit(20)

  const completedEvents = (completedEventsRaw ?? []) as { id: string; name: string; date: string }[]

  // "This Event" tab — priority: live → nearest upcoming → most recent completed
  let latestEvent: { id: string; name: string } | null = null

  // 1. Live event takes absolute priority
  const { data: liveEvt } = await supabase
    .from('events')
    .select('id, name')
    .eq('status', 'live')
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (liveEvt) {
    latestEvent = liveEvt as { id: string; name: string }
  } else {
    // 2. Nearest upcoming (ascending so we get the soonest, not the furthest)
    const { data: upcomingEvt } = await supabase
      .from('events')
      .select('id, name')
      .eq('status', 'upcoming')
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (upcomingEvt) {
      latestEvent = upcomingEvt as { id: string; name: string }
    } else {
      // 3. Most recently completed
      const { data: completedEvt } = await supabase
        .from('events')
        .select('id, name')
        .eq('status', 'completed')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      latestEvent = completedEvt as { id: string; name: string } | null
    }
  }

  // Fight-level data for "This Event" tab
  let eventFights: any[] = []
  let eventPicks: any[] = []
  let latestEventStatus = 'upcoming'
  if (latestEvent) {
    const [{ data: fightsRaw }, { data: predsRaw }, { data: evtRaw }] = await Promise.all([
      supabase
        .from('fights')
        .select('id, display_order, is_main_event, status, winner_id, method, round, fighter1:fighters!fights_fighter1_id_fkey(id, name), fighter2:fighters!fights_fighter2_id_fkey(id, name)')
        .eq('event_id', latestEvent.id)
        .order('display_order', { ascending: false }),
      supabase
        .from('predictions')
        .select('user_id, fight_id, predicted_winner_id, is_confidence, is_correct, points_earned')
        .in('user_id', memberUserIds)
        .in('fight_id',
          await supabase.from('fights').select('id').eq('event_id', latestEvent.id)
            .then(r => (r.data ?? []).map((f: any) => f.id))
        ),
      supabase.from('events').select('status').eq('id', latestEvent.id).maybeSingle(),
    ])
    eventFights = fightsRaw ?? []
    eventPicks  = predsRaw  ?? []
    latestEventStatus = (evtRaw as any)?.status ?? 'upcoming'
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-foreground">{crew.name}</h1>
              {isOwner && (
                <Badge variant="warning" className="gap-1">
                  <Crown className="h-2.5 w-2.5" />Owner
                </Badge>
              )}
            </div>
            {crew.description && (
              <p className="text-foreground-muted text-sm mt-1">{crew.description}</p>
            )}
            <p className="text-foreground-muted text-sm mt-2 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {memberCount} / {crew.max_members} members
            </p>
          </div>

          {isOwner ? (
            <DeleteCrewButton crewId={crew.id} />
          ) : (
            <form action={async () => { 'use server'; await leaveCrew(id) }}>
              <Button type="submit" variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                <LogOut className="h-4 w-4 mr-1.5" />
                Leave
              </Button>
            </form>
          )}
        </div>

        {/* Invite link */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-semibold text-foreground-muted mb-2">Invite Link</p>
          <InviteCopy inviteUrl={inviteUrl} inviteCode={crew.invite_code} />
        </div>

        {/* Invite a specific player (owner only) */}
        {isOwner && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-foreground-muted mb-2">Invite a Player</p>
            <InviteUserForm crewId={crew.id} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        <Tabs defaultValue="members">
          <TabsList className="mb-4">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="pastevents">Past Events</TabsTrigger>
            <TabsTrigger value="event">This Event</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <LeaderboardTable entries={leaderboard} currentUserId={user?.id} />
          </TabsContent>
          <TabsContent value="pastevents">
            <CrewEventHistory
              events={completedEvents}
              members={memberProfiles.map((p) => ({
                userId:      p.id,
                username:    p.username,
                displayName: p.display_name,
                avatarEmoji: p.avatar_emoji,
              }))}
              currentUserId={user?.id}
            />
          </TabsContent>
          <TabsContent value="event">
            {latestEvent ? (
              <CrewLiveEvent
                eventId={latestEvent.id}
                eventName={latestEvent.name}
                eventStatus={latestEventStatus}
                initialFights={eventFights}
                initialPicks={eventPicks}
                members={memberProfiles.map((p) => ({
                  userId:      p.id,
                  username:    p.username,
                  displayName: p.display_name,
                  avatarEmoji: p.avatar_emoji,
                }))}
                memberUserIds={memberUserIds}
                currentUserId={user?.id}
              />
            ) : (
              <p className="text-center text-sm text-foreground-muted py-8">No events found.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
