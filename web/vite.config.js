import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.API_PORT || 3001}`,
      '/uploads': `http://localhost:${process.env.API_PORT || 3001}`,
      '/trend-report': `http://localhost:${process.env.API_PORT || 3001}`,
    },
  },
})
