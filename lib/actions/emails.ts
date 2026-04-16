'use server'

import type { User } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { resend, FROM_ADDRESS } from '@/lib/email/resend'
import { cardLiveTemplate, weeklyRecapTemplate } from '@/lib/email/templates'
import type { CardLiveData, WeeklyRecapData } from '@/lib/email/templates'

type AuthUser  = Pick<User, 'id' | 'email'>
type ProfileId = { id: string }
type PickRow   = { user_id: string; is_correct: boolean | null }
type RankRow   = { id: string; total_points: number }

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ─── Card Live Notification ───────────────────────────────────────────────────

export async function sendCardLiveEmails(
  eventId: string
): Promise<{ sent: number; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { sent: 0, error: 'RESEND_API_KEY not set' }

  const supabase = createServiceClient()

  // Fetch event + fights
  const { data: event } = await supabase
    .from('events')
    .select(`
      id, name, date,
      fights(
        id, is_main_event, fight_time,
        fighter1:fighters!fights_fighter1_id_fkey(name),
        fighter2:fighters!fights_fighter2_id_fkey(name)
      )
    `)
    .eq('id', eventId)
    .single()

  if (!event) return { sent: 0, error: 'Event not found' }

  const fights = (event.fights ?? []) as Array<{
    id: string
    is_main_event: boolean
    fighter1: { name: string } | null
    fighter2: { name: string } | null
  }>
  const mainFight = fights.find((f) => f.is_main_event) ?? fights[0]

  const data: CardLiveData = {
    eventName:         event.name,
    eventDate:         new Date(event.date).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }),
    fightCount:        fights.length,
    mainEventFighter1: mainFight?.fighter1?.name ?? 'TBA',
    mainEventFighter2: mainFight?.fighter2?.name ?? 'TBA',
    slug:              slugify(event.name),
  }

  const { subject, html } = cardLiveTemplate(data)

  // Fetch opted-in profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('email_notifications', true)

  if (!profiles?.length) return { sent: 0 }

  const userIds = (profiles as ProfileId[]).map((p) => p.id)

  // Resolve emails from auth.users (service role required)
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map<string, string>(
    (users as AuthUser[])
      .filter((u): u is AuthUser & { email: string } => typeof u.email === 'string')
      .map((u) => [u.id, u.email])
  )

  const recipients = userIds
    .map((id: string) => emailMap.get(id))
    .filter((e): e is string => typeof e === 'string')

  if (!recipients.length) return { sent: 0 }

  // Batch send in chunks of 50 (Resend limit)
  let sent = 0
  const CHUNK = 50
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk  = recipients.slice(i, i + CHUNK)
    const emails = chunk.map((to: string) => ({
      from: FROM_ADDRESS,
      to:   [to] as [string],
      subject,
      html,
    }))
    const { error } = await resend.batch.send(emails)
    if (!error) sent += chunk.length
  }

  return { sent }
}

// ─── Weekly Recap ─────────────────────────────────────────────────────────────

export async function sendWeeklyRecapEmails(): Promise<{ sent: number; errors: number }> {
  if (!process.env.RESEND_API_KEY) return { sent: 0, errors: 0 }

  const supabase = createServiceClient()
  const since    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Opted-in profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, total_points, current_streak')
    .eq('email_notifications', true)

  if (!profiles?.length) return { sent: 0, errors: 0 }

  const userIds = (profiles as ProfileId[]).map((p) => p.id)

  // Correct predictions this week
  const { data: correctPreds } = await supabase
    .from('predictions')
    .select(`
      user_id,
      fight:fights(
        winner_id,
        fighter1:fighters!fights_fighter1_id_fkey(id, name),
        fighter2:fighters!fights_fighter2_id_fkey(id, name)
      )
    `)
    .in('user_id', userIds)
    .gte('created_at', since)
    .eq('is_correct', true)

  // All picks this week (for total count)
  const { data: allPicks } = await supabase
    .from('predictions')
    .select('user_id, is_correct')
    .in('user_id', userIds)
    .gte('created_at', since)

  // Rank map
  const { data: rankRows } = await supabase
    .from('profiles')
    .select('id, total_points')
    .order('total_points', { ascending: false })
    .limit(1000)

  const rankMap = new Map<string, number>()
  ;(rankRows ?? [] as RankRow[]).forEach((r: RankRow, i: number) => rankMap.set(r.id, i + 1))

  // Group by user
  type CorrectPred = NonNullable<typeof correctPreds>[number]
  const correctByUser   = new Map<string, CorrectPred[]>()
  const totalPickByUser = new Map<string, number>()
  const ptsThisWeek     = new Map<string, number>()

  ;(correctPreds ?? []).forEach((p: CorrectPred) => {
    const arr = correctByUser.get(p.user_id) ?? []
    arr.push(p)
    correctByUser.set(p.user_id, arr)
  })

  ;(allPicks ?? [] as PickRow[]).forEach((p: PickRow) => {
    totalPickByUser.set(p.user_id, (totalPickByUser.get(p.user_id) ?? 0) + 1)
    if (p.is_correct) {
      ptsThisWeek.set(p.user_id, (ptsThisWeek.get(p.user_id) ?? 0) + 10)
    }
  })

  // Resolve emails
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const emailMap = new Map<string, string>(
    (users as AuthUser[])
      .filter((u): u is AuthUser & { email: string } => typeof u.email === 'string')
      .map((u) => [u.id, u.email])
  )

  let sent = 0
  let errors = 0

  for (const profile of profiles) {
    const email = emailMap.get(profile.id)
    if (!email) continue

    const totalWeek = totalPickByUser.get(profile.id) ?? 0
    if (totalWeek === 0) continue   // nothing to recap

    const correct  = correctByUser.get(profile.id) ?? []
    const bestPick = correct[0] as typeof correct[0] | undefined
    const fight    = bestPick?.fight as {
      winner_id: string | null
      fighter1:  { id: string; name: string } | null
      fighter2:  { id: string; name: string } | null
    } | null | undefined

    const winnerId = fight?.winner_id
    const winner   = fight?.fighter1?.id === winnerId ? fight?.fighter1 : fight?.fighter2
    const loser    = fight?.fighter1?.id === winnerId ? fight?.fighter2 : fight?.fighter1

    const recapData: WeeklyRecapData = {
      username:           profile.username,
      displayName:        profile.display_name,
      pointsThisWeek:     ptsThisWeek.get(profile.id) ?? 0,
      totalPoints:        profile.total_points,
      rank:               rankMap.get(profile.id) ?? 999,
      correctThisWeek:    correct.length,
      totalPicksThisWeek: totalWeek,
      bestPickFighter:    winner?.name ?? null,
      bestPickOpponent:   loser?.name ?? null,
      streak:             profile.current_streak,
    }

    const { subject, html } = weeklyRecapTemplate(recapData)

    const { error } = await resend.emails.send({
      from:    FROM_ADDRESS,
      to:      [email],
      subject,
      html,
    })

    if (error) errors++
    else sent++
  }

  return { sent, errors }
}
