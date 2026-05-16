/**
 * Bookmaker configuration for odds display and affiliate links.
 *
 * To add affiliate links: replace `url` with your tracking URL for each book.
 * The `key` field matches The Odds API bookmaker keys so odds data lines up automatically.
 *
 * Example affiliate URL (DraftKings):
 *   https://sportsbook.draftkings.com/...?sourceId=YOUR_AFFILIATE_ID
 *
 * Books are shown in the order listed here. US books first, then international.
 * Only books present in this list get a branded display name — unknown keys fall
 * back to the raw API key string but still render as clickable rows.
 */

export interface Bookmaker {
  /** Matches The Odds API `bookmaker.key` — used to look up stored odds_by_book data */
  key: string
  /** Display name shown in the UI */
  name: string
  /** Homepage or affiliate tracking URL. Swap in your affiliate link when ready. */
  url: string
}

export const BOOKMAKERS: Bookmaker[] = [
  // ── US books ──────────────────────────────────────────────────────────────
  { key: 'draftkings',      name: 'DraftKings',  url: 'https://sportsbook.draftkings.com/sports/mma' },
  { key: 'fanduel',         name: 'FanDuel',     url: 'https://sportsbook.fanduel.com/mma' },
  { key: 'betmgm',          name: 'BetMGM',      url: 'https://sports.betmgm.com/en/sports/mma-7' },
  { key: 'betrivers',       name: 'BetRivers',   url: 'https://betrivers.com/sports/mma' },
  { key: 'caesars',         name: 'Caesars',     url: 'https://sportsbook.caesars.com/us/mma' },
  { key: 'espnbet',         name: 'ESPN Bet',    url: 'https://espnbet.com/sport/mma' },
  { key: 'williamhill_us',  name: 'WH (US)',     url: 'https://www.williamhill.com/us/sports/mma' },
  { key: 'betonlineag',     name: 'BetOnline',   url: 'https://www.betonline.ag/sportsbook/mma' },
  { key: 'bovada',          name: 'Bovada',      url: 'https://www.bovada.lv/sports/mma' },
  { key: 'betus',           name: 'BetUS',       url: 'https://www.betus.com.pa/sports/mma' },
  { key: 'betanysports',    name: 'BetAnySports',url: 'https://www.betanysports.eu/sports/mma' },
  // ── UK / Europe ───────────────────────────────────────────────────────────
  { key: 'pinnacle',        name: 'Pinnacle',    url: 'https://www.pinnacle.com/en/mma/matchups' },
  { key: 'williamhill',     name: 'William Hill',url: 'https://sports.williamhill.com/betting/en-gb/mma' },
  { key: 'betfair_ex_uk',   name: 'Betfair',     url: 'https://www.betfair.com/sport/mma' },
  { key: 'betfair_sb_uk',   name: 'Betfair SB',  url: 'https://www.betfair.com/sport/mma' },
  { key: 'paddypower',      name: 'Paddy Power', url: 'https://www.paddypower.com/fight-sports' },
  { key: 'betway',          name: 'Betway',      url: 'https://betway.com/en/sports/grp/mma' },
  { key: 'unibet_uk',       name: 'Unibet',      url: 'https://www.unibet.co.uk/betting/sports/mma' },
  { key: 'unibet',          name: 'Unibet',      url: 'https://www.unibet.com/betting/sports/mma' },
  { key: 'leovegas',        name: 'LeoVegas',    url: 'https://www.leovegas.com/en-gb/sport/mma' },
  { key: 'grosvenor',       name: 'Grosvenor',   url: 'https://www.grosvenorsport.com/sports/mma' },
  { key: 'virginbet',       name: 'Virgin Bet',  url: 'https://www.virginbet.com/sports/mma' },
  { key: 'livescorebet',    name: 'LiveScore',   url: 'https://www.livescorebet.com/sports/mma' },
  { key: 'betsson',         name: 'Betsson',     url: 'https://www.betsson.com/en/mma' },
  { key: 'nordicbet',       name: 'NordicBet',   url: 'https://www.nordicbet.com/en/sports/mma' },
  { key: 'matchbook',       name: 'Matchbook',   url: 'https://www.matchbook.com/sport/mma' },
  { key: 'onexbet',         name: '1xBet',       url: 'https://1xbet.com/en/line/mma' },
  { key: 'coolbet',         name: 'Coolbet',     url: 'https://coolbet.com/en/sports/mma' },
  // ── Australia ─────────────────────────────────────────────────────────────
  { key: 'sportsbet',       name: 'Sportsbet',   url: 'https://www.sportsbet.com.au/betting/mma' },
  { key: 'tab',             name: 'TAB',         url: 'https://www.tab.com.au/sports/mma' },
  { key: 'tabtouch',        name: 'TABtouch',    url: 'https://www.tabtouch.com.au' },
  { key: 'neds',            name: 'Neds',        url: 'https://www.neds.com.au/sports/mma' },
  { key: 'ladbrokes_au',    name: 'Ladbrokes',   url: 'https://www.ladbrokes.com.au/sports/mma' },
  { key: 'pointsbetau',     name: 'PointsBet',   url: 'https://pointsbet.com.au/sports/mma' },
  { key: 'betr_au',         name: 'Betr',        url: 'https://betr.com.au/sports/mma' },
  { key: 'betright',        name: 'Betright',    url: 'https://betright.com.au/sports/mma' },
  { key: 'playup',          name: 'PlayUp',      url: 'https://www.playup.com.au/sports/mma' },
]

/** Lookup a bookmaker by its Odds API key */
export function getBookmaker(key: string): Bookmaker | undefined {
  return BOOKMAKERS.find((b) => b.key === key)
}

/**
 * The primary bookmaker used for the top-level odds display on fight cards.
 * Whichever book is listed first in BOOKMAKERS is the default.
 */
export const DEFAULT_BOOKMAKER: Bookmaker = BOOKMAKERS[0]

/**
 * Bookmakers shown on fight cards by default.
 * The Admin panel lets you override this list via the app_settings table.
 * Add more keys here to change the fallback when no DB setting is present.
 */
export const FEATURED_BOOKMAKER_KEYS: string[] = ['draftkings', 'fanduel', 'bovada']

/** Pre-filtered bookmaker objects for the featured keys above */
export const FEATURED_BOOKMAKERS: Bookmaker[] = BOOKMAKERS.filter((b) =>
  FEATURED_BOOKMAKER_KEYS.includes(b.key),
)
