/**
 * Sherdog.com scraper — historical fight records
 *
 * Sherdog has covered MMA since 1997 and carries complete career records
 * including pre-UFC fights, regional bouts, and full method details
 * (e.g. "TKO (Spinning Back Kick and Punches)" vs just "TKO").
 *
 * Verified HTML structure (from live pages, April 2026):
 *
 * Search results: https://www.sherdog.com/stats/fightfinder?SearchTxt=Name
 *   <tr onclick="document.location='/fighter/Jon-Jones-27944';">
 *     <td><a href="/fighter/Jon-Jones-27944">Jon Jones</a></td>
 *     ...
 *   </tr>
 *
 * Fighter page: https://www.sherdog.com/fighter/Jon-Jones-27944
 *   <div class="module fight_history">
 *     <table class="new_table fighter">
 *       <tr>
 *         <td><span class="final_result win">win</span></td>
 *         <td><a href="/fighter/Name-ID">Opponent Name</a></td>
 *         <td>
 *           <a href="/events/..."><span itemprop="award">Event Name</span></a>
 *           <br/><span class="sub_line">Nov / 16 / 2024</span>
 *         </td>
 *         <td class="winby"><b>TKO (Spinning Back Kick and Punches)</b></td>
 *         <td>3</td>    <!-- Round -->
 *         <td>4:29</td> <!-- Time -->
 *       </tr>
 *     </table>
 *   </div>
 *
 * Note: Tapology is preferred by accuracy but returns 403. Sherdog is the
 * next-best freely accessible source.
 */

const BASE     = 'https://www.sherdog.com'
const UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CACHE_1D = { next: { revalidate: 86400 } } as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SherdogFight {
  result:      'W' | 'L' | 'D' | 'NC'
  opponent:    string
  opponentUrl: string | null   // relative Sherdog URL e.g. "/fighter/Name-ID"
  eventName:   string | null
  /** Format: "Nov / 16 / 2024" as returned by Sherdog */
  date:        string | null
  /** Formatted date as ISO "YYYY-MM-DD" (null if unparseable) */
  dateIso:     string | null
  /** Full method string: "TKO (Spinning Back Kick and Punches)" */
  method:      string | null
  round:       number | null
  time:        string | null
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

/** Parse Sherdog date "Nov / 16 / 2024" → ISO "2024-11-16" */
function parseDateIso(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/([A-Z][a-z]+)\s*\/\s*(\d+)\s*\/\s*(\d{4})/)
  if (!m) return null
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const mm = months[m[1]]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`
}

// ─── Fighter search ───────────────────────────────────────────────────────────

/**
 * Find a fighter on Sherdog by full name.
 * Returns the relative URL ("/fighter/Jon-Jones-27944") or null.
 *
 * Searches /stats/fightfinder and looks for an exact name match
 * (case-insensitive) across paginated results.
 */
export async function findFighterUrl(name: string): Promise<string | null> {
  const searchName = name.trim().toLowerCase()
  const encoded    = encodeURIComponent(name.trim())

  // Sherdog search paginates at ~20 results per page
  for (let page = 1; page <= 5; page++) {
    const url  = `${BASE}/stats/fightfinder?SearchTxt=${encoded}&page=${page}`
    const html = await fetchHtml(url)
    if (!html) break

    // Parse each result row as a unit so path and name stay aligned.
    // Row format:
    //   <tr onclick="document.location='/fighter/Jon-Jones-27944';">
    //     <td>...</td>
    //     <td><a href="/fighter/Jon-Jones-27944">Jon Jones</a></td>
    //   </tr>
    const rowRx = /document\.location='(\/fighter\/[^']+)';[\s\S]*?<\/tr>/g
    const rows: { path: string; name: string }[] = []

    let m: RegExpExecArray | null
    while ((m = rowRx.exec(html)) !== null) {
      const path     = m[1]
      const rowHtml  = m[0]
      const nameM    = rowHtml.match(/href="\/fighter\/[^"]+">([^<]+)<\/a>/)
      const rowName  = nameM?.[1]?.trim()
      if (rowName) rows.push({ path, name: rowName })
    }

    // 1. Exact match
    const exact = rows.find((r) => r.name.toLowerCase() === searchName)
    if (exact) return exact.path

    // 2. Partial match — handles "Conor McGregor" vs "Conor Anthony McGregor"
    const partial = rows.find((r) => {
      const rn = r.name.toLowerCase()
      return rn.includes(searchName) || searchName.includes(rn)
    })
    if (partial) return partial.path

    // No more pages if fewer than 20 results
    if (rows.length < 20) break
  }

  return null
}

// ─── Fight history ────────────────────────────────────────────────────────────

/**
 * Fetch a fighter's complete professional fight history from Sherdog.
 * Requires the relative URL from findFighterUrl() or a known Sherdog path.
 * Returns fights in reverse-chronological order (newest first).
 */
export async function getFighterHistory(sherdogPath: string): Promise<SherdogFight[]> {
  const url  = sherdogPath.startsWith('http') ? sherdogPath : `${BASE}${sherdogPath}`
  const html = await fetchHtml(url)
  if (!html) return []

  // The fight history section
  const historyM = html.match(/<div[^>]*class="module fight_history">([\s\S]*?)<\/div>\s*<\/div>/)
  if (!historyM) return []
  const section = historyM[1]

  const fights: SherdogFight[] = []

  // Each fight is a <tr> (skip the header row which has class "table_head")
  const rowRx = /<tr(?![^>]*table_head)>([\s\S]*?)<\/tr>/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRx.exec(section)) !== null) {
    const row = rowMatch[1]

    // ── Result ──────────────────────────────────────────────────────────────
    // <span class="final_result win">win</span>
    // <span class="final_result loss">loss</span>
    // <span class="final_result draw">draw</span>
    // <span class="final_result no contest">no contest</span>
    const resultM = row.match(/final_result[^"]*">([^<]+)<\/span>/)
    if (!resultM) continue
    const rawResult = resultM[1].toLowerCase().trim()
    const result: SherdogFight['result'] =
      rawResult === 'win'                          ? 'W' :
      rawResult === 'loss'                         ? 'L' :
      rawResult.includes('contest') || rawResult === 'nc' ? 'NC' : 'D'

    // ── Opponent ─────────────────────────────────────────────────────────────
    // <td><a href="/fighter/Name-ID">Opponent Full Name</a></td>
    const opponentM = row.match(/href="(\/fighter\/[^"]+)">([^<]+)<\/a>/)
    const opponentUrl = opponentM?.[1] ?? null
    const opponent    = opponentM?.[2]?.trim() ?? null
    if (!opponent) continue

    // ── Event ────────────────────────────────────────────────────────────────
    // <a href="/events/..."><span itemprop="award">Event Name</span></a>
    // <br /><span class="sub_line">Nov / 16 / 2024</span>
    const eventM    = row.match(/itemprop="award">([^<]+)<\/span>/)
    const eventName = eventM?.[1]?.trim() ?? null

    const dateM  = row.match(/class="sub_line">\s*([^<]+?)\s*<\/span>/)
    const date   = dateM?.[1]?.trim() ?? null
    const dateIso = parseDateIso(date)

    // ── Method ───────────────────────────────────────────────────────────────
    // <td class="winby"><b>TKO (Spinning Back Kick and Punches)</b>...</td>
    const methodM = row.match(/class="winby"><b>([^<]+)<\/b>/)
    const method  = methodM?.[1]?.trim() ?? null

    // ── Round ────────────────────────────────────────────────────────────────
    // After the method cell, two <td> cells: round number and time
    // We look for the last <td>N</td> before a time pattern
    const roundM = row.match(/<td>(\d+)<\/td>\s*<td>[\d:]+<\/td>/)
    const round  = roundM ? parseInt(roundM[1]) : null

    // ── Time ─────────────────────────────────────────────────────────────────
    const timeM = row.match(/<td>(\d:\d{2})<\/td>/)
    const time  = timeM?.[1] ?? null

    fights.push({ result, opponent, opponentUrl, eventName, date, dateIso, method, round, time })
  }

  return fights
}

// ─── Convenience: find + fetch in one call ────────────────────────────────────

export interface SherdogData {
  fights:    SherdogFight[]
  sourceUrl: string | null
}

export async function getSherdogData(name: string): Promise<SherdogData> {
  const path = await findFighterUrl(name)
  if (!path) return { fights: [], sourceUrl: null }

  const fights = await getFighterHistory(path)
  return { fights, sourceUrl: `${BASE}${path}` }
}
