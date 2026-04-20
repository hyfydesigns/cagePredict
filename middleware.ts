import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Admin routes — must be authenticated AND have role=admin in user_metadata
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
    const isAdmin = user.user_metadata?.role === 'admin'
    if (!isAdmin) {
      // Redirect non-admins silently to home — don't reveal the page exists
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Protected routes — redirect to login if no session
  const protectedPaths = ['/dashboard', '/leaderboard', '/crews', '/profile/edit']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))
  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Auth routes — redirect home if already logged in (unless carrying an invite)
  const authPaths = ['/login', '/signup']
  const isAuth = authPaths.some((p) => pathname.startsWith(p))
  if (isAuth && user && !request.nextUrl.searchParams.get('invite')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Onboarding requires auth
  if (pathname === '/onboarding' && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Onboarding gate — force /onboarding if profile not complete
  // /reset-password must be reachable during a recovery session even if
  // onboarding isn't complete (e.g. a user who signed up but never finished).
  const skipOnboardingCheck = ['/onboarding', '/api', '/invite', '/reset-password', '/forgot-password'].some((p) => pathname.startsWith(p))
  if (user && !skipOnboardingCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()

    if (profile && !(profile as { onboarding_complete: boolean }).onboarding_complete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
