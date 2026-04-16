import { createServerClient, type CookieOptions } from '@supabase/ssr'

export async function createClient() {
  // Lazy import so this module is safe to import from generateStaticParams
  // (cookies() must not be called at module-evaluation time during builds)
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — handled by middleware refresh
          }
        },
      },
    }
  )
}

/**
 * Cookie-free anon client — safe for generateStaticParams / build-time contexts
 * where cookies() is unavailable.
 */
export function createBuildClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient: sb } = require('@supabase/supabase-js')
  return sb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

/** Service-role client — only use in trusted server contexts */
export function createServiceClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient: sb } = require('@supabase/supabase-js')
  return sb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
