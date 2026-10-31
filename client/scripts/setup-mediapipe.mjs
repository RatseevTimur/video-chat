import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs'
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

// Keep only the SIMD build — the other two variants are ~22MB of duplicates.
const keep = new Set([
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm'
])
for (const name of readdirSync(dest)) {
  if (!keep.has(name)) rmSync(join(dest, name), { force: true })
}
console.log('Copied MediaPipe wasm (simd only) to public/mediapipe/wasm')
