import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // server: {
  //   proxy: {
  //     // Прокси для первого сервера
  //     '/api': {
  //       target: 'http://localhost:3000', // Адрес первого сервера
  //       changeOrigin: true,
  //       secure: false,
  //       rewrite: (path) => path.replace(/^\/api/, '')
  //     },
  //     // Прокси для второго сервера
  //     '/socket': {
  //       target: 'http://localhost:4000', // Адрес второго сервера (например, сервер WebSocket)
  //       changeOrigin: true,
  //       secure: false,
  //       ws: true, // Включить WebSocket прокси
  //       rewrite: (path) => path.replace(/^\/socket/, '')
  //     }
  //   }
  // host: '192.168.0.100', // Позволяет прослушивать на всех сетевых интерфейсах
  // port: 3000,      // Порт, который вы хотите использовать (можно изменить на любой другой)
  // }
})
