import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base תואם לכתובת של GitHub Pages: https://ymalka82810.github.io/Schedule/
export default defineConfig({
  base: '/Schedule/',
  plugins: [react()],
})
