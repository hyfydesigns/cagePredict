'use client'

import { useState, useTransition } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { joinCrew } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'

export function JoinCrewForm() {
  const [code, setCode] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    startTransition(async () => {
      const result = await joinCrew(code.trim().toUpperCase())
      if (result?.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter invite code (e.g. A1B2C3D4)"
        maxLength={8}
        className="font-mono tracking-widest uppercase"
      />
      <Button type="submit" variant="outline" disabled={isPending || !code.trim()} className="shrink-0">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <><LogIn className="h-4 w-4 mr-1.5" />Join</>
        )}
      </Button>
    </form>
  )
}
