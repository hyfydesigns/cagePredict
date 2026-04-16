'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type SupabaseClient = ReturnType<typeof createClient>

type SupabaseContextType = {
  supabase: SupabaseClient
  user: User | null
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)

      // When a user verifies their email, Supabase fires SIGNED_IN.
      // If their profile has onboarding_complete = false (new user), send them to onboarding.
      if (event === 'SIGNED_IN' && session?.user) {
        const confirmedAt = session.user.email_confirmed_at
        const isRecentVerification =
          !!confirmedAt &&
          Date.now() - new Date(confirmedAt).getTime() < 5 * 60 * 1000 // within 5 min

        if (isRecentVerification) {
          // Check if onboarding is complete before redirecting
          supabase
            .from('profiles')
            .select('onboarding_complete')
            .eq('id', session.user.id)
            .single()
            .then(({ data: profile }) => {
              if (profile && !(profile as any).onboarding_complete) {
                router.push('/onboarding?welcome=1')
              }
            })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router])

  return (
    <SupabaseContext.Provider value={{ supabase, user }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider')
  return ctx
}
