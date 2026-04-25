'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="h-9 w-9" />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        'text-foreground-muted hover:text-foreground hover:bg-surface-2',
        className,
      )}
    >
      <Sun  className={cn('h-4 w-4 absolute transition-all duration-200', isDark  ? 'opacity-0 scale-75' : 'opacity-100 scale-100')} />
      <Moon className={cn('h-4 w-4 absolute transition-all duration-200', !isDark ? 'opacity-0 scale-75' : 'opacity-100 scale-100')} />
    </button>
  )
}
