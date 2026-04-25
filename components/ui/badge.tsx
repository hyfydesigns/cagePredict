import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-white',
        secondary: 'border-transparent bg-surface-3 text-foreground',
        outline: 'border-border text-foreground-muted bg-transparent',
        success: 'border-green-500/40 bg-green-500/10 text-green-400',
        destructive: 'border-red-500/40 bg-red-500/10 text-red-400',
        warning: 'border-amber-600 dark:border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        live: 'border-red-500 bg-red-500/20 text-red-400 animate-pulse-red',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
