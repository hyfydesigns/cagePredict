'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SEED_EVENTS, SEED_FIGHTERS } from '@/seeds/seed-data'
import { sendCardLiveEmails } from '@/lib/actions/emails'
import { isAdmin } from '@/lib/auth/is-admin'
import { runSyncResults } from '@/lib/sync-results'
import { getUpcomingUFCEvents, parseTapologyDate, type TapologyEvent } from '@/lib/apis/tapology'
import { getUFCStatsData, calcWinBreakdown } from '@/lib/apis/ufc-stats'
import {
  isConfigured as isApiSportsConfigured,
  getFightsByDate,
  getUpcomingUFCFights,
  getFighterById,
  apiSportsIdToUuid,
  normaliseFighter,
  normaliseFight,
  type NormalisedFighter,
} from '@/lib/apis/api-sports'

type ActionResult = { error?: string; success?: boolean; message?: string }

// ─── Admin auth guard ────────────────────────────────────────────────────────

/**
 * Call at the top of every admin server action.
 * Returns the authed user or throws/returns an error result.
 */
async function requireAdmin(): Promise<{ user: import('@supabase/supabase-js').User } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdmin(user)) return { error: 'Unauthorized' }
  return { user }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a RapidAPI integer ID to a deterministic UUID (legacy — kept for backward compat) */
function apiIdToUuid(id: number, type: 'fighter' | 'event' | 'fight'): string {
  const prefix = type === 'fighter' ? '1' : type === 'event' ? '2' : '3'
  const padded = String(id).padStart(12, '0')
  return `00000000-0000-000${prefix}-0000-${padded}`
}

function mapWeightClass(wc: string): string {
  const map: Record<string, string> = {
    straw:      'Strawweight',
    fly:        'Flyweight',
    bantam:     'Bantamweight',
    feather:    'Featherweight',
    light:      'Lightweight',
    welter:     'Welterweight',
    middle:     'Middleweight',
    lightheavy: 'Light Heavyweight',
    heavy:      'Heavyweight',
    superheavy: 'Super Heavyweight',
  }
  return map[wc] ?? wc
}

function mapStatus(type: string): string {
  if (type === 'finished')    return 'completed'
  if (type === 'inprogress')  return 'live'
  return 'upcoming'
}

function mapMethod(winType: string): string {
  const map: Record<string, string> = {
    UD:  'Decision (Unanimous)',
    SD:  'Decision (Split)',
    MD:  'Decision (Majority)',
    TKO: 'TKO',
    KO:  'KO',
    SUB: 'Submission',
    DQ:  'Disqualification',
    NC:  'No Contest',
    RTD: 'RTD',
  }
  return map[winType] ?? winType
}

type FighterStats = {
  name: string; wins: number; losses: number; draws: number;
  nationality: string | null; height_cm: number | null; reach_cm: number | null;
  age: number | null; fighting_style: string | null;
}


function fighterSummary(f: FighterStats): string {
  const parts = [
    `Name: ${f.name}`,
    `Record: ${f.wins}-${f.losses}-${f.draws}`,
    f.fighting_style ? `Style: ${f.fighting_style}` : null,
    f.nationality    ? `Nationality: ${f.nationality}` : null,
    f.height_cm      ? `Height: ${f.height_cm}cm` : null,
    f.reach_cm       ? `Reach: ${f.reach_cm}cm` : null,
    f.age            ? `Age: ${f.age}` : null,
  ].filter(Boolean)
  return parts.join(', ')
}

async function generateAIAnalysis(
  f1: FighterStats,
  f2: FighterStats,
  weightClass: string,
): Promise<{ analysis_f1: string | null; analysis_f2: string | null; debugError?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { analysis_f1: null, analysis_f2: null, debugError: 'No API key' }

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `You are an MMA analyst. Write a 2-3 sentence pre-fight analysis for each fighter in this ${weightClass} matchup. Focus on their fighting style, key strengths, and what they need to do to win. Be specific and insightful. Do NOT mention odds or predictions.

Fighter 1: ${fighterSummary(f1)}
Fighter 2: ${fighterSummary(f2)}

Reply with ONLY a JSON object, no markdown, no explanation:
{"f1":"analysis for ${f1.name}","f2":"analysis for ${f2.name}"}`,
      }],
    })

    const raw = (msg.content[0] as any).text?.trim() ?? ''
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    // Extract JSON object if there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { analysis_f1: null, analysis_f2: null, debugError: `No JSON found in: ${raw.slice(0, 100)}` }

    const parsed = JSON.parse(jsonMatch[0])
    if (parsed.f1 && parsed.f2) {
      return { analysis_f1: String(parsed.f1), analysis_f2: String(parsed.f2) }
    }
    return { analysis_f1: null, analysis_f2: null, debugError: `Missing f1/f2 keys in: ${cleaned.slice(0, 100)}` }
  } catch (e: any) {
    return { analysis_f1: null, analysis_f2: null, debugError: String(e?.message ?? e) }
  }
}

function fighterFallbackAnalysis(f: FighterStats): string {
  const record = `${f.wins}-${f.losses}${f.draws ? `-${f.draws}` : ''}`
  const parts: string[] = [`${f.name} (${record})`]
  if (f.fighting_style) parts.push(`a ${f.fighting_style} specialist`)
  if (f.nationality)    parts.push(`from ${f.nationality}`)
  const physical = [
    f.height_cm ? `${f.height_cm}cm` : null,
    f.reach_cm  ? `${f.reach_cm}cm reach` : null,
    f.age       ? `age ${f.age}` : null,
  ].filter(Boolean)
  if (physical.length) parts.push(physical.join(', '))
  return parts.join(' — ') + '.'
}

function countryToFlag(alpha2: string): string | null {
  if (!alpha2 || alpha2.length !== 2) return null
  const pts = [...alpha2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...pts)
}

// fetchStatsFromWikipedia and fetchStatsFromUFCStats replaced by
// lib/apis/ufc-stats.ts (getUFCStatsData) — verified against live HTML April 2026

// ─── Force event status ───────────────────────────────────────────────────────

export async function forceSetEventStatus(
  eventId: string,
  status: 'upcoming' | 'live' | 'completed',
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')
  return { success: true, message: `Event status set to "${status}"` }
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export async function clearAllData(): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()

  // Order matters: predictions → fights → events → fighters
  await supabase.from('predictions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('fights').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('fighters').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Reset all user stats
  await supabase.from('profiles').update({
    total_points: 0,
    total_picks: 0,
    correct_picks: 0,
    current_streak: 0,
    longest_streak: 0,
  }).neq('id', '00000000-0000-0000-0000-000000000000')

  revalidatePath('/', 'layout')
  revalidatePath('/admin')

  return { success: true, message: 'All events, fights, fighters, and predictions cleared.' }
}

// ─── RapidAPI fight-meta cross-reference ────────────────────────────────────

/**
 * Full reconciliation of DB fights for an event against the authoritative RapidAPI data:
 *  1. Updates fight_type, display_order, is_main_event for every matched fight.
 *  2. Deletes DB fights whose fighter pair doesn't appear in RapidAPI at all
 *     (wrong fights that snuck in from a different event or a bad import).
 *     Deletion only proceeds when ≥3 name-pair matches are found (confidence check).
 *  3. Inserts fights present in RapidAPI but absent from the DB (looks up fighters by name).
 *
 * No-op when RAPIDAPI_KEY is absent. Never throws — errors are logged and swallowed.
 */
async function syncFightMetaFromRapidApi(
  eventId: string,
  day: number,
  month: number,
  year: number,
): Promise<void> {
  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) return

  try {
    const url = `https://${host}/api/mma/unique-tournament/19906/schedules/${day}/${month}/${year}`
    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
      cache: 'no-store',
    })
    if (!res.ok) return
    const data = await res.json()
    const allApiEvents: any[] = data.events ?? []
    if (allApiEvents.length === 0) return

    const supabase = createServiceClient()

    // Find the RapidAPI tournament that best matches our DB event (by name)
    const { data: dbEvent } = await supabase
      .from('events').select('name').eq('id', eventId).single()
    if (!dbEvent) return

    const norm     = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '')
    const dbNorm   = norm(dbEvent.name)

    const tourneyMap = new Map<number, { name: string; fights: any[] }>()
    for (const f of allApiEvents) {
      const tId = f.tournament?.id
      if (!tId) continue
      if (!tourneyMap.has(tId)) tourneyMap.set(tId, { name: f.tournament?.name ?? '', fights: [] })
      tourneyMap.get(tId)!.fights.push(f)
    }

    // Score each tournament against the DB event name
    let bestEntry: { name: string; fights: any[] } | null = null
    let bestScore = -1
    for (const [, entry] of tourneyMap) {
      const tn = norm(entry.name)
      const score = tn === dbNorm ? 1000 :
        (dbNorm.startsWith(tn.slice(0, 8)) || tn.startsWith(dbNorm.slice(0, 8))) ? 10 :
        entry.fights.length  // fallback: most fights
      if (score > bestScore) { bestScore = score; bestEntry = entry }
    }
    if (!bestEntry) return

    const apiFights: any[] = bestEntry.fights

    // Fetch DB fights with fighter names
    const { data: dbFights } = await supabase
      .from('fights')
      .select('id, fighter1:fighters!fights_fighter1_id_fkey(id, name), fighter2:fighters!fights_fighter2_id_fkey(id, name)')
      .eq('event_id', eventId)

    if (!dbFights) return

    // Build lookup: sorted name pair → db fight id
    // If a pair already exists in the map it's a duplicate — collect extras for deletion.
    const dbLookup = new Map<string, string>()
    const inDbDuplicates: string[] = []
    for (const f of dbFights) {
      const n1 = norm((f.fighter1 as any)?.name ?? '')
      const n2 = norm((f.fighter2 as any)?.name ?? '')
      if (!n1 || !n2) continue
      const key = [n1, n2].sort().join(':')
      if (dbLookup.has(key)) {
        inDbDuplicates.push(f.id)  // extra copy — safe to delete
      } else {
        dbLookup.set(key, f.id)
      }
    }

    // Delete in-DB duplicates immediately (these are always safe to remove)
    if (inDbDuplicates.length > 0) {
      await supabase.from('predictions').delete().in('fight_id', inDbDuplicates)
      await supabase.from('fights').delete().in('id', inDbDuplicates)
    }

    // Build set of valid fighter pairs from RapidAPI
    const apiPairs = new Set<string>()
    for (const f of apiFights) {
      const n1 = norm(f.homeTeam?.name ?? '')
      const n2 = norm(f.awayTeam?.name ?? '')
      if (n1 && n2) apiPairs.add([n1, n2].sort().join(':'))
    }

    // ── 1. Delete DB fights that don't match any RapidAPI fight ──────────────
    const matchedCount = [...dbLookup.keys()].filter((p) => apiPairs.has(p)).length
    if (matchedCount >= 3) {
      // Enough matches to be confident we have the right event — prune wrong rows
      const toDelete: string[] = []
      for (const [pair, dbId] of dbLookup) {
        if (!apiPairs.has(pair)) toDelete.push(dbId)
      }
      if (toDelete.length > 0) {
        await supabase.from('predictions').delete().in('fight_id', toDelete)
        await supabase.from('fights').delete().in('id', toDelete)
        for (const [pair, dbId] of [...dbLookup]) {
          if (toDelete.includes(dbId)) dbLookup.delete(pair)
        }
      }
    }

    // ── 2. Update metadata on matched fights ─────────────────────────────────
    const maincardFights = apiFights.filter((f: any) => f.fightType === 'maincard')
    const maxOrder = maincardFights.length > 0
      ? Math.max(...maincardFights.map((f: any) => (typeof f.order === 'number' ? f.order : 0)))
      : -1

    for (const apiFight of apiFights) {
      const n1 = norm(apiFight.homeTeam?.name ?? '')
      const n2 = norm(apiFight.awayTeam?.name ?? '')
      if (!n1 || !n2) continue
      const dbId = dbLookup.get([n1, n2].sort().join(':'))
      if (!dbId) continue

      const updates: Record<string, unknown> = {}
      if (typeof apiFight.fightType === 'string' && apiFight.fightType) {
        updates.fight_type = apiFight.fightType
      }
      if (typeof apiFight.order === 'number') {
        updates.display_order = apiFight.order
        if (apiFight.fightType === 'maincard') {
          updates.is_main_event = apiFight.order === maxOrder
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('fights').update(updates).eq('id', dbId)
      }
    }

    // ── 3. Handle RapidAPI fights with no exact pair match in DB ─────────────
    // This covers two scenarios:
    //   a) Fighter replacement — one corner was swapped (e.g. Filho vs Rocha → Filho vs Durden).
    //      Detect by checking if either fighter appears in an existing DB fight, then update
    //      that fight's fighter column to the new opponent.
    //   b) Genuinely new fight — neither fighter appears in any DB fight; insert fresh row.

    // Build single-fighter index for replacement detection: norm name → { fightId, f1n, f2n }
    const dbFighterIndex = new Map<string, { fightId: string; f1n: string; f2n: string }>()
    for (const f of dbFights) {
      if (inDbDuplicates.includes(f.id)) continue
      const n1 = norm((f.fighter1 as any)?.name ?? '')
      const n2 = norm((f.fighter2 as any)?.name ?? '')
      if (!n1 || !n2) continue
      const fightId = dbLookup.get([n1, n2].sort().join(':')) ?? f.id
      dbFighterIndex.set(n1, { fightId, f1n: n1, f2n: n2 })
      dbFighterIndex.set(n2, { fightId, f1n: n1, f2n: n2 })
    }

    for (const apiFight of apiFights) {
      const n1 = norm(apiFight.homeTeam?.name ?? '')
      const n2 = norm(apiFight.awayTeam?.name ?? '')
      if (!n1 || !n2) continue
      if (dbLookup.has([n1, n2].sort().join(':'))) continue  // exact match — already handled

      // ── a) Fighter replacement ─────────────────────────────────────────────
      const match1 = dbFighterIndex.get(n1)  // homeTeam fighter is in an existing DB fight
      const match2 = dbFighterIndex.get(n2)  // awayTeam fighter is in an existing DB fight
      const existing = match1 ?? match2

      if (existing) {
        // The fighter that stayed is the one that matched; the new fighter is the other
        const newFighterName = match1 ? apiFight.awayTeam?.name : apiFight.homeTeam?.name
        const newFighterApiId = match1 ? apiFight.awayTeam?.id  : apiFight.homeTeam?.id
        const stayedNorm = match1 ? n1 : n2

        // Determine which DB column the new fighter occupies
        const newFighterIsF1 = existing.f1n !== stayedNorm  // if stayed fighter was f1, new one is f2

        // Find or create the replacement fighter
        let newFighterId: string | null = null
        const { data: existingFighter } = await supabase
          .from('fighters').select('id').ilike('name', `${newFighterName}%`).maybeSingle()

        if (existingFighter?.id) {
          newFighterId = existingFighter.id
        } else if (newFighterApiId) {
          // Insert a minimal fighter record — full stats will be populated on next import
          newFighterId = apiIdToUuid(newFighterApiId, 'fighter')
          await supabase.from('fighters').upsert({
            id: newFighterId, name: newFighterName,
            wins: 0, losses: 0, draws: 0, record: '0-0-0',
          } as any, { onConflict: 'id', ignoreDuplicates: true })
        }

        if (newFighterId) {
          const col = newFighterIsF1 ? 'fighter1_id' : 'fighter2_id'
          await supabase.from('fights').update({ [col]: newFighterId }).eq('id', existing.fightId)
        }
        continue
      }

      // ── b) Genuinely new fight — insert ────────────────────────────────────
      const [{ data: f1rows }, { data: f2rows }] = await Promise.all([
        supabase.from('fighters').select('id').ilike('name', `${apiFight.homeTeam?.name}%`).limit(1),
        supabase.from('fighters').select('id').ilike('name', `${apiFight.awayTeam?.name}%`).limit(1),
      ])

      // Create minimal records for any fighter not yet in DB
      const f1id = f1rows?.[0]?.id ?? (apiFight.homeTeam?.id ? apiIdToUuid(apiFight.homeTeam.id, 'fighter') : null)
      const f2id = f2rows?.[0]?.id ?? (apiFight.awayTeam?.id ? apiIdToUuid(apiFight.awayTeam.id, 'fighter') : null)
      if (!f1id || !f2id) continue

      if (!f1rows?.[0] && apiFight.homeTeam?.name) {
        await supabase.from('fighters').upsert({
          id: f1id, name: apiFight.homeTeam.name,
          wins: 0, losses: 0, draws: 0, record: '0-0-0',
        } as any, { onConflict: 'id', ignoreDuplicates: true })
      }
      if (!f2rows?.[0] && apiFight.awayTeam?.name) {
        await supabase.from('fighters').upsert({
          id: f2id, name: apiFight.awayTeam.name,
          wins: 0, losses: 0, draws: 0, record: '0-0-0',
        } as any, { onConflict: 'id', ignoreDuplicates: true })
      }

      const isMain = apiFight.fightType === 'maincard' && apiFight.order === maxOrder
      await supabase.from('fights').insert({
        id:            apiIdToUuid(apiFight.id, 'fight'),
        event_id:      eventId,
        fighter1_id:   f1id,
        fighter2_id:   f2id,
        fight_type:    apiFight.fightType ?? null,
        display_order: typeof apiFight.order === 'number' ? apiFight.order : 0,
        is_main_event: isMain,
        is_title_fight: false,
        status:        'upcoming',
        weight_class:  null,
        fight_time:    new Date((apiFight.startTimestamp as number ?? Date.now() / 1000) * 1000).toISOString(),
        winner_id:     null,
        method:        null,
        round:         null,
        time_of_finish: null,
        odds_f1:       0,
        odds_f2:       0,
      } as any)
    }
  } catch (e) {
    console.error('[syncFightMetaFromRapidApi] error:', e)
  }
}

// ─── Fetch real event (api-sports.io preferred, RapidAPI fallback) ───────────

export async function fetchEventByDate(
  day: number,
  month: number,
  year: number,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  return isApiSportsConfigured()
    ? fetchEventByDateApiSports(day, month, year)
    : fetchEventByDateRapidApi(day, month, year)
}

/**
 * Internal version of fetchEventByDate for cron use — bypasses admin auth.
 * Auth is handled at the cron route level via CRON_SECRET.
 *
 * Tries api-sports first (if configured). If the free plan blocks the date
 * ("Free plans do not have access to this date"), falls back to RapidAPI.
 */
export async function importEventByDateInternal(
  day: number,
  month: number,
  year: number,
): Promise<ActionResult> {
  if (isApiSportsConfigured()) {
    const result = await fetchEventByDateApiSports(day, month, year)
    // Free plan restriction → try RapidAPI instead
    if (result.error?.toLowerCase().includes('plan')) {
      return fetchEventByDateRapidApi(day, month, year)
    }
    return result
  }
  return fetchEventByDateRapidApi(day, month, year)
}

/**
 * Scans the next 16 Saturdays and imports any UFC events found until the DB
 * has at least 2 upcoming events. Used by both the weekly cron and the admin panel.
 */
export async function autoImportUpcomingEvents(): Promise<{
  message: string
  log: string[]
  error?: string
}> {
  const supabase = createServiceClient()
  const log: string[] = []

  // ── 1. How many upcoming events do we already have? ──────────────────────
  const { data: upcomingEvents, error: upErr } = await supabase
    .from('events')
    .select('id, name, date')
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })

  if (upErr) return { message: 'DB error', log, error: upErr.message }

  const currentCount = upcomingEvents?.length ?? 0
  const TARGET = 2

  if (currentCount >= TARGET) {
    return {
      message: `Already have ${currentCount} upcoming event(s) — nothing to import.`,
      log,
    }
  }

  log.push(`Found ${currentCount} upcoming event(s) — need ${TARGET - currentCount} more.`)

  // ── 2. Build covered date window (±3 days around each existing event) ────
  const coveredDates = new Set<string>()
  for (const ev of upcomingEvents ?? []) {
    const d = new Date(ev.date)
    for (let offset = -3; offset <= 3; offset++) {
      const c = new Date(d)
      c.setUTCDate(d.getUTCDate() + offset)
      coveredDates.add(c.toISOString().slice(0, 10))
    }
  }

  // ── 3. Discover upcoming UFC event dates in ONE API call ─────────────────
  // Instead of blindly scanning 16 Saturdays (15+ fetch calls), fetch all
  // not-started UFC fights at once and extract their unique event dates.
  let candidateDates: string[] = []

  if (isApiSportsConfigured()) {
    log.push('Fetching upcoming UFC schedule from api-sports…')
    try {
      const upcomingFights = await getUpcomingUFCFights()
      const dateSet = new Set<string>()
      for (const fight of upcomingFights) {
        // New api-sports format: date is on fight.date; legacy: fight.event.date
        const d = (fight.date ?? fight.event?.date)?.slice(0, 10)  // "YYYY-MM-DD"
        if (d && !coveredDates.has(d)) dateSet.add(d)
      }
      candidateDates = [...dateSet].sort()
      log.push(`  Found ${candidateDates.length} uncovered event date(s): ${candidateDates.join(', ') || 'none'}`)
    } catch (e: any) {
      log.push(`  Discovery call failed: ${e.message} — falling back to Saturday scan`)
    }
  }

  // ── 4. Fallback: scan next 16 Saturdays if discovery failed / no api-sports ──
  if (candidateDates.length === 0) {
    log.push('Falling back to Saturday scan…')
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const firstSat = new Date(today)
    const dow = firstSat.getUTCDay()
    firstSat.setUTCDate(firstSat.getUTCDate() + (dow === 6 ? 7 : (6 - dow + 7) % 7 || 7))
    for (let week = 0; week < 16; week++) {
      const sat = new Date(firstSat)
      sat.setUTCDate(firstSat.getUTCDate() + week * 7)
      const dateStr = sat.toISOString().slice(0, 10)
      if (!coveredDates.has(dateStr)) candidateDates.push(dateStr)
    }
  }

  // ── 5. Import each candidate date until we hit the target ────────────────
  let imported = 0
  const needed = TARGET - currentCount

  for (const dateStr of candidateDates) {
    if (imported >= needed) break
    const [year, month, day] = dateStr.split('-').map(Number)
    log.push(`Importing ${dateStr}…`)
    try {
      const result = await importEventByDateInternal(day, month, year)
      if (result.error) {
        const quiet = result.error.toLowerCase().includes('no ')
        log.push(`  ${quiet ? '—' : '✗'} ${dateStr}: ${quiet ? 'no UFC event' : result.error}`)
      } else {
        log.push(`  ✓ ${dateStr}: ${result.message}`)
        imported++
      }
    } catch (e: any) {
      log.push(`  ✗ ${dateStr}: ${e.message}`)
    }
  }

  const message = imported > 0
    ? `Imported ${imported} new event(s).`
    : 'No new events found to import.'

  return { message, log }
}

// ─── api-sports.io import ─────────────────────────────────────────────────────

async function fetchEventByDateApiSports(
  day: number,
  month: number,
  year: number,
  opts: { skipAI?: boolean; skipUFCStats?: boolean; forceEventUuid?: string } = {},
): Promise<ActionResult> {
  try {
  const supabase = createServiceClient()

  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  let apiFights: Awaited<ReturnType<typeof getFightsByDate>>

  try {
    apiFights = await getFightsByDate(dateStr, true)
  } catch (e: any) {
    return { error: `api-sports.io fetch failed: ${e.message}` }
  }

  if (apiFights.length === 0) return { error: `No UFC fights found for ${dateStr}` }

  // Group by event — use event.id when available, fall back to slug (new API format)
  const eventMap = new Map<string, typeof apiFights>()
  for (const fight of apiFights) {
    const key = fight.event?.id != null ? String(fight.event.id) : (fight.slug ?? null)
    if (!key) continue
    if (!eventMap.has(key)) eventMap.set(key, [])
    eventMap.get(key)!.push(fight)
  }

  let insertedFighters = 0
  let insertedEvents   = 0
  let insertedFights   = 0
  let firstAiError: string | undefined
  const newEventIds: string[] = []

  for (const [, fights] of eventMap) {
    // 1. Collect unique fighters and enrich with full detail + UFCStats combat stats
    const fighterMap = new Map<number, NormalisedFighter & {
      age: number | null; fighting_style: string | null; last_5_form: string | null
    }>()

    // Filter out null/TBA fighter slots before collecting IDs
    const allFighterSlots = fights
      .flatMap((f) => [f.fighters.first, f.fighters.second])
      .filter((f): f is NonNullable<typeof f> => f != null)
    const uniqueFighterIds = [...new Set(allFighterSlots.map((f) => f.id).filter((id): id is number => id != null))]

    // Fetch full fighter detail in batches of 5 to respect rate limits
    for (let i = 0; i < uniqueFighterIds.length; i += 5) {
      const batch = uniqueFighterIds.slice(i, i + 5)
      await Promise.all(batch.map(async (fId) => {
        const basic = allFighterSlots.find((f) => f.id === fId)
        if (!basic) return  // skip if fighter data is missing
        const detail = opts.skipUFCStats ? null : await getFighterById(fId).catch(() => null)
        // detail is ApiSportsFighterDetail (full); basic is ApiFightFighter (minimal from fight slot)
        const base = normaliseFighter(detail ?? basic)

        // If a fighter with this name was previously imported from a different API source
        // (e.g. RapidAPI), reuse their existing UUID so we update the same row rather
        // than creating a parallel entry that breaks the fight dedup check.
        const { data: existingFighter } = await supabase
          .from('fighters').select('id').ilike('name', base.name).maybeSingle()
        const resolvedUuid = existingFighter?.id ?? base.uuid

        // Age from birth_date (only present on the full detail object)
        let age: number | null = null
        const bd = detail?.birth_date
        if (bd) age = Math.floor((Date.now() - new Date(bd).getTime()) / (365.25 * 24 * 60 * 60 * 1000))

        let fighting_style: string | null = null
        let ufcStatsHeight = base.height_cm
        let ufcStatsReach  = base.reach_cm
        let last_5_form: string | null = null
        let winBreakdown = { ko_tko_wins: null as number|null, sub_wins: null as number|null, dec_wins: null as number|null }

        if (!opts.skipUFCStats) {
          // UFCStats for physical + combat stats (striking accuracy, stance, etc.)
          const ufcStats = await getUFCStatsData(base.name)
          if (!ufcStatsHeight) ufcStatsHeight = ufcStats.height_cm
          if (!ufcStatsReach)  ufcStatsReach  = ufcStats.reach_cm
          if (!age)            age             = ufcStats.age
          if (!fighting_style) fighting_style  = ufcStats.fighting_style

          last_5_form = ufcStats.fights.length > 0
            ? ufcStats.fights.slice(0, 5).map((f) =>
                f.result === 'W' ? 'W' : f.result === 'L' ? 'L' : f.result === 'D' ? 'D' : 'N'
              ).join('')
            : null

          winBreakdown = calcWinBreakdown(ufcStats.fights)

          fighterMap.set(fId, {
            ...base, uuid: resolvedUuid,
            height_cm: ufcStatsHeight,
            reach_cm:  ufcStatsReach,
            striking_accuracy: base.striking_accuracy ?? ufcStats.str_acc,
            sig_str_landed:    base.sig_str_landed    ?? ufcStats.slpm,
            td_avg:            base.td_avg            ?? ufcStats.td_avg,
            sub_avg:           base.sub_avg           ?? ufcStats.sub_avg,
            age, fighting_style, last_5_form, ...winBreakdown,
          })
        } else {
          fighterMap.set(fId, {
            ...base, uuid: resolvedUuid,
            height_cm: ufcStatsHeight,
            reach_cm:  ufcStatsReach,
            age, fighting_style, last_5_form, ...winBreakdown,
          })
        }
      }))
    }

    // 2. Upsert fighters
    for (const [, fighter] of fighterMap) {
      // Determine weight class from the first fight featuring this fighter
      // New api-sports format uses `category`; legacy format uses `weight_class.name`
      const fightCtx = fights.find((f) =>
        f.fighters.first?.id === fighter.id || f.fighters.second?.id === fighter.id
      )
      const weightClass = fightCtx?.category ?? fightCtx?.weight_class?.name ?? null

      const row = {
        id:               fighter.uuid,
        name:             fighter.name,
        nickname:         fighter.nickname,
        nationality:      fighter.nationality,
        flag_emoji:       fighter.flag_emoji,
        image_url:        fighter.image_url,
        record:           fighter.record,
        wins:             fighter.wins,
        losses:           fighter.losses,
        draws:            fighter.draws,
        weight_class:     weightClass,
        height_cm:        fighter.height_cm,
        reach_cm:         fighter.reach_cm,
        age:              fighter.age,
        fighting_style:   fighter.fighting_style,
        last_5_form:      fighter.last_5_form,
        striking_accuracy: fighter.striking_accuracy,
        sig_str_landed:    fighter.sig_str_landed,
        td_avg:            fighter.td_avg,
        sub_avg:           fighter.sub_avg,
        ko_tko_wins:      (fighter as any).ko_tko_wins ?? null,
        sub_wins:         (fighter as any).sub_wins    ?? null,
        dec_wins:         (fighter as any).dec_wins    ?? null,
        analysis:          null,
      }

      const { error } = await supabase.from('fighters').upsert(row as any, { onConflict: 'id', ignoreDuplicates: false })
      if (error) console.error(`Fighter upsert failed (${fighter.name}):`, error.message)
      else insertedFighters++
    }

    // 3. Upsert event — never downgrade status (e.g. don't overwrite 'live' → 'upcoming')
    const { event: normEvent } = normaliseFight(fights[0], apiFights, opts.forceEventUuid)
    const earliestDate = fights.reduce((min, f) => f.date < min ? f.date : min, fights[0].date)

    // Fetch existing event status so we don't clobber a manually-set 'live'/'completed'
    const { data: existingEvent } = await supabase
      .from('events').select('status').eq('id', normEvent.uuid).maybeSingle()
    const statusPriority: Record<string, number> = { upcoming: 0, live: 1, completed: 2 }
    const existingPriority = statusPriority[existingEvent?.status ?? 'upcoming'] ?? 0
    const newPriority      = statusPriority[normEvent.status] ?? 0
    const resolvedStatus   = newPriority >= existingPriority ? normEvent.status : (existingEvent?.status ?? normEvent.status)

    const eventRow = {
      id:        normEvent.uuid,
      name:      normEvent.name,
      date:      earliestDate,
      location:  normEvent.location,
      venue:     normEvent.venue,
      image_url: null,
      status:    resolvedStatus,
    }

    const { error: evErr } = await supabase.from('events').upsert(eventRow as any, { onConflict: 'id', ignoreDuplicates: false })
    if (evErr) { console.error('Event upsert failed:', evErr.message); continue }
    insertedEvents++
    newEventIds.push(normEvent.uuid)

    // 4. Upsert fights (skip TBA bouts where either fighter slot is missing)
    for (let fightIdx = 0; fightIdx < fights.length; fightIdx++) {
      const fight = fights[fightIdx]
      if (!fight.fighters.first?.id || !fight.fighters.second?.id) continue

      // Resolve fighter data BEFORE calling normaliseFight so we can override UUIDs.
      // normaliseFight() generates api-sports UUIDs from the raw fight data — it has no
      // knowledge of fighters already in the DB from other API sources. We use the UUIDs
      // stored in fighterMap (which were resolved via name-lookup earlier) instead.
      const f1data = fight.fighters.first?.id  != null ? fighterMap.get(fight.fighters.first.id)  : undefined
      const f2data = fight.fighters.second?.id != null ? fighterMap.get(fight.fighters.second.id) : undefined

      const { fight: normFight } = normaliseFight(fight, apiFights, opts.forceEventUuid)

      // Use resolved fighter UUIDs (may differ from normFight's api-sports UUIDs when a
      // fighter was previously imported from RapidAPI and already exists in the DB).
      const f1uuid = f1data?.uuid ?? normFight.fighter1_uuid
      const f2uuid = f2data?.uuid ?? normFight.fighter2_uuid

      const aiInput1 = f1data ? {
        name: f1data.name, wins: f1data.wins, losses: f1data.losses, draws: f1data.draws,
        nationality: f1data.nationality, height_cm: f1data.height_cm, reach_cm: f1data.reach_cm,
        age: f1data.age, fighting_style: f1data.fighting_style,
      } : null
      const aiInput2 = f2data ? {
        name: f2data.name, wins: f2data.wins, losses: f2data.losses, draws: f2data.draws,
        nationality: f2data.nationality, height_cm: f2data.height_cm, reach_cm: f2data.reach_cm,
        age: f2data.age, fighting_style: f2data.fighting_style,
      } : null

      const aiResult = (!opts.skipAI && aiInput1 && aiInput2)
        ? await generateAIAnalysis(aiInput1, aiInput2, normFight.weight_class ?? 'Catchweight')
        : { analysis_f1: null, analysis_f2: null }
      if (aiResult.debugError && !firstAiError) firstAiError = aiResult.debugError

      // Check if a fight with the same fighter pair already exists for this event.
      // Use the resolved UUIDs (f1uuid/f2uuid) so we correctly match fights regardless
      // of which API source originally imported them.
      const { data: existingFight } = await supabase
        .from('fights')
        .select('id')
        .eq('event_id', normFight.event_uuid)
        .or(
          `and(fighter1_id.eq.${f1uuid},fighter2_id.eq.${f2uuid}),` +
          `and(fighter1_id.eq.${f2uuid},fighter2_id.eq.${f1uuid})`
        )
        .maybeSingle()

      const fightId = existingFight?.id ?? normFight.uuid

      const fightRow = {
        id:             fightId,
        event_id:       normFight.event_uuid,
        fighter1_id:    f1uuid,
        fighter2_id:    f2uuid,
        weight_class:   normFight.weight_class,
        is_main_event:  normFight.is_main_event,
        is_title_fight: normFight.is_title_fight,
        fight_time:     normFight.fight_time,
        status:         normFight.status,
        winner_id:      normFight.winner_uuid,
        method:         normFight.method,
        round:          normFight.round,
        time_of_finish: normFight.time_of_finish,
        odds_f1:        0,
        odds_f2:        0,
        analysis_f1:    aiResult.analysis_f1,
        analysis_f2:    aiResult.analysis_f2,
        // api-sports doesn't return card position — use loop index as tie-breaking fallback
        // so fights at least have a distinct order. syncFightMetaFromRapidApi (called below)
        // will overwrite this with proper RapidAPI fight.order values when available.
        display_order:  normFight.display_order !== 0 ? normFight.display_order : fightIdx,
        fight_type:     normFight.card_segment,
      }

      const { error: fErr } = await supabase.from('fights').upsert(fightRow as any, { onConflict: 'id', ignoreDuplicates: false })
      if (!fErr) insertedFights++
    }
  }

  // Cross-reference with RapidAPI to populate fight_type + display_order.
  // api-sports doesn't return card segment or fight order, but RapidAPI does.
  // This runs after all fight rows are upserted so updates land on existing rows.
  for (const eventId of newEventIds) {
    await syncFightMetaFromRapidApi(eventId, day, month, year)
  }

  revalidatePath('/')
  revalidatePath('/admin')

  for (const eventId of newEventIds) {
    sendCardLiveEmails(eventId).catch((err) => console.error('[admin] card-live email error:', err))
  }

  const aiNote = firstAiError ? ` (AI error: ${firstAiError})` : ' with AI analysis'
  return {
    success: true,
    message: `[api-sports.io] Imported ${insertedFighters} fighters, ${insertedEvents} event(s), ${insertedFights} fights${aiNote}.`,
  }
  } catch (e: any) {
    console.error('[fetchEventByDateApiSports] uncaught error:', e)
    return { error: `Import failed: ${e?.message ?? String(e)}` }
  }
}

// ─── RapidAPI import (legacy fallback) ───────────────────────────────────────

async function fetchEventByDateRapidApi(
  day: number,
  month: number,
  year: number,
): Promise<ActionResult> {
  const supabase = createServiceClient()

  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) return { error: 'RAPIDAPI_KEY not configured in environment (also no APISPORTS_KEY found)' }

  const url = `https://${host}/api/mma/unique-tournament/19906/schedules/${day}/${month}/${year}`
  const res = await fetch(url, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) return { error: `API request failed: ${res.status} — ${text.slice(0, 200)}` }
  if (!text) return { error: 'API returned empty response' }

  let data: any
  try { data = JSON.parse(text) } catch { return { error: `Invalid JSON from API: ${text.slice(0, 200)}` } }

  const apiFights: any[] = data.events ?? []
  if (apiFights.length === 0) return { error: 'No fights found for that date' }

  const eventMap = new Map<number, { tournament: any; venue: any; fights: any[] }>()
  for (const fight of apiFights) {
    const tId = fight.tournament?.id
    if (!tId) continue
    if (!eventMap.has(tId)) eventMap.set(tId, { tournament: fight.tournament, venue: fight.venue, fights: [] })
    eventMap.get(tId)!.fights.push(fight)
  }

  let insertedFighters = 0, insertedEvents = 0, insertedFights = 0
  let firstAiError: string | undefined
  const newEventIds: string[] = []

  const allTeams = new Map<number, any>()
  for (const [, { fights }] of eventMap) {
    for (const fight of fights) {
      for (const side of ['homeTeam', 'awayTeam'] as const) {
        const team = fight[side]
        if (team?.id) allTeams.set(team.id, { team, weightClass: fight.weightClass })
      }
    }
  }

  const fighterDetails = new Map<number, any>()
  const teamEntries = [...allTeams.entries()]
  for (let i = 0; i < teamEntries.length; i += 6) {
    const batch = teamEntries.slice(i, i + 6)
    await Promise.all(batch.map(async ([apiId]) => {
      try {
        const r = await fetch(`https://${host}/api/mma/team/${apiId}`, {
          headers: { 'X-RapidAPI-Key': key!, 'X-RapidAPI-Host': host },
          cache: 'no-store',
        })
        if (r.ok) {
          const d = await r.json()
          fighterDetails.set(apiId, d.team?.playerTeamInfo ?? null)
        }
      } catch { /* skip */ }
    }))
  }

  const resolvedFighters = new Map<number, FighterStats>()

  for (const [, { tournament, venue, fights }] of eventMap) {
    for (const fight of fights) {
      for (const side of ['homeTeam', 'awayTeam'] as const) {
        const team = fight[side]
        if (!team?.id) continue

        const wc     = mapWeightClass(fight.weightClass ?? '')
        const record = `${team.wdlRecord?.wins ?? 0}-${team.wdlRecord?.losses ?? 0}-${team.wdlRecord?.draws ?? 0}`
        const detail = fighterDetails.get(team.id)

        let age: number | null = null
        if (detail?.birthDateTimestamp) {
          const birth = new Date(detail.birthDateTimestamp * 1000)
          age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        }

        let height_cm     = detail?.height ? Math.round(detail.height * 100) : null
        let reach_cm      = detail?.reach  ? Math.round(detail.reach  * 100) : null
        let fighting_style = detail?.fightingStyle
          ? detail.fightingStyle.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : null

        // UFCStats for physical fallback + combat stats
        const ufc = await getUFCStatsData(team.name as string)
        if (!height_cm)      height_cm      = ufc.height_cm
        if (!reach_cm)       reach_cm       = ufc.reach_cm
        if (!fighting_style) fighting_style = ufc.fighting_style
        if (!age)            age            = ufc.age

        const wins        = (team.wdlRecord?.wins   as number) ?? 0
        const losses      = (team.wdlRecord?.losses as number) ?? 0
        const draws       = (team.wdlRecord?.draws  as number) ?? 0
        const nationality = (team.country?.name as string) ?? null

        resolvedFighters.set(team.id, { name: team.name as string, wins, losses, draws, nationality, height_cm, reach_cm, age, fighting_style })

        let last_5_form: string | null = null
        try {
          const formRes = await fetch(`https://${host}/api/mma/team/${team.id}/events/last/0`, {
            headers: { 'X-RapidAPI-Key': key!, 'X-RapidAPI-Host': host },
            cache: 'no-store',
          })
          if (formRes.ok) {
            const formData = await formRes.json()
            const recentFights: any[] = formData.events ?? []
            const formStr = recentFights.slice(0, 5).map((e: any) => {
              if (e.winnerCode === 1 && e.homeTeam?.id === team.id) return 'W'
              if (e.winnerCode === 2 && e.awayTeam?.id === team.id)  return 'W'
              if (e.winnerCode && e.winnerCode !== 0)                 return 'L'
              return 'D'
            }).join('')
            if (formStr.length > 0) last_5_form = formStr
          }
        } catch { /* skip */ }

        const { ko_tko_wins, sub_wins, dec_wins } = calcWinBreakdown(ufc.fights)

        const fighter = {
          id: apiIdToUuid(team.id, 'fighter'), name: team.name as string,
          nickname: detail?.nickname?.trim() || null, nationality,
          flag_emoji: countryToFlag(team.country?.alpha2 ?? ''),
          image_url: `/api/fighter-image/${team.id}`,
          record, wins, losses, draws, weight_class: wc, height_cm, reach_cm, age, fighting_style,
          last_5_form,
          striking_accuracy: ufc.str_acc,
          sig_str_landed:    ufc.slpm,
          td_avg:            ufc.td_avg,
          sub_avg:           ufc.sub_avg,
          ko_tko_wins,
          sub_wins,
          dec_wins,
          analysis: null,
        }

        const { error } = await supabase.from('fighters').upsert(fighter as any, { onConflict: 'id', ignoreDuplicates: false })
        if (error) console.error(`Fighter upsert failed (${team.name}):`, error.message)
        else insertedFighters++
      }
    }

    const allFinished = fights.every((f: any) => f.status?.type === 'finished')
    const anyLive     = fights.some((f: any)  => f.status?.type === 'inprogress')
    const eventStatus = allFinished ? 'completed' : anyLive ? 'live' : 'upcoming'
    const earliestTs  = Math.min(...fights.map((f: any) => (f.startTimestamp as number) ?? Infinity))

    const event = {
      id: apiIdToUuid(tournament.id, 'event'), name: tournament.name as string,
      date: new Date(earliestTs * 1000).toISOString(),
      location: (venue?.city?.name as string) ?? null, venue: (tournament.location as string) ?? null,
      image_url: null, status: eventStatus,
    }

    const { error: evErr } = await supabase.from('events').upsert(event as any, { onConflict: 'id', ignoreDuplicates: false })
    if (evErr) { continue }
    insertedEvents++
    newEventIds.push(event.id)

    const maincardFights = fights.filter((f: any) => f.fightType === 'maincard')
    const maxOrder = maincardFights.length > 0 ? Math.max(...maincardFights.map((f: any) => (f.order as number) ?? 0)) : -1

    for (const fight of fights) {
      const home = fight.homeTeam, away = fight.awayTeam
      if (!home?.id || !away?.id) continue

      const isMainEvent = fight.fightType === 'maincard' && fight.order === maxOrder
      const status      = mapStatus(fight.status?.type ?? '')
      let winnerId: string | null = null
      if (fight.winnerCode === 1) winnerId = apiIdToUuid(home.id, 'fighter')
      else if (fight.winnerCode === 2) winnerId = apiIdToUuid(away.id, 'fighter')

      const wc     = mapWeightClass(fight.weightClass ?? '')
      const f1data = resolvedFighters.get(home.id)
      const f2data = resolvedFighters.get(away.id)
      const aiResult = (f1data && f2data) ? await generateAIAnalysis(f1data, f2data, wc) : { analysis_f1: null, analysis_f2: null }
      if (aiResult.debugError && !firstAiError) firstAiError = aiResult.debugError

      const fightRow = {
        id: apiIdToUuid(fight.id, 'fight'), event_id: apiIdToUuid(tournament.id, 'event'),
        fighter1_id: apiIdToUuid(home.id, 'fighter'), fighter2_id: apiIdToUuid(away.id, 'fighter'),
        weight_class: wc, is_main_event: isMainEvent, is_title_fight: false,
        fight_time: new Date((fight.startTimestamp as number) * 1000).toISOString(),
        status, winner_id: winnerId, method: fight.winType ? mapMethod(fight.winType as string) : null,
        round: (fight.finalRound as number) ?? null, time_of_finish: null, odds_f1: 0, odds_f2: 0,
        analysis_f1: aiResult.analysis_f1, analysis_f2: aiResult.analysis_f2,
        display_order: (fight.order as number) ?? 0, fight_type: (fight.fightType as string) ?? null,
      }

      const { error: fErr } = await supabase.from('fights').upsert(fightRow as any, { onConflict: 'id', ignoreDuplicates: false })
      if (!fErr) insertedFights++
    }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  for (const eventId of newEventIds) {
    sendCardLiveEmails(eventId).catch((err) => console.error('[admin] card-live email error:', err))
  }

  const aiNote = firstAiError ? ` (AI error: ${firstAiError})` : ' with AI analysis'
  return {
    success: true,
    message: `[RapidAPI] Imported ${insertedFighters} fighters, ${insertedEvents} event(s), ${insertedFights} fights${aiNote}.`,
  }
}

// ─── Seed (fake data fallback) ───────────────────────────────────────────────

export async function seedEvents(): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()

  let insertedFighters = 0
  let insertedEvents   = 0
  let insertedFights   = 0

  for (const fighter of SEED_FIGHTERS) {
    const { error } = await supabase.from('fighters').upsert(fighter, { onConflict: 'id', ignoreDuplicates: true })
    if (!error) insertedFighters++
  }

  for (const eventData of SEED_EVENTS) {
    const { fights: eventFights, ...event } = eventData

    const { data: ev, error: evErr } = await supabase
      .from('events')
      .upsert(event, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')
      .single()

    if (evErr || !ev) continue
    insertedEvents++

    for (const fight of eventFights) {
      const { error: fErr } = await supabase
        .from('fights')
        .upsert({ ...fight, event_id: (ev as any).id }, { onConflict: 'id', ignoreDuplicates: true })
      if (!fErr) insertedFights++
    }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return {
    success: true,
    message: `Seeded ${insertedFighters} fighters, ${insertedEvents} events, ${insertedFights} fights.`,
  }
}

// ─── Force sync results ──────────────────────────────────────────────────────

export async function forceSyncResults(): Promise<ActionResult & { log?: string[]; skipped?: string[] }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const result = await runSyncResults()

  return {
    success: result.success,
    message: `Synced ${result.synced} fight(s). ${result.errors.length ? `${result.errors.length} error(s).` : ''}`,
    log:     [...result.log, ...result.errors],
    skipped: result.skipped,
  }
}

// ─── Backfill win breakdown ───────────────────────────────────────────────────

/**
 * Loops through all fighters missing any UFCStats-sourced data
 * (win breakdown OR striking/grappling career stats), fetches everything
 * in one scrape call per fighter, and updates the fighters table.
 * Safe to run multiple times — only touches rows that have at least one null column.
 */
export async function backfillWinBreakdown(): Promise<{ updated: number; errors: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdmin(user)) return { updated: 0, errors: 0 }

  // Fetch fighters missing any of the UFCStats-backed columns
  const { data: fighters, error } = await supabase
    .from('fighters')
    .select('id, name')
    .or('ko_tko_wins.is.null,striking_accuracy.is.null,sig_str_landed.is.null,td_avg.is.null,sub_avg.is.null,last_5_form.is.null')
    .order('name')

  if (error || !fighters?.length) return { updated: 0, errors: 0 }

  let updated = 0
  let errors  = 0

  for (const fighter of fighters) {
    try {
      const ufc = await getUFCStatsData(fighter.name)

      // Need at least career stats OR fight history to be worth updating
      const hasStats  = ufc.str_acc != null || ufc.slpm != null || ufc.td_avg != null || ufc.sub_avg != null
      const hasFights = ufc.fights.length > 0

      if (!hasStats && !hasFights) continue

      const breakdown = calcWinBreakdown(ufc.fights)

      const last_5_form = hasFights
        ? ufc.fights.slice(0, 5).map((f) =>
            f.result === 'W' ? 'W' : f.result === 'L' ? 'L' : f.result === 'D' ? 'D' : 'N'
          ).join('')
        : null

      const patch: Record<string, unknown> = {
        // Win breakdown (only write if we have fight history)
        ...(hasFights ? breakdown : {}),
        ...(last_5_form != null ? { last_5_form } : {}),
        // Career striking / grappling stats
        ...(ufc.str_acc  != null ? { striking_accuracy: ufc.str_acc  } : {}),
        ...(ufc.slpm     != null ? { sig_str_landed:    ufc.slpm     } : {}),
        ...(ufc.td_avg   != null ? { td_avg:            ufc.td_avg   } : {}),
        ...(ufc.sub_avg  != null ? { sub_avg:           ufc.sub_avg  } : {}),
        ...(ufc.height_cm != null ? { height_cm:        ufc.height_cm } : {}),
        ...(ufc.reach_cm  != null ? { reach_cm:         ufc.reach_cm  } : {}),
        ...(ufc.age       != null ? { age:              ufc.age       } : {}),
        ...(ufc.fighting_style != null ? { fighting_style: ufc.fighting_style } : {}),
      }

      if (Object.keys(patch).length === 0) continue

      const { error: upErr } = await supabase
        .from('fighters')
        .update(patch)
        .eq('id', fighter.id)

      if (upErr) { errors++; console.error(`backfill error (${fighter.name}):`, upErr.message) }
      else updated++
    } catch (e) {
      errors++
      console.error(`backfill exception (${fighter.name}):`, e)
    }
  }

  return { updated, errors }
}

// ─── Refresh missing fights for an existing event ────────────────────────────

/**
 * Re-fetches all fights for an existing event from the API and upserts them.
 * Safe to run on a live event — existing fights (and their picks) are untouched;
 * only missing fights get added.
 */
export async function refreshEventFights(eventId: string): Promise<ActionResult> {
  try {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()

  // Get the event date from DB
  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('id', eventId)
    .single()

  if (evErr || !event) return { error: 'Event not found' }

  const d     = new Date(event.date)
  const day   = d.getUTCDate()
  const month = d.getUTCMonth() + 1
  const year  = d.getUTCFullYear()

  // When RapidAPI is available, skip api-sports entirely for refreshes.
  // api-sports groups fights by slug which can collide across events on the same date,
  // causing fights from a different event to get stamped with forceEventUuid.
  // The RapidAPI reconciliation is authoritative: it matches by event name, deletes
  // wrong fights, inserts missing ones, and sets correct fight_type/display_order.
  if (process.env.RAPIDAPI_KEY) {
    await syncFightMetaFromRapidApi(eventId, day, month, year)
    revalidatePath('/', 'layout')
    revalidatePath('/admin')
    return { success: true, message: 'Fights reconciled from RapidAPI.' }
  }

  // Fallback: api-sports only (no RapidAPI key configured)
  const result = isApiSportsConfigured()
    ? await fetchEventByDateApiSports(day, month, year, { skipAI: true, skipUFCStats: true, forceEventUuid: eventId })
    : { error: 'No API source configured (set RAPIDAPI_KEY or APISPORTS_KEY)' }

  if (result.error) return { error: result.error }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')
  return { success: true, message: result.message ?? 'Fights refreshed.' }
  } catch (e: any) {
    console.error('[refreshEventFights] uncaught error:', e)
    return { error: `Unexpected error: ${e?.message ?? String(e)}` }
  }
}

// ─── Cron: sync all upcoming fight cards ─────────────────────────────────────

/** Strip diacritics, lowercase, remove non-letters — for fuzzy name matching */
const normFighterName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

/**
 * Cross-check DB fights for an event against Tapology's fight card.
 * When Tapology has a different fighter in one corner (replacement/correction),
 * the DB is updated to match Tapology, which is treated as the source of truth.
 */
async function reconcileWithTapology(
  eventId: string,
  tapologyFights: TapologyEvent['fight_card'],
  supabase: ReturnType<typeof createServiceClient>,
  log: string[],
): Promise<void> {
  const { data: dbFights } = await supabase
    .from('fights')
    .select(`
      id, fighter1_id, fighter2_id,
      fighter1:fighters!fights_fighter1_id_fkey(id, name),
      fighter2:fighters!fights_fighter2_id_fkey(id, name)
    `)
    .eq('event_id', eventId)
    .not('status', 'in', '("completed","cancelled")')

  if (!dbFights?.length) return

  // Parse Tapology fight strings into normalised name pairs
  const tapPairs = Object.values(tapologyFights).map((tf) => {
    const [raw1 = '', raw2 = ''] = tf.fight.split(' vs. ').map((s) => s.trim())
    return { raw1, raw2, n1: normFighterName(raw1), n2: normFighterName(raw2) }
  })

  for (const dbFight of dbFights as any[]) {
    const f1 = { id: dbFight.fighter1?.id as string, name: dbFight.fighter1?.name as string ?? '' }
    const f2 = { id: dbFight.fighter2?.id as string, name: dbFight.fighter2?.name as string ?? '' }
    const n1 = normFighterName(f1.name)
    const n2 = normFighterName(f2.name)

    for (const tap of tapPairs) {
      const tapSet = new Set([tap.n1, tap.n2])
      const shared = [n1, n2].filter((n) => tapSet.has(n))

      if (shared.length === 2) break   // Both fighters match — no issue

      if (shared.length === 1) {
        // One corner has changed — Tapology has the correct fighter
        const sharedNorm    = shared[0]
        const wrongFighter  = n1 === sharedNorm ? f2 : f1
        const correctRaw    = tap.n1 === sharedNorm ? tap.raw2 : tap.raw1
        const column        = n1 === sharedNorm ? 'fighter2_id' : 'fighter1_id'

        if (normFighterName(wrongFighter.name) === normFighterName(correctRaw)) break // already correct

        log.push(`⚠ Tapology correction on fight ${dbFight.id}: "${wrongFighter.name}" → "${correctRaw}"`)

        // Look up fighter by name or create a minimal record
        const { data: existing } = await supabase
          .from('fighters')
          .select('id')
          .ilike('name', correctRaw)
          .maybeSingle()

        let newId = existing?.id as string | undefined
        if (!newId) {
          const { data: inserted } = await supabase
            .from('fighters')
            .insert({ name: correctRaw })
            .select('id')
            .single()
          newId = inserted?.id
        }

        if (newId) {
          await supabase.from('fights').update({ [column]: newId }).eq('id', dbFight.id)
          log.push(`  ✓ Updated ${column} to "${correctRaw}" (${newId})`)
        }
        break
      }
      // shared.length === 0 → completely different fight, skip
    }
  }
}

/**
 * Called by /api/cron/sync-card — no admin auth needed (server-to-server).
 * For every upcoming event:
 *  1. Pulls latest fight card from RapidAPI (metadata, order, replacements)
 *  2. Cross-checks fighter names against Tapology and corrects any mismatches
 *     (Tapology is treated as the source of truth when the two disagree)
 */
export async function syncAllUpcomingCards(): Promise<{
  synced: number
  log: string[]
  errors: string[]
}> {
  if (!process.env.RAPIDAPI_KEY) {
    return { synced: 0, log: [], errors: ['RAPIDAPI_KEY not configured — skipping card sync'] }
  }

  const supabase = createServiceClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, name, date')
    .eq('status', 'upcoming')

  const log: string[] = []
  const errors: string[] = []
  let synced = 0

  // Fetch Tapology once for all events (one API call)
  const tapologyEvents = await getUpcomingUFCEvents()
  if (tapologyEvents.length > 0) {
    log.push(`[tapology] Fetched ${tapologyEvents.length} upcoming UFC events`)
  } else {
    log.push('[tapology] No events returned (key missing or API unavailable)')
  }

  for (const event of (events ?? [])) {
    const d = new Date(event.date)
    const eventMonth = d.getUTCMonth() + 1
    const eventDay   = d.getUTCDate()

    try {
      // Step 1 — RapidAPI sync (fight order, segments, insertions, deletions)
      await syncFightMetaFromRapidApi(
        event.id,
        eventDay,
        eventMonth,
        d.getUTCFullYear(),
      )
      log.push(`[rapidapi] ✓ ${event.name}`)

      // Step 2 — Tapology reconciliation (fighter name corrections)
      const tapEvent = tapologyEvents.find((te) => {
        const parsed = parseTapologyDate(te.datetime)
        return parsed && parsed.month === eventMonth && parsed.day === eventDay
      })

      if (tapEvent) {
        log.push(`[tapology] Reconciling ${event.name} against "${tapEvent.organization}"`)
        await reconcileWithTapology(event.id, tapEvent.fight_card, supabase, log)
      } else {
        log.push(`[tapology] No matching event found for ${event.name} (${eventMonth}/${eventDay})`)
      }

      synced++
    } catch (e: any) {
      errors.push(`${event.name}: ${e?.message ?? String(e)}`)
    }
  }

  if (synced > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/admin')
  }

  return { synced, log, errors }
}

// ─── Complete fight ──────────────────────────────────────────────────────────

export async function completeFight(
  fightId: string,
  winnerId: string | null,   // null = draw / no contest
  method?: string,
  round?: number,
  timeOfFinish?: string,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()

  const { error } = await supabase.rpc('complete_fight', {
    p_fight_id: fightId,
    p_winner_id: winnerId,
    p_method: method ?? null,
    p_round: round ?? null,
    p_time: timeOfFinish ?? null,
  } as any)

  if (error) return { error: error.message }

  revalidatePath('/')
  revalidatePath('/leaderboard')
  revalidatePath('/admin')
  return { success: true, message: 'Fight completed and scores updated.' }
}

// ─── Deduplicate fights ───────────────────────────────────────────────────────

/**
 * Finds fights where the same fighter pair appears more than once for the same
 * event (caused by cross-API re-imports generating different UUIDs) and removes
 * the duplicates, keeping whichever row has predictions attached, or the one
 * with more data (e.g. completed status) if there are no predictions.
 *
 * Matches by fighter NAME (normalised) rather than UUID so that RapidAPI-imported
 * fights (UUID prefix 0001/0003) and api-sports-imported fights (prefix 0004/0006)
 * are correctly detected as duplicates even though their IDs differ.
 */
export async function deduplicateFights(): Promise<ActionResult & { removed: number }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error, removed: 0 }

  const supabase = createServiceClient()

  // Fetch all fights with joined fighter names so we can match across API sources
  const { data: fights, error: fErr } = await supabase
    .from('fights')
    .select('id, event_id, status, fighter1:fighters!fights_fighter1_id_fkey(name), fighter2:fighters!fights_fighter2_id_fkey(name)')
    .order('created_at', { ascending: true })

  if (fErr) return { error: fErr.message, removed: 0 }
  if (!fights?.length) return { success: true, message: 'No fights found.', removed: 0 }

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

  // Group by event + normalised fighter name pair (order-independent)
  const groups = new Map<string, typeof fights>()
  for (const fight of fights) {
    const f1 = norm((fight.fighter1 as any)?.name ?? '')
    const f2 = norm((fight.fighter2 as any)?.name ?? '')
    if (!f1 || !f2) continue
    const [a, b] = [f1, f2].sort()
    const key = `${fight.event_id}::${a}::${b}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(fight)
  }

  const toDelete: string[] = []

  for (const [, group] of groups) {
    if (group.length < 2) continue

    // Fetch prediction counts for each fight in this group
    const counts = await Promise.all(group.map(async (f: { id: string; status: string; [k: string]: unknown }) => {
      const { count } = await supabase
        .from('predictions')
        .select('id', { count: 'exact', head: true })
        .eq('fight_id', f.id)
      return { id: f.id, picks: count ?? 0, status: f.status }
    }))

    // Keep the fight that has the most predictions; if tied, prefer completed > others
    counts.sort((a, b) => {
      if (b.picks !== a.picks) return b.picks - a.picks
      const priority = (s: string) => s === 'completed' ? 2 : s === 'live' ? 1 : 0
      return priority(b.status) - priority(a.status)
    })

    // Everything after the first (best) entry is a duplicate
    for (const dup of counts.slice(1)) {
      toDelete.push(dup.id)
    }
  }

  if (toDelete.length === 0) {
    return { success: true, message: 'No duplicate fights found.', removed: 0 }
  }

  // Delete duplicates in batches
  const batchSize = 50
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize)
    await supabase.from('predictions').delete().in('fight_id', batch)
    await supabase.from('fights').delete().in('id', batch)
  }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')

  return {
    success: true,
    message: `Removed ${toDelete.length} duplicate fight(s).`,
    removed: toDelete.length,
  }
}

// ─── Fight meta controls ─────────────────────────────────────────────────────

export async function updateFightMeta(
  fightId: string,
  updates: { fight_type?: string | null; display_order?: number; is_main_event?: boolean }
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('fights')
    .update(updates)
    .eq('id', fightId)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')
  return { success: true, message: 'Fight updated.' }
}

export async function deleteFight(fightId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()

  // Remove predictions first (FK constraint)
  await supabase.from('predictions').delete().eq('fight_id', fightId)

  const { error } = await supabase.from('fights').delete().eq('id', fightId)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')
  return { success: true, message: 'Fight deleted.' }
}
