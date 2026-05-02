'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to the current user's profile row and keeps total_points
 * up to date in real-time. Used in the Navbar so points refresh the
 * moment a fight is scored — no page reload required.
 */
export function useRealtimePoints(userId: string | null | undefined, initialPoints: number) {
  const [points, setPoints] = useState(initialPoints)

  useEffect(() => {
    // Keep in sync with SSR prop if it changes (e.g. navigation)
    setPoints(initialPoints)
  }, [initialPoints])

  useEffect(() => {
    if (!userId) return

    const supabase = createClient()
    const channel = supabase
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
          if (newPoints != null) {
            setPoints(newPoints)
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return points
}
