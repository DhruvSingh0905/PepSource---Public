import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Completely disable SSL verification

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000'

    }
  },
  plugins: [react()],
})
