import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Semantic status colours (see globals.css).
        // `<alpha-value>` keeps opacity modifiers (bg-warning/15) working.
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        // Re-tinted neutral ramp: cool blue-grey instead of stock slate. Existing
        // `slate-*` classes pick this up, so the whole app re-themes from one place.
        // 400/500 are lifted so secondary and placeholder text keeps >= 4.5:1 on 950/900.
        slate: {
          50: '#f4f6fa',
          100: '#e8ecf4',
          200: '#d3dae8',
          300: '#b7c1d6',
          400: '#98a5bf',
          500: '#7b8aa8',
          600: '#4a5670',
          700: '#2c364c',
          800: '#1c2438',
          900: '#121827',
          950: '#0b101a',
        },
        // Brand blue, slightly more saturated than Tailwind's default.
        blue: {
          300: '#8cc4ff',
          400: '#5aa9ff',
          500: '#3b8ff5',
          600: '#1c69d8',
          700: '#1a56b4',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
export default config;
