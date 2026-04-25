'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InviteCopyProps {
  inviteUrl: string
  inviteCode: string
}

export function InviteCopy({ inviteUrl, inviteCode }: InviteCopyProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm text-foreground-muted font-mono truncate">
        {inviteUrl}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="shrink-0"
      >
        {copied ? (
          <><Check className="h-4 w-4 text-green-400 mr-1.5" />Copied!</>
        ) : (
          <><Copy className="h-4 w-4 mr-1.5" />Copy</>
        )}
      </Button>
    </div>
  )
}
