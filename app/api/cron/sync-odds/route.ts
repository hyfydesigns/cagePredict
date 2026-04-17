import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { syncEventOdds } from '@/lib/actions/odds'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/cron/sync-odds
 *  Syncs odds for all active (upcoming/live) events.
 *  Protected by CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()

  // Find all upcoming/live events
  const { data: events, error } = await supabase
    .from('events')
    .select('id, name')
    .in('status', ['upcoming', 'live'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ message: 'No active events' })
  }

  const results: Record<string, unknown> = {}
  for (const event of events) {
    results[event.name] = await syncEventOdds(event.id)
  }

  return NextResponse.json({ results })
}
