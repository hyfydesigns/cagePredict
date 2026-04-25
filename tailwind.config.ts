import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        background:       'hsl(var(--background))',
        surface:          'hsl(var(--surface))',
        'surface-2':      'hsl(var(--surface-2))',
        'surface-3':      'hsl(var(--surface-3))',
        border:           'hsl(var(--border))',
        'border-subtle':  'hsl(var(--border-subtle))',
        primary: {
          DEFAULT:        '#ef4444',
          foreground:     '#ffffff',
          hover:          '#dc2626',
          subtle:         'rgba(239,68,68,0.12)',
        },
        accent: {
          DEFAULT:        '#f97316',
          gold:           'hsl(var(--accent-gold))',
        },
        muted: {
          DEFAULT:        'hsl(var(--surface-2))',
          foreground:     'hsl(var(--foreground-muted))',
        },
        foreground: {
          DEFAULT:        'hsl(var(--foreground))',
          secondary:      'hsl(var(--foreground-secondary))',
          muted:          'hsl(var(--foreground-muted))',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono],
      },
      backgroundImage: {
        'card-gradient':            'linear-gradient(135deg, hsl(var(--surface)) 0%, hsl(var(--surface-2)) 100%)',
        'hero-gradient':            'radial-gradient(ellipse at top, rgba(239,68,68,0.15) 0%, transparent 60%)',
        'fighter-gradient-left':    'linear-gradient(to right, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0.9) 100%)',
        'fighter-gradient-right':   'linear-gradient(to left, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0.9) 100%)',
      },
      animation: {
        'pulse-red': 'pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up':  'slide-up 0.3s ease-out',
        'fade-in':   'fade-in 0.4s ease-out',
      },
      keyframes: {
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
          '50%':       { boxShadow: '0 0 0 8px rgba(239,68,68,0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to:   { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
