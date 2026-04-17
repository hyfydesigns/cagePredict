'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { acceptCrewInvite, declineCrewInvite } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'
import type { CrewInviteWithDetails } from '@/types/database'

interface PendingInvitesProps {
  invites: CrewInviteWithDetails[]
}

export function PendingInvites({ invites: initialInvites }: PendingInvitesProps) {
  const [invites, setInvites] = useState(initialInvites)
  const { toast } = useToast()

  function removeInvite(id: string) {
    setInvites((prev) => prev.filter((inv) => inv.id !== id))
  }

  if (invites.length === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Pending Invites ({invites.length})
      </h2>
      <div className="space-y-3">
        {invites.map((invite) => (
          <InviteCard
            key={invite.id}
            invite={invite}
            onDone={removeInvite}
          />
        ))}
      </div>
    </div>
  )
}

interface InviteCardProps {
  invite: CrewInviteWithDetails
  onDone: (id: string) => void
}

function InviteCard({ invite, onDone }: InviteCardProps) {
  const [acceptPending, startAccept] = useTransition()
  const [declinePending, startDecline] = useTransition()
  const { toast } = useToast()
  const isPending = acceptPending || declinePending

  function handleAccept() {
    startAccept(async () => {
      // Optimistically remove before the redirect
      onDone(invite.id)
      const result = await acceptCrewInvite(invite.id)
      if (result?.error) {
        // Restore on error — page will not have redirected
        toast({ title: 'Could not accept invite', description: result.error, variant: 'destructive' })
      }
    })
  }

  function handleDecline() {
    startDecline(async () => {
      const result = await declineCrewInvite(invite.id)
      if (result?.error) {
        toast({ title: 'Could not decline invite', description: result.error, variant: 'destructive' })
      } else {
        onDone(invite.id)
        toast({ title: 'Invite declined' })
      }
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-bold text-white truncate">{invite.crew.name}</p>
        <p className="text-sm text-zinc-500 mt-0.5">
          Invited by{' '}
          <span className="text-zinc-400 font-medium">
            {invite.inviter.avatar_emoji} @{invite.inviter.username}
          </span>
        </p>
      </div>

      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={handleAccept}
          className="border-green-700 text-green-400 hover:bg-green-900/40 hover:text-green-300"
        >
          {acceptPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><Check className="h-4 w-4 mr-1" />Accept</>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={handleDecline}
          className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
        >
          {declinePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <><X className="h-4 w-4 mr-1" />Decline</>
          )}
        </Button>
      </div>
    </div>
  )
}
