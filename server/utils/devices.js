import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '../data')
const path = join(dataDir, 'devices.json')
const DEVICE_RE = /^[a-z0-9]{8,32}$/
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/

function ensureDir() {
  mkdirSync(dataDir, { recursive: true })
}

function load() {
  try {
    if (!existsSync(path)) return {}
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(map) {
  ensureDir()
  writeFileSync(path, JSON.stringify(map))
}

function cleanRoom(item) {
  const id = String(item?.id || '')
  if (!ROOM_RE.test(id)) return null
  return {
    id,
    title: String(item?.title || 'Комната').replace(/[<>]/g, '').trim().slice(0, 24) || 'Комната',
    family: Boolean(item?.family)
  }
}

/** Merge rooms for a device and return the saved list. */
export function syncDevice(deviceId, { name = '', rooms = [] } = {}) {
  if (!DEVICE_RE.test(deviceId)) return null
  const map = load()
  const prev = map[deviceId] || { rooms: [], name: '', updatedAt: 0 }
  const byId = new Map()
  ;[...(prev.rooms || []), ...(Array.isArray(rooms) ? rooms : [])]
    .map(cleanRoom)
    .filter(Boolean)
    .forEach((room) => byId.set(room.id, room))

  const family = [...byId.values()].find((room) => room.family)
  const rest = [...byId.values()].filter((room) => !room.family).slice(0, 23)
  const nextRooms = family ? [family, ...rest] : rest

  map[deviceId] = {
    name: String(name || prev.name || '').replace(/[<>]/g, '').trim().slice(0, 24),
    rooms: nextRooms,
    updatedAt: Date.now()
  }
  save(map)
  return map[deviceId]
}

export function getDevice(deviceId) {
  if (!DEVICE_RE.test(deviceId)) return null
  return load()[deviceId] || null
}

export function touchDeviceRoom(deviceId, room) {
  const cleaned = cleanRoom(room)
  if (!DEVICE_RE.test(deviceId) || !cleaned) return null
  return syncDevice(deviceId, { rooms: [cleaned] })
}

/** Replace the full room list for a device (used after local delete). */
export function setDeviceRooms(deviceId, { name = '', rooms = [] } = {}) {
  if (!DEVICE_RE.test(deviceId)) return null
  const map = load()
  const byId = new Map()
  ;(Array.isArray(rooms) ? rooms : [])
    .map(cleanRoom)
    .filter(Boolean)
    .forEach((room) => byId.set(room.id, room))
  const family = [...byId.values()].find((room) => room.family)
  const rest = [...byId.values()].filter((room) => !room.family).slice(0, 23)
  const nextRooms = family ? [family, ...rest] : rest
  map[deviceId] = {
    name: String(name || map[deviceId]?.name || '').replace(/[<>]/g, '').trim().slice(0, 24),
    rooms: nextRooms,
    updatedAt: Date.now()
  }
  save(map)
  return map[deviceId]
}

export function removeDeviceRoom(deviceId, roomId) {
  if (!DEVICE_RE.test(deviceId) || !ROOM_RE.test(String(roomId || ''))) return null
  const map = load()
  const prev = map[deviceId]
  if (!prev) return null
  prev.rooms = (prev.rooms || []).filter((room) => room.id !== roomId)
  prev.updatedAt = Date.now()
  map[deviceId] = prev
  save(map)
  return prev
}
