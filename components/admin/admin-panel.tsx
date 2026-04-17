'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  RefreshCw, CheckCircle, Trophy, Users, Swords,
  BarChart3, Loader2, ChevronDown, ChevronUp, AlertTriangle, Download, Trash2, TrendingUp
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { seedEvents, completeFight, fetchEventByDate, clearAllData } from '@/lib/actions/admin'
import { syncEventOdds } from '@/lib/actions/odds'
import { useToast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

interface AdminFighter { id: string; name: string; flag_emoji: string | null }
interface AdminFight {
  id: string
  status: string
  weight_class: string | null
  is_main_event: boolean
  winner_id: string | null
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

interface Props {
  events: AdminEvent[]
  stats: { users: number; fights: number; predictions: number }
  adminUserId: string
}

export function AdminPanel({ events, stats, adminUserId }: Props) {
  const { toast } = useToast()
  const [isSeedPending, startSeedTransition]         = useTransition()
  const [isApiFetchPending, startApiFetchTransition] = useTransition()
  const [isClearPending, startClearTransition]       = useTransition()
  const [confirmClear, setConfirmClear]              = useState(false)
  const [isResultPending, startResultTransition]     = useTransition()
  const [isOddsPending, startOddsTransition]         = useTransition()
  const [oddsEventId, setOddsEventId]                = useState(() => events[0]?.id ?? '')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(events[0]?.id ?? null)
  const [completingFight, setCompletingFight] = useState<string | null>(null)
  const [selectedWinners, setSelectedWinners] = useState<Record<string, string>>({})
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

  function handleCompleteFight(fightId: string) {
    const winnerId = selectedWinners[fightId]
    if (!winnerId) {
      toast({ title: 'Select a winner first', variant: 'destructive' })
      return
    }
    startResultTransition(async () => {
      setCompletingFight(fightId)
      const result = await completeFight(fightId, winnerId)
      setCompletingFight(null)
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Fight completed!', description: 'Scores updated for all predictions.' })
      }
    })
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">Admin Panel</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Manage events, fights, and results</p>
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
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
            <Icon className={`h-5 w-5 mx-auto mb-2 ${color}`} />
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="text-zinc-500 text-xs mt-0.5">{label}</p>
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
            <p className="text-zinc-500 text-xs mt-1">
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

      {/* Fetch from RapidAPI */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-white flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" /> Import from RapidAPI
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            Pick the date of a UFC event to import all fights and fighters automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={fetchDate}
            onChange={(e) => setFetchDate(e.target.value)}
            className="max-w-[200px] bg-zinc-800 border-zinc-700 text-white"
          />
          <Button onClick={handleApiFetch} disabled={isApiFetchPending}>
            {isApiFetchPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><Download className="h-4 w-4 mr-1.5" />Import Event</>
            }
          </Button>
        </div>
      </div>

      {/* Sync Odds */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-400" /> Sync Betting Odds
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            Pull live American odds from The Odds API and save opening odds + history.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={oddsEventId}
            onChange={(e) => setOddsEventId(e.target.value)}
            className="flex-1 max-w-xs rounded-md border border-zinc-700 bg-zinc-800 text-white text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
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
        <p className="text-zinc-600 text-xs">
          Run this manually before events, or set up a cron to call <code className="bg-zinc-800 px-1 rounded">/api/cron/sync-odds</code> hourly on fight days.
        </p>
      </div>

      {/* Seed fake data (fallback) */}
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-zinc-400 text-sm">Seed Demo Data</h2>
            <p className="text-zinc-600 text-xs mt-1">
              Load fictional fighters and events for testing.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={isSeedPending} className="shrink-0 border-zinc-700 text-zinc-400">
            {isSeedPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <><RefreshCw className="h-4 w-4 mr-1.5" />Seed Demo</>
            }
          </Button>
        </div>
      </div>

      {/* Set Fight Results */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            Set Fight Results
          </h2>
          <p className="text-zinc-500 text-sm mt-0.5">
            Mark fights as completed to automatically score all predictions.
          </p>
        </div>

        <div className="divide-y divide-zinc-800/60">
          {events.map((event) => (
            <div key={event.id}>
              {/* Event header toggle */}
              <button
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-800/40 transition-colors text-left"
                onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
              >
                <div>
                  <p className="font-semibold text-white text-sm">{event.name}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {format(new Date(event.date), 'MMM d, yyyy')} · {event.fights?.length ?? 0} fights
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={event.status === 'completed' ? 'outline' : event.status === 'live' ? 'live' : 'secondary'} className="text-[11px]">
                    {event.status}
                  </Badge>
                  {expandedEvent === event.id
                    ? <ChevronUp className="h-4 w-4 text-zinc-500" />
                    : <ChevronDown className="h-4 w-4 text-zinc-500" />
                  }
                </div>
              </button>

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
                      {event.fights?.map((fight) => (
                        <FightResultRow
                          key={fight.id}
                          fight={fight}
                          selectedWinner={selectedWinners[fight.id] ?? null}
                          onSelectWinner={(id) =>
                            setSelectedWinners((prev) => ({ ...prev, [fight.id]: id }))
                          }
                          onComplete={() => handleCompleteFight(fight.id)}
                          isCompleting={completingFight === fight.id && isResultPending}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {events.length === 0 && (
            <div className="px-5 py-10 text-center text-zinc-600 text-sm">
              No events found. Click &quot;Fetch New Events&quot; to seed the database.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FightResultRow({
  fight,
  selectedWinner,
  onSelectWinner,
  onComplete,
  isCompleting,
}: {
  fight: AdminFight
  selectedWinner: string | null
  onSelectWinner: (id: string) => void
  onComplete: () => void
  isCompleting: boolean
}) {
  const isCompleted = fight.status === 'completed'

  return (
    <div className={`rounded-xl border p-3 ${isCompleted ? 'border-zinc-800/40 opacity-60' : 'border-zinc-700/60 bg-zinc-800/30'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Fight info */}
        <div className="flex-1 min-w-0">
          {fight.is_main_event && (
            <Badge variant="destructive" className="text-[10px] mb-1">Main Event</Badge>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="truncate">
              {fight.fighter1.flag_emoji} {fight.fighter1.name}
            </span>
            <span className="text-zinc-600 shrink-0">vs</span>
            <span className="truncate">
              {fight.fighter2.flag_emoji} {fight.fighter2.name}
            </span>
          </div>
          {fight.weight_class && (
            <p className="text-zinc-500 text-xs mt-0.5">{fight.weight_class}</p>
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
            {/* Winner picker */}
            <div className="flex gap-1">
              <button
                onClick={() => onSelectWinner(fight.fighter1.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  selectedWinner === fight.fighter1.id
                    ? 'border-primary bg-primary/15 text-white'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {fight.fighter1.name.split(' ').pop()}
              </button>
              <button
                onClick={() => onSelectWinner(fight.fighter2.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  selectedWinner === fight.fighter2.id
                    ? 'border-primary bg-primary/15 text-white'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {fight.fighter2.name.split(' ').pop()}
              </button>
            </div>

            <Button
              size="sm"
              onClick={onComplete}
              disabled={!selectedWinner || isCompleting}
              className="text-xs h-7 px-3"
            >
              {isCompleting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : 'Set Result'
              }
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
