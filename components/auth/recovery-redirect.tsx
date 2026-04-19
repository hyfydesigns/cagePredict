'use client'

/**
 * Handles Supabase's legacy implicit-flow password-reset links.
 *
 * When the Supabase dashboard email template hasn't been customised it sends:
 *   https://yoursite.com/#access_token=...&type=recovery&...
 *
 * The hash fragment is client-side only, so this component reads it, calls
 * setSession() to establish the recovery session, then navigates to
 * /reset-password where the user can pick a new password.
 *
 * Mount this once in the root layout — it's a no-op on every other page.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function RecoveryRedirect() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash.includes('type=recovery')) return

    // Parse the hash fragment — drop the leading '#'
    const params = new URLSearchParams(hash.slice(1))
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || !refreshToken) return

    const supabase = createClient()
    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error('[RecoveryRedirect]', error.message)
          router.replace('/forgot-password')
        } else {
          // Clear the hash so the token isn't sitting in the URL bar
          window.history.replaceState(null, '', window.location.pathname)
          // If we're already on /reset-password, just refresh the router so
          // the page re-renders with the new session — no navigation needed.
          if (window.location.pathname === '/reset-password') {
            router.refresh()
          } else {
            router.replace('/reset-password')
          }
        }
      })
  }, [router])

  return null
}
