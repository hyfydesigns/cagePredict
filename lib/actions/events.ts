'use server'

import { createClient } from '@/lib/supabase/server'
import type { EventWithFights } from '@/types/database'

export async function getActiveEvents(): Promise<EventWithFights[]> {
  const supabase = await createClient()

  const { data } = await supabase
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

  return ((data ?? []) as any[]).map((e: any) => ({
    ...e,
    fights: ((e.fights ?? []) as any[]).sort((a: any, b: any) => b.display_order - a.display_order),
  })) as EventWithFights[]
}
