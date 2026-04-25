'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUp } from '@/lib/actions/auth'
import { useToast } from '@/components/ui/use-toast'

export default function SignUpPage() {
  const searchParams   = useSearchParams()
  const inviteCode     = searchParams.get('invite') ?? undefined
  const [showPassword, setShowPassword] = useState(false)
  const [isPending, startTransition]    = useTransition()
  const [isSuccess, setIsSuccess]       = useState(false)
  const { toast } = useToast()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signUp({
        email:      form.get('email') as string,
        password:   form.get('password') as string,
        username:   form.get('username') as string,
        inviteCode,
      })
      if (result?.error) {
        toast({ title: 'Sign up failed', description: result.error, variant: 'destructive' })
      } else {
        setIsSuccess(true)
      }
    })
  }

  if (isSuccess) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-8 text-center">
        <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-foreground mb-2">Check your email!</h2>
        <p className="text-foreground-muted text-sm">
          We sent a confirmation link. Click it to activate your account
          {inviteCode ? ' and you\'ll be automatically joined to the crew.' : ' and start predicting.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl backdrop-blur">
      <div className="flex justify-center mb-5">
        <img
          src="/logo.svg"
          alt="CagePredict"
          className="h-14 w-14 drop-shadow-[0_0_12px_rgba(239,68,68,0.5)]"
        />
      </div>
      <h1 className="text-2xl font-black text-foreground mb-1">Create account</h1>
      <p className="text-foreground-muted text-sm mb-6">Free forever. No credit card needed.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" placeholder="octagonking" required
            pattern="[a-zA-Z0-9_]+" title="Letters, numbers and underscores only" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password" name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 8 chars, 1 uppercase, 1 number"
              required minLength={8}
              className="pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground-secondary">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Account'}
        </Button>
      </form>

      <p className="text-center text-xs text-foreground-muted mt-4">
        By creating an account you agree to our{' '}
        <Link href="/terms" className="hover:text-foreground-muted underline underline-offset-2">Terms of Service</Link>
        {' '}and{' '}
        <Link href="/privacy" className="hover:text-foreground-muted underline underline-offset-2">Privacy Policy</Link>.
      </p>
      <p className="text-center text-sm text-foreground-muted mt-3">
        Already have an account?{' '}
        <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>
    </div>
  )
}
