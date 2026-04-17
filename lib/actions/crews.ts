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

export async function deleteCrew(crewId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is the owner
  const { data: crewRaw } = await supabase
    .from('crews')
    .select('owner_id')
    .eq('id', crewId)
    .single()

  const crew = crewRaw as { owner_id: string } | null
  if (!crew) return { error: 'Crew not found' }
  if (crew.owner_id !== user.id) return { error: 'Only the crew owner can delete this crew' }

  const { error } = await supabase
    .from('crews')
    .delete()
    .eq('id', crewId)

  if (error) return { error: error.message }

  revalidatePath('/crews')
  redirect('/crews')
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

export async function inviteToCrewByUsername(crewId: string, username: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is the crew owner
  const { data: crewRaw } = await supabase
    .from('crews')
    .select('id, owner_id, max_members')
    .eq('id', crewId)
    .single()

  const crew = crewRaw as { id: string; owner_id: string; max_members: number } | null
  if (!crew) return { error: 'Crew not found' }
  if (crew.owner_id !== user.id) return { error: 'Only the crew owner can send invites' }

  // Look up target user by username
  const { data: targetProfileRaw } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username.trim())
    .single()

  const targetProfile = targetProfileRaw as { id: string; username: string } | null
  if (!targetProfile) return { error: `No player found with username "@${username.trim()}"` }
  if (targetProfile.id === user.id) return { error: 'You cannot invite yourself' }

  // Check they're not already a member
  const { data: existingMember } = await supabase
    .from('crew_members')
    .select('id')
    .eq('crew_id', crewId)
    .eq('user_id', targetProfile.id)
    .single()

  if (existingMember) return { error: `@${username.trim()} is already in this crew` }

  // Check for existing pending invite
  const { data: existingInvite } = await supabase
    .from('crew_invites')
    .select('id, status')
    .eq('crew_id', crewId)
    .eq('invited_user', targetProfile.id)
    .single()

  if (existingInvite) {
    const inv = existingInvite as { id: string; status: string }
    if (inv.status === 'pending') return { error: `@${username.trim()} already has a pending invite` }
  }

  // Check crew isn't full
  const { count } = await supabase
    .from('crew_members')
    .select('id', { count: 'exact', head: true })
    .eq('crew_id', crewId)

  if (count !== null && count >= crew.max_members)
    return { error: 'This crew is full' }

  // Insert invite (upsert to handle declined invites being re-sent)
  const { error: insertError } = await supabase
    .from('crew_invites')
    .upsert(
      { crew_id: crewId, invited_by: user.id, invited_user: targetProfile.id, status: 'pending' },
      { onConflict: 'crew_id,invited_user' }
    )

  if (insertError) return { error: insertError.message }

  revalidatePath('/crews')
  return { success: true }
}

export async function acceptCrewInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Get the invite — must be pending and belong to caller
  const { data: inviteRaw } = await supabase
    .from('crew_invites')
    .select('id, crew_id, invited_user, status')
    .eq('id', inviteId)
    .single()

  const invite = inviteRaw as { id: string; crew_id: string; invited_user: string; status: string } | null
  if (!invite) return { error: 'Invite not found' }
  if (invite.invited_user !== user.id) return { error: 'Not your invite' }
  if (invite.status !== 'pending') return { error: 'Invite is no longer pending' }

  const crewId = invite.crew_id

  // Check crew isn't full
  const { data: crewRaw } = await supabase
    .from('crews')
    .select('max_members')
    .eq('id', crewId)
    .single()

  const crew = crewRaw as { max_members: number } | null
  if (!crew) return { error: 'Crew not found' }

  const { count } = await supabase
    .from('crew_members')
    .select('id', { count: 'exact', head: true })
    .eq('crew_id', crewId)

  if (count !== null && count >= crew.max_members)
    return { error: 'This crew is now full' }

  // Add to crew_members
  const { error: memberError } = await supabase
    .from('crew_members')
    .insert({ crew_id: crewId, user_id: user.id })

  if (memberError?.code === '23505') {
    // Already a member — still mark invite accepted
  } else if (memberError) {
    return { error: memberError.message }
  }

  // Mark invite accepted
  await supabase
    .from('crew_invites')
    .update({ status: 'accepted' })
    .eq('id', inviteId)

  revalidatePath('/crews')
  redirect(`/crews/${crewId}`)
}

export async function declineCrewInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: inviteRaw } = await supabase
    .from('crew_invites')
    .select('id, invited_user')
    .eq('id', inviteId)
    .single()

  const invite = inviteRaw as { id: string; invited_user: string } | null
  if (!invite) return { error: 'Invite not found' }
  if (invite.invited_user !== user.id) return { error: 'Not your invite' }

  const { error } = await supabase
    .from('crew_invites')
    .update({ status: 'declined' })
    .eq('id', inviteId)

  if (error) return { error: error.message }

  revalidatePath('/crews')
  return { success: true }
}
