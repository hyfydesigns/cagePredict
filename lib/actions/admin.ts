'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SEED_EVENTS, SEED_FIGHTERS } from '@/seeds/seed-data'

type ActionResult = { error?: string; success?: boolean; message?: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a RapidAPI integer ID to a deterministic UUID */
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

function countryToFlag(alpha2: string): string | null {
  if (!alpha2 || alpha2.length !== 2) return null
  const pts = [...alpha2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...pts)
}

// ─── Wikipedia fallback for missing fighter stats ────────────────────────────

async function fetchStatsFromWikipedia(name: string): Promise<{
  height_cm: number | null
  reach_cm: number | null
  age: number | null
  fighting_style: string | null
}> {
  const empty = { height_cm: null, reach_cm: null, age: null, fighting_style: null }
  try {
    const slug = name.trim().replace(/\s+/g, '_')
    const url  = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvslots=main&rvprop=content&titles=${encodeURIComponent(slug)}&format=json&redirects=1`
    const res  = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return empty
    const data  = await res.json()
    const pages = Object.values((data.query?.pages ?? {}) as Record<string, any>)
    const text: string = pages[0]?.revisions?.[0]?.slots?.main?.['*'] ?? ''
    if (!text || text.includes('#REDIRECT')) return empty

    // Height: "5 ft 10 in" or "{{height|ft=5|in=10}}" or "180 cm"
    let height_cm: number | null = null
    const htFtIn = text.match(/height\s*[=|]\s*(\d+)\s*ft\s*([\d.]+)\s*in/i)
    const htCm   = text.match(/height\s*[=|]\s*(\d+)\s*cm/i)
    const htTpl  = text.match(/height\|ft=(\d+)\|in=([\d.]+)/i)
    if (htFtIn)  height_cm = Math.round(parseInt(htFtIn[1]) * 30.48 + parseFloat(htFtIn[2]) * 2.54)
    else if (htTpl) height_cm = Math.round(parseInt(htTpl[1]) * 30.48 + parseFloat(htTpl[2]) * 2.54)
    else if (htCm)  height_cm = parseInt(htCm[1])

    // Reach: "71.5 in" or "71+1/2 in" or "182 cm"
    let reach_cm: number | null = null
    const rcIn  = text.match(/reach\s*[=|][^=\n]*?([\d]+(?:\.[\d]+)?)\s*(?:\+\s*(?:[\d]+\/[\d]+))?\s*in/i)
    const rcFrac = text.match(/reach\s*[=|][^=\n]*?(\d+)\+(\d+)\/(\d+)\s*in/i)
    const rcCm  = text.match(/reach\s*[=|]\s*([\d.]+)\s*cm/i)
    if (rcFrac) reach_cm = Math.round((parseInt(rcFrac[1]) + parseInt(rcFrac[2]) / parseInt(rcFrac[3])) * 2.54)
    else if (rcIn)  reach_cm = Math.round(parseFloat(rcIn[1]) * 2.54)
    else if (rcCm)  reach_cm = Math.round(parseFloat(rcCm[1]))

    // Age from birth year
    let age: number | null = null
    const born = text.match(/birth_date\s*[=|][^=\n]*?(\d{4})/i)
    if (born) age = new Date().getFullYear() - parseInt(born[1])

    // Fighting style
    let fighting_style: string | null = null
    const style = text.match(/(?:fighting_)?style\s*[=|]\s*([^\n|{}[\]]+)/i)
    if (style) {
      const raw = style[1].replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/[{}]/g, '').trim()
      if (raw && raw.length < 60) fighting_style = raw
    }

    return { height_cm, reach_cm, age, fighting_style }
  } catch {
    return empty
  }
}

// ─── Clear all data ──────────────────────────────────────────────────────────

export async function clearAllData(): Promise<ActionResult> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

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

// ─── Fetch real event from RapidAPI ─────────────────────────────────────────

/**
 * Fetch a UFC event for a given date from the RapidAPI MMA API
 * and upsert fighters, event, and fights into the database.
 *
 * URL pattern: /api/mma/unique-tournament/19906/schedules/{day}/{month}/{year}
 */
export async function fetchEventByDate(
  day: number,
  month: number,
  year: number,
): Promise<ActionResult> {
  // Verify the caller is authenticated
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Use service role to bypass RLS for admin writes
  const supabase = createServiceClient()

  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'
  if (!key) return { error: 'RAPIDAPI_KEY not configured in environment' }

  const url = `https://${host}/api/mma/unique-tournament/19906/schedules/${day}/${month}/${year}`
  const res = await fetch(url, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) return { error: `API request failed: ${res.status} — ${text.slice(0, 200)}` }
  if (!text) return { error: 'API returned empty response' }

  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    return { error: `Invalid JSON from API: ${text.slice(0, 200)}` }
  }

  const apiFights: any[] = data.events ?? []
  if (apiFights.length === 0) return { error: 'No fights found for that date' }

  // Group fights by tournament (multiple events on same day is rare but possible)
  const eventMap = new Map<number, { tournament: any; venue: any; fights: any[] }>()
  for (const fight of apiFights) {
    const tId = fight.tournament?.id
    if (!tId) continue
    if (!eventMap.has(tId)) {
      eventMap.set(tId, { tournament: fight.tournament, venue: fight.venue, fights: [] })
    }
    eventMap.get(tId)!.fights.push(fight)
  }

  let insertedFighters = 0
  let insertedEvents   = 0
  let insertedFights   = 0

  // Collect unique fighter API IDs across all events
  const allTeams = new Map<number, any>()
  for (const [, { fights }] of eventMap) {
    for (const fight of fights) {
      for (const side of ['homeTeam', 'awayTeam'] as const) {
        const team = fight[side]
        if (team?.id) allTeams.set(team.id, { team, weightClass: fight.weightClass })
      }
    }
  }

  // Fetch fighter details in parallel (max 6 at a time to avoid rate limits)
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
      } catch { /* skip if detail fetch fails */ }
    }))
  }

  for (const [, { tournament, venue, fights }] of eventMap) {
    // 1. Upsert fighters
    for (const fight of fights) {
      for (const side of ['homeTeam', 'awayTeam'] as const) {
        const team = fight[side]
        if (!team?.id) continue

        const wc     = mapWeightClass(fight.weightClass ?? '')
        const record = `${team.wdlRecord?.wins ?? 0}-${team.wdlRecord?.losses ?? 0}-${team.wdlRecord?.draws ?? 0}`
        const detail = fighterDetails.get(team.id)

        // Calculate age from birthDateTimestamp
        let age: number | null = null
        if (detail?.birthDateTimestamp) {
          const birth = new Date(detail.birthDateTimestamp * 1000)
          age = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        }

        // Primary stats from RapidAPI detail
        let height_cm     = detail?.height ? Math.round(detail.height * 100) : null
        let reach_cm      = detail?.reach  ? Math.round(detail.reach  * 100) : null
        let fighting_style = detail?.fightingStyle
          ? detail.fightingStyle.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : null

        // Fallback to Wikipedia for missing stats
        if (!height_cm || !reach_cm || !fighting_style || !age) {
          const wiki = await fetchStatsFromWikipedia(team.name as string)
          if (!height_cm)      height_cm      = wiki.height_cm
          if (!reach_cm)       reach_cm       = wiki.reach_cm
          if (!fighting_style) fighting_style = wiki.fighting_style
          if (!age)            age            = wiki.age
        }

        const fighter = {
          id:             apiIdToUuid(team.id, 'fighter'),
          name:           team.name as string,
          nickname:       detail?.nickname?.trim() || null,
          nationality:    (team.country?.name as string) ?? null,
          flag_emoji:     countryToFlag(team.country?.alpha2 ?? ''),
          image_url:      `/api/fighter-image/${team.id}`,
          record,
          wins:           (team.wdlRecord?.wins   as number) ?? 0,
          losses:         (team.wdlRecord?.losses as number) ?? 0,
          draws:          (team.wdlRecord?.draws  as number) ?? 0,
          weight_class:   wc,
          height_cm,
          reach_cm,
          age,
          fighting_style,
          striking_accuracy: null,
          td_avg:            null,
          sub_avg:           null,
          sig_str_landed:    null,
          analysis:          null,
        }

        const { error } = await supabase
          .from('fighters')
          .upsert(fighter as any, { onConflict: 'id', ignoreDuplicates: false })
        if (error) {
          console.error(`Fighter upsert failed (${team.name}):`, error.message)
        } else {
          insertedFighters++
        }
      }
    }

    // 2. Upsert event
    const allFinished = fights.every((f: any) => f.status?.type === 'finished')
    const anyLive     = fights.some((f: any)  => f.status?.type === 'inprogress')
    const eventStatus = allFinished ? 'completed' : anyLive ? 'live' : 'upcoming'
    const earliestTs  = Math.min(...fights.map((f: any) => (f.startTimestamp as number) ?? Infinity))

    const event = {
      id:        apiIdToUuid(tournament.id, 'event'),
      name:      tournament.name as string,
      date:      new Date(earliestTs * 1000).toISOString(),
      location:  (venue?.city?.name as string) ?? null,
      venue:     (tournament.location as string) ?? null,
      image_url: null,
      status:    eventStatus,
    }

    const { error: evErr } = await supabase
      .from('events')
      .upsert(event as any, { onConflict: 'id', ignoreDuplicates: false })
    if (evErr) { continue }
    insertedEvents++

    // 3. Upsert fights
    // Main event = highest order fight on the maincard
    const maincardFights = fights.filter((f: any) => f.fightType === 'maincard')
    const maxOrder = maincardFights.length > 0
      ? Math.max(...maincardFights.map((f: any) => (f.order as number) ?? 0))
      : -1

    for (const fight of fights) {
      const home = fight.homeTeam
      const away = fight.awayTeam
      if (!home?.id || !away?.id) continue

      const isMainEvent = fight.fightType === 'maincard' && fight.order === maxOrder
      const status      = mapStatus(fight.status?.type ?? '')

      let winnerId: string | null = null
      if (fight.winnerCode === 1) winnerId = apiIdToUuid(home.id, 'fighter')
      else if (fight.winnerCode === 2) winnerId = apiIdToUuid(away.id, 'fighter')

      const fightRow = {
        id:             apiIdToUuid(fight.id, 'fight'),
        event_id:       apiIdToUuid(tournament.id, 'event'),
        fighter1_id:    apiIdToUuid(home.id, 'fighter'),
        fighter2_id:    apiIdToUuid(away.id, 'fighter'),
        weight_class:   mapWeightClass(fight.weightClass ?? ''),
        is_main_event:  isMainEvent,
        is_title_fight: false,
        fight_time:     new Date((fight.startTimestamp as number) * 1000).toISOString(),
        status,
        winner_id:      winnerId,
        method:         fight.winType ? mapMethod(fight.winType as string) : null,
        round:          (fight.finalRound as number) ?? null,
        time_of_finish: null,
        odds_f1:        0,
        odds_f2:        0,
        analysis_f1:    null,
        analysis_f2:    null,
        display_order:  (fight.order as number) ?? 0,
      }

      const { error: fErr } = await supabase
        .from('fights')
        .upsert(fightRow as any, { onConflict: 'id', ignoreDuplicates: false })
      if (!fErr) insertedFights++
    }
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return {
    success: true,
    message: `Imported ${insertedFighters} fighters, ${insertedEvents} event(s), ${insertedFights} fights.`,
  }
}

// ─── Seed (fake data fallback) ───────────────────────────────────────────────

export async function seedEvents(): Promise<ActionResult> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

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

// ─── Complete fight ──────────────────────────────────────────────────────────

export async function completeFight(
  fightId: string,
  winnerId: string,
  method?: string,
  round?: number,
  timeOfFinish?: string,
): Promise<ActionResult> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

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
