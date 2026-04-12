'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LeaderboardEntry } from '@/types/database'

export function useRealtimeLeaderboard(initialData: LeaderboardEntry[]) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialData)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('leaderboard-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          setEntries((prev) => {
            const updated = prev.map((e) =>
              e.id === payload.new.id
                ? { ...e, ...(payload.new as LeaderboardEntry) }
                : e
            )
            // Re-sort by total_points desc
            updated.sort((a, b) => b.total_points - a.total_points)
            // Re-assign ranks
            return updated.map((e, i) => ({
              ...e,
              rank: i + 1,
              win_rate: e.total_picks > 0
                ? Math.round((e.correct_picks / e.total_picks) * 100)
                : 0,
            }))
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return entries
}
