import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '../data')
const vapidPath = join(dataDir, 'vapid.json')
const subsPath = join(dataDir, 'push-subs.json')
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/
const DEVICE_RE = /^[a-z0-9]{8,32}$/

let webpush = null
let keys = null

function ensureDir() {
  mkdirSync(dataDir, { recursive: true })
}

function loadKeys() {
  if (keys) return keys
  const fromEnv = {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || ''
  }
  if (fromEnv.publicKey && fromEnv.privateKey) {
    keys = fromEnv
    return keys
  }
  ensureDir()
  if (existsSync(vapidPath)) {
    keys = JSON.parse(readFileSync(vapidPath, 'utf8'))
    return keys
  }
  if (!webpush) return null
  keys = webpush.generateVAPIDKeys()
  writeFileSync(vapidPath, JSON.stringify(keys))
  return keys
}

function loadSubs() {
  try {
    if (!existsSync(subsPath)) return []
    const parsed = JSON.parse(readFileSync(subsPath, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveSubs(list) {
  ensureDir()
  writeFileSync(subsPath, JSON.stringify(list))
}

async function client() {
  if (!webpush) {
    const mod = await import('web-push')
    webpush = mod.default || mod
  }
  const pair = loadKeys()
  if (!pair?.publicKey || !pair?.privateKey) throw new Error('no-keys')
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:calls@video-chat.local',
    pair.publicKey,
    pair.privateKey
  )
  return webpush
}

function validSubscription(subscription) {
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  return typeof endpoint === 'string'
    && endpoint.startsWith('https://')
    && endpoint.length < 1200
    && typeof p256dh === 'string'
    && p256dh.length < 200
    && typeof auth === 'string'
    && auth.length < 120
}

export function attachPush(app) {
  client().catch((error) => console.warn('Web Push unavailable:', error.message))

  app.get('/api/push/public-key', async (_req, res) => {
    try {
      await client()
      res.json({ publicKey: keys.publicKey })
    } catch {
      res.status(503).json({ error: 'Push не настроен / Push is unavailable' })
    }
  })

  app.post('/api/push/subscribe', (req, res) => {
    const roomId = String(req.body?.roomId || '')
    if (!ROOM_RE.test(roomId) || !validSubscription(req.body?.subscription)) {
      res.status(400).json({ error: 'Некорректная подписка / Bad subscription' })
      return
    }
    const deviceId = DEVICE_RE.test(String(req.body?.deviceId || '')) ? String(req.body.deviceId) : ''
    const name = String(req.body?.name || '').replace(/[<>]/g, '').trim().slice(0, 24)
    const endpoint = req.body.subscription.endpoint
    const next = loadSubs().filter((item) => !(item.roomId === roomId && item.subscription.endpoint === endpoint))
    if (next.filter((item) => item.roomId === roomId).length >= 40) {
      res.status(400).json({ error: 'Слишком много подписок / Too many subscriptions' })
      return
    }
    next.push({
      roomId,
      deviceId,
      name,
      subscription: {
        endpoint,
        keys: {
          p256dh: req.body.subscription.keys.p256dh,
          auth: req.body.subscription.keys.auth
        }
      },
      updatedAt: Date.now()
    })
    saveSubs(next)
    res.json({ ok: true, count: next.filter((item) => item.roomId === roomId).length })
  })

  app.post('/api/push/unsubscribe', (req, res) => {
    const roomId = String(req.body?.roomId || '')
    const endpoint = String(req.body?.endpoint || '')
    if (!ROOM_RE.test(roomId) || !endpoint.startsWith('https://')) {
      res.status(400).json({ error: 'Bad unsubscribe' })
      return
    }
    const next = loadSubs().filter((item) => !(item.roomId === roomId && item.subscription.endpoint === endpoint))
    saveSubs(next)
    res.json({ ok: true })
  })
}

async function pushAll(roomId, payload, { skipDevices = [], urgency = 'high', ttl = 45 } = {}) {
  const skip = new Set(skipDevices.filter(Boolean))
  const subs = loadSubs().filter((item) => item.roomId === roomId && !skip.has(item.deviceId))
  const total = loadSubs().filter((item) => item.roomId === roomId).length
  if (!subs.length) return { sent: 0, total }

  let push
  try {
    push = await client()
  } catch {
    return { sent: 0, total, error: 'unavailable' }
  }

  const body = JSON.stringify(payload)
  const stale = []
  const results = await Promise.allSettled(subs.map((item) => push.sendNotification(
    item.subscription,
    body,
    { TTL: ttl, urgency }
  ).catch((error) => {
    const status = error?.statusCode
    if (status === 404 || status === 410) stale.push(item.subscription.endpoint)
    throw error
  })))

  if (stale.length) {
    saveSubs(loadSubs().filter((item) => !(item.roomId === roomId && stale.includes(item.subscription.endpoint))))
  }

  return {
    sent: results.filter((item) => item.status === 'fulfilled').length,
    total
  }
}

export async function sendRing(roomId, { fromName, ringId = '', skipDevices = [] } = {}) {
  const safeName = String(fromName || 'Участник').replace(/\s+/g, ' ').slice(0, 24)
  return pushAll(roomId, {
    title: 'Входящий звонок',
    body: `${safeName} звонит. Откройте, чтобы ответить.`,
    fromName: safeName,
    roomId,
    ringId,
    url: `/room/${roomId}${ringId ? `?ring=${encodeURIComponent(ringId)}` : ''}`,
    tag: `call-${roomId}`
  }, { skipDevices, urgency: 'high', ttl: 60 })
}

export async function sendCancelRing(roomId, { ringId = '', skipDevices = [] } = {}) {
  return pushAll(roomId, {
    type: 'cancel',
    cancel: true,
    roomId,
    ringId,
    title: 'Звонок отменён',
    body: 'Звонок уже завершён',
    tag: `call-${roomId}`
  }, { skipDevices, urgency: 'high', ttl: 30 })
}
