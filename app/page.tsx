import { ChevronRight, Swords } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LiveWrapper } from '@/components/fight-card/live-wrapper'
import { Badge } from '@/components/ui/badge'
import type { EventWithFights, CommentWithProfile } from '@/types/database'

export const revalidate = 60

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch upcoming/live events with fights + fighters
  const { data: eventsRaw } = await supabase
    .from('events')
    .select(`
      *,
      fights(
        *,
        fighter1:fighters!fights_fighter1_id_fkey(*),
        fighter2:fighters!fights_fighter2_id_fkey(*)
      )
    `)
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })
    .limit(4)

  // Fetch user picks including is_confidence
  let userPicks: Record<string, { winnerId: string; isConfidence: boolean }> = {}
  const events = (eventsRaw ?? []) as any[]

  if (user && events.length > 0) {
    const fightIds = events.flatMap((e: any) => (e.fights ?? []).map((f: any) => f.id as string))
    if (fightIds.length > 0) {
      const { data: preds } = await supabase
        .from('predictions')
        .select('fight_id, predicted_winner_id, is_confidence')
        .eq('user_id', user.id)
        .in('fight_id', fightIds)
      ;(preds ?? []).forEach((p: any) => {
        userPicks[p.fight_id] = { winnerId: p.predicted_winner_id, isConfidence: p.is_confidence ?? false }
      })
    }
  }

  const typedEvents = events.map((e: any) => ({
    ...e,
    fights: ((e.fights ?? []) as any[]).sort((a: any, b: any) => b.display_order - a.display_order),
  })) as EventWithFights[]

  // Fetch comments for all fights
  let commentsByFight: Record<string, CommentWithProfile[]> = {}
  if (typedEvents.length > 0) {
    const allFightIds = typedEvents.flatMap((e) => e.fights.map((f) => f.id))
    if (allFightIds.length > 0) {
      const { data: commentsRaw } = await supabase
        .from('comments')
        .select('*, profile:profiles!comments_user_id_fkey(*)')
        .in('fight_id', allFightIds)
        .order('created_at', { ascending: true })
      ;(commentsRaw ?? []).forEach((c: any) => {
        if (!commentsByFight[c.fight_id]) commentsByFight[c.fight_id] = []
        commentsByFight[c.fight_id].push(c as CommentWithProfile)
      })
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-12 max-w-3xl">
      {/* Hero */}
      <div className="text-center space-y-3 py-6 relative">
        <div className="absolute inset-0 bg-hero-gradient -z-10" />
        <Badge variant="destructive" className="mb-2">
          <Swords className="h-3 w-3 mr-1" /> Free to Play
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight">
          Predict.<br />
          <span className="text-gradient-red">Compete.</span><br />
          Climb the Rankings.
        </h1>
        <p className="text-zinc-400 text-base max-w-md mx-auto">
          Pick the winner of every UFC fight. Earn points for correct predictions. Rise to the top of the global leaderboard.
        </p>
        {!user && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors shadow-[0_0_20px_rgba(239,68,68,0.35)]"
            >
              Start Predicting Free
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Events */}
      {typedEvents.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Swords className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-semibold">No upcoming events</p>
          <p className="text-sm mt-1">Check back soon or visit the admin panel to seed events.</p>
        </div>
      ) : (
        <div className="space-y-12">
          <LiveWrapper initialEvents={typedEvents} userPicks={userPicks} userId={user?.id} commentsByFight={commentsByFight} />
        </div>
      )}
    </div>
  )
}
