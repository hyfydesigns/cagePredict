'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from '@/lib/actions/auth'

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      await requestPasswordReset(email)
      setSent(true)
    })
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

      {sent ? (
        <div className="text-center space-y-3">
          <div className="text-4xl mb-2">📬</div>
          <h1 className="text-xl font-black text-foreground">Check your email</h1>
          <p className="text-foreground-muted text-sm leading-relaxed">
            If <span className="text-foreground font-medium">{email}</span> has an account,
            you'll receive a password reset link shortly.
          </p>
          <Link
            href="/login"
            className="inline-block mt-4 text-sm text-foreground-muted hover:text-foreground transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-black text-foreground mb-1">Reset password</h1>
          <p className="text-foreground-muted text-sm mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send reset link'}
            </Button>
          </form>

          <p className="text-center text-sm text-foreground-muted mt-5">
            Remembered it?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
