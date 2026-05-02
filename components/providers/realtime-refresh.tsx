'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Invisible global component placed in the root layout.
 * Subscribes to the current user's predictions table — when points_earned
 * is written by complete_fight(), calls router.refresh() so every server
 * component on the current page (dashboard stats, profile header, leaderboard,
 * crew scores, etc.) re-fetches fresh data without a manual page reload.
 *
 * Works on every route, not just the home fight card where live-wrapper runs.
 */
export function RealtimeRefresh({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`global-refresh-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'predictions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Only refresh when a fight has actually been scored
          if ((payload.new as { points_earned?: number }).points_earned != null) {
            router.refresh()
          }
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, router])

  return null
}
