/* Push-only worker: rings even when the site is closed. No asset cache. */

const rings = new Map()
const VIBRATE = [800, 200, 800, 200, 800, 200, 1200]

function stopRing(roomId) {
  const token = rings.get(roomId)
  if (token) token.stop = true
  rings.delete(roomId)
}

async function closeTagged(roomId) {
  const list = await self.registration.getNotifications()
  list.forEach((note) => {
    if (note.data?.roomId === roomId || String(note.tag || '').startsWith(`call-${roomId}`)) {
      note.close()
    }
  })
}

async function showCallNotice(payload, pulse) {
  const tag = `call-${payload.roomId}-${pulse}`
  const options = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: VIBRATE,
    timestamp: Date.now(),
    data: { url: payload.url, roomId: payload.roomId, pulse },
    actions: [
      { action: 'accept', title: 'Ответить' },
      { action: 'decline', title: 'Отклонить' }
    ]
  }

  // Newer Chromium: call-style notice with system ringtone (ignored if unsupported).
  try {
    await self.registration.showNotification(payload.title, {
      ...options,
      scenario: 'incoming-call'
    })
    return
  } catch {
    // fall through
  }

  await self.registration.showNotification(payload.title, options)
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {}
    try {
      data = event.data ? event.data.json() : {}
    } catch {
      data = { title: 'Входящий звонок', body: 'Video Chat' }
    }

    const payload = {
      type: 'incoming-call',
      roomId: data.roomId || '',
      fromName: data.fromName || '',
      url: data.url || '/',
      title: data.title || 'Входящий звонок',
      body: data.body || 'Откройте, чтобы ответить'
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage(payload))
    const visible = windows.some((client) => client.visibilityState === 'visible')
    // Foreground page plays its own ringtone + vibrate.
    if (visible) return

    const roomId = payload.roomId || 'call'
    const token = { stop: false }
    rings.set(roomId, token)

    // Pulse with a NEW tag each time so Android re-alerts (same tag often stays silent).
    for (let i = 0; i < 10 && !token.stop; i += 1) {
      await closeTagged(roomId)
      await showCallNotice(payload, i)
      if (i < 9 && !token.stop) {
        await new Promise((resolve) => setTimeout(resolve, 1800))
      }
    }
    rings.delete(roomId)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const roomId = event.notification.data?.roomId || ''
  stopRing(roomId)
  closeTagged(roomId)
  if (event.action === 'decline') return
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        client.postMessage({ type: 'navigate-call', url })
        return
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url)
  })())
})

self.addEventListener('notificationclose', () => {
  // Closing the previous pulse also fires this. The ring loop / click handler owns stop.
})
