'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Keeps total_points up to date in real-time without a page reload.
 *
 * Two-layer approach:
 * 1. Primary  — subscribe to `profiles` table changes (works if the publication
 *    broadcasts security-definer writes; some Supabase configs do, some don't).
 * 2. Fallback — subscribe to `predictions` table changes for this user. When
 *    `points_earned` is set (fight scored), do a direct client query to read
 *    the fresh `total_points` from profiles. This is guaranteed to work because:
 *    • predictions realtime is proven to fire (live-wrapper already uses it)
 *    • complete_fight() commits atomically, so profiles is already updated by
 *      the time the predictions realtime event arrives
 *    • a direct Supabase client fetch bypasses all Next.js caching
 */
export function useRealtimePoints(userId: string | null | undefined, initialPoints: number) {
  const [points, setPoints] = useState(initialPoints)

  // Stay in sync with the SSR-fetched value (e.g. after router.refresh() or navigation)
  useEffect(() => {
    setPoints(initialPoints)
  }, [initialPoints])

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()

    // ── Layer 1: profiles table realtime ──────────────────────────────────────
    const profileChannel = supabase
      .channel(`profile-points-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newPoints = (payload.new as { total_points?: number }).total_points
          if (newPoints != null) setPoints(newPoints)
        },
      )
      .subscribe()

    // ── Layer 2: predictions table realtime (reliable fallback) ───────────────
    // complete_fight() writes points_earned to predictions; by the time this
    // event fires the profiles row is also committed with the new total.
    const predChannel = supabase
      .channel(`pred-scored-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'predictions',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const pe = (payload.new as { points_earned?: number }).points_earned
          // Only refetch when a fight was actually scored (points written)
          if (pe == null) return
          const { data } = await supabase
            .from('profiles')
            .select('total_points')
            .eq('id', userId)
            .single()
          if (data?.total_points != null) setPoints(data.total_points)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(predChannel)
    }
  }, [userId])

  return points
}
