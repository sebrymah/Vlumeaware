import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1720',
        slate: { 850: '#172033' },
      },
    },
  },
  plugins: [],
} satisfies Config;
