'use client'

import { useState, useTransition } from 'react'
import { Loader2, Swords } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarPicker } from '@/components/auth/avatar-picker'
import { completeOnboarding } from '@/lib/actions/auth'
import { useToast } from '@/components/ui/use-toast'

export default function OnboardingPage() {
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('🥊')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await completeOnboarding({
        username,
        display_name: displayName,
        avatar_emoji: avatarEmoji,
      })
      if (result?.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      }
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
      <div className="text-center mb-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 mb-3 text-4xl">
          {avatarEmoji}
        </div>
        <h1 className="text-2xl font-black text-white">Set up your profile</h1>
        <p className="text-zinc-500 text-sm mt-1">Choose your fighter name and avatar</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label>Choose your avatar</Label>
          <AvatarPicker selected={avatarEmoji} onSelect={setAvatarEmoji} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="octagonking"
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]+"
          />
          <p className="text-xs text-zinc-600">Letters, numbers and underscores only</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="display-name">Display Name</Label>
          <Input
            id="display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={40}
          />
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isPending || !username}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Swords className="h-4 w-4 mr-2" />
              Start Predicting
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
