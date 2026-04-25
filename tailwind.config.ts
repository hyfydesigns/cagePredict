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
        background: '#111115',
        surface: '#18181c',
        'surface-2': '#222228',
        border: '#2e2e38',
        'border-subtle': '#222228',
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
        'card-gradient': 'linear-gradient(135deg, #18181c 0%, #14141a 100%)',
        'hero-gradient': 'radial-gradient(ellipse at top, rgba(239,68,68,0.15) 0%, transparent 60%)',
        'fighter-gradient-left': 'linear-gradient(to right, rgba(17,17,21,0) 0%, rgba(17,17,21,0.9) 100%)',
        'fighter-gradient-right': 'linear-gradient(to left, rgba(17,17,21,0) 0%, rgba(17,17,21,0.9) 100%)',
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
