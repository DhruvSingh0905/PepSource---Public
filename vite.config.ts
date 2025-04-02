import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

// Completely disable SSL verification

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd())
  
  // Use API_URL from env or fallback to localhost
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'
  
  return {
    server: {
      proxy: {
        '/api': apiUrl
      }
    },
    plugins: [react()],
  }
})
