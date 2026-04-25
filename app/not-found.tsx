import Link from 'next/link'
import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface border border-border mb-6">
        <Shield className="h-8 w-8 text-foreground-muted" />
      </div>
      <h1 className="text-5xl font-black text-foreground mb-2">404</h1>
      <p className="text-foreground-muted text-lg mb-1">Page not found</p>
      <p className="text-foreground-muted text-sm mb-8 max-w-xs">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/">
        <Button>Back to Fight Card</Button>
      </Link>
    </div>
  )
}
