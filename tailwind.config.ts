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
        background: '#080808',
        surface: '#111111',
        'surface-2': '#1a1a1a',
        border: '#262626',
        'border-subtle': '#1a1a1a',
        primary: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
          hover: '#dc2626',
          subtle: 'rgba(239,68,68,0.12)',
        },
        accent: {
          DEFAULT: '#f97316',
          gold: '#f59e0b',
        },
        muted: {
          DEFAULT: '#3f3f46',
          foreground: '#71717a',
        },
        foreground: {
          DEFAULT: '#fafafa',
          secondary: '#a1a1aa',
          muted: '#71717a',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...fontFamily.mono],
      },
      backgroundImage: {
        'card-gradient': 'linear-gradient(135deg, #111111 0%, #0d0d0d 100%)',
        'hero-gradient': 'radial-gradient(ellipse at top, rgba(239,68,68,0.15) 0%, transparent 60%)',
        'fighter-gradient-left': 'linear-gradient(to right, rgba(8,8,8,0) 0%, rgba(8,8,8,0.9) 100%)',
        'fighter-gradient-right': 'linear-gradient(to left, rgba(8,8,8,0) 0%, rgba(8,8,8,0.9) 100%)',
      },
      animation: {
        'pulse-red': 'pulse-red 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      keyframes: {
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(239,68,68,0)' },
        },
        'slide-up': {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
