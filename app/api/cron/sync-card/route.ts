import { NextResponse } from 'next/server'
import { syncAllUpcomingCards } from '@/lib/actions/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/sync-card
 *
 * Daily job that refreshes all upcoming fight cards from RapidAPI:
 * - Updates fight_type / display_order / is_main_event
 * - Detects and applies fighter replacements
 * - Inserts new fights, removes fights that no longer exist
 *
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await syncAllUpcomingCards()
  return NextResponse.json(result)
}
