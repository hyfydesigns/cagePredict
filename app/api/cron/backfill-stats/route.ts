import { NextResponse } from 'next/server'
import { backfillStatsForCron } from '@/lib/actions/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — ESPN + UFCStats calls per fighter can add up

/**
 * GET /api/cron/backfill-stats
 *
 * Finds any fighters missing stats (striking_accuracy, sig_str_landed,
 * td_avg, sub_avg, ko_tko_wins, last_5_form) and fills them in from
 * UFCStats (primary) then ESPN (fallback). Becomes a no-op once all
 * fighters are backfilled — safe to run indefinitely.
 *
 * Scheduled daily at 06:00 UTC. Also safe to trigger manually from the
 * admin panel at any time.
 *
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await backfillStatsForCron()
  return NextResponse.json({ success: true, ...result, checkedAt: new Date().toISOString() })
}
