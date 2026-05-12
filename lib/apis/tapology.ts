/**
 * Unofficial Tapology API (via RapidAPI)
 * Host: unofficial-tapology-api.p.rapidapi.com
 * Uses the same RAPIDAPI_KEY as the existing MMA API.
 */

const HOST = 'unofficial-tapology-api.p.rapidapi.com'

export type TapologyFight = {
  fight: string        // "Fighter1 vs. Fighter2"
  outcome: string
  weight_class: string
  title_bout?: boolean
}

export type TapologyEvent = {
  organization: string  // "UFC Fight Night: Della Maddalena vs. Prates"
  main_event: string    // "Jack Della Maddalena vs. Carlos Prates"
  datetime: string      // "Saturday, May  2,  4:00 AM ET"
  fight_card: Record<string, TapologyFight>
}

/**
 * Parse month + day from Tapology's datetime string.
 * e.g. "Saturday, May  2,  4:00 AM ET" → { month: 5, day: 2 }
 */
export function parseTapologyDate(datetime: string): { month: number; day: number } | null {
  const months: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
    July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
  }
  const match = datetime.match(/(\w+)\s+(\d+),/)
  if (!match) return null
  const month = months[match[1]]
  const day   = parseInt(match[2], 10)
  return month ? { month, day } : null
}

async function fetchTapologyEvents(params: Record<string, string>): Promise<TapologyEvent[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return []

  const qs = new URLSearchParams({
    fields: 'organization,main_event,datetime,fight_card',
    past: 'false',
    page: '1',
    ...params,
  }).toString()

  try {
    const res = await fetch(`https://${HOST}/api/v2/events?${qs}`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.events ?? []) as TapologyEvent[]
  } catch {
    return []
  }
}

/**
 * Fetch all upcoming UFC events from the Tapology API.
 * Returns an empty array if RAPIDAPI_KEY is not configured or the request fails.
 */
export async function getUpcomingUFCEvents(): Promise<TapologyEvent[]> {
  return fetchTapologyEvents({ organization: 'UFC' })
}

/**
 * Fetch upcoming events for any organization (e.g. "MVP MMA", "Bellator").
 * Pass an empty string to get all upcoming events across all orgs.
 */
export async function getUpcomingEventsByOrg(organization: string): Promise<TapologyEvent[]> {
  return fetchTapologyEvents(organization ? { organization } : {})
}

/**
 * Search upcoming events for a keyword in the organization/event name.
 * Fetches up to 3 pages and returns events whose org name contains the keyword (case-insensitive).
 */
export async function searchUpcomingEvents(keyword: string): Promise<TapologyEvent[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return []

  const results: TapologyEvent[] = []
  const norm = keyword.toLowerCase()

  for (let page = 1; page <= 3; page++) {
    const qs = new URLSearchParams({
      fields: 'organization,main_event,datetime,fight_card',
      past: 'false',
      page: String(page),
    }).toString()

    try {
      const res = await fetch(`https://${HOST}/api/v2/events?${qs}`, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
        cache: 'no-store',
      })
      if (!res.ok) break
      const data = await res.json()
      const events: TapologyEvent[] = data.events ?? []
      if (!events.length) break
      for (const ev of events) {
        if (ev.organization.toLowerCase().includes(norm)) results.push(ev)
      }
    } catch {
      break
    }
  }

  return results
}
