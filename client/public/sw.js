/* Push-only worker: rings subscribers even when the site is closed. No asset cache. */

const rings = new Map()
const VIBRATE = [560, 140, 560, 140, 800]

function stopRing(roomId) {
  const token = rings.get(roomId)
  if (token) token.stop = true
  rings.delete(roomId)
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
      body: data.body || ''
    }

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage(payload))
    const visible = windows.some((client) => client.visibilityState === 'visible')
    if (visible) return

    const token = { stop: false }
    if (payload.roomId) rings.set(payload.roomId, token)
    for (let i = 0; i < 12 && !token.stop; i += 1) {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag || `call-${payload.roomId}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: VIBRATE,
        data: { url: payload.url, roomId: payload.roomId },
        actions: [
          { action: 'accept', title: 'Войти' },
          { action: 'decline', title: 'Отклонить' }
        ]
      })
      if (i < 11 && !token.stop) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    if (payload.roomId) rings.delete(payload.roomId)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  stopRing(event.notification.data?.roomId || '')
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
  // Replacing the same tag also closes the previous notice. The ring loop owns the stop.
})
