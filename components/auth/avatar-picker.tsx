'use client'

import { cn } from '@/lib/utils'
import { AVATAR_OPTIONS } from '@/lib/constants'

interface AvatarPickerProps {
  selected: string
  onSelect: (emoji: string) => void
}

export function AvatarPicker({ selected, onSelect }: AvatarPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {AVATAR_OPTIONS.map(({ emoji, label }) => (
        <button
          key={emoji}
          type="button"
          title={label}
          onClick={() => onSelect(emoji)}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl border-2 text-xl transition-all duration-150',
            selected === emoji
              ? 'border-primary bg-primary/15 scale-110 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
              : 'border-border bg-surface-2/60 hover:border-border hover:scale-105'
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
