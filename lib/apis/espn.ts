/**
 * ESPN unofficial API — no key required.
 *
 * Used as a fallback to enrich fighter stats when RapidAPI returns null/missing values.
 * Endpoints are undocumented and may change, so all calls fail gracefully.
 *
 * Search:  site.api.espn.com/apis/search/v2?query={name}&limit=5&type=player
 * Profile: sports.core.api.espn.com/v2/sports/mma/athletes/{id}
 * Stats:   sports.core.api.espn.com/v2/sports/mma/athletes/{id}/statistics
 * Records: sports.core.api.espn.com/v2/sports/mma/athletes/{id}/records
 */

const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/mma'
const SEARCH_URL = 'https://site.api.espn.com/apis/search/v2'

export type EspnFighterData = {
  espn_id:           string
  striking_accuracy: number | null
  sig_str_landed:    number | null
  td_avg:            number | null
  sub_avg:           number | null
  wins:              number | null
  losses:            number | null
  draws:             number | null
  weight_class:      string | null
  height_cm:         number | null
  reach_cm:          number | null
  image_url:         string | null
}

async function safeFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

/** Find an ESPN athlete ID by fighter name. Returns null if not found. */
export async function findEspnAthleteId(name: string): Promise<{ id: string; imageUrl: string | null } | null> {
  const data = await safeFetch(
    `${SEARCH_URL}?query=${encodeURIComponent(name)}&limit=5&type=player`,
  )
  if (!data) return null

  const players = data.results?.find((r: any) => r.type === 'player')?.contents ?? []
  if (!players.length) return null

  // Normalise names for matching — strip diacritics, lowercase, letters only
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

  const target = norm(name)

  // Prefer an exact normalised match; fall back to the first MMA result
  const best =
    players.find((p: any) => norm(p.displayName ?? '') === target && p.sport === 'mma') ??
    players.find((p: any) => p.sport === 'mma') ??
    players[0]

  if (!best) return null

  // uid format: "s:3301~a:4684751" — extract the numeric part after ~a:
  const uid: string = best.uid ?? ''
  const id = uid.split('~a:')[1] ?? null
  if (!id) return null

  const imageUrl: string | null = best.image?.default ?? null
  return { id, imageUrl }
}

/** Fetch full fighter data from ESPN given a numeric athlete ID. */
export async function getEspnFighterById(espnId: string): Promise<EspnFighterData | null> {
  const [profile, statsRaw, recordsRaw] = await Promise.all([
    safeFetch(`${CORE_BASE}/athletes/${espnId}?lang=en&region=us`),
    safeFetch(`${CORE_BASE}/athletes/${espnId}/statistics?lang=en&region=us`),
    safeFetch(`${CORE_BASE}/athletes/${espnId}/records?lang=en&region=us`),
  ])

  if (!profile) return null

  // ── Stats ─────────────────────────────────────────────────────────────────
  const generalStats: any[] =
    statsRaw?.splits?.categories?.find((c: any) => c.name === 'general')?.stats ?? []

  const getStat = (key: string): number | null => {
    const s = generalStats.find((s: any) => s.name === key)
    return s?.value != null ? Number(s.value) : null
  }

  // ── Records ───────────────────────────────────────────────────────────────
  const record = recordsRaw?.items?.[0]
  const getRecord = (key: string): number | null => {
    const s = record?.stats?.find((s: any) => s.name === key)
    return s?.value != null ? Number(s.value) : null
  }

  // ── Physical ──────────────────────────────────────────────────────────────
  // ESPN stores height in inches, reach in inches — convert to cm
  const heightCm = profile.height ? Math.round(profile.height * 2.54) : null
  const reachIn  = Number(profile.reach ?? 0)
  const reachCm  = reachIn > 0 ? Math.round(reachIn * 2.54) : null

  const weightClass: string | null = profile.weightClass?.text ?? null

  return {
    espn_id:           espnId,
    striking_accuracy: getStat('strikeAccuracy'),
    sig_str_landed:    getStat('strikeLPM'),
    td_avg:            getStat('takedownAvg'),
    sub_avg:           getStat('submissionAvg'),
    wins:              getRecord('wins'),
    losses:            getRecord('losses'),
    draws:             getRecord('draws'),
    weight_class:      weightClass,
    height_cm:         heightCm,
    reach_cm:          reachCm,
    image_url:         profile.images?.[0]?.href ?? null,
  }
}

/**
 * Look up a fighter by name and return enrichment data.
 * Returns null if ESPN doesn't have the fighter or the request fails.
 */
export async function enrichFighterFromEspn(name: string): Promise<EspnFighterData | null> {
  const found = await findEspnAthleteId(name)
  if (!found) return null
  const data = await getEspnFighterById(found.id)
  if (data && !data.image_url) data.image_url = found.imageUrl
  return data
}
