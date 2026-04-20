/**
 * api-sports.io MMA API client
 *
 * Docs:   https://api-sports.io/documentation/mma/v1
 * Base:   https://api.mma.api-sports.io
 * Auth:   x-apisports-key: {APISPORTS_KEY}
 * Limits: 100 req/day (free) · all plans include all endpoints
 *
 * All responses follow the standard api-sports envelope:
 * { get, parameters, errors, results, paging, response: [...] }
 *
 * League IDs (verify with GET /leagues if needed):
 *   UFC = 1 (confirmed from /leagues endpoint)
 */

const BASE_URL = 'https://api.mma.api-sports.io'

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
  /** ISO datetime string, e.g. "2024-04-13T23:00:00+00:00" */
  date: string
  event: {
    id: number
    name: string
    date: string  // "YYYY-MM-DD"
    city: string | null
    country: string | null
    venue: string | null
  }
  league: {
    id: number
    name: string
  }
  fighters: {
    first: ApiSportsFighterBasic
    second: ApiSportsFighterBasic
  }
  /** Number of scheduled rounds */
  rounds: number | null
  weight_class: {
    id: number
    name: string  // "Lightweight", "Welterweight", etc.
  } | null
  /** "Main Card" | "Prelims" | "Early Prelims" */
  card_segment: string | null
  /** "Scheduled" | "Finished" | "In Progress" | "Cancelled" | "Postponed" */
  status: string
  /** null if fight not yet finished */
  winner: { id: number; name: string } | null
  result: {
    type: string | null    // "KO/TKO" | "Submission" | "Decision" | "Draw" | "No Contest"
    details: string | null // e.g. "Punches" or "Rear Naked Choke"
    round: number | null
    clock: string | null   // e.g. "2:21"
  } | null
  /** Display order on the card (higher = more important) */
  position: number | null
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
  if (s === 'finished' || s === 'final') return 'completed'
  if (s === 'in progress' || s === 'inprogress') return 'live'
  if (s === 'cancelled' || s === 'canceled' || s === 'postponed') return 'cancelled'
  return 'upcoming'
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

export function normaliseFighter(f: ApiSportsFighterBasic | ApiSportsFighterDetail): NormalisedFighter {
  const detail = 'career' in f ? (f as ApiSportsFighterDetail) : null
  return {
    id: f.id,
    uuid: apiSportsIdToUuid(f.id, 'fighter'),
    name: f.name,
    nickname: f.nickname ?? null,
    image_url: f.image ?? null,
    nationality: f.nationality ?? null,
    flag_emoji: countryToFlag(f.nationality ?? null),
    birth_date: f.birth_date ?? null,
    height_cm: parseHeight(f.height ?? null),
    reach_cm: parseReach(f.reach ?? null),
    weight_class: null,  // set from fight context
    wins: f.record.wins,
    losses: f.record.losses,
    draws: f.record.draws,
    record: `${f.record.wins}-${f.record.losses}-${f.record.draws}`,
    striking_accuracy: detail?.career?.striking_accuracy ?? null,
    sig_str_landed: detail?.career?.significant_strikes_landed ?? null,
    td_avg: detail?.career?.takedown_avg ?? null,
    sub_avg: detail?.career?.submission_avg ?? null,
  }
}

export function normaliseFight(
  fight: ApiSportsFight,
  allFights: ApiSportsFight[],
): { fight: NormalisedFight; event: NormalisedEvent; f1: NormalisedFighter; f2: NormalisedFighter } {
  const f1 = normaliseFighter(fight.fighters.first)
  const f2 = normaliseFighter(fight.fighters.second)

  // Determine main event: highest position on the main card
  const maincardFights = allFights.filter(
    (f) => f.event.id === fight.event.id &&
           (f.card_segment?.toLowerCase().includes('main') ?? false)
  )
  const maxPos = maincardFights.reduce((max, f) => Math.max(max, f.position ?? 0), 0)
  const isMainEvent = (fight.card_segment?.toLowerCase().includes('main') ?? false)
    && (fight.position ?? 0) === maxPos
    && maxPos > 0

  const status = mapStatus(fight.status)
  let winnerUuid: string | null = null
  if (fight.winner?.id === fight.fighters.first.id) winnerUuid = f1.uuid
  else if (fight.winner?.id === fight.fighters.second.id) winnerUuid = f2.uuid

  const normFight: NormalisedFight = {
    id: fight.id,
    uuid: apiSportsIdToUuid(fight.id, 'fight'),
    event_uuid: apiSportsIdToUuid(fight.event.id, 'event'),
    fighter1_uuid: f1.uuid,
    fighter2_uuid: f2.uuid,
    fight_time: fight.date,
    status: status === 'cancelled' ? 'cancelled' : status,
    winner_uuid: status === 'completed' ? winnerUuid : null,
    method: mapResultType(fight.result?.type ?? null),
    round: fight.result?.round ?? null,
    time_of_finish: fight.result?.clock ?? null,
    weight_class: fight.weight_class?.name ?? null,
    card_segment: fight.card_segment ?? null,
    display_order: fight.position ?? 0,
    is_main_event: isMainEvent,
    is_title_fight: false,  // api-sports.io doesn't reliably flag title fights
  }

  // Determine event status from all fights in this event
  const eventFights = allFights.filter((f) => f.event.id === fight.event.id)
  const allDone = eventFights.every((f) => ['Finished', 'Cancelled'].includes(f.status))
  const anyLive = eventFights.some((f) => f.status === 'In Progress')
  const eventStatus: 'upcoming' | 'live' | 'completed' = allDone ? 'completed' : anyLive ? 'live' : 'upcoming'

  const normEvent: NormalisedEvent = {
    id: fight.event.id,
    uuid: apiSportsIdToUuid(fight.event.id, 'event'),
    name: fight.event.name,
    date: fight.date,   // earliest fight date — overwritten when grouping
    location: fight.event.city ?? null,
    venue: fight.event.venue ?? null,
    status: eventStatus,
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
      'x-rapidapi-host': 'api.mma.api-sports.io',
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

/**
 * Get all MMA fights for a date (YYYY-MM-DD).
 * Optionally filtered to UFC only (leagueId = UFC_LEAGUE_ID).
 */
export async function getFightsByDate(
  date: string,   // "YYYY-MM-DD"
  ufcOnly = true,
): Promise<ApiSportsFight[]> {
  const params: Record<string, string | number> = { date }
  if (ufcOnly) params['league'] = UFC_LEAGUE_ID
  return apiGet<ApiSportsFight>('/fights', params)
}

/**
 * Get all upcoming (not-started) UFC fights in a single call.
 * Returns fights with status NS (Not Started). Use to discover upcoming event dates
 * without needing to scan individual dates.
 */
export async function getUpcomingUFCFights(): Promise<ApiSportsFight[]> {
  return apiGet<ApiSportsFight>('/fights', { league: UFC_LEAGUE_ID, status: 'NS' })
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
