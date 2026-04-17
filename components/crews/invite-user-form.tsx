'use client'

import { useState, useTransition } from 'react'
import { UserPlus, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { inviteToCrewByUsername } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'

interface InviteUserFormProps {
  crewId: string
}

export function InviteUserForm({ crewId }: InviteUserFormProps) {
  const [username, setUsername] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = username.trim().replace(/^@/, '')
    if (!trimmed) return
    startTransition(async () => {
      const result = await inviteToCrewByUsername(crewId, trimmed)
      if (result?.error) {
        toast({ title: 'Could not send invite', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Invite sent!', description: `@${trimmed} has been invited to the crew.` })
        setUsername('')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="@username"
        disabled={isPending}
        className="font-mono"
      />
      <Button type="submit" variant="outline" disabled={isPending || !username.trim()} className="shrink-0">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <><UserPlus className="h-4 w-4 mr-1.5" />Invite</>
        )}
      </Button>
    </form>
  )
}
