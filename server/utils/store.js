import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../data')
mkdirSync(dir, { recursive: true })

function pathFor(name) {
  return join(dir, name)
}

export function loadJson(name, fallback) {
  const file = pathFor(name)
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function saveJson(name, data) {
  writeFileSync(pathFor(name), JSON.stringify(data), 'utf8')
}
