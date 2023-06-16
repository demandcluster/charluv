/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin')

module.exports = {
  content: ['./web/**/*.{html,tsx}'],
  theme: {
    extend: {
      textShadow: {
        sm: '0 1px 2px var(--tw-shadow-color)',
        DEFAULT: '0 2px 4px var(--tw-shadow-color)',
        lg: '0 8px 16px var(--tw-shadow-color)',
      },
      fontFamily: {
        body: ['Bai Jamjuree', 'sans-serif'],
        sans: ['Bai Jamjuree', 'sans-serif'],
      },
      screens: {
        xs: '768px',
        sm: '1024px',
      },
      colors: {
        background: '#090b10',
        'background-lighter': '#0d1017',
        purple: {
          50: '#c8aad4',
          100: '#c49acf',
          200: '#bf80c8',
          300: '#bb69c0',
          400: '#b556b4',
          500: '#aa4bae',
          600: '#9840a0',
          700: '#7f348b',
          800: '#60286e',
          900: '#401c4c',
        },
      },
    },
  },
  plugins: [
    plugin(function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'text-shadow': (value) => ({
            textShadow: value,
          }),
        },
        { values: theme('textShadow') }
      )
    }),
  ],
}
