import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { SupabaseProvider } from '@/components/providers/supabase-provider'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import { Navbar } from '@/components/layout/navbar'
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

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <SupabaseProvider>
            <Navbar profile={profile} isAuthenticated={!!user} />
            <main className="min-h-[calc(100vh-4rem)]">
              {children}
            </main>
            <Toaster />
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
