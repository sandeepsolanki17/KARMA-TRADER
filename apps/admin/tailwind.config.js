/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0B0D0F',
        panel: '#14171A',
        panelhover: '#1B1F23',
        hairline: '#262B30',
        ink: '#E7E9EA',
        muted: '#8A9199',
        buy: '#3DDC84',
        sell: '#FF6B5B',
        amber: '#F5B942',
        info: '#5B9DFF',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      letterSpacing: {
        wider2: '0.08em',
      },
    },
  },
  plugins: [],
};
