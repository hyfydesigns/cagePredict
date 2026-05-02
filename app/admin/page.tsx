import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { AdminPanel } from '@/components/admin/admin-panel'
import { isAdmin } from '@/lib/auth/is-admin'

export const metadata: Metadata = { title: 'Admin Panel' }

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Double-check: middleware already blocks non-admins, but we verify again
  // here so the page is safe even if middleware is bypassed or misconfigured.
  if (!user || !isAdmin(user)) redirect('/')

  // Fetch all fights with event + fighter data for the results panel
  const { data: events } = await supabase
    .from('events')
    .select(`
      id, name, date, status,
      fights(
        id, status, weight_class, is_main_event, winner_id, fight_type, display_order, fight_time,
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

  // Fetch all user profiles for the user management section
  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_emoji, total_points, total_picks, correct_picks, created_at, email_notifications')
    .order('created_at', { ascending: false })

  return (
    <AdminPanel
      events={(events as any) ?? []}
      stats={{ users: userCount ?? 0, fights: fightCount ?? 0, predictions: predCount ?? 0 }}
      adminUserId={user.id}
      users={(usersData as any) ?? []}
    />
  )
}
