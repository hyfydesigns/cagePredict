import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { AdminPanel } from '@/components/admin/admin-panel'

export const metadata: Metadata = { title: 'Admin Panel' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch all fights with event + fighter data for the results panel
  const { data: events } = await supabase
    .from('events')
    .select(`
      id, name, date, status,
      fights(
        id, status, weight_class, is_main_event, winner_id,
        fighter1:fighters!fights_fighter1_id_fkey(id, name, flag_emoji),
        fighter2:fighters!fights_fighter2_id_fkey(id, name, flag_emoji)
      )
    `)
    .order('date', { ascending: false })
    .limit(10)

  // Basic stats
  const { count: userCount }  = await supabase.from('profiles').select('id', { count: 'exact', head: true })
  const { count: fightCount } = await supabase.from('fights').select('id', { count: 'exact', head: true })
  const { count: predCount }  = await supabase.from('predictions').select('id', { count: 'exact', head: true })

  return (
    <AdminPanel
      events={(events as any) ?? []}
      stats={{ users: userCount ?? 0, fights: fightCount ?? 0, predictions: predCount ?? 0 }}
      adminUserId={user.id}
    />
  )
}
