import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '../data')
const tokensPath = join(dataDir, 'fcm-tokens.json')
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/
const DEVICE_RE = /^[a-z0-9]{8,32}$/

function ensureDir() {
  mkdirSync(dataDir, { recursive: true })
}

function loadTokens() {
  try {
    if (!existsSync(tokensPath)) return []
    const parsed = JSON.parse(readFileSync(tokensPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveTokens(list) {
  ensureDir()
  writeFileSync(tokensPath, JSON.stringify(list))
}

export function fcmConfigured() {
  return Boolean(process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY)
}

/** Names of native devices that would hear a ring for this room. */
export function listNativeRingNames(roomId, { skipDevices = [] } = {}) {
  if (!ROOM_RE.test(String(roomId || ''))) return []
  const skip = new Set(skipDevices.filter(Boolean))
  const seen = new Set()
  const names = []
  for (const item of loadTokens()) {
    if (!Array.isArray(item.roomIds) || !item.roomIds.includes(roomId)) continue
    if (skip.has(item.deviceId)) continue
    const label = String(item.name || 'Участник').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Участник'
    const key = `${item.deviceId || ''}|${label}`
    if (seen.has(key)) continue
    seen.add(key)
    names.push(label)
    if (names.length >= 24) break
  }
  return names
}

export function upsertNativeToken({ token, deviceId, name, platform, roomIds = [] }) {
  const safeToken = String(token || '').trim()
  if (safeToken.length < 20 || safeToken.length > 4096) return { ok: false, error: 'bad-token' }
  const safeDevice = DEVICE_RE.test(String(deviceId || '')) ? String(deviceId) : ''
  const safeName = String(name || '').replace(/[<>]/g, '').trim().slice(0, 24)
  const rooms = [...new Set((Array.isArray(roomIds) ? roomIds : [])
    .map((id) => String(id || ''))
    .filter((id) => ROOM_RE.test(id)))]
    .slice(0, 40)

  let list = loadTokens().filter((item) => item.token !== safeToken)
  if (safeDevice) list = list.filter((item) => item.deviceId !== safeDevice)
  list.push({
    token: safeToken,
    deviceId: safeDevice,
    name: safeName,
    platform: platform === 'ios' ? 'ios' : 'android',
    roomIds: rooms,
    updatedAt: Date.now()
  })
  // Cap growth
  if (list.length > 500) list = list.slice(-500)
  saveTokens(list)
  return { ok: true, rooms: rooms.length }
}

export function bindNativeRooms(deviceId, roomIds = []) {
  if (!DEVICE_RE.test(String(deviceId || ''))) return
  const rooms = [...new Set((Array.isArray(roomIds) ? roomIds : [])
    .map((id) => String(id || ''))
    .filter((id) => ROOM_RE.test(id)))]
    .slice(0, 40)
  const list = loadTokens()
  let changed = false
  for (const item of list) {
    if (item.deviceId === deviceId) {
      item.roomIds = rooms
      item.updatedAt = Date.now()
      changed = true
    }
  }
  if (changed) saveTokens(list)
}

async function sendFcm(message) {
  const key = process.env.FCM_SERVER_KEY || process.env.FIREBASE_SERVER_KEY
  if (!key) return { ok: false, error: 'no-key' }
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: text.slice(0, 200) || String(res.status) }
  }
  return { ok: true }
}

/** Wake Android APK devices subscribed to this room (full-screen call path). */
export async function sendNativeRing(roomId, { fromName, ringId = '', skipDevices = [] } = {}) {
  if (!ROOM_RE.test(String(roomId || '')) || !fcmConfigured()) {
    return { sent: 0, total: 0, skipped: 'no-fcm' }
  }
  const skip = new Set(skipDevices.filter(Boolean))
  const targets = loadTokens().filter((item) => (
    item.platform !== 'ios'
    && Array.isArray(item.roomIds)
    && item.roomIds.includes(roomId)
    && !skip.has(item.deviceId)
  ))
  if (!targets.length) return { sent: 0, total: 0 }

  const safeName = String(fromName || 'Участник').replace(/\s+/g, ' ').slice(0, 24)
  const title = 'Входящий звонок'
  const body = `${safeName} звонит. Нажмите «Ответить».`
  const results = await Promise.allSettled(targets.map((item) => sendFcm({
    to: item.token,
    priority: 'high',
    content_available: true,
    time_to_live: 90,
    data: {
      type: 'ring',
      roomId,
      ringId: String(ringId || ''),
      title,
      body,
      fromName: safeName
    }
    // data-only so our CallMessagingService always runs (notification+data can be system-handled).
  })))

  return {
    sent: results.filter((item) => item.status === 'fulfilled' && item.value?.ok).length,
    total: targets.length
  }
}

export async function sendNativeCancel(roomId, { ringId = '', skipDevices = [] } = {}) {
  if (!ROOM_RE.test(String(roomId || '')) || !fcmConfigured()) return { sent: 0 }
  const skip = new Set(skipDevices.filter(Boolean))
  const targets = loadTokens().filter((item) => (
    Array.isArray(item.roomIds)
    && item.roomIds.includes(roomId)
    && !skip.has(item.deviceId)
  ))
  await Promise.allSettled(targets.map((item) => sendFcm({
    to: item.token,
    priority: 'high',
    data: { type: 'cancel', roomId, ringId: String(ringId || '') }
  })))
  return { sent: targets.length }
}

export function attachNativePush(app) {
  app.post('/api/push/native-subscribe', (req, res) => {
    const result = upsertNativeToken({
      token: req.body?.token,
      deviceId: req.body?.deviceId,
      name: req.body?.name,
      platform: req.body?.platform,
      roomIds: req.body?.roomIds
    })
    if (!result.ok) {
      res.status(400).json({ error: 'Bad token' })
      return
    }
    res.json({ ok: true, fcm: fcmConfigured(), ...result })
  })
}
