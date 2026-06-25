import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        panel: {
          DEFAULT: 'rgba(15, 18, 26, 0.82)',
          border: 'rgba(120, 140, 180, 0.18)',
        },
        accent: {
          DEFAULT: '#5eead4',
          soft: '#2dd4bf',
        },
      },
    },
  },
  plugins: [],
};

export default config;
