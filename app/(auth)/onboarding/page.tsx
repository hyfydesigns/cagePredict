'use client'

import { useState, useTransition, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Swords, Trophy, Flame, Lock, Users, BarChart2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarPicker } from '@/components/auth/avatar-picker'
import { completeOnboarding } from '@/lib/actions/auth'
import { joinCrew } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'
import { useSupabase } from '@/components/providers/supabase-provider'

const FEATURES = [
  { icon: Swords,   text: 'Pick the winner of every UFC fight' },
  { icon: Lock,     text: 'Lock one fight per card for double points' },
  { icon: Flame,    text: 'Build win streaks for bonus points' },
  { icon: Trophy,   text: 'Climb the global leaderboard' },
  { icon: Users,    text: 'Compete in crews with friends' },
  { icon: BarChart2,text: 'Browse fighter stats & division standings' },
]

export default function OnboardingPage() {
  const searchParams = useSearchParams()
  const isWelcome  = searchParams.get('welcome') === '1'
  const inviteCode = searchParams.get('invite') ?? null
  const { user }   = useSupabase()

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('🥊')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  // Pre-fill username from the value entered during sign-up (stored in user_metadata)
  useEffect(() => {
    if (user?.user_metadata?.username && !username) {
      setUsername(user.user_metadata.username)
    }
  }, [user])

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
        return
      }
      // Auto-join crew from invite link — best-effort, don't block on failure
      if (inviteCode) {
        const joinResult = await joinCrew(inviteCode)
        if (joinResult?.error && joinResult.error !== 'You are already in this crew') {
          toast({ title: 'Could not join crew', description: joinResult.error, variant: 'destructive' })
        }
        // joinCrew redirects to /crews/[id] on success — flow ends here
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* Welcome banner — only shown after email verification */}
      {isWelcome && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h2 className="text-lg font-black text-white mb-1">Email verified — you're in!</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Welcome to CagePredict. Set up your profile below to start predicting UFC fights, earning points, and climbing the leaderboard.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs text-zinc-300">{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Profile setup card */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <div className="text-center mb-6">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30 mb-3 text-4xl">
            {avatarEmoji}
          </div>
          <h1 className="text-2xl font-black text-white">
            {isWelcome ? 'Set up your fighter profile' : 'Set up your profile'}
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Choose your fighter name and avatar to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label>Choose your avatar</Label>
            <AvatarPicker selected={avatarEmoji} onSelect={setAvatarEmoji} />
          </div>

          {/* Username — hidden if already provided during sign-up */}
          {user?.user_metadata?.username ? (
            <div className="flex items-center gap-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 px-4 py-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-xs text-zinc-500">Username</p>
                <p className="text-sm font-semibold text-white">@{username}</p>
              </div>
            </div>
          ) : (
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
          )}

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
                {isWelcome ? 'Enter the Cage →' : 'Start Predicting'}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
