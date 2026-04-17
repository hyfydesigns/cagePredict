'use client'

import { useState, useTransition } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteCrew } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'

export function DeleteCrewButton({ crewId }: { crewId: string }) {
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleClick() {
    if (!confirm) {
      setConfirm(true)
      // Auto-reset confirm state after 4 seconds if user doesn't click again
      setTimeout(() => setConfirm(false), 4000)
      return
    }

    startTransition(async () => {
      const result = await deleteCrew(crewId)
      if (result?.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
        setConfirm(false)
      }
      // On success the server action redirects to /crews
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className={confirm ? 'text-red-400 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300' : 'text-zinc-500 hover:text-red-400'}
    >
      {isPending
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <>
            <Trash2 className="h-4 w-4 mr-1.5" />
            {confirm ? 'Confirm Delete' : 'Delete Crew'}
          </>
      }
    </Button>
  )
}
