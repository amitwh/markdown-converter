/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#e5461f',
          dark: '#c93a18',
          light: '#ff6b47',
        },
        success: '#1a7a56',
        warning: '#eab308',
        danger: '#ef4444',
        info: '#0ea5e9',
        warm: {
          50: '#fafbfc',
          100: '#f5f5f5',
          200: '#e3e3e3',
          300: '#d1d1d1',
          400: '#b0b0b0',
          500: '#9a9696',
          600: '#7a7878',
          700: '#5a5858',
          800: '#4e4e4e',
          900: '#464646',
          950: '#0d0b09',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
