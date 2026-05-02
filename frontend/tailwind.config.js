/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // These keys map your custom names to specific Hex codes
        'eco-primary': '#10b981',   // Emerald Green
        'eco-secondary': '#3b82f6', // Sync Blue
        'dark-bg': '#1a1a1a',       // Professional Dark
      },
    },
  },
  plugins: [],
}
