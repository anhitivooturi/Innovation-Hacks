/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sand: '#f6efe6',
        ink: '#1a1816',
        clay: '#c96e4f',
        ember: '#ec9a5d',
        moss: '#3a7563',
        marine: '#255d7a',
        plum: '#7a4f9a',
        gold: '#dbb267',
      },
      fontFamily: {
        display: ['"Sora"', '"Segoe UI"', 'sans-serif'],
        body: ['"Space Grotesk"', '"Segoe UI"', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 18px 50px rgba(17, 22, 29, 0.14)',
      },
      backgroundImage: {
        'dashboard-glow':
          'radial-gradient(circle at top left, rgba(219, 178, 103, 0.22), transparent 32%), radial-gradient(circle at top right, rgba(37, 93, 122, 0.18), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.9), rgba(246,239,230,0.96))',
      },
      keyframes: {
        rise: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', opacity: 0.7 },
          '70%': { transform: 'scale(1)', opacity: 1 },
          '100%': { transform: 'scale(0.98)', opacity: 0.8 },
        },
      },
      animation: {
        rise: 'rise 450ms ease-out',
        pulseRing: 'pulseRing 1800ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
