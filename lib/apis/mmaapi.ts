/**
 * MMAAPI (fluis.lacasse) on RapidAPI — https://rapidapi.com/fluis.lacasse/api/mmaapi
 * Host: mmaapi.p.rapidapi.com
 * Uses the same RAPIDAPI_KEY env variable as the existing UFC sync.
 *
 * Tournament IDs are Sofascore organisation IDs:
 *   UFC        → 19906
 *   Bellator   → 19904  (post-2023 Bellator Champions Series may sit under PFL 19910)
 *   RIZIN      → 19905
 *   PFL        → 19910
 *   ONE        → 20269
 */

export const MMAAPI_HOST = 'mmaapi.p.rapidapi.com'

export interface PromotionTournament {
  /** Display name */
  name: string
  /** MMAAPI unique-tournament ID */
  id: number
  /** Regex to match event names belonging to this promotion */
  pattern: RegExp
}

/**
 * All promotions supported by MMAAPI.
 * Order matters — first match wins in getTournamentId().
 * Add new promotions here to automatically extend sync coverage.
 */
export const PROMOTION_TOURNAMENTS: PromotionTournament[] = [
  { name: 'UFC',      id: 19906, pattern: /\bufc\b/i },
  { name: 'Bellator', id: 19904, pattern: /\bbellator\b/i },
  { name: 'RIZIN',    id: 19905, pattern: /\brizin\b/i },
  { name: 'PFL',      id: 19910, pattern: /\bpfl\b/i },
  { name: 'ONE',      id: 20269, pattern: /\bone\s+(?:championship|fight|friday|fc|mma)\b|^one\s+/i },
]

/**
 * Returns the MMAAPI tournament ID for a given event name,
 * or null if the promotion is not covered by MMAAPI.
 */
export function getTournamentId(eventName: string): number | null {
  for (const { pattern, id } of PROMOTION_TOURNAMENTS) {
    if (pattern.test(eventName)) return id
  }
  return null
}

/**
 * Returns the promotion name for a given event name,
 * or null if not recognised.
 */
export function getPromotionName(eventName: string): string | null {
  for (const { pattern, name } of PROMOTION_TOURNAMENTS) {
    if (pattern.test(eventName)) return name
  }
  return null
}
