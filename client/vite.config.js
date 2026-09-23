import { existsSync, cpSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = dirname(fileURLToPath(import.meta.url))

function copyMediapipeWasm() {
  const dest = join(root, 'public/mediapipe/wasm')
  const sources = [
    join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
    join(root, '../node_modules/@mediapipe/tasks-vision/wasm')
  ]
  const src = sources.find((path) => existsSync(path))
  if (!src) return
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-mediapipe-wasm',
      buildStart() {
        copyMediapipeWasm()
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true
      },
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
})
