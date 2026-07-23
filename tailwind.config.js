/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Gloock', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        pink: {
          400: 'rgb(var(--color-primary-light-rgb, 244 114 182) / <alpha-value>)',
          500: 'rgb(var(--color-primary-rgb, 236 72 153) / <alpha-value>)',
          600: 'rgb(var(--color-primary-dark-rgb, 219 39 119) / <alpha-value>)',
        },
        slate: {
          50: '#ffffff',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#404040',
          700: '#1a1a1a',
          800: '#0a0a0a',
          900: '#000000',
          950: '#000000',
        }
      }
    }
  },
  plugins: [],
}
