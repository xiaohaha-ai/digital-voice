import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = (process.env.API_ORIGIN?.trim() || `http://127.0.0.1:${process.env.API_PORT ?? '8787'}`).replace(/\/$/, '')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/uploads': { target: apiTarget, changeOrigin: true },
    },
  },
})
