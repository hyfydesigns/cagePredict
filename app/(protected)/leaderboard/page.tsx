import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Trophy, Users, Globe } from 'lucide-react'
import type { LeaderboardEntry, ProfileRow } from '@/types/database'

export const metadata: Metadata = { title: 'Leaderboard' }
export const revalidate = 30

function toLeaderboard(rows: ProfileRow[]): LeaderboardEntry[] {
  return rows.map((p, i) => ({
    ...p,
    rank: i + 1,
    win_rate: p.total_picks > 0 ? Math.round((p.correct_picks / p.total_picks) * 100) : 0,
  }))
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Global top 100
  const { data: globalRaw } = await supabase
    .from('profiles')
    .select('*')
    .order('total_points', { ascending: false })
    .limit(100)

  const global = toLeaderboard((globalRaw ?? []) as ProfileRow[])

  // Friends leaderboard
  let friendEntries: LeaderboardEntry[] = []
  if (user) {
    const { data: friendLinks } = await supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const friendIds = ((friendLinks ?? []) as { user_id: string; friend_id: string }[]).map((f) =>
      f.user_id === user.id ? f.friend_id : f.user_id
    )

    if (friendIds.length > 0) {
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', [...friendIds, user.id])
        .order('total_points', { ascending: false })

      friendEntries = toLeaderboard((friendProfiles ?? []) as ProfileRow[])
    }
  }

  const myRank = global.find((e) => e.id === user?.id)?.rank

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-3xl font-black text-white">Leaderboard</h1>
        </div>
        {myRank && (
          <p className="text-zinc-500 text-sm pl-9">
            Your rank: <span className="text-white font-bold">#{myRank}</span>
          </p>
        )}
      </div>

      <Tabs defaultValue="global">
        <TabsList className="w-full">
          <TabsTrigger value="global" className="flex-1 gap-2">
            <Globe className="h-3.5 w-3.5" /> Global
          </TabsTrigger>
          <TabsTrigger value="friends" className="flex-1 gap-2">
            <Users className="h-3.5 w-3.5" /> Friends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global">
          <LeaderboardTable entries={global} currentUserId={user?.id} />
        </TabsContent>

        <TabsContent value="friends">
          {friendEntries.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-zinc-500">No friends yet</p>
              <p className="text-sm mt-1">
                Visit someone&apos;s profile to send a friend request.
              </p>
            </div>
          ) : (
            <LeaderboardTable entries={friendEntries} currentUserId={user?.id} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
