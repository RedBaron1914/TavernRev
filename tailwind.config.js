/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        splash: {
          "0%, 100%": { transform: "scale(1) rotate(-2deg)" },
          "50%": { transform: "scale(1.1) rotate(2deg)" },
        },
      },
      animation: {
        splash: "splash 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar'),
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
  ],
}