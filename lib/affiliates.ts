/**
 * Bookmaker configuration for odds display and affiliate links.
 *
 * To add affiliate links: replace `url` with your tracking URL for each book.
 * The `key` field matches The Odds API bookmaker keys so odds data lines up automatically.
 *
 * Example affiliate URL (DraftKings):
 *   https://sportsbook.draftkings.com/...?sourceId=YOUR_AFFILIATE_ID
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
  { key: 'draftkings', name: 'DraftKings', url: 'https://sportsbook.draftkings.com/sports/mma' },
  { key: 'fanduel',    name: 'FanDuel',    url: 'https://sportsbook.fanduel.com/mma' },
  { key: 'betmgm',     name: 'BetMGM',     url: 'https://sports.betmgm.com/en/sports/mma-7' },
  { key: 'pointsbet',  name: 'PointsBet',  url: 'https://pointsbet.com/sports/mma' },
  { key: 'caesars',    name: 'Caesars',    url: 'https://sportsbook.caesars.com/us/mma' },
  { key: 'espnbet',    name: 'ESPN Bet',   url: 'https://espnbet.com/sport/mma' },
  { key: 'bet365',     name: 'Bet365',     url: 'https://www.bet365.com/#/AS/B17/' },
  { key: 'williamhill_us', name: 'WH',     url: 'https://www.williamhill.com/us/sports/mma' },
]

/** Lookup a bookmaker by its Odds API key */
export function getBookmaker(key: string): Bookmaker | undefined {
  return BOOKMAKERS.find((b) => b.key === key)
}

/**
 * The primary bookmaker used for the top-level odds display on fight cards
 * (fighter portrait odds chip, main moneyline).
 * Whichever book is listed first in BOOKMAKERS is the default.
 */
export const DEFAULT_BOOKMAKER: Bookmaker = BOOKMAKERS[0]
