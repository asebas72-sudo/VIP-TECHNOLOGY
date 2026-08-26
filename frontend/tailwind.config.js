/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './pages/**/*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Paleta tomada del sistema legacy (Stylesheet.html)
        accent: {
          DEFAULT: '#7e22ce',
          dark: '#6b21a8',
          soft: '#f3e8ff'
        }
      }
    }
  },
  plugins: []
};
