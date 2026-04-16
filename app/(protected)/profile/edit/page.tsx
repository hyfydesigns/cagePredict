'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AvatarPicker } from '@/components/auth/avatar-picker'
import { updateProfile, updateEmailNotifications } from '@/lib/actions/auth'
import { useToast } from '@/components/ui/use-toast'
import { useSupabase } from '@/components/providers/supabase-provider'
import type { ProfileRow } from '@/types/database'

export default function EditProfilePage() {
  const { supabase, user } = useSupabase()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('🥊')
  const [favFighter, setFavFighter] = useState('')
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [isTogglingEmail, startEmailTransition] = useTransition()
  const { toast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('profiles').select('*').eq('id', user.id).single().then(({ data }: { data: any }) => {
      if (data) {
        setProfile(data as ProfileRow)
        setDisplayName(data.display_name ?? '')
        setBio(data.bio ?? '')
        setAvatarEmoji(data.avatar_emoji)
        setFavFighter(data.favorite_fighter ?? '')
        setEmailNotifications(data.email_notifications ?? true)
      }
    })
  }, [user, supabase])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateProfile({
        display_name: displayName,
        bio,
        avatar_emoji: avatarEmoji,
        favorite_fighter: favFighter,
      })
      if (result?.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Profile updated!' })
        if (profile) router.push(`/profile/${profile.username}`)
      }
    })
  }

  function handleEmailToggle() {
    const next = !emailNotifications
    setEmailNotifications(next)
    startEmailTransition(async () => {
      const result = await updateEmailNotifications(next)
      if (result?.error) {
        setEmailNotifications(!next) // revert on error
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({
          title: next ? 'Email notifications on' : 'Email notifications off',
          description: next
            ? "You'll get card-live alerts and weekly recaps."
            : "You won't receive any emails from CagePredict.",
        })
      }
    })
  }

  return (
    <div className="container mx-auto py-8 max-w-md">
      <h1 className="text-2xl font-black text-white mb-6">Edit Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label>Avatar</Label>
          <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="text-4xl text-center mb-3">{avatarEmoji}</div>
            <AvatarPicker selected={avatarEmoji} onSelect={setAvatarEmoji} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Display Name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" maxLength={40} />
        </div>

        <div className="space-y-1.5">
          <Label>Bio</Label>
          <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself..." maxLength={160} />
          <p className="text-xs text-zinc-600">{bio.length}/160</p>
        </div>

        <div className="space-y-1.5">
          <Label>Favourite Fighter</Label>
          <Input value={favFighter} onChange={(e) => setFavFighter(e.target.value)} placeholder="e.g. Jon Jones" maxLength={50} />
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <><Save className="h-4 w-4 mr-1.5" />Save Changes</>
            )}
          </Button>
        </div>
      </form>

      {/* Notifications section — separate from the main form */}
      <div className="mt-8 pt-8 border-t border-zinc-800">
        <h2 className="text-lg font-bold text-white mb-1">Notifications</h2>
        <p className="text-sm text-zinc-500 mb-4">
          Control what emails CagePredict sends you.
        </p>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-lg p-1.5 ${emailNotifications ? 'bg-primary/10 text-primary' : 'bg-zinc-800 text-zinc-500'}`}>
              {emailNotifications ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Email notifications</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Card-live alerts &amp; weekly pick recaps
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={emailNotifications}
            onClick={handleEmailToggle}
            disabled={isTogglingEmail}
            className={`
              relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary
              disabled:opacity-50
              ${emailNotifications ? 'bg-primary' : 'bg-zinc-700'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 rounded-full bg-white shadow transition-transform
                ${emailNotifications ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>
    </div>
  )
}
