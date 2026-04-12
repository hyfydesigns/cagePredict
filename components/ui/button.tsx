import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]',
        destructive:
          'bg-red-600 text-white hover:bg-red-700',
        outline:
          'border border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600',
        ghost:
          'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
        link:
          'text-primary underline-offset-4 hover:underline',
        secondary:
          'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        'fighter-pick':
          'border-2 border-zinc-700 bg-zinc-800/80 text-white hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_16px_rgba(239,68,68,0.25)] text-base font-bold',
        'fighter-pick-selected':
          'border-2 border-primary bg-primary/15 text-white shadow-[0_0_16px_rgba(239,68,68,0.3)] text-base font-bold scale-[1.02]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-base',
        xl: 'h-14 px-10 text-lg',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
