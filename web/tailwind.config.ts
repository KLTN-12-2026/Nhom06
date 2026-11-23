import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          active: 'var(--brand-active)',
          foreground: 'var(--brand-fg)',
        },
        background: 'var(--bg)',
        foreground: 'var(--text)',
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text)',
        },
        popover: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: '#FFFFFF',
        },
        secondary: {
          DEFAULT: 'var(--surface-muted)',
          foreground: 'var(--text)',
        },
        muted: {
          DEFAULT: 'var(--surface-muted)',
          foreground: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--surface-muted)',
          foreground: 'var(--text)',
        },
        destructive: {
          DEFAULT: 'var(--risk-critical-fg)',
          foreground: '#FFFFFF',
        },
        info: 'var(--info)',
        border: 'var(--border)',
        input: 'var(--border)',
        ring: 'var(--info)',
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
    },
  },
  plugins: [animate],
};

export default config;
