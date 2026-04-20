import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/auth/is-admin'
import { autoImportUpcomingEvents } from '@/lib/actions/admin'

// Explicitly run in Node.js runtime so outbound fetch has full network access
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/auto-import
 *
 * Same logic as the weekly cron but triggered manually from the admin panel.
 * Authenticated via Supabase session (must be admin) instead of CRON_SECRET.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await autoImportUpcomingEvents()
  return NextResponse.json(result)
}
