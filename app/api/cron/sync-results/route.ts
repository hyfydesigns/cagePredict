import { NextResponse } from 'next/server'
import { runSyncResults } from '@/lib/sync-results'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/sync-results
 *
 * For every live event, fetches the RapidAPI MMA schedule for that date,
 * detects finished fights, and automatically calls complete_fight() to
 * score predictions — no admin interaction required.
 *
 * Run every 2 minutes while an event is live.
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSyncResults()
  return NextResponse.json(result)
}
