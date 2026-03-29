/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050709',
        gold: '#C9A96E',
        blue: { DEFAULT: '#4D7FFF', light: '#6B96FF' },
        danger: '#E8475F',
        success: '#2ECC99',
        warning: '#F59E0B',
        surface: 'rgba(255,255,255,0.03)',
        'text-primary': '#EAF1FF',
        'text-secondary': '#A8B3C9',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
}

