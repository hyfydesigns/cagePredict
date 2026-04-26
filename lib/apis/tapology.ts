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

/**
 * Fetch all upcoming UFC events from the Tapology API.
 * Returns an empty array if RAPIDAPI_KEY is not configured or the request fails.
 */
export async function getUpcomingUFCEvents(): Promise<TapologyEvent[]> {
  const key = process.env.RAPIDAPI_KEY
  if (!key) return []

  const url =
    `https://${HOST}/api/v2/events` +
    `?fields=organization%2Cmain_event%2Cdatetime%2Cfight_card` +
    `&organization=UFC&past=false&page=1`

  try {
    const res = await fetch(url, {
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
