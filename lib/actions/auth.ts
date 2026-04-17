'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { signUpSchema, signInSchema, onboardingSchema, editProfileSchema } from '@/lib/validations'
import type { SignUpInput, SignInInput, OnboardingInput, EditProfileInput } from '@/lib/validations'

type ActionResult = { error?: string; success?: boolean }

export async function signUp(data: SignUpInput): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', parsed.data.username)
    .single()

  if (existing) return { error: 'Username already taken' }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cagepredict.com'
  const callbackUrl = new URL(`${base}/api/auth/callback`)
  callbackUrl.searchParams.set('next', '/onboarding')
  if (parsed.data.inviteCode) {
    callbackUrl.searchParams.set('invite', parsed.data.inviteCode)
  }

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username },
      emailRedirectTo: callbackUrl.toString(),
    },
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function signIn(data: SignInInput, redirectTo = '/'): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { error: 'Invalid email or password' }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function completeOnboarding(data: OnboardingInput): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: current } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  if ((current as any)?.username !== parsed.data.username) {
    const { data: taken } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', parsed.data.username)
      .neq('id', user.id)
      .single()
    if (taken) return { error: 'Username already taken' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      username: parsed.data.username,
      display_name: parsed.data.display_name ?? parsed.data.username,
      avatar_emoji: parsed.data.avatar_emoji,
      onboarding_complete: true,
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function updateProfile(data: EditProfileInput): Promise<ActionResult> {
  const parsed = editProfileSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.errors[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/profile', 'layout')
  return { success: true }
}

export async function updateEmailNotifications(enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ email_notifications: enabled })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/profile/edit')
  return { success: true }
}

/** Admin-only: delete any user by ID. Caller must be authenticated (admin check is in UI). */
export async function adminDeleteUser(targetUserId: string): Promise<ActionResult> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Prevent self-deletion via this route
  if (user.id === targetUserId) return { error: 'Use account settings to delete your own account' }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(targetUserId)
  if (error) return { error: error.message }

  revalidatePath('/admin')
  return { success: true }
}

export async function deleteAccount(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Sign the user out first so their session is cleared
  await supabase.auth.signOut()

  // Use service role to hard-delete the auth user.
  // All related rows (profiles, predictions, friends, crew_members)
  // cascade-delete automatically via ON DELETE CASCADE.
  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) return { error: error.message }

  redirect('/?deleted=1')
}
