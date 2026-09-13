/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#1B4F72',
          dark: '#154060',
          light: '#2980B9',
          50: '#EBF5FB',
          100: '#D6EAF8',
        },
        success: {
          DEFAULT: '#27AE60',
          light: '#D5F5E3',
          dark: '#1E8449',
        },
        warning: {
          DEFAULT: '#F39C12',
          light: '#FEF9E7',
          dark: '#D68910',
        },
        danger: {
          DEFAULT: '#E74C3C',
          light: '#FADBD8',
          dark: '#C0392B',
        },
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.12)',
        modal: '0 20px 60px rgba(0,0,0,0.2)',
      },
    },
  },
  plugins: [],
};