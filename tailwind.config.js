/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // We can define custom modern dark-theme colors here later if needed
        dark: {
          bg: '#1e1e1e',
          panel: '#252526',
          border: '#3c3c3c',
          accent: '#007acc'
        }
      }
    },
  },
  plugins: [],
}