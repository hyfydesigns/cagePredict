import type { User } from '@supabase/supabase-js'

/**
 * Single source of truth for the admin check.
 * Uses app_metadata (not user_metadata) because user_metadata is
 * writable by the user themselves via supabase.auth.updateUser().
 * app_metadata can only be set via the service role key or the
 * Supabase dashboard — users cannot modify it.
 *
 * To grant admin: Supabase Dashboard → Authentication → Users →
 * select user → edit raw_app_meta_data → add { "role": "admin" }
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  return user.app_metadata?.role === 'admin'
}
