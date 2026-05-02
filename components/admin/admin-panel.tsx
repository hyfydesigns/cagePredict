'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, CheckCircle, Trophy, Users, Swords,
  BarChart3, Loader2, ChevronDown, ChevronUp, AlertTriangle, Download, Trash2, TrendingUp, UserX, Search, Zap, Calendar, Radio,
  ArrowUp, ArrowDown, Star, Clock
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { seedEvents, completeFight, fetchEventByDate, clearAllData, forceSyncResults, backfillWinBreakdown, forceSetEventStatus, refreshEventFights, deduplicateFights, updateFightMeta, deleteFight, setEventFightTimes } from '@/lib/actions/admin'
import { syncEventOdds } from '@/lib/actions/odds'
import { adminDeleteUser } from '@/lib/actions/auth'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

interface AdminFighter { id: string; name: string; flag_emoji: string | null }
interface AdminFight {
  id: string
  status: string
  weight_class: string | null
  is_main_event: boolean
  winner_id: string | null
  fight_type: string | null
  display_order: number | null
  fight_time: string | null
  fighter1: AdminFighter
  fighter2: AdminFighter
}
interface AdminEvent {
  id: string
  name: string
  date: string
  status: string
  fights: AdminFight[]
}

interface AdminUser {
  id: string
  username: string
  display_name: string | null
  avatar_emoji: string
  total_points: number
  total_picks: number
  correct_picks: number
  created_at: string
  email_notifications: boolean
}

interface Props {
  events: AdminEvent[]
  stats: { users: number; fights: number; predictions: number }
  adminUserId: string
  users: AdminUser[]
}

export function AdminPanel({ events, stats, adminUserId, users }: Props) {
  const { toast } = useToast()
  const [isSeedPending, startSeedTransition]         = useTransition()
  const [isApiFetchPending, startApiFetchTransition] = useTransition()
  const [isClearPending, startClearTransition]       = useTransition()
  const [confirmClear, setConfirmClear]              = useState(false)
  const [isResultPending, startResultTransition]     = useTransition()
  const [isOddsPending, startOddsTransition]         = useTransition()
  const [oddsEventId, setOddsEventId]                = useState(() => events[0]?.id ?? '')
  const [userSearch, setUserSearch]                  = useState('')
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null)
  const [isDeleteUserPending, startDeleteUserTransition] = useTransition()
  const [isSyncPending, startSyncTransition]           = useTransition()
  const [syncLog, setSyncLog]                          = useState<string[] | null>(null)
  const [isBackfillPending, startBackfillTransition]   = useTransition()
  const [backfillResult, setBackfillResult]            = useState<{ updated: number; errors: number } | null>(null)
  const [isDedupPending, startDedupTransition]         = useTransition()
  const [isAutoImportPending, startAutoImportTransition] = useTransition()
  const [autoImportLog, setAutoImportLog]                = useState<string[] | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<string | null>(events[0]?.id ?? null)
  const [refreshingEventId, setRefreshingEventId] = useState<string | null>(null)
  const [settingTimesEventId, setSettingTimesEventId] = useState<string | null>(null)
  // eventStartTimes: eventId → "datetime-local" value (YYYY-MM-DDTHH:mm)
  const [eventStartTimes, setEventStartTimes] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const ev of events) {
      // Pre-fill with the main card fight_time if available, else the event date
      const mainCard = ev.fights?.find((f: AdminFight) => f.is_main_event && f.fight_time)
      const rawISO = mainCard?.fight_time ?? ev.date
      if (rawISO) {
        // Convert to local datetime-local format (YYYY-MM-DDTHH:mm) in UTC
        const d = new Date(rawISO)
        const pad = (n: number) => String(n).padStart(2, '0')
        init[ev.id] = `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
      }
    }
    return init
  })
  const [completingFight, setCompletingFight] = useState<string | null>(null)
  const [selectedWinners, setSelectedWinners] = useState<Record<string, string>>({})
  const [deletedFightIds, setDeletedFightIds] = useState<Set<string>>(new Set())
  const [fetchDate, setFetchDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    setConfirmClear(false)
    startClearTransition(async () => {
      const result = await clearAllData()
      if (result.error) {
        toast({ title: 'Clear failed', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Data cleared', description: result.message })
      }
    })
  }

  function handleAutoImport() {
    setAutoImportLog(null)
    startAutoImportTransition(async () => {
      try {
        const res  = await fetch('/api/admin/auto-import', { method: 'POST' })
        const data = await res.json()
        const diagLines: string[] = data.diag ? ['── Diagnostics ──', ...data.diag, '── Import log ──'] : []
        setAutoImportLog([...diagLines, ...(data.log ?? [data.message ?? 'Done'])])
        toast({
          title: data.error ? 'Auto-import failed' : (data.message ?? 'Auto-import complete'),
          description: data.error,
          variant: data.error ? 'destructive' : 'default',
        })
      } catch (e: any) {
        toast({ title: 'Auto-import failed', description: e.message, variant: 'destructive' })
      }
    })
  }

  function handleApiFetch() {
    const [year, month, day] = fetchDate.split('-').map(Number)
    if (!year || !month || !day) {
      toast({ title: 'Invalid date', variant: 'destructive' })
      return
    }
    startApiFetchTransition(async () => {
      const result = await fetchEventByDate(day, month, year)
      if (result.error) {
        toast({ title: 'Fetch failed', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Event imported!', description: result.message })
      }
    })
  }

  function handleSeed() {
    startSeedTransition(async () => {
      const result = await seedEvents()
      if (result.error) {
        toast({ title: 'Seed failed', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Events seeded!', description: result.message })
      }
    })
  }

  function handleForceSync() {
    setSyncLog(null)
    startSyncTransition(async () => {
      const result = await forceSyncResults()
      if (result.error) {
        toast({ title: 'Sync failed', description: result.error, variant: 'destructive' })
        setSyncLog([`ERROR: ${result.error}`])
      } else {
        toast({ title: result.message ?? 'Sync complete' })
        const providerLine = (result as any).provider ? [`Provider: ${(result as any).provider}`] : []
        const allLines = [
          ...providerLine,
          ...(result.log ?? []),
          ...(result.skipped?.length ? ['— Skipped (no DB match) —', ...(result.skipped ?? [])] : []),
        ]
        setSyncLog(allLines.length ? allLines : ['Nothing to sync — no live events, or all fights already completed.'])
      }
    })
  }

  function handleDedup() {
    startDedupTransition(async () => {
      const result = await deduplicateFights()
      toast({
        title: result.error ? 'Dedup failed' : result.removed === 0 ? 'No duplicates found' : `Removed ${result.removed} duplicate fight(s)`,
        description: result.error ?? (result.removed > 0 ? 'Duplicate fights deleted. Refresh the page.' : 'All fights are unique.'),
        variant: result.error ? 'destructive' : 'default',
      })
    })
  }

  function handleBackfill() {
    setBackfillResult(null)
    startBackfillTransition(async () => {
      const result = await backfillWinBreakdown()
      setBackfillResult(result)
      if (result.updated === 0 && result.errors === 0) {
        toast({ title: 'Nothing to backfill', description: 'All fighters already have win breakdown data.' })
      } else {
        toast({
          title: 'Backfill complete',
          description: `${result.updated} fighter${result.updated !== 1 ? 's' : ''} updated${result.errors ? `, ${result.errors} failed` : ''}.`,
          variant: result.errors > 0 ? 'destructive' : 'default',
        })
      }
    })
  }

  function handleSyncOdds() {
    if (!oddsEventId) {
      toast({ title: 'Select an event first', variant: 'destructive' })
      return
    }
    startOddsTransition(async () => {
      const result = await syncEventOdds(oddsEventId)
      if (result.error) {
        toast({ title: 'Odds sync failed', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Odds synced!', description: result.message })
      }
    })
  }

  function handleDeleteUser(userId: string) {
    if (confirmDeleteUserId !== userId) {
      setConfirmDeleteUserId(userId)
      // auto-reset after 4s if not confirmed
      setTimeout(() => setConfirmDeleteUserId((prev) => (prev === userId ? null : prev)), 4000)
      return
    }
    setConfirmDeleteUserId(null)
    startDeleteUserTransition(async () => {
      const result = await adminDeleteUser(userId)
      if (result?.error) {
        toast({ title: 'Delete failed', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'User deleted', description: 'The user account has been permanently removed.' })
      }
    })
  }

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase()
    return (
      u.username.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q)
    )
  })

  function handleSetStartTime(eventId: string) {
    const localVal = eventStartTimes[eventId]
    if (!localVal) { toast({ title: 'Set a date/time first', variant: 'destructive' }); return }
    // datetime-local gives us YYYY-MM-DDTHH:mm in the local browser timezone.
    // We treat it as UTC since admins should enter UTC times.
    const mainCardISO = new Date(localVal + ':00Z').toISOString()
    setSettingTimesEventId(eventId)
    setEventFightTimes(eventId, mainCardISO).then((r) => {
      setSettingTimesEventId(null)
      toast({
        title: r.error ? 'Failed' : `Updated ${(r as any).updated} fight(s)`,
        description: r.error ?? `Main card: ${mainCardISO} UTC · Prelims −90min · Early prelims −180min`,
        variant: r.error ? 'destructive' : 'default',
      })
    })
  }

  function handleCompleteFight(fightId: string) {
    const winnerId = selectedWinners[fightId]
    // 'draw' is a valid special value meaning null winner
    if (!winnerId) {
      toast({ title: 'Select a winner or Draw first', variant: 'destructive' })
      return
    }
    startResultTransition(async () => {
      setCompletingFight(fightId)
      const result = await completeFight(fightId, winnerId === 'draw' ? null : winnerId)
      setCompletingFight(null)
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: winnerId === 'draw' ? 'Fight recorded as Draw' : 'Fight completed!', description: 'Scores updated for all predictions.' })
      }
    })
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-foreground">Admin Panel</h1>
          <p className="text-foreground-muted text-sm mt-0.5">Manage events, fights, and results</p>
        </div>
        <Badge variant="warning" className="gap-1.5">
          <AlertTriangle className="h-3 w-3" /> Admin Access
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Users', value: stats.users, icon: Users, color: 'text-blue-400' },
          { label: 'Total Fights', value: stats.fights, icon: Swords, color: 'text-primary' },
          { label: 'Predictions Made', value: stats.predictions, icon: BarChart3, color: 'text-green-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4 text-center">
            <Icon className={`h-5 w-5 mx-auto mb-2 ${color}`} />
            <p className="text-2xl font-black text-foreground">{value}</p>
            <p className="text-foreground-muted text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-red-400 flex items-center gap-2 text-sm">
              <Trash2 className="h-4 w-4" /> Danger Zone
            </h2>
            <p className="text-foreground-muted text-xs mt-1">
              Permanently delete all fighters, events, fights, predictions, and reset user stats.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleClear}
            disabled={isClearPending}
            className="shrink-0"
          >
            {isClearPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : confirmClear
                ? 'Confirm Delete'
                : <><Trash2 className="h-4 w-4 mr-1.5" />Clear All Data</>
            }
          </Button>
        </div>
        {confirmClear && (
          <p className="text-red-400 text-xs mt-3">
            Click &quot;Confirm Delete&quot; again to permanently erase all data. This cannot be undone.
          </p>
        )}
      </div>

      {/* Auto-import upcoming events */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-400" /> Auto-Import Upcoming Events
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Scans the next 16 Saturdays and imports any UFC events until there are at least 2 upcoming cards. Runs automatically every Monday — click to trigger manually.
          </p>
        </div>
        <Button onClick={handleAutoImport} disabled={isAutoImportPending} variant="outline" className="border-border">
          {isAutoImportPending
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Scanning…</>
            : <><Calendar className="h-4 w-4 mr-1.5 text-blue-400" />Run Auto-Import</>
          }
        </Button>
        {autoImportLog && (
          <div className="rounded-xl bg-background border border-border p-3 max-h-48 overflow-y-auto">
            {autoImportLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono leading-relaxed ${
                line.startsWith('  ✓') ? 'text-green-400' :
                line.startsWith('  ✗') ? 'text-foreground-muted' :
                line.startsWith('Found') || line.startsWith('Scanning') ? 'text-foreground-secondary' :
                'text-foreground-muted'
              }`}>{line}</p>
            ))}
          </div>
        )}
        <p className="text-foreground-muted text-xs">
          Also runs automatically every Monday at 08:00 UTC via <code className="bg-surface-2 px-1 rounded">/api/cron/import-events</code>.
        </p>
      </div>

      {/* Fetch from RapidAPI */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Import from RapidAPI
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Pick the date of a UFC event to import all fights and fighters automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={fetchDate}
            onChange={(e) => setFetchDate(e.target.value)}
            className="max-w-[200px] bg-surface-2 border-border text-foreground"
          />
          <Button onClick={handleApiFetch} disabled={isApiFetchPending}>
            {isApiFetchPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Download className="h-4 w-4 mr-1.5" />Import Event</>
            }
          </Button>
        </div>
      </div>

      {/* Deduplicate Fights */}
      <div className="rounded-2xl border border-amber-500/30 bg-surface p-5 space-y-3">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Swords className="h-4 w-4 text-amber-400" /> Deduplicate Fights
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Remove duplicate fight rows caused by re-importing from a different API source (RapidAPI vs api-sports). Keeps the row with the most predictions.
          </p>
        </div>
        <Button onClick={handleDedup} disabled={isDedupPending} variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
          {isDedupPending
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Scanning…</>
            : <><Swords className="h-4 w-4 mr-1.5" />Remove Duplicates</>
          }
        </Button>
      </div>

      {/* Backfill Win Breakdown */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-purple-400" /> Backfill Win Breakdown
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Fetch KO/TKO · Submission · Decision win counts from UFCStats for fighters missing that data. Safe to run multiple times.
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Button onClick={handleBackfill} disabled={isBackfillPending} variant="outline" className="border-border">
            {isBackfillPending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Fetching…</>
              : <><BarChart3 className="h-4 w-4 mr-1.5 text-purple-400" />Run Backfill</>
            }
          </Button>
          {backfillResult && (
            <p className="text-sm text-foreground-muted">
              <span className="text-green-400 font-semibold">{backfillResult.updated}</span> updated
              {backfillResult.errors > 0 && (
                <>, <span className="text-red-400 font-semibold">{backfillResult.errors}</span> failed</>
              )}
            </p>
          )}
        </div>
        <p className="text-foreground-muted text-xs">
          This scrapes ufcstats.com for each fighter — expect it to take 10–60 s depending on roster size.
        </p>
      </div>

      {/* Sync Odds */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" /> Sync Betting Odds
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Pull live American odds from The Odds API and save opening odds + history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={oddsEventId}
            onChange={(e) => setOddsEventId(e.target.value)}
            className="flex-1 max-w-xs rounded-md border border-border bg-surface-2 text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {format(new Date(ev.date), 'MMM d')}
              </option>
            ))}
          </select>
          <Button onClick={handleSyncOdds} disabled={isOddsPending} className="shrink-0">
            {isOddsPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><TrendingUp className="h-4 w-4 mr-1.5" />Sync Odds</>
            }
          </Button>
        </div>
        <p className="text-foreground-muted text-xs">
          Run this manually before events, or set up a cron to call <code className="bg-surface-2 px-1 rounded">/api/cron/sync-odds</code> hourly on fight days.
        </p>
      </div>

      {/* Seed fake data (fallback) */}
      <div className="rounded-2xl border border-border/50 bg-surface/50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-foreground-muted text-sm">Seed Demo Data</h2>
            <p className="text-foreground-muted text-xs mt-1">
              Load fictional fighters and events for testing.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={isSeedPending} className="shrink-0 border-border text-foreground-muted">
            {isSeedPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><RefreshCw className="h-4 w-4 mr-1.5" />Seed Demo</>
            }
          </Button>
        </div>
      </div>

      {/* User Management */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-foreground flex items-center gap-2">
              <UserX className="h-4 w-4 text-blue-400" /> User Management
            </h2>
            <p className="text-foreground-muted text-sm mt-0.5">
              {users.length} registered user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-muted pointer-events-none" />
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users…"
              className="pl-8 h-8 text-sm bg-surface-2 border-border"
            />
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <p className="px-5 py-8 text-center text-foreground-muted text-sm">No users found.</p>
          ) : (
            filteredUsers.map((u) => {
              const isAdmin = u.id === adminUserId
              const isConfirming = confirmDeleteUserId === u.id
              const accuracy = u.total_picks > 0 ? Math.round((u.correct_picks / u.total_picks) * 100) : 0
              return (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/30 transition-colors">
                  {/* Avatar */}
                  <div className="h-9 w-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-lg shrink-0 select-none">
                    {u.avatar_emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {u.display_name || u.username}
                      </p>
                      <span className="text-foreground-muted text-xs">@{u.username}</span>
                      {isAdmin && (
                        <Badge variant="warning" className="text-[10px] py-0 px-1.5">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-foreground-muted text-xs">{u.total_points} pts</span>
                      <span className="text-foreground-muted text-xs">{u.total_picks} picks · {accuracy}% acc</span>
                      <span className="text-foreground-muted text-xs hidden sm:inline">
                        Joined {format(new Date(u.created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  {!isAdmin && (
                    <Button
                      size="sm"
                      variant={isConfirming ? 'destructive' : 'ghost'}
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={isDeleteUserPending}
                      className={`shrink-0 h-7 text-xs ${!isConfirming ? 'text-foreground-muted hover:text-red-400 hover:bg-red-500/10' : ''}`}
                    >
                      {isDeleteUserPending && confirmDeleteUserId === null ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isConfirming ? (
                        'Confirm?'
                      ) : (
                        <UserX className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Force Resync Results */}
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Force Resync Results
          </h2>
          <p className="text-foreground-muted text-sm mt-1">
            Manually trigger the sync-results cron. Uses api-sports.io if <code className="text-xs bg-surface-2 px-1 rounded">APISPORTS_KEY</code> is set, otherwise RapidAPI.
          </p>
        </div>
        <Button onClick={handleForceSync} disabled={isSyncPending} variant="outline" className="border-border">
          {isSyncPending
            ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Syncing…</>
            : <><Zap className="h-4 w-4 mr-1.5 text-amber-600 dark:text-amber-400" />Run Sync Now</>
          }
        </Button>
        {syncLog && (
          <div className="rounded-xl bg-background border border-border p-3 max-h-64 overflow-y-auto">
            {syncLog.map((line, i) => (
              <p key={i} className={`text-xs font-mono leading-relaxed ${
                line.startsWith('✓') ? 'text-green-400' :
                line.startsWith('✗') ? 'text-red-400' :
                line.startsWith('🤝') ? 'text-blue-400' :
                line.startsWith('⚠') || line.startsWith('ERROR') ? 'text-amber-600 dark:text-amber-400' :
                line.startsWith('—') ? 'text-foreground-muted mt-2 font-semibold' :
                line.startsWith('No DB match') ? 'text-orange-400' :
                'text-foreground-muted'
              }`}>{line}</p>
            ))}
          </div>
        )}
      </div>

      {/* Set Fight Results */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Set Fight Results
          </h2>
          <p className="text-foreground-muted text-sm mt-0.5">
            Mark fights as completed to automatically score all predictions.
          </p>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {events.map((event) => (
            <div key={event.id}>
              {/* Event header toggle */}
              <button
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-2/40 transition-colors text-left"
                onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
              >
                <div>
                  <p className="font-semibold text-foreground text-sm">{event.name}</p>
                  <p className="text-foreground-muted text-xs mt-0.5">
                    {format(new Date(event.date), 'MMM d, yyyy')} · {event.fights?.length ?? 0} fights
                  </p>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Badge variant={event.status === 'completed' ? 'outline' : event.status === 'live' ? 'live' : 'secondary'} className="text-[11px]">
                    {event.status}
                  </Badge>
                  {event.status !== 'live' && (
                    <button
                      className="flex items-center gap-1 text-[10px] font-bold text-red-500 border border-red-500/40 rounded px-1.5 py-0.5 hover:bg-red-500/10 transition-colors"
                      onClick={() => {
                        forceSetEventStatus(event.id, 'live').then(r => {
                          toast({ title: r.error ? 'Failed' : r.message ?? 'Set live', variant: r.error ? 'destructive' : 'default' })
                        })
                      }}
                    >
                      <Radio className="h-2.5 w-2.5" />
                      Force Live
                    </button>
                  )}
                  {event.status === 'live' && (
                    <button
                      className="flex items-center gap-1 text-[10px] font-bold text-foreground-muted border border-border rounded px-1.5 py-0.5 hover:bg-surface-2 transition-colors"
                      onClick={() => {
                        forceSetEventStatus(event.id, 'upcoming').then(r => {
                          toast({ title: r.error ? 'Failed' : r.message ?? 'Set upcoming', variant: r.error ? 'destructive' : 'default' })
                        })
                      }}
                    >
                      Revert
                    </button>
                  )}
                  <button
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-500 border border-blue-500/40 rounded px-1.5 py-0.5 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                    title="Re-fetch fights from API and add any missing ones"
                    disabled={refreshingEventId === event.id}
                    onClick={() => {
                      setRefreshingEventId(event.id)
                      refreshEventFights(event.id).then(r => {
                        setRefreshingEventId(null)
                        toast({ title: r.error ? 'Refresh failed' : 'Fights refreshed', description: r.error ?? r.message, variant: r.error ? 'destructive' : 'default' })
                      }).catch(e => {
                        setRefreshingEventId(null)
                        toast({ title: 'Refresh failed', description: String(e), variant: 'destructive' })
                      })
                    }}
                  >
                    {refreshingEventId === event.id
                      ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      : <RefreshCw className="h-2.5 w-2.5" />
                    }
                    {refreshingEventId === event.id ? 'Refreshing…' : 'Refresh Fights'}
                  </button>
                  {expandedEvent === event.id
                    ? <ChevronUp className="h-4 w-4 text-foreground-muted" />
                    : <ChevronDown className="h-4 w-4 text-foreground-muted" />
                  }
                </div>
              </button>

              {/* Set fight start times (shown when expanded) */}
              <AnimatePresence initial={false}>
                {expandedEvent === event.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pt-3 pb-2 border-b border-border/30 bg-surface-2/20">
                      <p className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Main Card Start Time (UTC)
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="datetime-local"
                          value={eventStartTimes[event.id] ?? ''}
                          onChange={(e) => setEventStartTimes((prev) => ({ ...prev, [event.id]: e.target.value }))}
                          className="text-xs bg-surface-2 border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary"
                        />
                        <button
                          onClick={() => handleSetStartTime(event.id)}
                          disabled={settingTimesEventId === event.id}
                          className="flex items-center gap-1 text-[11px] font-bold text-primary border border-primary/40 rounded px-2 py-1 hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {settingTimesEventId === event.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Clock className="h-3 w-3" />
                          }
                          Set Times
                        </button>
                        <span className="text-[10px] text-foreground-muted">
                          Prelims −90min · Early prelims −180min
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Fight rows */}
              <AnimatePresence initial={false}>
                {expandedEvent === event.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-2.5">
                      {event.fights?.filter((fight) => !deletedFightIds.has(fight.id)).map((fight) => (
                        <FightResultRow
                          key={fight.id}
                          fight={fight}
                          selectedWinner={selectedWinners[fight.id] ?? null}
                          onSelectWinner={(id) =>
                            setSelectedWinners((prev) => ({ ...prev, [fight.id]: id }))
                          }
                          onComplete={() => handleCompleteFight(fight.id)}
                          isCompleting={completingFight === fight.id && isResultPending}
                          onDeleted={() => setDeletedFightIds((prev) => new Set([...prev, fight.id]))}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {events.length === 0 && (
            <div className="px-5 py-10 text-center text-foreground-muted text-sm">
              No events found. Click &quot;Fetch New Events&quot; to seed the database.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const SEGMENT_OPTIONS = [
  { value: '',            label: '— unset —' },
  { value: 'maincard',    label: 'Main Card' },
  { value: 'prelims',     label: 'Prelims' },
  { value: 'earlyprelims', label: 'Early Prelims' },
]

/** Format a UTC ISO string as "May 2, 08:00 UTC" */
function fmtFightTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

function FightResultRow({
  fight,
  selectedWinner,
  onSelectWinner,
  onComplete,
  isCompleting,
  onDeleted,
}: {
  fight: AdminFight
  selectedWinner: string | null
  onSelectWinner: (id: string) => void
  onComplete: () => void
  isCompleting: boolean
  onDeleted: () => void
}) {
  const { toast } = useToast()
  const isCompleted = fight.status === 'completed'

  // Local editable state for segment + order (controlled inline)
  const [segment, setSegment]   = useState<string>(fight.fight_type ?? '')
  const [order, setOrder]       = useState<number>(fight.display_order ?? 0)
  const [isMain, setIsMain]     = useState<boolean>(fight.is_main_event)
  const [isSavingMeta, setIsSavingMeta] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleSaveMeta() {
    setIsSavingMeta(true)
    const result = await updateFightMeta(fight.id, {
      fight_type: segment || null,
      display_order: order,
      is_main_event: isMain,
    })
    setIsSavingMeta(false)
    toast({
      title: result.error ? 'Update failed' : 'Fight updated',
      description: result.error ?? undefined,
      variant: result.error ? 'destructive' : 'default',
    })
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 4000)
      return
    }
    setConfirmDelete(false)
    setIsDeleting(true)
    const result = await deleteFight(fight.id)
    setIsDeleting(false)
    if (result.error) {
      toast({ title: 'Delete failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Fight deleted' })
      onDeleted()
    }
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2.5 ${isCompleted ? 'border-border/40 opacity-70' : 'border-border/60 bg-surface-2/30'}`}>
      {/* ── Top row: fight info + result ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Fight info */}
        <div className="flex-1 min-w-0">
          {isMain && (
            <Badge variant="destructive" className="text-[10px] mb-1">Main Event</Badge>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">
              {fight.fighter1.flag_emoji} {fight.fighter1.name}
            </span>
            <span className="text-foreground-muted shrink-0">vs</span>
            <span className="truncate">
              {fight.fighter2.flag_emoji} {fight.fighter2.name}
            </span>
          </div>
          {fight.weight_class && (
            <p className="text-foreground-muted text-xs mt-0.5">{fight.weight_class}</p>
          )}
          {fmtFightTime(fight.fight_time) && (
            <p className="text-foreground-muted/70 text-[10px] mt-0.5 flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              {fmtFightTime(fight.fight_time)}
            </p>
          )}
        </div>

        {/* Result controls */}
        {isCompleted ? (
          <div className="flex items-center gap-1.5 text-green-400 text-sm shrink-0">
            <CheckCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">Final</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => onSelectWinner(fight.fighter1.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  selectedWinner === fight.fighter1.id
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border text-foreground-muted hover:border-border'
                }`}
              >
                {fight.fighter1.name.split(' ').pop()}
              </button>
              <button
                onClick={() => onSelectWinner(fight.fighter2.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  selectedWinner === fight.fighter2.id
                    ? 'border-primary bg-primary/15 text-foreground'
                    : 'border-border text-foreground-muted hover:border-border'
                }`}
              >
                {fight.fighter2.name.split(' ').pop()}
              </button>
              <button
                onClick={() => onSelectWinner('draw')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  selectedWinner === 'draw'
                    ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                    : 'border-border text-foreground-muted hover:border-border'
                }`}
              >
                Draw
              </button>
            </div>
            <Button
              size="sm"
              onClick={onComplete}
              disabled={!selectedWinner || isCompleting}
              className="text-xs h-7 px-3"
            >
              {isCompleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set Result'}
            </Button>
          </div>
        )}
      </div>

      {/* ── Bottom row: meta controls ── */}
      <div className="flex items-center gap-2 flex-wrap border-t border-border/30 pt-2">
        {/* Segment selector */}
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="text-[11px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-foreground-muted focus:outline-none focus:border-primary cursor-pointer"
        >
          {SEGMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Display order */}
        <div className="flex items-center gap-0.5">
          <span className="text-[11px] text-foreground-muted mr-1">Order:</span>
          <button
            onClick={() => setOrder((n) => Math.max(0, n - 1))}
            className="h-5 w-5 flex items-center justify-center rounded border border-border hover:bg-surface-2 transition-colors"
          >
            <ArrowDown className="h-3 w-3 text-foreground-muted" />
          </button>
          <span className="text-[11px] font-mono text-foreground w-5 text-center">{order}</span>
          <button
            onClick={() => setOrder((n) => n + 1)}
            className="h-5 w-5 flex items-center justify-center rounded border border-border hover:bg-surface-2 transition-colors"
          >
            <ArrowUp className="h-3 w-3 text-foreground-muted" />
          </button>
        </div>

        {/* Main event toggle */}
        <button
          onClick={() => setIsMain((v) => !v)}
          className={`flex items-center gap-1 text-[11px] font-bold border rounded px-1.5 py-0.5 transition-colors ${
            isMain
              ? 'border-red-500/60 bg-red-500/10 text-red-400'
              : 'border-border text-foreground-muted hover:bg-surface-2'
          }`}
        >
          <Star className="h-3 w-3" />
          Main
        </button>

        {/* Save meta */}
        <button
          onClick={handleSaveMeta}
          disabled={isSavingMeta}
          className="flex items-center gap-1 text-[11px] font-bold text-primary border border-primary/40 rounded px-1.5 py-0.5 hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {isSavingMeta ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={`flex items-center gap-1 text-[11px] font-bold border rounded px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
            confirmDelete
              ? 'border-red-500 bg-red-500/20 text-red-400'
              : 'border-border text-foreground-muted hover:border-red-500/60 hover:text-red-400'
          }`}
        >
          {isDeleting
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Trash2 className="h-3 w-3" />
          }
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
