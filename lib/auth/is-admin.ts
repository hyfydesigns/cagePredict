import type { User } from '@supabase/supabase-js'

/**
 * Single source of truth for the admin check.
 * An admin user must have `user_metadata.role === 'admin'`
 * set via the Supabase Auth admin API or dashboard.
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  return user.user_metadata?.role === 'admin'
}
