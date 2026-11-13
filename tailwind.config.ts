import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#151a21', 800: '#1d2430', 700: '#2a3342', 500: '#5b6677', 300: '#a9b2c0' },
        canvas: '#f2f4f6',
        brand: { DEFAULT: '#2b4bd8', dark: '#1f3aaa', soft: '#e8ecfd' },
        ok: { DEFAULT: '#0f8a5f', soft: '#e3f5ed' },
        warn: { DEFAULT: '#b4690a', soft: '#fdf1dc' },
        bad: { DEFAULT: '#c0392b', soft: '#fbe7e4' },
        demo: { DEFAULT: '#a61e72', soft: '#fbe6f3' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
