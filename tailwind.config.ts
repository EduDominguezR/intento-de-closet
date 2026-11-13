import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pastel: {
          pink: '#FADADD',
          lavender: '#E6E0F8',
          mint: '#D5F5E3',
          peach: '#FFE5D0',
          sky: '#D6EAF8',
          cream: '#FFF9DB',
          canvas: '#FFFBFD',
        },
        ink: {
          primary: '#4A4458',
          secondary: '#6B6580',
        },
        cta: {
          primary: '#8B7FD4',
          hover: '#7668C8',
        },
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        sans: ['Quicksand', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
        sheet: '1.5rem',
      },
      boxShadow: {
        soft: '0 8px 30px -10px rgba(74, 68, 88, 0.08)',
        sheet: '0 -8px 32px -8px rgba(74, 68, 88, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
