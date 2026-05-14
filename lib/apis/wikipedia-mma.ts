/**
 * Wikipedia MMA fight-results scraper
 *
 * Wikipedia articles for major MMA events are updated within minutes of each
 * fight finishing, making them a reliable real-time fallback for promotions
 * that aren't covered by api-sports or RapidAPI (e.g. MVP MMA, Bellator, PFL).
 *
 * Table structure on completed events (same for all MMA articles):
 *
 *  <table class="toccolours">
 *    <tr>                                 ← header row (Weight class / Method / Round / Time)
 *    <tr>                                 ← one row per fight
 *      <td>Weight class</td>
 *      <td><a>Fighter 1</a></td>          ← WINNER when fight is done
 *      <td>def.</td>                      ← "def." = complete, "vs." = upcoming
 *      <td><a>Fighter 2</a></td>          ← LOSER when fight is done
 *      <td>Method (detail)</td>
 *      <td>Round</td>
 *      <td>Time</td>
 *      <td>Notes</td>
 *    </tr>
 *  </table>
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WikipediaFightResult {
  /** Name exactly as it appears in the Wikipedia article */
  winnerName:  string
  loserName:   string
  weightClass: string | null
  method:      string | null   // e.g. "TKO (punches)", "Decision (unanimous)"
  round:       number | null
  time:        string | null   // "MM:SS"
  isDraw:      boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#039;/g, "'")
    .trim()
}

/** Extract visible text from an anchor tag or plain td */
function extractName(td: string): string {
  const anchorMatch = td.match(/<a[^>]*>([^<]+)<\/a>/)
  const text = anchorMatch ? anchorMatch[1] : stripTags(td)
  return decodeEntities(text)
}

/**
 * Normalise a method string from Wikipedia into a canonical form.
 * e.g. "TKO (elbows and punches)" → "TKO"
 *       "Decision (unanimous) (48–47, 49–46, 49–46)" → "Decision (Unanimous)"
 */
function normaliseMethod(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (/^KO/i.test(s))                         return 'KO'
  if (/^TKO/i.test(s))                         return 'TKO'
  if (/submission/i.test(s))                    return 'Submission'
  if (/decision.*unanimous/i.test(s))           return 'Decision (Unanimous)'
  if (/decision.*split/i.test(s))               return 'Decision (Split)'
  if (/decision.*majority/i.test(s))            return 'Decision (Majority)'
  if (/decision/i.test(s))                      return 'Decision'
  if (/draw/i.test(s))                          return 'Draw'
  if (/no\s*contest/i.test(s))                  return 'No Contest'
  if (/disqualification|DQ/i.test(s))           return 'Disqualification'
  if (/RTD/i.test(s))                           return 'RTD'
  return s.slice(0, 50) || null
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseWikipediaFightCard(html: string): WikipediaFightResult[] {
  const results: WikipediaFightResult[] = []

  // Find all toccolours tables (Wikipedia uses this class for MMA fight cards)
  const tableRx = /<table[^>]*class="[^"]*toccolours[^"]*"[^>]*>([\s\S]*?)<\/table>/gi
  let tableMatch: RegExpExecArray | null

  while ((tableMatch = tableRx.exec(html)) !== null) {
    const tableBody = tableMatch[1]

    // Split into rows, skip header rows (th elements only)
    const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let rowMatch: RegExpExecArray | null

    while ((rowMatch = rowRx.exec(tableBody)) !== null) {
      const row = rowMatch[1]
      // Skip header rows (contain <th> but no fight data)
      if (!/<td/i.test(row)) continue

      // Extract all <td> cells
      const cells: string[] = []
      const cellRx = /<td[^>]*>([\s\S]*?)<\/td>/gi
      let cellMatch: RegExpExecArray | null
      while ((cellMatch = cellRx.exec(row)) !== null) {
        cells.push(cellMatch[1])
      }

      if (cells.length < 4) continue

      const weightClass = decodeEntities(stripTags(cells[0]))
      const f1Cell      = cells[1]
      const vsCell      = decodeEntities(stripTags(cells[2]))
      const f2Cell      = cells[3]
      const methodCell  = cells[4] ?? ''
      const roundCell   = cells[5] ?? ''
      const timeCell    = cells[6] ?? ''

      const f1Name = extractName(f1Cell)
      const f2Name = extractName(f2Cell)

      if (!f1Name || !f2Name) continue

      const isComplete = vsCell.toLowerCase().includes('def.')
      const isDraw     = vsCell.toLowerCase().includes('draw') ||
                         normaliseMethod(decodeEntities(stripTags(methodCell)))?.toLowerCase().includes('draw') ||
                         false

      if (!isComplete && !isDraw) continue  // upcoming fight — skip

      const method  = normaliseMethod(decodeEntities(stripTags(methodCell)))
      const roundRaw = decodeEntities(stripTags(roundCell))
      const round   = roundRaw ? parseInt(roundRaw, 10) || null : null
      const time    = decodeEntities(stripTags(timeCell)) || null

      results.push({
        // In Wikipedia, when "def." is used, fighter1 = winner, fighter2 = loser.
        // For draws both columns list fighters in their original order.
        winnerName:  f1Name,
        loserName:   f2Name,
        weightClass: weightClass || null,
        method,
        round,
        time,
        isDraw,
      })
    }
  }

  return results
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and parse a Wikipedia MMA event article.
 * Pass the article title as it appears in the URL, e.g.
 * "MVP_MMA:_Rousey_vs._Carano" or "UFC_314"
 *
 * Returns an empty array if the page is unavailable or has no completed fights.
 */
export async function fetchWikipediaFightResults(
  articleTitle: string,
): Promise<WikipediaFightResult[]> {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle).replace(/%20/g, '_')}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const html = await res.text()
    return parseWikipediaFightCard(html)
  } catch {
    return []
  }
}
