'use client'

import { useState } from 'react'
import { Share2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ShareProfileButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    const url = `${window.location.origin}/profile/${username}`
    try {
      if (navigator.share) {
        await navigator.share({ title: `${username} on CagePredict`, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* user cancelled */ }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} className="shrink-0">
      {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5 mr-1.5" />}
      {copied ? 'Copied!' : 'Share'}
    </Button>
  )
}
