'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { signUpSchema, signInSchema, onboardingSchema, editProfileSchema } from '@/lib/validations'
import type { SignUpInput, SignInInput, OnboardingInput, EditProfileInput } from '@/lib/validations'
import { isAdmin } from '@/lib/auth/is-admin'

/** Derive the public-facing origin from the current request headers.
 *  Falls back to NEXT_PUBLIC_APP_URL, then the hardcoded production URL. */
async function getOrigin(): Promise<string> {
  try {
    const h    = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
    const proto = h.get('x-forwarded-proto')?.split(',')[0] ?? 'https'
    if (host) return `${proto}://${host}`
  } catch { /* not in a request context */ }
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://cagepredict.com'
}

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

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  if (!email?.trim()) return { error: 'Email is required' }

  const base       = await getOrigin()
  const redirectTo = `${base}/api/auth/callback?next=/reset-password`

  // If Resend is configured, generate the link ourselves and send a branded email
  if (process.env.RESEND_API_KEY) {
    try {
      const service = createServiceClient()
      const { data, error: linkErr } = await service.auth.admin.generateLink({
        type:    'recovery',
        email:   email.trim(),
        options: { redirectTo },
      })

      if (!linkErr && data?.properties?.action_link) {
        const { resend }                  = await import('@/lib/email/resend')
        const { passwordResetTemplate }   = await import('@/lib/email/templates')
        const { subject, html }           = passwordResetTemplate(data.properties.action_link)
        await resend.emails.send({
          from:    'CagePredict <noreply@cagepredict.com>',
          to:      [email.trim()],
          subject,
          html,
        })
        return { success: true }
      }
    } catch (e) {
      console.error('[requestPasswordReset] Resend path failed:', e)
      // fall through to Supabase built-in
    }
  }

  // Fallback: let Supabase send its default email
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) console.error('[requestPasswordReset]', error.message)
  return { success: true }
}

export async function updatePassword(password: string): Promise<ActionResult> {
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
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

/** Admin-only: delete any user by ID. */
export async function adminDeleteUser(targetUserId: string): Promise<ActionResult> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || !isAdmin(user)) return { error: 'Unauthorized' }

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
