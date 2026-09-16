import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // KnowBe4-style light surfaces with an emerald brand accent
        canvas: '#F1F5F4',       // app background (cool off-white, slight green bias)
        ink: '#0F1B16',          // near-black text
        brand: {
          50: '#E9F6EF',
          100: '#D2EDDF',
          500: '#0E9F6E',
          600: '#0B7C57',
          700: '#0A6446',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,22,.04), 0 1px 3px rgba(15,27,22,.06)',
        pop: '0 10px 30px -12px rgba(15,27,22,.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
