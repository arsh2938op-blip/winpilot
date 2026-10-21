import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// Design tokens for WinPilot.
// The palette is intentionally built around the Windows 11 system accent blue
// and a Mica-like neutral surface, so the app reads as "part of Windows"
// rather than as a generic web dashboard dropped onto the desktop.
export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem'
    },
    extend: {
      fontFamily: {
        // Segoe UI Variable is the native Windows 11 system font — using it
        // (with sane fallbacks) reinforces that WinPilot is an OS companion,
        // not a web app pretending to be a desktop app.
        sans: [
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'sans-serif'
        ],
        display: [
          '"Segoe UI Variable Display"',
          '"Segoe UI Semibold"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif'
        ],
        // Used for stats, versions, command palette input — a small nod to
        // the VS Code / developer-tool lineage this app draws from.
        mono: ['"Cascadia Code"', '"Consolas"', 'ui-monospace', 'monospace']
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))'
        }
      },
      borderRadius: {
        // Fluent-style rounding: friendly but not bubbly.
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 3px)',
        sm: 'calc(var(--radius) - 6px)'
      },
      boxShadow: {
        // Soft, low-elevation shadows rather than hard drop shadows,
        // matching Windows 11's flatter "acrylic" elevation model.
        fluent: '0 2px 8px 0 hsl(220 30% 4% / 0.06), 0 0 1px 0 hsl(220 30% 4% / 0.12)',
        'fluent-lg': '0 8px 24px 0 hsl(220 30% 4% / 0.10), 0 0 1px 0 hsl(220 30% 4% / 0.14)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animate]
} satisfies Config
