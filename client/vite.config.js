import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Позволяет прослушивать на всех сетевых интерфейсах
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true
      }
    }
  }
})
