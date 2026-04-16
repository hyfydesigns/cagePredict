import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { resend } from '@/lib/email/resend'
import { welcomeTemplate } from '@/lib/email/templates'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  // Collect cookies from the session exchange — we apply them to whichever
  // redirect response we end up building (destination depends on first vs. repeat verification)
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) { pendingCookies.push(...cookiesToSet) },
      },
    }
  )

  const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !session) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  const user = session.user

  // First-ever email verification: email_confirmed_at was set within the last 60 s.
  // Repeat sign-ins (magic link etc.) will have a much older confirmed_at.
  const confirmedAt = user.email_confirmed_at
  const isFirstVerification =
    !!confirmedAt &&
    Date.now() - new Date(confirmedAt).getTime() < 60_000

  // Route new users to onboarding with a welcome flag; everyone else to `next`
  const destination = isFirstVerification ? '/onboarding?welcome=1' : next
  const response = NextResponse.redirect(`${origin}${destination}`)

  // Transfer session cookies to the redirect response
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  )

  // Fire welcome email on first verification (non-blocking)
  if (isFirstVerification && user.email && process.env.RESEND_API_KEY) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle()

    const username = (profile as any)?.username ?? user.email.split('@')[0]
    const displayName = (profile as any)?.display_name ?? null

    const { subject, html } = welcomeTemplate({ username, displayName })

    resend.emails
      .send({ from: 'CagePredict <picks@cagepredict.com>', to: [user.email], subject, html })
      .catch((err) => console.error('[welcome-email]', err))
  }

  return response
}
