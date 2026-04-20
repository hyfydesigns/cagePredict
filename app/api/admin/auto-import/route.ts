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

  // ── Connectivity + config diagnostics ──────────────────────────────────
  const diag: string[] = []

  // 1. Basic outbound fetch
  try {
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
    const j = await r.json() as { ip: string }
    diag.push(`✓ Outbound fetch works (egress IP: ${j.ip})`)
  } catch (e: any) {
    const cause = (e.cause as any)?.code ?? (e.cause as any)?.message ?? String(e.cause ?? '')
    diag.push(`✗ Outbound fetch failed: ${e.message}${cause ? ` [${cause}]` : ''}`)
  }

  // 2. Verify api-sports key is present
  const apisportsKey = process.env.APISPORTS_KEY
  diag.push(apisportsKey ? `✓ APISPORTS_KEY is set (${apisportsKey.slice(0, 6)}…)` : '✗ APISPORTS_KEY is NOT set')

  // 3. Direct api-sports probe
  if (apisportsKey) {
    try {
      const r = await fetch('https://v1.mma.api-sports.io/status', {
        headers: { 'x-apisports-key': apisportsKey },
        cache: 'no-store',
      })
      const text = await r.text()
      diag.push(`✓ api-sports /status → ${r.status}: ${text.slice(0, 120)}`)
    } catch (e: any) {
      const cause = (e.cause as any)?.code ?? (e.cause as any)?.message ?? String(e.cause ?? '')
      diag.push(`✗ api-sports /status fetch failed: ${e.message}${cause ? ` [${cause}]` : ''}`)
    }
  }

  const result = await autoImportUpcomingEvents()
  return NextResponse.json({ ...result, diag })
}
