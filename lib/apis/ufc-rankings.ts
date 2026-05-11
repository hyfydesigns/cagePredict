/**
 * UFC.com rankings scraper
 *
 * Fetches the official UFC fighter rankings from ufc.com/rankings.
 * The page is server-rendered by Drupal — no JS execution required.
 * Rankings update weekly (Tuesday) so we cache for 6 hours.
 *
 * HTML structure (verified May 2026):
 *
 *  <div class="view-grouping-header">Lightweight</div>
 *  <table>
 *    <caption>
 *      <div class="rankings--athlete--champion clearfix">
 *        <h4>Lightweight</h4>
 *        <h5><a href="/athlete/ilia-topuria">Ilia Topuria</a></h5>
 *        <h6><span class="text">Champion</span></h6>   ← absent for P4P
 *      </div>
 *    </caption>
 *    <tbody>
 *      <tr>
 *        <td class="views-field views-field-weight-class-rank">1</td>
 *        <td class="views-field views-field-title"><a href="/athlete/arman-tsarukyan">Arman Tsarukyan</a></td>
 *        <td class="views-field views-field-weight-class-rank-change"></td>
 *      </tr>
 *      ...
 *    </tbody>
 *  </table>
 */

const UFC_RANKINGS_URL = 'https://www.ufc.com/rankings'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CACHE_6H = { next: { revalidate: 21600 } } as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UfcRankedFighter {
  rank:       number        // 0 = champion
  name:       string
  slug:       string        // /athlete/islam-makhachev → "islam-makhachev"
  isChampion: boolean
  isInterim:  boolean
}

export interface UfcDivisionRankings {
  division:  string         // "Lightweight", "Men's Pound-for-Pound Top Rank", etc.
  isPap:     boolean        // true for pound-for-pound rankings
  champion:  UfcRankedFighter | null
  ranked:    UfcRankedFighter[]   // #1–#15 contenders
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

function extractSlug(href: string): string {
  return href.replace(/^\/athlete\//, '').trim()
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseRankings(html: string): UfcDivisionRankings[] {
  const divisions: UfcDivisionRankings[] = []

  // Split the page into per-division blocks.
  // Each block starts with a view-grouping-header and contains a table.
  const blockRx = /<div class="view-grouping-header">([\s\S]*?)<\/div>\s*<div class="view-grouping-content">([\s\S]*?)(?=<div class="view-grouping-header">|$)/g
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockRx.exec(html)) !== null) {
    const headerHtml = blockMatch[1]
    const bodyHtml   = blockMatch[2]

    const division = decodeEntities(stripTags(headerHtml))
    if (!division) continue

    const isPap = /pound.for.pound/i.test(division)

    // ── Champion ─────────────────────────────────────────────────────────────
    // <h5><a href="/athlete/slug">Name</a></h5>
    // <h6><span class="text">Champion</span></h6>  ← present for weight-class champs
    const champM = bodyHtml.match(/<h5><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h5>/)
    const isChampLabel = /<h6>[\s\S]*?Champion[\s\S]*?<\/h6>/i.test(bodyHtml)
    const isInterimLabel = /<h6>[\s\S]*?Interim[\s\S]*?<\/h6>/i.test(bodyHtml)

    // For P4P rankings the <h5> just repeats the #1 ranked fighter — skip it
    // as a separate "champion" row since they already appear in the ranked list.
    let champion: UfcRankedFighter | null = null
    if (champM && !isPap) {
      champion = {
        rank:       0,
        name:       decodeEntities(champM[2].trim()),
        slug:       extractSlug(champM[1]),
        isChampion: isChampLabel,
        isInterim:  isInterimLabel && !isChampLabel,
      }
    }

    // ── Ranked contenders ─────────────────────────────────────────────────────
    // Each row: rank cell → title cell (anchor)
    const ranked: UfcRankedFighter[] = []
    const rowRx = /<td class="views-field views-field-weight-class-rank">\s*(\d+)\s*<\/td>[\s\S]*?<td class="views-field views-field-title"><a href="([^"]+)"[^>]*>([^<]+)<\/a>/g
    let rowMatch: RegExpExecArray | null

    while ((rowMatch = rowRx.exec(bodyHtml)) !== null) {
      ranked.push({
        rank:       parseInt(rowMatch[1], 10),
        name:       decodeEntities(rowMatch[3].trim()),
        slug:       extractSlug(rowMatch[2]),
        isChampion: false,
        isInterim:  false,
      })
    }

    divisions.push({ division, isPap, champion, ranked })
  }

  return divisions
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchUfcRankings(): Promise<UfcDivisionRankings[]> {
  try {
    const res = await fetch(UFC_RANKINGS_URL, {
      headers: { 'User-Agent': UA },
      ...CACHE_6H,
    })
    if (!res.ok) return []
    const html = await res.text()
    return parseRankings(html)
  } catch {
    return []
  }
}
