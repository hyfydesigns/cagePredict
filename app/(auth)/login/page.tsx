'use client'

import { Suspense, useState, useTransition, useRef, useEffect } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/lib/actions/auth'
import { useToast } from '@/components/ui/use-toast'
import { createClient } from '@/lib/supabase/client'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [isMagicPending, startMagicTransition] = useTransition()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const inviteCode = searchParams.get('invite')
  const redirectTo = inviteCode ? `/invite/${inviteCode}` : (searchParams.get('redirect') ?? '/')

  const captchaToken = useRef<string>('')
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY || !widgetRef.current) return
    const tryRender = () => {
      if ((window as any).turnstile && widgetRef.current) {
        ;(window as any).turnstile.render(widgetRef.current, {
          sitekey: SITE_KEY,
          callback: (token: string) => { captchaToken.current = token },
          'expired-callback': () => { captchaToken.current = '' },
          'error-callback':   () => { captchaToken.current = '' },
          theme: 'auto',
        })
      } else {
        setTimeout(tryRender, 100)
      }
    }
    tryRender()
  }, [])

  function resetCaptcha() {
    if (SITE_KEY && (window as any).turnstile) {
      ;(window as any).turnstile.reset()
      captchaToken.current = ''
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signIn(
        {
          email: form.get('email') as string,
          password: form.get('password') as string,
          captchaToken: captchaToken.current || undefined,
        },
        redirectTo
      )
      if (result?.error) {
        resetCaptcha()
        toast({ title: 'Sign in failed', description: result.error, variant: 'destructive' })
      }
    })
  }

  function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startMagicTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email: magicEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}${redirectTo}`,
          captchaToken: captchaToken.current || undefined,
        },
      })
      if (error) {
        resetCaptcha()
        toast({ title: 'Failed to send link', description: error.message, variant: 'destructive' })
      } else {
        setMagicSent(true)
      }
    })
  }

  if (magicSent) {
    return (
      <div className="rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl backdrop-blur text-center space-y-4">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-3">
            <Mail className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="text-xl font-black text-foreground">Check your email</h1>
        <p className="text-sm text-foreground-muted">
          We sent a login link to <span className="text-foreground font-medium">{magicEmail}</span>.
          Click it to sign in — no password needed.
        </p>
        <button
          onClick={() => setMagicSent(false)}
          className="text-xs text-foreground-muted hover:text-primary transition-colors"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl backdrop-blur">
      {SITE_KEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      )}
      <div className="flex justify-center mb-5">
        <img
          src="/logo.svg"
          alt="CagePredict"
          className="h-14 w-14 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]"
        />
      </div>
      <h1 className="text-2xl font-black text-foreground mb-1">Welcome back</h1>
      <p className="text-foreground-muted text-sm mb-4">Sign in to your CagePredict account</p>

      {/* Magic link */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 mb-5">
        <p className="text-xs font-semibold text-primary mb-2.5 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Sign in with email link (no password needed)
        </p>
        <form onSubmit={handleMagicLink} className="flex gap-2">
          <Input
            type="email"
            placeholder="your@email.com"
            value={magicEmail}
            onChange={(e) => setMagicEmail(e.target.value)}
            required
            className="flex-1 h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={isMagicPending} className="shrink-0">
            {isMagicPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send link'}
          </Button>
        </form>
      </div>

      <div className="relative flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-foreground-muted">or sign in with password</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-foreground-muted hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground-secondary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Shared Turnstile widget — token used by whichever form submits */}
        {SITE_KEY && (
          <div ref={widgetRef} className="flex justify-center" />
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
        </Button>
      </form>

      <p className="text-center text-sm text-foreground-muted mt-5">
        No account?{' '}
        <Link
          href={inviteCode ? `/signup?invite=${inviteCode}` : '/signup'}
          className="text-primary hover:underline font-medium"
        >
          Sign up free
        </Link>
      </p>
    </div>
  )
}
