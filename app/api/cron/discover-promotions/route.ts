import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { MMAAPI_HOST, PROMOTION_TOURNAMENTS } from '@/lib/apis/mmaapi'
import { importEventByDateInternal } from '@/lib/actions/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/discover-promotions
 *
 * Probes MMAAPI for new MMA promotions (currently targeting MVP MMA) by
 * scanning candidate Sofascore tournament IDs sequentially.
 *
 * Strategy:
 *  1. First pass  — probe each candidate ID against the nearest Saturday only.
 *                   404/non-OK → invalid ID, skip immediately.
 *                   204        → valid tournament, no event that date; queue for 2nd pass.
 *                   200        → has an event; check if it matches a target promotion.
 *  2. Second pass — check 204 IDs against the next 3 Saturdays.
 *
 * When a match is found the tournament ID is stored in app_config
 * (key: `discovered_promotions`) and upcoming events are imported immediately.
 *
 * Runs weekly Monday 06:00 UTC via Vercel Cron.
 * Protected by CRON_SECRET: Authorization: Bearer <secret>
 */

/** Promotions we're actively looking for, with name-match patterns. */
const TARGET_PROMOTIONS: { name: string; pattern: RegExp }[] = [
  { name: 'MVP MMA', pattern: /mvp\s*mma|most\s+valuable\s+promotions/i },
]

function matchesTarget(eventName: string): string | null {
  for (const { name, pattern } of TARGET_PROMOTIONS) {
    if (pattern.test(eventName)) return name
  }
  return null
}

/** IDs already known to the system — never re-probe these. */
const KNOWN_IDS = new Set(PROMOTION_TOURNAMENTS.map((p) => p.id))

/**
 * Candidate tournament ID range to probe.
 * Sofascore assigns IDs sequentially across all sports; MMA promotions
 * known so far top out at 20269 (ONE Championship). New promotions added
 * after that will have higher IDs. We probe 20270–20500 and expand the
 * ceiling when needed.
 */
const PROBE_START = 20270
const PROBE_END   = 20500

export async function GET(req: Request) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []
  const supabase = createServiceClient()
  const rapidKey  = process.env.RAPIDAPI_KEY
  const rapidHost = process.env.RAPIDAPI_UFC_HOST ?? MMAAPI_HOST

  if (!rapidKey) {
    return NextResponse.json({ message: 'RAPIDAPI_KEY not set — skipping', log })
  }

  // ── 1. Load already-discovered promotions from app_config ─────────────────
  const { data: configRow } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'discovered_promotions')
    .single()

  const alreadyDiscovered: { id: number; name: string }[] = configRow?.value ?? []
  const discoveredIds = new Set(alreadyDiscovered.map((p) => p.id))

  // Check if all targets are already known
  const stillNeeded = TARGET_PROMOTIONS.filter(
    (t) => !alreadyDiscovered.some((d) => d.name === t.name)
  )

  if (stillNeeded.length === 0) {
    log.push(`All target promotions already discovered: ${alreadyDiscovered.map((p) => `${p.name} (${p.id})`).join(', ')}`)
    return NextResponse.json({ message: 'Nothing to discover', log })
  }

  log.push(`Looking for: ${stillNeeded.map((t) => t.name).join(', ')}`)

  // ── 2. Build probe dates — next 4 Saturdays ───────────────────────────────
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  const saturdays: { day: number; month: number; year: number; dateStr: string }[] = []
  for (let offset = 1; offset <= 28; offset++) {
    const d = new Date(now)
    d.setUTCDate(now.getUTCDate() + offset)
    if (d.getUTCDay() === 6) {
      saturdays.push({
        day:     d.getUTCDate(),
        month:   d.getUTCMonth() + 1,
        year:    d.getUTCFullYear(),
        dateStr: d.toISOString().slice(0, 10),
      })
    }
  }

  const [firstSat, ...moreSats] = saturdays
  const headers = { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': rapidHost }

  log.push(
    `Probing IDs ${PROBE_START}–${PROBE_END} against ${firstSat.dateStr}` +
    ` (+${moreSats.length} more Saturdays for valid IDs)…`
  )

  // ── 3. First pass — probe each candidate ID against the nearest Saturday ──
  const validIds: number[] = []   // returned 204 — real tournament, no event this Saturday
  const newlyFound: { id: number; name: string; dateStr: string }[] = []

  for (let id = PROBE_START; id <= PROBE_END; id++) {
    if (KNOWN_IDS.has(id) || discoveredIds.has(id)) continue

    try {
      const url =
        `https://${rapidHost}/api/mma/unique-tournament/${id}` +
        `/schedules/${firstSat.day}/${firstSat.month}/${firstSat.year}`
      const res = await fetch(url, { headers, cache: 'no-store' })

      if (res.status === 204) {
        validIds.push(id)   // real tournament ID, no event this Saturday
        continue
      }
      if (!res.ok) continue   // non-existent tournament — skip

      const data = JSON.parse(await res.text())
      const events: any[] = data.events ?? []
      for (const ev of events) {
        const evName: string = ev.name ?? ev.tournament?.name ?? ev.slug ?? ''
        const match = matchesTarget(evName)
        if (match) {
          log.push(`  ID ${id} matched "${match}" (event: "${evName}", date: ${firstSat.dateStr})`)
          newlyFound.push({ id, name: match, dateStr: firstSat.dateStr })
          discoveredIds.add(id)
          break
        }
      }
    } catch { /* network blip — skip this ID */ }
  }

  log.push(`First pass complete — ${validIds.length} valid IDs queued for second pass.`)

  // ── 4. Second pass — check valid IDs against remaining Saturdays ──────────
  if (newlyFound.length < stillNeeded.length && validIds.length > 0 && moreSats.length > 0) {
    outer: for (const sat of moreSats) {
      for (const id of validIds) {
        if (discoveredIds.has(id)) continue
        try {
          const url =
            `https://${rapidHost}/api/mma/unique-tournament/${id}` +
            `/schedules/${sat.day}/${sat.month}/${sat.year}`
          const res = await fetch(url, { headers, cache: 'no-store' })
          if (!res.ok || res.status === 204) continue

          const data = JSON.parse(await res.text())
          const events: any[] = data.events ?? []
          for (const ev of events) {
            const evName: string = ev.name ?? ev.tournament?.name ?? ev.slug ?? ''
            const match = matchesTarget(evName)
            if (match) {
              log.push(`  ID ${id} matched "${match}" (event: "${evName}", date: ${sat.dateStr})`)
              newlyFound.push({ id, name: match, dateStr: sat.dateStr })
              discoveredIds.add(id)
              if (newlyFound.length >= stillNeeded.length) break outer
              break
            }
          }
        } catch { }
      }
    }
  }

  // ── 5. Persist and import any newly found promotions ──────────────────────
  if (newlyFound.length === 0) {
    log.push(`No new promotions found in ID range ${PROBE_START}–${PROBE_END} — will retry next week.`)
    return NextResponse.json({ message: 'Not found yet', log })
  }

  const updatedList = [
    ...alreadyDiscovered,
    ...newlyFound.map(({ id, name }) => ({ id, name })),
  ]

  await supabase.from('app_config').upsert({
    key: 'discovered_promotions',
    value: updatedList,
    updated_at: new Date().toISOString(),
  })

  log.push(`Stored in app_config: ${updatedList.map((p) => `${p.name}=${p.id}`).join(', ')}`)

  // Import upcoming events for each newly found promotion
  for (const { name, dateStr } of newlyFound) {
    const [year, month, day] = dateStr.split('-').map(Number)
    log.push(`Importing ${name} event on ${dateStr}…`)
    try {
      const result = await importEventByDateInternal(day, month, year)
      log.push(`  → ${result.error ?? result.message ?? 'OK'}`)
    } catch (e: any) {
      log.push(`  → import error: ${e.message}`)
    }
  }

  return NextResponse.json({
    message: `Discovered: ${newlyFound.map((p) => p.name).join(', ')}`,
    log,
  })
}
