import type { Config } from 'tailwindcss';

/**
 * Colours are declared once, as CSS custom properties, in `src/app/globals.css`.
 * Tailwind only references them here — so re-theming the whole app is a single-file edit.
 * See `docs/DESIGN-SYSTEM.md`.
 */
/**
 * Tokens hold space-separated RGB channels, so wrapping them like this is what lets
 * `bg-surface/95` and `ring-brand/25` resolve to a real alpha value.
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('--color-bg'),
        surface: token('--color-surface'),
        'surface-2': token('--color-surface-2'),
        border: token('--color-border'),
        fg: token('--color-fg'),
        muted: token('--color-muted'),
        header: { DEFAULT: token('--color-header'), fg: token('--color-header-fg') },
        brand: {
          DEFAULT: token('--color-brand'),
          fg: token('--color-brand-fg'),
          soft: token('--color-brand-soft'),
          strong: token('--color-brand-strong'),
        },
        accent: {
          DEFAULT: token('--color-accent'),
          fg: token('--color-accent-fg'),
          soft: token('--color-accent-soft'),
        },
        success: { DEFAULT: token('--color-success'), soft: token('--color-success-soft') },
        warning: { DEFAULT: token('--color-warning'), soft: token('--color-warning-soft') },
        danger: { DEFAULT: token('--color-danger'), soft: token('--color-danger-soft') },
        info: { DEFAULT: token('--color-info'), soft: token('--color-info-soft') },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        md: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
    },
  },
  plugins: [],
};

export default config;
