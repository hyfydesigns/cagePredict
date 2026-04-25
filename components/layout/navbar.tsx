'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Home, Trophy, Users, User, LogOut, Menu, X,
  Swords, Bell, BarChart2, HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { signOut } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'
import type { ProfileRow } from '@/types/database'

const NAV_LINKS = [
  { href: '/',            label: 'Fight Card',   icon: Swords },
  { href: '/leaderboard', label: 'Leaderboard',  icon: Trophy },
  { href: '/standings',   label: 'Standings',    icon: BarChart2 },
  { href: '/crews',       label: 'Crews',        icon: Users },
]

interface NavbarProps {
  profile: ProfileRow | null
  isAuthenticated: boolean
}

export function Navbar({ profile, isAuthenticated }: NavbarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/90 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/logo.svg"
            alt="CagePredict"
            className="h-8 w-8 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]"
          />
          <span className="text-lg font-black tracking-tight text-foreground">
            Cage<span className="text-primary">Predict</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-surface-2 text-foreground'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-surface-2'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Help link (desktop) */}
        <Link
          href="/help"
          className={cn(
            'hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            pathname === '/help'
              ? 'text-foreground-secondary'
              : 'text-foreground-muted hover:text-foreground-secondary'
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Help
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isAuthenticated && profile ? (
            <>
              {/* Points badge */}
              <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-amber-600 dark:border-amber-500/30 bg-amber-500/10 px-3 py-1">
                <Trophy className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-600 dark:text-amber-500 dark:text-amber-300">{profile.total_points} pts</span>
              </div>

              {/* Profile link */}
              <Link
                href={`/profile/${profile.username}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-2 transition-colors"
              >
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarImage src={profile.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-surface-2 text-lg">
                    {profile.avatar_emoji}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-foreground-secondary">
                  {profile.username}
                </span>
              </Link>

              <form action={signOut}>
                <Button variant="ghost" size="icon" type="submit" title="Sign out">
                  <LogOut className="h-4 w-4 text-foreground-muted" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Join Free</Button>
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-foreground-secondary hover:text-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                pathname === href
                  ? 'bg-surface-2 text-foreground'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-surface-2'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="pt-2 border-t border-border">
            <Link
              href="/help"
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                pathname === '/help'
                  ? 'bg-surface-2 text-foreground'
                  : 'text-foreground-muted hover:text-foreground hover:bg-surface-2'
              )}
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Link>
          </div>
          {isAuthenticated && (
            <form action={signOut}>
              <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground-secondary hover:text-foreground w-full">
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </form>
          )}
        </nav>
      )}
    </header>
  )
}
