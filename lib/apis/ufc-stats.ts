/**
 * ufcstats.com scraper
 *
 * Provides fighter career stats and fight history from the UFC's official stats site.
 * No API key required — public HTML, fetched with a browser User-Agent.
 *
 * Verified HTML structure (from live pages, April 2026):
 *
 * Stats are in <li class="b-list__box-list-item ...">
 *   <i class="b-list__box-item-title ...">SLpM:</i>
 *   3.06
 * </li>
 * → Pattern: LABEL:[^<]*<\/i>\s*(value)
 *
 * Fight history rows: <tr class="...js-fight-details-click" data-link="...">
 *   col 0: W/L  via b-flag__text content (win|loss|draw|nc)
 *   col 1: Fighters — two <p> elements, first = self, second = opponent
 *   cols 2-5: KD, STR, TD, SUB stats (skipped)
 *   col 6: Event — <a href="event-details/...">Name</a> + <p>date</p>
 *   col 7: Method — <p>TYPE</p><p>detail</p>
 *   col 8: Round
 *   col 9: Time
 */

const BASE     = 'http://www.ufcstats.com'
const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CACHE_1D = { next: { revalidate: 86400 } } as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UFCStatsFighterStats {
  // Physical
  height_cm:      number | null
  reach_cm:       number | null
  age:            number | null
  fighting_style: string | null   // stance: Orthodox | Southpaw | Switch
  // Career averages
  slpm:           number | null   // sig strikes landed per min
  str_acc:        number | null   // striking accuracy %
  td_avg:         number | null   // takedowns per 15 min
  sub_avg:        number | null   // submission attempts per 15 min
}

export interface UFCStatsFight {
  result:     'W' | 'L' | 'D' | 'NC'
  opponent:   string
  eventName:  string | null
  date:       string | null       // "Aug. 23, 2015"
  method:     string | null       // e.g. "SUB (Armbar)" or "KO (Punches)"
  round:      number | null
  time:       string | null
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, ...CACHE_1D })
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

/** Extract the numeric value after a labeled <i> tag.
 *  HTML: <i class="...">SLpM:</i>\n\n3.06\n
 *  → pass label="SLpM:" → returns 3.06
 */
function extractNum(html: string, label: string): number | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m   = html.match(new RegExp(esc + '[^<]*<\\/i>\\s*([\\d.]+)'))
  return m ? parseFloat(m[1]) : null
}

/** Extract a percentage value (returns the number, not the string with %). */
function extractPct(html: string, label: string): number | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m   = html.match(new RegExp(esc + '[^<]*<\\/i>\\s*(\\d+)%'))
  return m ? parseFloat(m[1]) : null
}

/** Extract a plain text value after a labeled <i> tag, trimmed. */
function extractText(html: string, label: string): string | null {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m   = html.match(new RegExp(esc + '[^<]*<\\/i>\\s*([^\\n<]+)'))
  const raw = m?.[1]?.trim()
  return raw && raw !== '--' ? raw : null
}

/** `5' 7"` → cm */
function parseFtIn(s: string): number | null {
  const m = s.match(/(\d+)'\s*(\d+)[""]?/)
  if (!m) return null
  return Math.round(parseInt(m[1]) * 30.48 + parseInt(m[2]) * 2.54)
}

/** `68"` or `68.0"` → cm */
function parseInches(s: string): number | null {
  const m = s.match(/([\d.]+)[""]/)
  if (!m) return null
  return Math.round(parseFloat(m[1]) * 2.54)
}

// ─── Fighter search ───────────────────────────────────────────────────────────

/**
 * Normalise a name for comparison: strip diacritics, lowercase, keep letters+spaces only.
 * "Álvarez" → "alvarez", "José" → "jose", "Da Silva" → "da silva"
 */
function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Common name suffixes that UFCStats never includes in the last-name cell. */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/**
 * Find a fighter on ufcstats.com by full name.
 * Returns the detail-page URL (http://www.ufcstats.com/fighter-details/HEXID) or null.
 *
 * Strategy:
 *  1. Strip common suffixes (Jr., Sr., II, III) from the name — UFCStats never indexes by these.
 *  2. Fetch /statistics/fighters?char={lastNameFirstLetter}&page=N&action=Search
 *     The letter is taken from the diacritic-stripped last name so "Álvarez" → char=a.
 *  3. Scan rows for exact first+last name match (diacritic-stripped, case-insensitive).
 *  4. Return the href from the first-name anchor tag.
 */
export async function findFighterUrl(name: string): Promise<string | null> {
  let parts = name.trim().split(/\s+/)
  if (parts.length < 2) return null

  // Drop trailing suffixes so "John Smith Jr." → ["John", "Smith"]
  while (parts.length > 2 && NAME_SUFFIXES.has(normName(parts[parts.length - 1]).replace(/\./g, ''))) {
    parts = parts.slice(0, -1)
  }

  const firstName = normName(parts.slice(0, -1).join(' '))
  const lastName  = normName(parts[parts.length - 1])
  const letter    = lastName[0]  // now always ASCII a-z

  for (let page = 1; page <= 25; page++) {
    const url  = `${BASE}/statistics/fighters?char=${letter}&page=${page}&action=Search`
    const html = await fetchHtml(url)
    if (!html) break

    // Each data row has class b-statistics__table-row and td cells b-statistics__table-col
    // Cell 0: first name (anchor)
    // Cell 1: last name (anchor, same href)
    const rowRx = /<tr[^>]*b-statistics__table-row[^>]*>([\s\S]*?)<\/tr>/g
    let   match: RegExpExecArray | null
    let   hasDataRows = false

    while ((match = rowRx.exec(html)) !== null) {
      const row = match[1]
      // Must contain a fighter-details link
      const linkM = row.match(/href="(http:\/\/www\.ufcstats\.com\/fighter-details\/[^"]+)"/)
      if (!linkM) continue
      hasDataRows = true

      // Extract all anchor text values in this row
      const anchors = [...row.matchAll(/<a[^>]*>\s*([^<]*?)\s*<\/a>/g)].map((m) => m[1].trim())
      if (anchors.length < 2) continue

      // Normalise row names the same way so diacritics match on either side
      const rowFirst = normName(anchors[0])
      const rowLast  = normName(anchors[1])

      if (rowFirst === firstName && rowLast === lastName) {
        return linkM[1]
      }
    }

    if (!hasDataRows) break
    if (!html.includes('b-statistics__table-row')) break
  }

  return null
}

// ─── Fighter stats ────────────────────────────────────────────────────────────

/**
 * Fetch career stats and physical measurements from a ufcstats fighter detail page.
 * Pass the full URL returned by findFighterUrl().
 */
export async function getFighterStats(detailUrl: string): Promise<UFCStatsFighterStats> {
  const empty: UFCStatsFighterStats = {
    height_cm: null, reach_cm: null, age: null, fighting_style: null,
    slpm: null, str_acc: null, td_avg: null, sub_avg: null,
  }

  const html = await fetchHtml(detailUrl)
  if (!html) return empty

  // ── Physical stats ──────────────────────────────────────────────────────────
  const heightStr = extractText(html, 'Height:')
  const reachStr  = extractText(html, 'Reach:')
  const stanceStr = extractText(html, 'STANCE:')
  const dobStr    = extractText(html, 'DOB:')

  const height_cm = heightStr ? parseFtIn(heightStr) : null
  const reach_cm  = reachStr  ? parseInches(reachStr) : null
  const fighting_style = stanceStr ?? null

  let age: number | null = null
  if (dobStr) {
    // Format: "May 30, 1979"
    const yearM = dobStr.match(/(\d{4})$/)
    if (yearM) age = new Date().getFullYear() - parseInt(yearM[1])
  }

  // ── Career stats ────────────────────────────────────────────────────────────
  // Labels verified from live ufcstats.com pages:
  //   SLpM:, Str. Acc.:, SApM:, Str. Def:, TD Avg.:, TD Acc.:, TD Def.:, Sub. Avg.:
  const slpm    = extractNum(html, 'SLpM:')
  const str_acc = extractPct(html, 'Str. Acc.:')
  const td_avg  = extractNum(html, 'TD Avg.:')
  const sub_avg = extractNum(html, 'Sub. Avg.:')

  return { height_cm, reach_cm, age, fighting_style, slpm, str_acc, td_avg, sub_avg }
}

// ─── Fighter fight history ────────────────────────────────────────────────────

/**
 * Extract the complete fight history from a ufcstats fighter detail page.
 * The first fighter in column 2 is always the searched fighter; the second is the opponent.
 * Fights are returned in reverse-chronological order (newest first).
 */
export async function getFighterHistory(detailUrl: string): Promise<UFCStatsFight[]> {
  const html = await fetchHtml(detailUrl)
  if (!html) return []

  const fights: UFCStatsFight[] = []

  // Match fight history rows
  const rowRx = /<tr[^>]*js-fight-details-click[^>]*>([\s\S]*?)<\/tr>/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRx.exec(html)) !== null) {
    const row = rowMatch[1]

    // ── Result ──────────────────────────────────────────────────────────────
    // b-flag_style_green = win, b-flag_style_bordered = loss, b-flag_style_mixed = draw/NC
    // Also extractable from b-flag__text content
    const resultM = row.match(/b-flag__text">\s*(win|loss|draw|nc)\s*</)
    if (!resultM) continue
    const raw = resultM[1].toLowerCase()
    const result: UFCStatsFight['result'] =
      raw === 'win'  ? 'W' :
      raw === 'loss' ? 'L' :
      raw === 'nc'   ? 'NC' : 'D'

    // ── Opponent (second fighter link in the fighters column) ───────────────
    const fighterLinks = [
      ...row.matchAll(/fighter-details\/[a-f0-9]+[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)
    ]
    const opponent = fighterLinks[1]?.[1]?.trim() ?? null
    if (!opponent) continue  // can't identify opponent, skip

    // ── Event name + date ───────────────────────────────────────────────────
    const eventM = row.match(/event-details\/[^"]+[^>]*>\s*([^<]+?)\s*<\/a>/)
    const eventName = eventM?.[1]?.trim() ?? null

    // Date appears as text in a <p> after the event link
    // Format: "Aug. 23, 2015"
    const dateM = row.match(/event-details\/[^<]+<\/a>[\s\S]*?<p[^>]*>\s*([A-Z][a-z]+\.\s+\d+,\s+\d{4})\s*<\/p>/)
    const date = dateM?.[1]?.trim() ?? null

    // ── Method ──────────────────────────────────────────────────────────────
    // Cell has two <p>: type (KO/TKO/SUB/DEC) and detail (Punches/Armbar/etc.)
    // We extract both and combine: "SUB (Armbar)" or "KO (Punches)"
    const methodCellM = row.match(
      /l-page_align_left[^>]*>[\s\S]*?<p[^>]*>\s*(KO|TKO|SUB|DEC|U-DEC|S-DEC|M-DEC|CNC|NC|DRAW|Overturned|Could Not Continue)\s*<\/p>[\s\S]*?<p[^>]*>\s*([^<]*?)\s*<\/p>/
    )
    let method: string | null = null
    if (methodCellM) {
      const type   = methodCellM[1].trim()
      const detail = methodCellM[2].trim()
      method = detail && detail !== '--' ? `${type} (${detail})` : type
    }

    // ── Round ───────────────────────────────────────────────────────────────
    // Last two simple-numeric <p> cells are Round and Time
    const numericParts = [...row.matchAll(/<p[^>]*>\s*(\d+)\s*<\/p>/g)]
    const round = numericParts.length > 0
      ? parseInt(numericParts[numericParts.length - 1][1])
      : null

    // ── Time ────────────────────────────────────────────────────────────────
    const timeM = row.match(/<p[^>]*>\s*(\d:\d{2})\s*<\/p>/)
    const time  = timeM?.[1] ?? null

    fights.push({ result, opponent, eventName, date, method, round, time })
  }

  return fights
}

// ─── Win-by breakdown ─────────────────────────────────────────────────────────

export interface WinBreakdown {
  ko_tko_wins: number
  sub_wins:    number
  dec_wins:    number
}

/**
 * Counts career wins by method from a UFCStats fight history array.
 * Method strings look like "KO (Punches)", "TKO (Punches)", "SUB (Armbar)",
 * "U-DEC", "S-DEC", "M-DEC", "DEC", etc.
 */
export function calcWinBreakdown(fights: UFCStatsFight[]): WinBreakdown {
  let ko_tko_wins = 0
  let sub_wins    = 0
  let dec_wins    = 0

  for (const f of fights) {
    if (f.result !== 'W' || !f.method) continue
    const m = f.method.toUpperCase()
    if (m.startsWith('KO') || m.startsWith('TKO')) ko_tko_wins++
    else if (m.startsWith('SUB'))                   sub_wins++
    else if (m.includes('DEC'))                     dec_wins++
  }

  return { ko_tko_wins, sub_wins, dec_wins }
}

// ─── Convenience: find + fetch in one call ────────────────────────────────────

export interface UFCStatsData extends UFCStatsFighterStats {
  fights: UFCStatsFight[]
  sourceUrl: string | null
}

export async function getUFCStatsData(name: string): Promise<UFCStatsData> {
  const empty: UFCStatsData = {
    height_cm: null, reach_cm: null, age: null, fighting_style: null,
    slpm: null, str_acc: null, td_avg: null, sub_avg: null,
    fights: [], sourceUrl: null,
  }

  const url = await findFighterUrl(name)
  if (!url) return empty

  const [stats, fights] = await Promise.all([
    getFighterStats(url),
    getFighterHistory(url),
  ])

  return { ...stats, fights, sourceUrl: url }
}
