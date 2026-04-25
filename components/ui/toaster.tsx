'use client'

import { useToast } from './use-toast'
import { CheckCircle, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-xl',
            'bg-surface text-foreground min-w-[280px] max-w-[400px]',
            'animate-slide-up',
            toast.variant === 'destructive' && 'border-red-500/40 bg-red-950/80',
            toast.variant === 'success' && 'border-green-500/40 bg-green-950/80',
            (!toast.variant || toast.variant === 'default') && 'border-border'
          )}
        >
          {toast.variant === 'destructive' && <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
          {toast.variant === 'success' && <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
            {toast.description && <p className="text-xs text-foreground-muted mt-0.5">{toast.description}</p>}
          </div>
          <button onClick={() => dismiss(toast.id)} className="text-foreground-muted hover:text-foreground-secondary shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
