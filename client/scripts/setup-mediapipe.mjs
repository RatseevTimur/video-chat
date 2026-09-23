import { cpSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'public/mediapipe/wasm')
const sources = [
  join(root, 'node_modules/@mediapipe/tasks-vision/wasm'),
  join(root, '../node_modules/@mediapipe/tasks-vision/wasm')
]

const src = sources.find((path) => existsSync(path))
if (!src) {
  console.warn('MediaPipe wasm not found. Install @mediapipe/tasks-vision first.')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('Copied MediaPipe wasm to public/mediapipe/wasm')
