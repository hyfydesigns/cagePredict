/**
 * api-sports.io MMA API client
 *
 * Docs:   https://api-sports.io/documentation/mma/v1
 * Base:   https://v1.mma.api-sports.io
 * Auth:   x-apisports-key: {APISPORTS_KEY}
 * Limits: 100 req/day (free) · all plans include all endpoints
 *
 * All responses follow the standard api-sports envelope:
 * { get, parameters, errors, results, paging, response: [...] }
 *
 * League IDs (verify with GET /leagues if needed):
 *   UFC = 1 (confirmed from /leagues endpoint)
 */

const BASE_URL = 'https://v1.mma.api-sports.io'

// ─── UFC league ID ────────────────────────────────────────────────────────────
// Filter fights by this league to avoid non-UFC bouts on the same date.
// Override via APISPORTS_UFC_LEAGUE_ID env var if the ID ever changes.
export const UFC_LEAGUE_ID = parseInt(process.env.APISPORTS_UFC_LEAGUE_ID ?? '1', 10)

// ─── UUID encoding ────────────────────────────────────────────────────────────
// RapidAPI used prefixes 1/2/3; api-sports uses 4/5/6.
// This lets the image proxy and fight-history route detect which API to call.
export function apiSportsIdToUuid(id: number, type: 'fighter' | 'event' | 'fight'): string {
  const prefix = type === 'fighter' ? '4' : type === 'event' ? '5' : '6'
  const padded = String(id).padStart(12, '0')
  return `00000000-0000-000${prefix}-0000-${padded}`
}

/** Returns the integer api-sports ID from an api-sports UUID, or null for non-api-sports UUIDs */
export function uuidToApiSportsId(uuid: string): number | null {
  const parts = uuid.split('-')
  if (parts.length !== 5) return null
  // Only decode UUIDs created by this module (prefix 0004, 0005, 0006)
  if (!['0004', '0005', '0006'].includes(parts[2])) return null
  const n = parseInt(parts[4], 10)
  return isNaN(n) || n === 0 ? null : n
}

// ─── Response types ───────────────────────────────────────────────────────────

export interface ApiSportsEnvelope<T> {
  get: string
  parameters: Record<string, string>
  errors: unknown[]
  results: number
  paging: { current: number; total: number }
  response: T[]
}

export interface ApiSportsFighterBasic {
  id: number
  name: string
  nickname: string | null
  /** URL to the fighter's photo, or null */
  image: string | null
  nationality: string | null
  birth_date: string | null  // "YYYY-MM-DD"
  /** e.g. "6'2\"" or "188 cm" */
  height: string | null
  /** e.g. "185 lbs" */
  weight: string | null
  /** e.g. "75\"" */
  reach: string | null
  record: {
    wins: number
    losses: number
    draws: number
    no_contests: number
  }
}

export interface ApiSportsFight {
  id: number
  /** ISO datetime string, e.g. "2026-04-25T16:00:00+00:00" */
  date: string
  time: string | null
  timestamp: number | null
  timezone: string | null
  /** Event name, e.g. "UFC Fight Night: Sterling vs. Zalal" */
  slug: string | null
  /** True if this is the main event of the card */
  is_main: boolean | null
  /** Weight class string, e.g. "Welterweight" */
  category: string | null
  /** { long: "Finished"|"Cancelled"|"Scheduled"|"In Progress", short: "FIN"|"CANC"|"NS"|"INPROG" } */
  status: { long: string; short: string } | null
  fighters: {
    first:  ApiFightFighter | null
    second: ApiFightFighter | null
  }
  /** Present on finished fights */
  result?: {
    type: string | null    // "KO/TKO" | "Submission" | "Decision" | "Draw" | "No Contest"
    details: string | null
    round: number | null
    clock: string | null
  } | null
  // Legacy fields (may be absent in some API plan tiers — kept for compat)
  event?: { id: number; name: string; date?: string; city?: string | null; venue?: string | null } | null
  league?: { id: number; name: string } | null
  weight_class?: { id: number; name: string } | null
  card_segment?: string | null
  position?: number | null
  winner?: { id: number; name: string } | null
  rounds?: number | null
}

/** Minimal fighter shape embedded inside fight.fighters.first / .second */
export interface ApiFightFighter {
  id: number
  name: string
  logo?: string | null
  winner?: boolean
}

export interface ApiSportsFighterDetail extends ApiSportsFighterBasic {
  career: {
    total_fights: number | null
    kos: number | null
    submissions: number | null
    decisions: number | null
    striking_accuracy: number | null  // percentage, e.g. 47.5
    significant_strikes_landed: number | null  // per min
    takedown_avg: number | null       // per 15 min
    submission_avg: number | null     // per 15 min
  } | null
}

// ─── Internal normalised types (what the rest of the app consumes) ────────────

export interface NormalisedFighter {
  id: number           // raw api-sports integer ID
  uuid: string         // deterministic UUID for DB storage
  name: string
  nickname: string | null
  image_url: string | null
  nationality: string | null
  flag_emoji: string | null
  birth_date: string | null
  height_cm: number | null
  reach_cm: number | null
  weight_class: string | null
  wins: number
  losses: number
  draws: number
  record: string       // "W-L-D"
  // combat stats (from career section or UFCStats fallback)
  striking_accuracy: number | null
  sig_str_landed: number | null
  td_avg: number | null
  sub_avg: number | null
}

export interface NormalisedFight {
  id: number
  uuid: string
  event_uuid: string
  fighter1_uuid: string
  fighter2_uuid: string
  fight_time: string       // ISO
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
  winner_uuid: string | null
  method: string | null
  round: number | null
  time_of_finish: string | null
  weight_class: string | null
  card_segment: string | null  // "Main Card" | "Prelims" | "Early Prelims"
  display_order: number
  is_main_event: boolean
  is_title_fight: boolean
}

export interface NormalisedEvent {
  id: number
  uuid: string
  name: string
  date: string         // ISO
  location: string | null
  venue: string | null
  status: 'upcoming' | 'live' | 'completed'
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function mapStatus(status: string): 'upcoming' | 'live' | 'completed' | 'cancelled' {
  const s = status.toLowerCase()
  if (s === 'finished' || s === 'final' || s === 'fin') return 'completed'
  if (s === 'in progress' || s === 'inprogress' || s === 'inprog') return 'live'
  if (s === 'cancelled' || s === 'canceled' || s === 'postponed' || s === 'canc') return 'cancelled'
  return 'upcoming'
}

/** Extract status string from api-sports status object (new format) or plain string (legacy) */
function extractStatus(status: ApiSportsFight['status']): string {
  if (!status) return 'upcoming'
  if (typeof status === 'string') return status
  // Prefer the short code for matching (FIN, CANC, NS, INPROG, etc.)
  return status.long ?? status.short ?? 'upcoming'
}

function mapResultType(type: string | null): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    'KO/TKO': 'KO/TKO',
    'KO':     'KO',
    'TKO':    'TKO',
    'Submission': 'Submission',
    'Decision': 'Decision',
    'Unanimous Decision': 'Decision (Unanimous)',
    'Split Decision':     'Decision (Split)',
    'Majority Decision':  'Decision (Majority)',
    'Draw':       'Draw',
    'No Contest': 'No Contest',
    'DQ':         'Disqualification',
    'RTD':        'RTD',
  }
  return map[type] ?? type
}

/** Parse height string ("6'2\"" or "188 cm") → cm */
function parseHeight(raw: string | null): number | null {
  if (!raw) return null
  const ftIn = raw.match(/(\d+)['']?\s*(\d+)[""]/)
  if (ftIn) return Math.round(parseInt(ftIn[1]) * 30.48 + parseInt(ftIn[2]) * 2.54)
  const cm = raw.match(/(\d+)\s*cm/)
  if (cm) return parseInt(cm[1])
  return null
}

/** Parse reach string ("75\"" or "190 cm") → cm */
function parseReach(raw: string | null): number | null {
  if (!raw) return null
  const inches = raw.match(/([\d.]+)\s*[""]/)
  if (inches) return Math.round(parseFloat(inches[1]) * 2.54)
  const cm = raw.match(/([\d.]+)\s*cm/)
  if (cm) return Math.round(parseFloat(cm[1]))
  return null
}

function countryToFlag(nationality: string | null): string | null {
  if (!nationality) return null
  // Map common nationalities to alpha2 codes
  const map: Record<string, string> = {
    american: 'US', 'united states': 'US',
    brazilian: 'BR', brazil: 'BR',
    russian: 'RU', russia: 'RU',
    canadian: 'CA', canada: 'CA',
    british: 'GB', english: 'GB', 'united kingdom': 'GB',
    irish: 'IE', ireland: 'IE',
    australian: 'AU', australia: 'AU',
    nigerian: 'NG', nigeria: 'NG',
    mexican: 'MX', mexico: 'MX',
    dutch: 'NL', netherlands: 'NL',
    polish: 'PL', poland: 'PL',
    jamaican: 'JM',
    chinese: 'CN', china: 'CN',
    korean: 'KR', 'south korean': 'KR',
    japanese: 'JP', japan: 'JP',
    georgian: 'GE', georgia: 'GE',
    dagestan: 'RU',
    chechen: 'RU',
  }
  const alpha2 = map[nationality.toLowerCase()]
  if (!alpha2 || alpha2.length !== 2) return null
  const pts = [...alpha2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...pts)
}

export function normaliseFighter(f: ApiSportsFighterBasic | ApiSportsFighterDetail | ApiFightFighter | null | undefined): NormalisedFighter {
  // Guard against null/undefined (TBA slots or malformed API response)
  if (!f || f.id == null) {
    return {
      id: 0, uuid: '', name: 'TBA', nickname: null, image_url: null,
      nationality: null, flag_emoji: null, birth_date: null,
      height_cm: null, reach_cm: null, weight_class: null,
      wins: 0, losses: 0, draws: 0, record: '0-0-0',
      striking_accuracy: null, sig_str_landed: null, td_avg: null, sub_avg: null,
    }
  }
  const fa     = f as any  // cast once; ApiFightFighter lacks most BasicFighter fields
  const detail = 'career' in f ? (f as ApiSportsFighterDetail) : null
  const wins   = fa?.record?.wins   ?? 0
  const losses = fa?.record?.losses ?? 0
  const draws  = fa?.record?.draws  ?? 0
  return {
    id: f.id,
    uuid: apiSportsIdToUuid(f.id, 'fighter'),
    name: f.name ?? 'TBA',
    nickname:   fa.nickname   ?? null,
    image_url:  fa.image      ?? fa.logo ?? null,
    nationality: fa.nationality ?? null,
    flag_emoji: countryToFlag(fa.nationality ?? null),
    birth_date: fa.birth_date ?? null,
    height_cm: parseHeight(fa.height ?? null),
    reach_cm: parseReach(fa.reach ?? null),
    weight_class: null,  // set from fight context
    wins,
    losses,
    draws,
    record: `${wins}-${losses}-${draws}`,
    striking_accuracy: detail?.career?.striking_accuracy ?? null,
    sig_str_landed: detail?.career?.significant_strikes_landed ?? null,
    td_avg: detail?.career?.takedown_avg ?? null,
    sub_avg: detail?.career?.submission_avg ?? null,
  }
}

export function normaliseFight(
  fight: ApiSportsFight,
  allFights: ApiSportsFight[],
  overrideEventUuid?: string,  // pass existing DB event UUID to avoid creating duplicates
): { fight: NormalisedFight; event: NormalisedEvent; f1: NormalisedFighter; f2: NormalisedFighter } {
  const f1 = normaliseFighter(fight.fighters?.first)
  const f2 = normaliseFighter(fight.fighters?.second)

  // Event identification: new API uses slug (no event.id); legacy uses event.id
  const eventId   = fight.event?.id ?? 0
  const eventName = fight.slug ?? fight.event?.name ?? 'Unknown Event'
  // Stable event UUID: prefer explicit override, then legacy event.id, then slug-based date key
  const eventUuid = overrideEventUuid
    ?? (eventId ? apiSportsIdToUuid(eventId, 'event') : null)
    ?? (() => {
      // Derive a stable numeric ID from the date string (YYYYMMDD as integer)
      const dateKey = fight.date?.slice(0, 10).replace(/-/g, '') ?? '00000000'
      return apiSportsIdToUuid(parseInt(dateKey, 10), 'event')
    })()

  // is_main: prefer new field, fall back to card_segment logic
  const isMainEvent = fight.is_main
    ?? (fight.card_segment?.toLowerCase().includes('main') && fight.position != null
        ? fight.position === Math.max(...allFights.filter(f => f.event?.id === eventId || f.slug === fight.slug).map(f => f.position ?? 0))
        : false)

  const statusStr = extractStatus(fight.status)
  const status    = mapStatus(statusStr)

  // Winner: new API uses fighters.first.winner / fighters.second.winner booleans
  let winnerUuid: string | null = null
  if (fight.fighters?.first?.winner)  winnerUuid = f1.uuid
  else if (fight.fighters?.second?.winner) winnerUuid = f2.uuid
  // Legacy: winner object
  else if (fight.winner?.id === fight.fighters?.first?.id)  winnerUuid = f1.uuid
  else if (fight.winner?.id === fight.fighters?.second?.id) winnerUuid = f2.uuid

  // Weight class: new API uses category string; legacy uses weight_class.name
  const weightClass = fight.category ?? fight.weight_class?.name ?? null

  const normFight: NormalisedFight = {
    id:             fight.id,
    uuid:           apiSportsIdToUuid(fight.id, 'fight'),
    event_uuid:     eventUuid,
    fighter1_uuid:  f1.uuid,
    fighter2_uuid:  f2.uuid,
    fight_time:     fight.date,
    status:         status === 'cancelled' ? 'cancelled' : status,
    winner_uuid:    status === 'completed' ? winnerUuid : null,
    method:         mapResultType(fight.result?.type ?? null),
    round:          fight.result?.round ?? null,
    time_of_finish: fight.result?.clock ?? null,
    weight_class:   weightClass,
    card_segment:   fight.card_segment ?? null,
    display_order:  fight.position ?? 0,
    is_main_event:  Boolean(isMainEvent),
    is_title_fight: false,
  }

  // Determine event status from all fights sharing this event
  const eventFights = allFights.filter(f =>
    (eventId && f.event?.id === eventId) || (fight.slug && f.slug === fight.slug)
  )
  const allDone    = eventFights.length > 0 && eventFights.every(f => ['Finished', 'Cancelled'].includes(extractStatus(f.status)))
  const anyLive    = eventFights.some(f => extractStatus(f.status).toLowerCase().includes('progress'))
  const eventStatus: 'upcoming' | 'live' | 'completed' = allDone ? 'completed' : anyLive ? 'live' : 'upcoming'

  const normEvent: NormalisedEvent = {
    id:       eventId,
    uuid:     eventUuid,
    name:     eventName,
    date:     fight.date,
    location: fight.event?.city ?? null,
    venue:    fight.event?.venue ?? null,
    status:   eventStatus,
  }

  return { fight: normFight, event: normEvent, f1, f2 }
}

// ─── API client ───────────────────────────────────────────────────────────────

function getKey(): string | null {
  return process.env.APISPORTS_KEY ?? null
}

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T[]> {
  const key = getKey()
  if (!key) throw new Error('APISPORTS_KEY not configured')

  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': key,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`api-sports ${path} → ${res.status}: ${text.slice(0, 200)}`)
  }

  const data: ApiSportsEnvelope<T> = await res.json()

  if (data.errors && (Array.isArray(data.errors) ? data.errors.length > 0 : Object.keys(data.errors).length > 0)) {
    const errMsg = JSON.stringify(data.errors).slice(0, 200)
    throw new Error(`api-sports API error: ${errMsg}`)
  }

  return data.response ?? []
}

/** Returns true if a fight belongs to the UFC, checking multiple possible field locations
 *  because api-sports doesn't always populate the `league` field on fight objects.
 *  Falls back to including the fight if none of the discriminating fields are present
 *  (safe since callers already filter by specific event date). */
function isUfcFight(f: ApiSportsFight | any): boolean {
  // New api-sports format: event name is in slug field
  if (f.slug != null) return f.slug.toLowerCase().includes('ufc')
  // Legacy / alternative formats
  if (f.league != null)      return f.league?.id === UFC_LEAGUE_ID || f.league?.name?.toLowerCase().includes('ufc')
  if (f.event != null)       return f.event?.name?.toLowerCase().includes('ufc') ?? false
  if (f.competition != null) return f.competition?.name?.toLowerCase().includes('ufc') ?? false
  if (f.tournament != null)  return f.tournament?.name?.toLowerCase().includes('ufc') ?? false
  // No discriminating field — include by default (caller is filtering by date already)
  return true
}

/**
 * Get all MMA fights for a date (YYYY-MM-DD).
 * Optionally filtered to UFC only (client-side, since the free plan
 * rejects the `league` query parameter with "The League field do not exist.").
 */
export async function getFightsByDate(
  date: string,   // "YYYY-MM-DD"
  ufcOnly = true,
): Promise<ApiSportsFight[]> {
  const all = await apiGet<ApiSportsFight>('/fights', { date })
  if (!ufcOnly) return all
  return all.filter(isUfcFight)
}

/**
 * Get UFC fights for today's date (within free-plan date window).
 * The free plan does not support the `league` filter or future dates, so we
 * query today only and filter client-side by league name / known UFC league ID.
 */
export async function getUpcomingUFCFights(): Promise<ApiSportsFight[]> {
  const today = new Date().toISOString().slice(0, 10)
  const all = await apiGet<ApiSportsFight>('/fights', { date: today })
  return all.filter(isUfcFight)
}

/**
 * Get a specific fighter's full details (including career stats).
 */
export async function getFighterById(id: number): Promise<ApiSportsFighterDetail | null> {
  const results = await apiGet<ApiSportsFighterDetail>('/fighters', { id })
  return results[0] ?? null
}

/**
 * Get all fights for a specific fighter (for fight history page).
 */
export async function getFighterFights(fighterId: number): Promise<ApiSportsFight[]> {
  return apiGet<ApiSportsFight>('/fights', { fighter: fighterId })
}

/**
 * Search fighters by name (returns up to 20 results).
 */
export async function searchFighters(name: string): Promise<ApiSportsFighterDetail[]> {
  return apiGet<ApiSportsFighterDetail>('/fighters', { search: name })
}

/** Returns true if APISPORTS_KEY is set in the environment */
export function isConfigured(): boolean {
  return Boolean(process.env.APISPORTS_KEY)
}
