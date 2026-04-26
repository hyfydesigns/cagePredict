'use server'

import Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SEED_EVENTS, SEED_FIGHTERS } from '@/seeds/seed-data'
import { sendCardLiveEmails } from '@/lib/actions/emails'
import { isAdmin } from '@/lib/auth/is-admin'
import { runSyncResults } from '@/lib/sync-results'
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
        const d = fight.event?.date?.slice(0, 10)  // "YYYY-MM-DD"
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
  opts: { skipAI?: boolean; skipUFCStats?: boolean } = {},
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

  // Group by event
  const eventMap = new Map<number, typeof apiFights>()
  for (const fight of apiFights) {
    const eid = fight.event.id
    if (!eventMap.has(eid)) eventMap.set(eid, [])
    eventMap.get(eid)!.push(fight)
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
    const allFighterSlots = fights.flatMap((f) => [f.fighters.first, f.fighters.second]).filter(Boolean)
    const uniqueFighterIds = [...new Set(allFighterSlots.map((f) => f.id).filter((id) => id != null))]

    // Fetch full fighter detail in batches of 5 to respect rate limits
    for (let i = 0; i < uniqueFighterIds.length; i += 5) {
      const batch = uniqueFighterIds.slice(i, i + 5)
      await Promise.all(batch.map(async (fId) => {
        const basic = allFighterSlots.find((f) => f.id === fId)
        if (!basic) return  // skip if fighter data is missing
        const detail = opts.skipUFCStats ? null : await getFighterById(fId).catch(() => null)
        const base = normaliseFighter(detail ?? basic)

        // Age from birth_date
        let age: number | null = null
        const bd = (detail ?? basic)?.birth_date
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
            ...base,
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
            ...base,
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
      const fightCtx = fights.find((f) =>
        f.fighters.first?.id === fighter.id || f.fighters.second?.id === fighter.id
      )
      const weightClass = fightCtx?.weight_class?.name ?? null

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
    const { event: normEvent } = normaliseFight(fights[0], apiFights)
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
    for (const fight of fights) {
      if (!fight.fighters.first?.id || !fight.fighters.second?.id) continue
      const { fight: normFight } = normaliseFight(fight, apiFights)
      const f1data = fight.fighters.first?.id != null ? fighterMap.get(fight.fighters.first.id) : undefined
      const f2data = fight.fighters.second?.id != null ? fighterMap.get(fight.fighters.second.id) : undefined

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

      const fightRow = {
        id:             normFight.uuid,
        event_id:       normFight.event_uuid,
        fighter1_id:    normFight.fighter1_uuid,
        fighter2_id:    normFight.fighter2_uuid,
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
        display_order:  normFight.display_order,
        fight_type:     normFight.card_segment,
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

  // Re-run a lightweight import that only adds missing fight rows.
  // We skip AI analysis and UFCStats enrichment here (those are slow and the
  // fighters were already enriched during the original import).
  const result = isApiSportsConfigured()
    ? await fetchEventByDateApiSports(day, month, year, { skipAI: true, skipUFCStats: true })
    : await fetchEventByDateRapidApi(day, month, year)

  if (result.error) return { error: result.error }

  revalidatePath('/', 'layout')
  revalidatePath('/admin')
  return { success: true, message: result.message ?? 'Fights refreshed.' }
  } catch (e: any) {
    console.error('[refreshEventFights] uncaught error:', e)
    return { error: `Unexpected error: ${e?.message ?? String(e)}` }
  }
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
