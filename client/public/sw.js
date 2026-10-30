/* Push worker: call alerts when the site is closed/minimized. */

const rings = new Map()
const VIBRATE = [600, 200, 600, 200, 600, 400, 900]

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function stopRing(roomId) {
  const token = rings.get(roomId)
  if (token) token.stop = true
  rings.delete(roomId)
}

async function closeTagged(roomId) {
  const list = await self.registration.getNotifications()
  list.forEach((note) => {
    const tag = String(note.tag || '')
    if (note.data?.roomId === roomId || tag === `call-${roomId}` || tag.startsWith(`call-${roomId}-`)) {
      note.close()
    }
  })
}

async function showCallNotice(payload, pulse) {
  // Stable base tag + pulse suffix so Android re-alerts without stacking forever.
  const tag = pulse === 0 ? `call-${payload.roomId}` : `call-${payload.roomId}-${pulse}`
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: VIBRATE,
    timestamp: Date.now(),
    data: {
      url: payload.url,
      roomId: payload.roomId,
      ringId: payload.ringId || '',
      pulse
    },
    actions: [
      { action: 'accept', title: 'Ответить' },
      { action: 'decline', title: 'Отклонить' }
    ]
  })
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {}
    try {
      data = event.data ? event.data.json() : {}
    } catch {
      data = { title: 'Входящий звонок', body: 'Video Chat' }
    }

    // Caller cancelled — stop pulsing and clear notices.
    if (data.type === 'cancel' || data.cancel) {
      const roomId = data.roomId || ''
      stopRing(roomId)
      await closeTagged(roomId)
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      windows.forEach((client) => client.postMessage({ type: 'ring-cancelled', roomId, ringId: data.ringId || '' }))
      return
    }

    if (data.type === 'chat') {
      const roomId = data.roomId || ''
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      windows.forEach((client) => client.postMessage({
        type: 'chat-message',
        roomId,
        title: data.title || 'Сообщение',
        body: data.body || ''
      }))
      const visible = windows.some((client) => client.visibilityState === 'visible')
      if (visible) return
      await self.registration.showNotification(data.title || 'Сообщение', {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || `chat-${roomId}`,
        renotify: true,
        data: { url: data.url || `/room/${roomId}`, roomId },
        vibrate: [120, 80, 120]
      })
      return
    }

    const payload = {
      type: 'incoming-call',
      roomId: data.roomId || '',
      ringId: data.ringId || '',
      fromName: data.fromName || '',
      url: data.url || '/',
      title: data.title || 'Входящий звонок',
      body: data.body || 'Откройте, чтобы ответить'
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage(payload))
    const visible = windows.some((client) => client.visibilityState === 'visible')
    if (visible) return

    const roomId = payload.roomId || 'call'
    stopRing(roomId)
    const token = { stop: false }
    rings.set(roomId, token)

    for (let i = 0; i < 8 && !token.stop; i += 1) {
      if (i > 0) await closeTagged(roomId)
      await showCallNotice(payload, i)
      if (i < 7 && !token.stop) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
    rings.delete(roomId)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const roomId = event.notification.data?.roomId || ''
  const ringId = event.notification.data?.ringId || ''
  stopRing(roomId)
  event.waitUntil(closeTagged(roomId))
  if (event.action === 'decline') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      windows.forEach((client) => client.postMessage({ type: 'ring-declined', roomId, ringId }))
    })())
    return
  }
  const url = new URL(event.notification.data?.url || '/', self.location.origin)
  if (ringId) url.searchParams.set('ring', ringId)
  const href = url.href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        client.postMessage({ type: 'navigate-call', url: href, roomId, ringId })
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(href)
  })())
})

self.addEventListener('notificationclose', () => {})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'stop-ring') {
    const roomId = event.data.roomId || ''
    stopRing(roomId)
    event.waitUntil(closeTagged(roomId))
  }
})
