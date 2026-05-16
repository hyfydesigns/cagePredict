'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

/** A single odds snapshot stored in history */
export interface OddsSnapshot {
  ts: string       // ISO timestamp
  odds_f1: number  // American odds for fighter 1
  odds_f2: number  // American odds for fighter 2
}

// ─── The Odds API ────────────────────────────────────────────────────────────

interface OddsApiOutcome {
  name: string
  price: number
}

interface OddsApiBookmaker {
  key: string
  title: string
  markets: Array<{
    key: string
    outcomes: OddsApiOutcome[]
  }>
}

interface OddsApiEvent {
  id: string
  sport_key: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: OddsApiBookmaker[]
}

/** Normalise a fighter name for fuzzy matching (lowercase, remove accents, strip non-alpha) */
function normName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

/** Simple last-name match: does needle's last word appear in haystack? */
function nameMatches(dbName: string, apiName: string): boolean {
  const db  = normName(dbName)
  const api = normName(apiName)
  if (db === api) return true
  const dbLast  = db.split(' ').pop()  ?? db
  const apiLast = api.split(' ').pop() ?? api
  return dbLast === apiLast || db.includes(apiLast) || api.includes(dbLast)
}

/** Pick the best American odds from the bookmakers list (prefer DraftKings → FanDuel → first available) */
function bestOdds(
  bookmakers: OddsApiBookmaker[],
  fighterName: string,
): number | null {
  const priority = ['draftkings', 'fanduel', 'betmgm', 'pointsbet']
  const sorted = [
    ...bookmakers.filter((b) => priority.includes(b.key)),
    ...bookmakers.filter((b) => !priority.includes(b.key)),
  ]

  for (const bk of sorted) {
    const h2h = bk.markets.find((m) => m.key === 'h2h')
    if (!h2h) continue
    const outcome = h2h.outcomes.find((o) => nameMatches(fighterName, o.name))
    if (outcome) return outcome.price
  }
  return null
}

/** Per-bookmaker odds shape stored in fights.odds_by_book */
export interface BookOdds {
  odds_f1: number
  odds_f2: number
}

/**
 * Collect odds for every bookmaker that has a line on this fight.
 * Returns a map of bookmaker key → { odds_f1, odds_f2 }.
 * Only includes books that have lines for BOTH fighters.
 */
function collectBookOdds(
  bookmakers: OddsApiBookmaker[],
  f1Name: string,
  f2Name: string,
): Record<string, BookOdds> {
  const result: Record<string, BookOdds> = {}
  for (const bk of bookmakers) {
    const h2h = bk.markets.find((m) => m.key === 'h2h')
    if (!h2h) continue
    const o1 = h2h.outcomes.find((o) => nameMatches(f1Name, o.name))
    const o2 = h2h.outcomes.find((o) => nameMatches(f2Name, o.name))
    if (o1 && o2) result[bk.key] = { odds_f1: o1.price, odds_f2: o2.price }
  }
  return result
}

// ─── Kalshi prediction market ────────────────────────────────────────────────

interface KalshiMarket {
  ticker:             string
  yes_sub_title:      string   // fighter name on the YES side
  no_sub_title:       string   // fighter name on the NO side
  last_price_dollars: string   // last traded price  (0.00–1.00)
  yes_bid_dollars:    string   // current best bid for YES
  yes_ask_dollars:    string   // current best ask for YES
  status:             string   // open | closed | settled | …
}

/**
 * Mid-price of the YES side (average of best bid and best ask).
 * Falls back to last traded price when bid/ask are missing or zero.
 */
function kalshiMidPrice(market: KalshiMarket): number {
  const bid  = parseFloat(market.yes_bid_dollars)
  const ask  = parseFloat(market.yes_ask_dollars)
  const last = parseFloat(market.last_price_dollars)
  if (bid > 0 && ask > 0) return (bid + ask) / 2
  return last
}

/**
 * Convert a Kalshi probability (0.0–1.0) to American odds.
 * p > 0.5 → negative (favourite), p < 0.5 → positive (underdog).
 */
function kalshiPriceToAmerican(p: number): number {
  // clamp so we never divide by 0 or produce nonsense
  const clamped = Math.max(0.01, Math.min(0.99, p))
  if (clamped > 0.5) return -Math.round((clamped / (1 - clamped)) * 100)
  if (clamped < 0.5) return  Math.round(((1 - clamped) / clamped) * 100)
  return -100
}

/**
 * Fetch all active UFC fight markets from Kalshi.
 * No API key required — the endpoint is public.
 * Kalshi creates TWO markets per fight (one YES contract per fighter),
 * so a 10-fight card returns ~20 markets.
 * Returns an empty array on any network or parse error.
 */
async function fetchKalshiMarkets(): Promise<KalshiMarket[]> {
  try {
    const url = new URL('https://external-api.kalshi.com/trade-api/v2/markets')
    url.searchParams.set('series_ticker', 'KXUFCFIGHT')
    // Kalshi uses "open" as the query-param value for active/live markets
    url.searchParams.set('status', 'open')
    url.searchParams.set('limit', '500')

    const res = await fetch(url.toString(), { next: { revalidate: 0 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.markets ?? []) as KalshiMarket[]
  } catch {
    return []
  }
}

/**
 * Find Kalshi odds for a fighter pair.
 *
 * Kalshi structure: each fight gets TWO separate binary markets —
 *   "Will [Fighter A] win?" (YES = A wins)
 *   "Will [Fighter B] win?" (YES = B wins)
 *
 * So we look for each fighter's own YES market and read the mid-price
 * directly from it. If only one fighter's market is found we derive
 * the other from 1 - p (less accurate but still useful).
 */
function matchKalshi(
  markets: KalshiMarket[],
  f1Name: string,
  f2Name: string,
): { odds_f1: number; odds_f2: number } | null {
  // Each fighter has their own market where they are the YES side
  const f1Market = markets.find((m) => nameMatches(f1Name, m.yes_sub_title))
  const f2Market = markets.find((m) => nameMatches(f2Name, m.yes_sub_title))

  if (!f1Market && !f2Market) return null

  // Use each fighter's own market price; derive the other if missing
  let p1 = f1Market ? kalshiMidPrice(f1Market) : null
  let p2 = f2Market ? kalshiMidPrice(f2Market) : null

  if (p1 === null && p2 !== null) p1 = 1 - p2
  if (p2 === null && p1 !== null) p2 = 1 - p1

  if (p1 === null || p2 === null) return null
  // Clamp — shouldn't normally be needed but guards against bad data
  p1 = Math.max(0.01, Math.min(0.99, p1))
  p2 = Math.max(0.01, Math.min(0.99, p2))

  return {
    odds_f1: kalshiPriceToAmerican(p1),
    odds_f2: kalshiPriceToAmerican(p2),
  }
}

// ─── Debug: inspect raw API response ─────────────────────────────────────────

/**
 * Fetch the raw Odds API response and return a summary of what bookmakers
 * and fighter names it contains for MMA. Useful for diagnosing missing books.
 */
export async function debugOddsApi(): Promise<{
  error?: string
  fights: { home: string; away: string; books: string[] }[]
  rawBookmakerKeys: string[]
}> {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return { error: 'ODDS_API_KEY not set', fights: [], rawBookmakerKeys: [] }

  const url = new URL('https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/')
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('regions', 'us,uk,eu,au')  // expand regions to see all available books
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      return { error: `API error ${res.status}: ${text.slice(0, 300)}`, fights: [], rawBookmakerKeys: [] }
    }
    const apiEvents: OddsApiEvent[] = await res.json()

    const allBookKeys = new Set<string>()
    const fights = apiEvents.map((ev) => {
      const books = ev.bookmakers.map((b) => { allBookKeys.add(b.key); return b.key })
      return { home: ev.home_team, away: ev.away_team, books }
    })

    return { fights, rawBookmakerKeys: [...allBookKeys].sort() }
  } catch (e) {
    return { error: String(e), fights: [], rawBookmakerKeys: [] }
  }
}

// ─── Main sync action ────────────────────────────────────────────────────────

export async function syncEventOdds(eventId: string): Promise<{ error?: string; synced?: number; message?: string }> {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return { error: 'ODDS_API_KEY environment variable is not set' }

  // 1. Load fights for this event (with fighter names)
  const supabase = await createServiceClient()
  const { data: fights, error: dbErr } = await supabase
    .from('fights')
    .select(`
      id,
      odds_f1, odds_f2,
      odds_f1_open, odds_f2_open,
      odds_history,
      fighter1:fighters!fighter1_id ( id, name ),
      fighter2:fighters!fighter2_id ( id, name )
    `)
    .eq('event_id', eventId)
    .neq('status', 'completed')

  if (dbErr) return { error: dbErr.message }
  if (!fights || fights.length === 0) return { error: 'No active fights found for this event' }

  // 2. Fetch odds from The Odds API
  // Use all regions so we capture UK/EU/AU books too — important for non-UFC events
  // (MVP MMA, Bellator, PFL) where US bookmakers often don't offer lines.
  const url = new URL('https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/')
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('regions', 'us,uk,eu,au')
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')

  let apiEvents: OddsApiEvent[]
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } })
    if (!res.ok) {
      const text = await res.text()
      return { error: `Odds API error ${res.status}: ${text.slice(0, 200)}` }
    }
    apiEvents = await res.json()
  } catch (e) {
    return { error: `Network error fetching odds: ${String(e)}` }
  }

  // 3. Fetch Kalshi markets in parallel (no API key required, best-effort)
  const kalshiMarkets = await fetchKalshiMarkets()

  // 4. Match each DB fight to an API event and update
  const now = new Date().toISOString()
  let synced = 0

  for (const fight of fights) {
    const f1 = fight.fighter1 as unknown as { id: string; name: string }
    const f2 = fight.fighter2 as unknown as { id: string; name: string }
    if (!f1 || !f2) continue

    // ── The Odds API: find the matching event ────────────────────────────────
    const match = apiEvents.find(
      (ev) =>
        (nameMatches(f1.name, ev.home_team) && nameMatches(f2.name, ev.away_team)) ||
        (nameMatches(f2.name, ev.home_team) && nameMatches(f1.name, ev.away_team)),
    )

    let oddsApiF1: number | null = null
    let oddsApiF2: number | null = null
    const oddsMap: Record<string, BookOdds> = {}

    if (match) {
      const f1IsHome = nameMatches(f1.name, match.home_team)
      const apiNameF1 = f1IsHome ? match.home_team : match.away_team
      const apiNameF2 = f1IsHome ? match.away_team : match.home_team

      oddsApiF1 = bestOdds(match.bookmakers, apiNameF1)
      oddsApiF2 = bestOdds(match.bookmakers, apiNameF2)

      // Collect all per-bookmaker lines from The Odds API
      const fromApi = collectBookOdds(match.bookmakers, apiNameF1, apiNameF2)
      Object.assign(oddsMap, fromApi)
    }

    // ── Kalshi: match by fighter name (no auth required) ────────────────────
    const kalshiLine = matchKalshi(kalshiMarkets, f1.name, f2.name)
    if (kalshiLine) oddsMap['kalshi'] = kalshiLine

    // ── Resolve best "main" odds ─────────────────────────────────────────────
    // Prefer The Odds API (real sportsbook lines); fall back to Kalshi prices.
    const finalF1 = oddsApiF1 ?? kalshiLine?.odds_f1 ?? null
    const finalF2 = oddsApiF2 ?? kalshiLine?.odds_f2 ?? null

    if (!finalF1 || !finalF2) continue   // no source has odds for this fight

    // ── Build history snapshot ───────────────────────────────────────────────
    const snapshot: OddsSnapshot = { ts: now, odds_f1: finalF1, odds_f2: finalF2 }
    const existingHistory: OddsSnapshot[] = Array.isArray(fight.odds_history)
      ? (fight.odds_history as OddsSnapshot[])
      : []
    const updatedHistory = [...existingHistory, snapshot].slice(-50)

    // Opening odds: only set once (when null/0)
    const openF1 = fight.odds_f1_open ?? finalF1
    const openF2 = fight.odds_f2_open ?? finalF2

    const { error: updateErr } = await supabase
      .from('fights')
      .update({
        odds_f1:      finalF1,
        odds_f2:      finalF2,
        odds_f1_open: openF1,
        odds_f2_open: openF2,
        odds_history: updatedHistory,
        odds_by_book: Object.keys(oddsMap).length > 0 ? oddsMap : null,
      })
      .eq('id', fight.id)

    if (!updateErr) synced++
  }

  revalidatePath('/')
  revalidatePath('/admin')

  return {
    synced,
    message: synced > 0
      ? `Synced odds for ${synced} fight${synced !== 1 ? 's' : ''}`
      : 'No matching fights found in The Odds API — they may not be listed yet',
  }
}
