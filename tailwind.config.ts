import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   '#080d1a',
          secondary: '#0f172a',
          tertiary:  '#1a2235',
        },
        brand: {
          blue:   '#3b82f6',
          green:  '#10b981',
          red:    '#ef4444',
          orange: '#f97316',
          purple: '#8b5cf6',
          teal:   '#14b8a6',
          amber:  '#f59e0b',
          cyan:   '#06b6d4',
          indigo: '#6366f1',
        },
        muted: '#475569',
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
