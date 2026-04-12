'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCrew } from '@/lib/actions/crews'
import { useToast } from '@/components/ui/use-toast'

export function CreateCrewDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await createCrew({ name, description })
      if (result.error) {
        toast({ title: 'Error', description: result.error, variant: 'destructive' })
      } else {
        toast({ title: 'Crew created!', description: 'Share your invite code with friends.', variant: 'success' as any })
        setOpen(false)
        setName('')
        setDescription('')
        if (result.crewId) router.push(`/crews/${result.crewId}`)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Crew
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Crew</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="crew-name">Crew Name *</Label>
            <Input
              id="crew-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Octagon Kings"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crew-desc">Description</Label>
            <Input
              id="crew-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()} className="flex-1">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Crew'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
