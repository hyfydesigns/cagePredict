import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { resend, FROM_ADDRESS } from '@/lib/email/resend'
import { welcomeTemplate } from '@/lib/email/templates'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabaseResponse = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      const user = session.user

      // Send welcome email only on first-ever email verification.
      // We detect this by checking that email_confirmed_at was set within the last 60 s —
      // repeat sign-ins via magic link will have a much older confirmed_at timestamp.
      const confirmedAt = user.email_confirmed_at
      const isFirstVerification =
        !!confirmedAt &&
        Date.now() - new Date(confirmedAt).getTime() < 60_000

      if (isFirstVerification && user.email && process.env.RESEND_API_KEY) {
        // Fetch username / display_name from profiles (may not exist yet if
        // the trigger hasn't run — fall back to email prefix gracefully)
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', user.id)
          .maybeSingle()

        const username = (profile as any)?.username ?? user.email.split('@')[0]
        const displayName = (profile as any)?.display_name ?? null

        const { subject, html } = welcomeTemplate({ username, displayName })

        // Fire-and-forget — don't block the redirect
        resend.emails
          .send({ from: FROM_ADDRESS, to: [user.email], subject, html })
          .catch((err) => console.error('[welcome-email]', err))
      }

      return supabaseResponse
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
