process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Completely disable SSL verification

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_PRODUCTION_URL || 'http://localhost:8000',
        secure: false
      }
    },
    https: {
      key: undefined,
      cert: undefined
    }
  },
  plugins: [react()],
})
