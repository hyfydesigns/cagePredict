import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert American odds to implied probability % */
export function oddsToImplied(odds: number): number {
  if (odds < 0) return Math.round((-odds / (-odds + 100)) * 100)
  return Math.round((100 / (odds + 100)) * 100)
}

/** Format American odds for display: -150 → "-150" / +130 → "+130" */
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`
}

/** Format a record "28-3-0" — hides draws if 0 */
export function formatRecord(wins: number, losses: number, draws: number): string {
  if (draws === 0) return `${wins}-${losses}`
  return `${wins}-${losses}-${draws}`
}

/** Win rate as percentage string */
export function winRate(correct: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((correct / total) * 100)}%`
}

/** Rank label based on position */
export function rankLabel(rank: number): string {
  if (rank === 1) return 'UFC Champion'
  if (rank <= 5) return 'Undisputed'
  if (rank <= 15) return 'Contender'
  if (rank <= 30) return 'Ranked'
  if (rank <= 100) return 'Prospect'
  return 'Amateur'
}

/** Rank badge colour */
export function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-400 border-amber-500/40 bg-amber-500/10'
  if (rank <= 5) return 'text-purple-400 border-purple-500/40 bg-purple-500/10'
  if (rank <= 15) return 'text-red-400 border-red-500/40 bg-red-500/10'
  if (rank <= 30) return 'text-orange-400 border-orange-500/40 bg-orange-500/10'
  return 'text-zinc-400 border-zinc-700 bg-zinc-800/50'
}

/** Time until a fight, formatted as countdown string */
export function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Now'
  const days = Math.floor(diff / 86_400_000)
  const hrs  = Math.floor((diff % 86_400_000) / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  if (days > 0) return `${days}d ${hrs}h`
  if (hrs > 0) return `${hrs}h ${mins}m`
  return `${mins}m`
}

/** Is a fight locked (< 5 min to start or already past) */
export function isFightLocked(fightTime: string): boolean {
  return new Date(fightTime).getTime() - Date.now() <= 5 * 60 * 1000
}

/** Generate a share URL for a crew invite */
export function crewInviteUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cagepredict.app'
  return `${base}/invite/${code}`
}

/** Short number display: 1234 → "1.2k" */
export function shortNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}
