import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  isConfigured as isApiSportsConfigured,
  getFightsByDate,
  apiSportsIdToUuid,
  uuidToApiSportsId,
  UFC_LEAGUE_ID,
} from '@/lib/apis/api-sports'

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Offset a YYYY-MM-DD string by ±N days */
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z') // noon UTC avoids DST edge cases
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Convert a RapidAPI integer ID to a deterministic UUID (legacy) */
function rapidApiIdToUuid(id: number, type: 'fighter' | 'event' | 'fight'): string {
  const prefix = type === 'fighter' ? '1' : type === 'event' ? '2' : '3'
  const padded = String(id).padStart(12, '0')
  return `00000000-0000-000${prefix}-0000-${padded}`
}

function mapMethod(winType: string): string {
  const map: Record<string, string> = {
    UD: 'Decision (Unanimous)', SD: 'Decision (Split)', MD: 'Decision (Majority)',
    TKO: 'TKO', KO: 'KO', SUB: 'Submission', DQ: 'Disqualification', NC: 'No Contest', RTD: 'RTD',
  }
  return map[winType] ?? winType
}

/** Normalise a fighter name for fuzzy matching — strips diacritics, lowercases, removes non-letters. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

function mapResultType(type: string | null): string | null {
  if (!type) return null
  const map: Record<string, string> = {
    'KO/TKO': 'KO/TKO',
    'KO': 'KO',
    'TKO': 'TKO',
    'Submission': 'Submission',
    'Decision': 'Decision',
    'Unanimous Decision': 'Decision (Unanimous)',
    'Split Decision': 'Decision (Split)',
    'Majority Decision': 'Decision (Majority)',
    'Draw': 'Draw',
    'No Contest': 'No Contest',
    'DQ': 'Disqualification',
    'RTD': 'RTD',
  }
  return map[type] ?? type
}

export type SyncResultsOutput = {
  success: boolean
  synced: number
  errors: string[]
  log: string[]
  skipped: string[]
  checkedAt: string
  provider: 'api-sports' | 'rapidapi'
  error?: string
}

// ─── api-sports.io sync ───────────────────────────────────────────────────────

async function syncViaApiSports(
  liveEvents: any[],
  supabase: ReturnType<typeof createServiceClient>,
  log: string[],
  errors: string[],
  skipped: string[],
): Promise<{ synced: number; rateLimited: boolean }> {
  let synced = 0
  let rateLimited = false

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []
    const d     = new Date(event.date)
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    // Determine whether this is a UFC event so we can apply the right filter.
    // Non-UFC events (e.g. MVP MMA, Bellator) are matched against ALL fights
    // returned for that date — api-sports covers all MMA organisations.
    const isUfcEvent = /ufc/i.test(event.name)

    log.push(`[api-sports] Checking ${event.name} (${dbFights.length} DB fights) for ${dateStr} [${isUfcEvent ? 'UFC' : 'non-UFC — all orgs'}]`)

    let apiFights: Awaited<ReturnType<typeof getFightsByDate>>
    try {
      // Try the stored date first; if it returns nothing, also try ±1 day
      // (handles timezone offsets introduced during import)
      const datesToTry = [dateStr, offsetDate(dateStr, -1), offsetDate(dateStr, 1)]
      let foundFights: typeof apiFights = []

      for (const tryDate of datesToTry) {
        const allFights = await getFightsByDate(tryDate, false)

        let relevantFights: typeof allFights
        if (isUfcEvent) {
          // UFC: filter to UFC bouts only to avoid false name matches from other orgs on same day
          relevantFights = allFights.filter(
            (f: any) =>
              f.league?.id === UFC_LEAGUE_ID ||
              f.league?.name?.toLowerCase().includes('ufc') ||
              f.event?.name?.toLowerCase().includes('ufc') ||
              f.slug?.toLowerCase().includes('ufc') ||
              f.competition?.name?.toLowerCase().includes('ufc') ||
              f.tournament?.name?.toLowerCase().includes('ufc') ||
              // Last resort: if no discriminating field at all, include everything
              (!f.league && !f.event && !f.slug)
          )
          log.push(`  [${tryDate}] ${allFights.length} total, ${relevantFights.length} UFC`)
        } else {
          // Non-UFC: use all fights — then name-match against this event's DB fighters
          // to avoid picking up UFC bouts that happen on the same day.
          const dbNames = new Set(
            dbFights.flatMap((f: any) => [
              norm(f.fighter1?.name ?? ''),
              norm(f.fighter2?.name ?? ''),
            ]).filter(Boolean)
          )
          relevantFights = allFights.filter((f: any) => {
            const n1 = norm(f.fighters?.first?.name  ?? '')
            const n2 = norm(f.fighters?.second?.name ?? '')
            return dbNames.has(n1) || dbNames.has(n2)
          })
          log.push(`  [${tryDate}] ${allFights.length} total, ${relevantFights.length} matched to ${event.name}`)
          if (allFights.length > 0 && relevantFights.length === 0) {
            const sample = allFights[0]
            log.push(`  Sample fight: ${sample.fighters?.first?.name} vs ${sample.fighters?.second?.name} | slug=${sample.slug ?? 'none'}`)
          }
        }

        if (relevantFights.length > 0) {
          foundFights = relevantFights
          break
        }
      }
      apiFights = foundFights
    } catch (e: any) {
      if (e.message?.toLowerCase().includes('request limit') || e.message?.toLowerCase().includes('rate limit')) {
        rateLimited = true
        log.push(`  ⚠ api-sports daily limit reached — will fall back to RapidAPI`)
        break
      }
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    for (const apiFight of apiFights) {
      const fightUuid = apiSportsIdToUuid(apiFight.id, 'fight')
      const f1Name    = apiFight.fighters.first?.name ?? 'TBA'
      const f2Name    = apiFight.fighters.second?.name ?? 'TBA'

      // Primary match: by UUID (api-sports imported events)
      let dbFight = dbFights.find((f: any) => f.id === fightUuid)

      // Fallback 1: full name match (handles RapidAPI-imported events where
      // UUIDs use a different prefix and will never match directly)
      if (!dbFight) {
        const f1n = norm(f1Name)
        const f2n = norm(f2Name)
        dbFight = dbFights.find((f: any) => {
          const d1 = norm(f.fighter1?.name ?? '')
          const d2 = norm(f.fighter2?.name ?? '')
          return (d1 === f1n && d2 === f2n) || (d1 === f2n && d2 === f1n)
        })
        if (dbFight) {
          log.push(`  Name-matched ${f1Name} vs ${f2Name} → DB fight ${dbFight.id}`)
        }
      }

      // Fallback 2: last-name-only match — catches cases where APIs disagree on
      // first names (e.g. "Joaquin" vs "J.J.", accent variants, middle names).
      // Only used when there is exactly one candidate to avoid false positives.
      if (!dbFight) {
        const lastName = (s: string) => norm(s.trim().split(/\s+/).pop() ?? s)
        const f1l = lastName(f1Name)
        const f2l = lastName(f2Name)
        const candidates = dbFights.filter((f: any) => {
          const d1l = lastName(f.fighter1?.name ?? '')
          const d2l = lastName(f.fighter2?.name ?? '')
          return (d1l === f1l && d2l === f2l) || (d1l === f2l && d2l === f1l)
        })
        if (candidates.length === 1) {
          dbFight = candidates[0]
          log.push(`  Last-name-matched ${f1Name} vs ${f2Name} → DB fight ${dbFight.id}`)
        }
      }

      if (!dbFight) {
        skipped.push(`No DB match for api-sports fight ${apiFight.id} (${f1Name} vs ${f2Name})`)
        continue
      }

      // status is { long, short } object in new api-sports format (or null)
      const statusLong = (typeof apiFight.status === 'object' && apiFight.status !== null
        ? apiFight.status.long ?? apiFight.status.short ?? ''
        : String(apiFight.status ?? '')).toLowerCase()
      const isFinished  = ['finished', 'final', 'fin'].includes(statusLong)
      const isCancelled = ['cancelled', 'canceled', 'postponed', 'canc'].includes(statusLong)
      // Any non-empty status that isn't finished/cancelled/not-started means the fight is in progress
      const notStartedStatuses = ['', 'ns', 'not started', 'scheduled', 'tbd']
      const isInProgress = !isFinished && !isCancelled && !!statusLong && !notStartedStatuses.includes(statusLong)
      const method     = mapResultType(apiFight.result?.type ?? null)
      const round      = apiFight.result?.round ?? null
      const clockTime  = apiFight.result?.clock ?? null

      if (isCancelled && dbFight.status !== 'cancelled') {
        const { error } = await supabase.from('fights').update({ status: 'cancelled' }).eq('id', dbFight.id)
        if (error) errors.push(`cancel(${dbFight.id}): ${error.message}`)
        else log.push(`✗ ${f1Name} vs ${f2Name} → cancelled`)
        continue
      }

      if (dbFight.status === 'completed') {
        log.push(`  ⏭ ${f1Name} vs ${f2Name} already completed`)
        continue
      }

      // Fight is currently in progress (walkouts, round 1, etc.) — mark as live in DB
      // so the "Fighting Now" indicator on the front-end picks it up immediately.
      if (isInProgress) {
        if (dbFight.status !== 'live') {
          const { error } = await supabase.from('fights').update({ status: 'live' }).eq('id', dbFight.id)
          if (error) errors.push(`live(${dbFight.id}): ${error.message}`)
          else log.push(`🥊 ${f1Name} vs ${f2Name} → marked LIVE (api status: "${statusLong}")`)
        } else {
          log.push(`  ⏳ ${f1Name} vs ${f2Name} — status: "${statusLong}" (already live in DB)`)
        }
        continue
      }

      if (!isFinished) {
        log.push(`  ⏳ ${f1Name} vs ${f2Name} — status: "${statusLong}"`)
        continue
      }

      // Determine winner UUID (draw / no contest = null winner)
      // New format: fighters.first.winner / fighters.second.winner booleans
      // Legacy format: apiFight.winner object
      const resultType = apiFight.result?.type?.toLowerCase() ?? ''
      // Only treat as draw when result type explicitly says so — never infer a draw
      // from missing winner flags, which can happen when api-sports finishes indexing.
      const isDraw = resultType.includes('draw') || resultType.includes('no contest')

      let winnerUuid: string | null = null
      if (!isDraw) {
        // New format: use winner boolean flags
        if (apiFight.fighters.first?.winner) {
          const apiWinnerName = apiFight.fighters.first.name
          // Always resolve to a DB fighter UUID — never use an api-sports UUID as
          // the winner, because fights imported from RapidAPI use a different UUID prefix
          // and complete_fight() would mark the wrong winner.
          winnerUuid = norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)
            ? dbFight.fighter1?.id
            : norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)
              ? dbFight.fighter2?.id
              : dbFight.fighter1?.id  // positional fallback: first ≈ fighter1
        } else if (apiFight.fighters.second?.winner) {
          const apiWinnerName = apiFight.fighters.second.name
          winnerUuid = norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)
            ? dbFight.fighter2?.id
            : norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)
              ? dbFight.fighter1?.id
              : dbFight.fighter2?.id  // positional fallback: second ≈ fighter2
        } else if (apiFight.winner) {
          // Legacy format fallback
          const apiWinnerName = apiFight.winner.name
          if (norm(dbFight.fighter1?.name ?? '') === norm(apiWinnerName)) {
            winnerUuid = dbFight.fighter1?.id
          } else if (norm(dbFight.fighter2?.name ?? '') === norm(apiWinnerName)) {
            winnerUuid = dbFight.fighter2?.id
          } else {
            // Can't determine winner — skip and let next cron run retry
            errors.push(`Cannot resolve winner for ${f1Name} vs ${f2Name}: api winner="${apiWinnerName}" doesn't match either DB fighter`)
            continue
          }
        } else {
          // Winner flags not yet populated — api-sports may still be processing.
          // Skip this fight; next cron run (2 min) will retry once flags are set.
          log.push(`  ⏳ ${f1Name} vs ${f2Name} — finished but winner not yet determined, will retry`)
          continue
        }
      }

      const dbFightId = dbFight.id  // use actual DB fight ID (may differ from fightUuid if name-matched)

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  dbFightId,
        p_winner_id: winnerUuid,
        p_method:    isDraw ? (method ?? 'Draw') : method,
        p_round:     round,
        p_time:      clockTime,
      } as any)

      if (rpcErr) {
        errors.push(`complete_fight(${dbFightId}): ${rpcErr.message}`)
      } else {
        synced++
        const winner = isDraw ? 'Draw' : apiFight.winner?.name ?? '?'
        log.push(`✓ ${f1Name} vs ${f2Name} → ${winner} (${method ?? 'unknown'}, R${round ?? '?'})`)
      }
    }
  }

  return { synced, rateLimited }
}

// ─── RapidAPI sync (legacy fallback) ─────────────────────────────────────────

async function syncViaRapidApi(
  liveEvents: any[],
  supabase: ReturnType<typeof createServiceClient>,
  log: string[],
  errors: string[],
  skipped: string[],
): Promise<number> {
  const key  = process.env.RAPIDAPI_KEY
  const host = process.env.RAPIDAPI_UFC_HOST ?? 'mmaapi.p.rapidapi.com'

  if (!key) {
    errors.push('RAPIDAPI_KEY not configured')
    return 0
  }

  let synced = 0

  for (const event of liveEvents) {
    const dbFights: any[] = (event as any).fights ?? []
    const d     = new Date(event.date)
    const day   = d.getUTCDate()
    const month = d.getUTCMonth() + 1
    const year  = d.getUTCFullYear()

    // RapidAPI (mmaapi.p.rapidapi.com) only covers UFC via tournament 19906.
    // Skip non-UFC events and log clearly so ops can see it in the cron output.
    const isUfcEvent = /ufc/i.test(event.name)
    if (!isUfcEvent) {
      skipped.push(`[rapidapi] ${event.name} — RapidAPI is UFC-only; use api-sports for non-UFC events`)
      continue
    }

    log.push(`[rapidapi] Checking ${event.name} (${dbFights.length} DB fights) for ${year}-${month}-${day}`)

    const url = `https://${host}/api/mma/unique-tournament/19906/schedules/${day}/${month}/${year}`
    let apiFights: any[]
    try {
      const res = await fetch(url, {
        headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host },
        cache: 'no-store',
      })
      if (!res.ok) {
        errors.push(`API ${res.status} for ${event.name}`)
        continue
      }
      const data = await res.json()
      apiFights  = data.events ?? []
      log.push(`  API returned ${apiFights.length} fights`)
    } catch (e: any) {
      errors.push(`Fetch failed for ${event.name}: ${e.message}`)
      continue
    }

    for (const apiFight of apiFights) {
      const fightUuid = rapidApiIdToUuid(apiFight.id, 'fight')
      const home      = apiFight.homeTeam?.name ?? '?'
      const away      = apiFight.awayTeam?.name ?? '?'

      // Primary match: by RapidAPI UUID (fights imported via RapidAPI)
      let dbFight = dbFights.find((f: any) => f.id === fightUuid)

      // Fallback: match by fighter names (fights imported via api-sports have different UUIDs)
      if (!dbFight) {
        const h = norm(home), a = norm(away)
        dbFight = dbFights.find((f: any) => {
          const d1 = norm(f.fighter1?.name ?? '')
          const d2 = norm(f.fighter2?.name ?? '')
          return (d1 === h && d2 === a) || (d1 === a && d2 === h)
        })
        if (dbFight) log.push(`  Name-matched ${home} vs ${away} → DB fight ${dbFight.id}`)
      }

      if (!dbFight) {
        skipped.push(`No DB match for API fight ${apiFight.id} (${home} vs ${away}) → uuid ${fightUuid}`)
        continue
      }

      const apiStatus  = (apiFight.status?.type ?? apiFight.statusType ?? '').toLowerCase()
      const isFinished = ['finished', 'complete', 'ended', 'after'].includes(apiStatus)
      const method     = apiFight.winType ? mapMethod(apiFight.winType) : null
      const round      = apiFight.finalRound ?? null

      if (['cancelled', 'canceled', 'postponed', 'abandoned'].includes(apiStatus) && dbFight.status !== 'cancelled') {
        const { error } = await supabase.from('fights').update({ status: 'cancelled' }).eq('id', fightUuid)
        if (error) errors.push(`cancel(${fightUuid}): ${error.message}`)
        else log.push(`✗ ${home} vs ${away} → cancelled`)
        continue
      }

      if (dbFight.status === 'completed') {
        log.push(`  ⏭ ${home} vs ${away} already completed in DB`)
        continue
      }

      if (!isFinished) {
        log.push(`  ⏳ ${home} vs ${away} — API status: "${apiStatus}", winnerCode: ${apiFight.winnerCode ?? 'null'}`)
        continue
      }

      if (apiFight.winnerCode === 0) {
        const { error } = await supabase.rpc('complete_fight', {
          p_fight_id:  dbFight.id,
          p_winner_id: null,
          p_method:    method ?? 'Draw',
          p_round:     round,
          p_time:      null,
        } as any)
        if (error) errors.push(`draw(${fightUuid}): ${error.message}`)
        else log.push(`🤝 ${home} vs ${away} → Draw (${method ?? 'Draw'})`)
        continue
      }

      if (!apiFight.winnerCode) {
        log.push(`  ⚠ ${home} vs ${away} — finished but winnerCode is null/undefined`)
        continue
      }

      // Determine winner DB ID — prefer name match over RapidAPI UUID
      // since DB fighters may have been imported from api-sports (different UUID prefix)
      const winnerName = apiFight.winnerCode === 1 ? home : away
      const winnerApiId = apiFight.winnerCode === 1 ? apiFight.homeTeam?.id : apiFight.awayTeam?.id
      if (!winnerApiId) {
        errors.push(`No winner team ID for fight ${apiFight.id} (${home} vs ${away})`)
        continue
      }

      const winnerNorm = norm(winnerName)
      // RapidAPI imports always set fighter1=homeTeam, fighter2=awayTeam, so
      // winnerCode 1 (homeTeam) → fighter1, winnerCode 2 (awayTeam) → fighter2.
      // Use this positional fallback instead of generating a new UUID that won't
      // match any existing DB fighter and would cause everyone to score 0 pts.
      const winnerDbId =
        norm(dbFight.fighter1?.name ?? '') === winnerNorm ? dbFight.fighter1?.id :
        norm(dbFight.fighter2?.name ?? '') === winnerNorm ? dbFight.fighter2?.id :
        apiFight.winnerCode === 1 ? dbFight.fighter1?.id : dbFight.fighter2?.id

      const { error: rpcErr } = await supabase.rpc('complete_fight', {
        p_fight_id:  dbFight.id,
        p_winner_id: winnerDbId,
        p_method:    method,
        p_round:     round,
        p_time:      null,
      } as any)

      if (rpcErr) {
        errors.push(`complete_fight(${fightUuid}): ${rpcErr.message}`)
      } else {
        synced++
        const winner = apiFight.winnerCode === 1 ? home : away
        log.push(`✓ ${home} vs ${away} → ${winner} (${method ?? 'unknown'}, R${round ?? '?'})`)
      }
    }
  }

  return synced
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function runSyncResults(): Promise<SyncResultsOutput> {
  const provider: 'api-sports' | 'rapidapi' = isApiSportsConfigured() ? 'api-sports' : 'rapidapi'

  // Check at least one API key is available
  if (provider === 'rapidapi' && !process.env.RAPIDAPI_KEY) {
    return {
      success: false, synced: 0, provider,
      errors: ['No API key configured — set APISPORTS_KEY (preferred) or RAPIDAPI_KEY'],
      log: [], skipped: [], checkedAt: new Date().toISOString(),
    }
  }

  const supabase = createServiceClient()

  const { data: liveEvents, error: evErr } = await supabase
    .from('events')
    .select(`
      id, date, name,
      fights(
        id, status, fighter1_id, fighter2_id, winner_id,
        fighter1:fighters!fights_fighter1_id_fkey(id, name),
        fighter2:fighters!fights_fighter2_id_fkey(id, name)
      )
    `)
    .eq('status', 'live')

  if (evErr) {
    return { success: false, synced: 0, provider, errors: [evErr.message], log: [], skipped: [], checkedAt: new Date().toISOString() }
  }

  if (!liveEvents?.length) {
    return { success: true, synced: 0, provider, errors: [], log: ['No live events to sync'], skipped: [], checkedAt: new Date().toISOString() }
  }

  const errors: string[] = []
  const log: string[] = []
  const skipped: string[] = []

  let synced = 0
  if (provider === 'api-sports') {
    const { synced: asSynced, rateLimited } = await syncViaApiSports(liveEvents, supabase, log, errors, skipped)
    synced += asSynced
    // If api-sports hit its daily limit, fall back to RapidAPI automatically
    if (rateLimited && process.env.RAPIDAPI_KEY) {
      log.push('[rapidapi] Falling back to RapidAPI due to api-sports rate limit')
      synced += await syncViaRapidApi(liveEvents, supabase, log, errors, skipped)
    }
  } else {
    synced = await syncViaRapidApi(liveEvents, supabase, log, errors, skipped)
  }

  if (synced > 0) {
    revalidatePath('/', 'layout')
    revalidatePath('/leaderboard')
    revalidatePath('/admin')
  }

  return { success: true, synced, provider, errors, log, skipped, checkedAt: new Date().toISOString() }
}
