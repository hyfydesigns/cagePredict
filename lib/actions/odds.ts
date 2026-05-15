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
  const url = new URL('https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/')
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('regions', 'us')
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

  // 3. Match each DB fight to an API event and update
  const now = new Date().toISOString()
  let synced = 0

  for (const fight of fights) {
    const f1 = fight.fighter1 as unknown as { id: string; name: string }
    const f2 = fight.fighter2 as unknown as { id: string; name: string }
    if (!f1 || !f2) continue

    // Find the API event that matches this fight
    const match = apiEvents.find(
      (ev) =>
        (nameMatches(f1.name, ev.home_team) && nameMatches(f2.name, ev.away_team)) ||
        (nameMatches(f2.name, ev.home_team) && nameMatches(f1.name, ev.away_team)),
    )
    if (!match) continue

    // Determine which API side is which DB fighter
    const f1IsHome = nameMatches(f1.name, match.home_team)
    const apiNameF1 = f1IsHome ? match.home_team : match.away_team
    const apiNameF2 = f1IsHome ? match.away_team : match.home_team

    const newOddsF1 = bestOdds(match.bookmakers, apiNameF1)
    const newOddsF2 = bestOdds(match.bookmakers, apiNameF2)

    if (!newOddsF1 || !newOddsF2) continue

    // Collect per-bookmaker lines
    const oddsMap = collectBookOdds(match.bookmakers, apiNameF1, apiNameF2)

    // Build history snapshot
    const snapshot: OddsSnapshot = { ts: now, odds_f1: newOddsF1, odds_f2: newOddsF2 }
    const existingHistory: OddsSnapshot[] = Array.isArray(fight.odds_history) ? (fight.odds_history as OddsSnapshot[]) : []

    // Keep max 50 snapshots
    const updatedHistory = [...existingHistory, snapshot].slice(-50)

    // Opening odds: only set once (when null)
    const openF1 = fight.odds_f1_open ?? newOddsF1
    const openF2 = fight.odds_f2_open ?? newOddsF2

    const { error: updateErr } = await supabase
      .from('fights')
      .update({
        odds_f1:      newOddsF1,
        odds_f2:      newOddsF2,
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
