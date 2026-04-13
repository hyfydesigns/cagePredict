import type { UserBadgeWithDefinition } from '@/types/database'

const ALL_BADGES = [
  { id: 'first_pick',       icon: '🩸', name: 'First Blood',       description: 'Made your first prediction' },
  { id: 'sharp_eye',        icon: '👁️', name: 'Sharp Eye',         description: '10 correct picks' },
  { id: 'ten_streak',       icon: '🔥', name: 'On Fire',           description: '10-fight correct streak' },
  { id: 'called_the_upset', icon: '🐐', name: 'Giant Killer',      description: 'Picked an underdog winner' },
  { id: 'confidence_king',  icon: '👑', name: 'Confidence King',   description: 'Won 5 Lock picks' },
  { id: 'lock_master',      icon: '🔐', name: 'Lock Master',       description: 'Won a Lock on the main event' },
  { id: 'perfect_card',     icon: '💎', name: 'Perfect Card',      description: 'Correctly called every fight in an event' },
]

interface BadgeShelfProps {
  earned: UserBadgeWithDefinition[]
}

export function BadgeShelf({ earned }: BadgeShelfProps) {
  const earnedIds = new Set(earned.map((b) => b.badge_id))

  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Achievements</h3>
      <div className="flex flex-wrap gap-2">
        {ALL_BADGES.map((badge) => {
          const isEarned = earnedIds.has(badge.id)
          return (
            <div
              key={badge.id}
              title={`${badge.name} — ${badge.description}`}
              className={`
                flex items-center gap-2 rounded-xl px-3 py-2 border text-xs font-semibold transition-all
                ${isEarned
                  ? 'bg-zinc-800 border-zinc-600 text-white'
                  : 'bg-zinc-900/40 border-zinc-800/40 text-zinc-600 opacity-40 grayscale'}
              `}
            >
              <span className="text-base leading-none">{badge.icon}</span>
              <span>{badge.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
