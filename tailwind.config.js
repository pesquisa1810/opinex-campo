/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#101D35', 2: '#1B3154', 3: '#26406B' },
        gold: { DEFAULT: '#C6A66B', light: '#E3D3B0', dark: '#A88A50', deep: '#A17D35' },
        line: '#E4E8EF',
        soft: '#EDF1F6',
        mist: '#F3F5F8',
        ink: { DEFAULT: '#18263D', muted: '#687386' },
        alert: '#8B0000',
        ok: '#2F7D55',
        warn: '#B7791F',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(16,29,53,.06), 0 4px 16px rgba(16,29,53,.06)' },
    },
  },
  plugins: [],
}
