import type { AvatarOption } from '@/types/database'

export const AVATAR_OPTIONS: AvatarOption[] = [
  { emoji: '🥊', label: 'Boxing Glove' },
  { emoji: '🦁', label: 'Lion' },
  { emoji: '🐺', label: 'Wolf' },
  { emoji: '🦅', label: 'Eagle' },
  { emoji: '🐯', label: 'Tiger' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '⚡', label: 'Lightning' },
  { emoji: '💀', label: 'Skull' },
  { emoji: '🗡️', label: 'Dagger' },
  { emoji: '🏆', label: 'Trophy' },
  { emoji: '🎯', label: 'Bullseye' },
  { emoji: '🦊', label: 'Fox' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🦂', label: 'Scorpion' },
  { emoji: '🥷', label: 'Ninja' },
  { emoji: '👊', label: 'Fist' },
]

export const WEIGHT_CLASSES = [
  'Strawweight',
  'Flyweight',
  'Bantamweight',
  'Featherweight',
  'Lightweight',
  'Welterweight',
  'Middleweight',
  'Light Heavyweight',
  'Heavyweight',
  "Women's Strawweight",
  "Women's Flyweight",
  "Women's Bantamweight",
  "Women's Featherweight",
] as const

export const POINTS_PER_CORRECT_PICK = 10

export const MAX_LEADERBOARD_ENTRIES = 100

export const FIGHT_LOCK_BUFFER_MS = 5 * 60 * 1000 // 5 minutes
