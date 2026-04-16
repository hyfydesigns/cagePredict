import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import { Toaster } from '@/components/ui/toaster'
import { Navbar } from '@/components/layout/navbar'
import { EventCountdownBanner } from '@/components/layout/event-countdown-banner'
import { createClient } from '@/lib/supabase/server'

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: {
    default: 'CagePredict — Predict. Compete. Climb the Rankings.',
    template: '%s | CagePredict',
  },
  description:
    'Free-to-play UFC fantasy prediction game. Pick every fight, earn points, and climb the global leaderboard.',
  keywords: ['UFC', 'MMA', 'fantasy', 'predictions', 'fight picks', 'CagePredict'],
  openGraph: {
    title: 'CagePredict',
    description: 'Predict. Compete. Climb the Rankings.',
    type: 'website',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  }

  // Fetch the next upcoming fight for the countdown banner (shown site-wide)
  const { data: nextFightRow } = await supabase
    .from('fights')
    .select('fight_time, events!inner(name, status)')
    .in('events.status', ['upcoming', 'live'])
    .neq('status', 'completed')
    .not('fight_time', 'is', null)
    .order('fight_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  const nextFight = nextFightRow as any
  const bannerEventName = nextFight?.events?.name ?? null
  const bannerFightTime = nextFight?.fight_time ?? null

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans min-h-screen bg-[#080808]`}>
        <SupabaseProvider>
          <Navbar profile={profile} isAuthenticated={!!user} />
          {bannerEventName && bannerFightTime && (
            <EventCountdownBanner
              eventName={bannerEventName}
              fightTime={bannerFightTime}
            />
          )}
          <main className="min-h-[calc(100vh-4rem)]">
            {children}
          </main>
          <Toaster />
        </SupabaseProvider>
      </body>
    </html>
  )
}
