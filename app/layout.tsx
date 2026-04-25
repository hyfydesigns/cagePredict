// v2
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import { Toaster } from '@/components/ui/toaster'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { EventCountdownBanner } from '@/components/layout/event-countdown-banner'
import { StagingBanner } from '@/components/layout/staging-banner'
import { RecoveryRedirect } from '@/components/auth/recovery-redirect'
import { createClient } from '@/lib/supabase/server'

const inter = Inter({ subsets: ['latin'], variable: '--font-geist-sans' })

const APP_URL = 'https://cagepredict.com'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'CagePredict — Predict. Compete. Climb the Rankings.',
    template: '%s | CagePredict',
  },
  description:
    'Free-to-play UFC fantasy prediction game. Pick every fight, earn points, and climb the global leaderboard.',
  keywords: ['UFC', 'MMA', 'fantasy predictions', 'UFC picks', 'fight picks', 'MMA predictions', 'CagePredict', 'UFC fantasy game'],
  authors: [{ name: 'CagePredict' }],
  creator: 'CagePredict',
  openGraph: {
    siteName:    'CagePredict',
    title:       'CagePredict — Predict. Compete. Climb the Rankings.',
    description: 'Free-to-play UFC fantasy prediction game. Pick every fight, earn points, and climb the global leaderboard.',
    type:        'website',
    url:         APP_URL,
    locale:      'en_US',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'CagePredict — Predict. Compete. Climb the Rankings.',
    description: 'Free-to-play UFC fantasy prediction game. Pick every fight, earn points, and climb the global leaderboard.',
    site:        '@cagepredict',
  },
  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:               true,
      follow:              true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet':       -1,
    },
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
      <body className={`${inter.variable} font-sans min-h-screen bg-background`}>
        <SupabaseProvider>
          <StagingBanner />
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
          <Footer />
          <Toaster />
          <RecoveryRedirect />
        </SupabaseProvider>
      </body>
    </html>
  )
}
