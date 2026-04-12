'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createCrewSchema } from '@/lib/validations'
import type { CreateCrewInput } from '@/lib/validations'

type ActionResult = { error?: string; success?: boolean; crewId?: string }

export async function createCrew(data: CreateCrewInput): Promise<ActionResult> {
  const parsed = createCrewSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: crew, error } = await supabase
    .from('crews')
    .insert({ name: parsed.data.name, description: parsed.data.description, owner_id: user.id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const crewId = (crew as any)?.id as string
  const { error: memberError } = await supabase
    .from('crew_members')
    .insert({ crew_id: crewId, user_id: user.id })

  if (memberError) return { error: memberError.message }

  revalidatePath('/crews')
  return { success: true, crewId }
}

export async function joinCrew(inviteCode: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: crewRaw } = await supabase
    .from('crews')
    .select('id, max_members')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  const crew = crewRaw as { id: string; max_members: number } | null
  if (!crew) return { error: 'Invalid invite code' }

  const { count } = await supabase
    .from('crew_members')
    .select('id', { count: 'exact', head: true })
    .eq('crew_id', crew.id)

  if (count !== null && count >= crew.max_members)
    return { error: 'This crew is full' }

  const { error } = await supabase
    .from('crew_members')
    .insert({ crew_id: crew.id, user_id: user.id })

  if (error?.code === '23505') return { error: 'You are already in this crew' }
  if (error) return { error: error.message }

  revalidatePath('/crews')
  redirect(`/crews/${crew.id}`)
}

export async function leaveCrew(crewId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('crew_members')
    .delete()
    .eq('crew_id', crewId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/crews')
  return { success: true }
}

export async function sendFriendRequest(friendId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (user.id === friendId) return { error: 'Cannot add yourself' }

  const { error } = await supabase
    .from('friends')
    .insert({ user_id: user.id, friend_id: friendId, status: 'pending' })

  if (error?.code === '23505') return { error: 'Friend request already sent' }
  if (error) return { error: error.message }

  revalidatePath('/leaderboard')
  return { success: true }
}

export async function acceptFriendRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted' })
    .eq('id', requestId)
    .eq('friend_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/leaderboard')
  return { success: true }
}
