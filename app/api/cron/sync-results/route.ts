import { NextResponse } from 'next/server'
import { runSyncResults } from '@/lib/sync-results'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Vercel default is 10 s (Hobby) / 60 s (Pro) — not enough for a full UFC card.
// 300 s gives headroom for multiple API calls + DB operations mid-event.
export const maxDuration = 300

/**
 * GET /api/cron/sync-results
 *
 * For every live event, fetches the RapidAPI MMA schedule for that date,
 * detects finished fights, and automatically calls complete_fight() to
 * score predictions — no admin interaction required.
 *
 * Run every minute while an event is live.
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
