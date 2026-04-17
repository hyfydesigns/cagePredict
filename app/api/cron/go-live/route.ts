import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/go-live
 *
 * Automatically manages event status with no admin interaction:
 *   upcoming → live   when now >= earliest fight_time − 30 min
 *   live     → completed   when every fight in the event is 'completed'
 *
 * Run every 15 minutes via Vercel Cron or an external scheduler.
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 */
export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = Date.now()

  let wentLive      = 0
  let wentCompleted = 0
  const log: string[] = []

  // ── 1. upcoming → live ───────────────────────────────────────────────────
  // Flip any upcoming event whose earliest fight starts within the next 30 min
  const { data: upcomingEvents, error: upErr } = await supabase
    .from('events')
    .select('id, name, fights(id, fight_time)')
    .eq('status', 'upcoming')

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  for (const event of upcomingEvents ?? []) {
    const fights: any[] = (event as any).fights ?? []
    if (!fights.length) continue

    const earliestMs = fights.reduce((min: number, f: any) => {
      const t = f.fight_time ? new Date(f.fight_time).getTime() : Infinity
      return Math.min(min, t)
    }, Infinity)

    // Go live 30 min before the first fight
    const goLiveAt = earliestMs - 30 * 60 * 1000
    if (now >= goLiveAt) {
      const { error } = await supabase
        .from('events')
        .update({ status: 'live' })
        .eq('id', event.id)
      if (!error) {
        wentLive++
        log.push(`→ LIVE: ${event.name}`)
      }
    }
  }

  // ── 2. live → completed ──────────────────────────────────────────────────
  // Flip any live event where every fight is already completed
  const { data: liveEvents, error: liveErr } = await supabase
    .from('events')
    .select('id, name, fights(id, status)')
    .eq('status', 'live')

  if (liveErr) return NextResponse.json({ error: liveErr.message }, { status: 500 })

  for (const event of liveEvents ?? []) {
    const fights: any[] = (event as any).fights ?? []
    if (!fights.length) continue

    const allDone = fights.every((f: any) => f.status === 'completed')
    if (allDone) {
      const { error } = await supabase
        .from('events')
        .update({ status: 'completed' })
        .eq('id', event.id)
      if (!error) {
        wentCompleted++
        log.push(`→ COMPLETED: ${event.name}`)
      }
    }
  }

  if (wentLive > 0 || wentCompleted > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/admin')
  }

  return NextResponse.json({
    success: true,
    wentLive,
    wentCompleted,
    log,
    checkedAt: new Date().toISOString(),
  })
}
