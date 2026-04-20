import { NextResponse } from 'next/server'
import { autoImportUpcomingEvents } from '@/lib/actions/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Max time this route is allowed to run (Vercel Pro = 300s, Hobby = 60s)
export const maxDuration = 300

/**
 * GET /api/cron/import-events
 *
 * Ensures the app always has at least 2 upcoming events loaded.
 * Scans the next 16 Saturdays and imports any UFC events found.
 *
 * Runs weekly Monday 08:00 UTC via Vercel Cron.
 * Protected by CRON_SECRET: Authorization: Bearer <secret>
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await autoImportUpcomingEvents()
  return NextResponse.json({ success: !result.error, ...result })
}
