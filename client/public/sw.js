/* Push-only worker: rings subscribers even when the site is closed. No asset cache. */

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

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || `call-${payload.roomId}`,
      renotify: true,
      requireInteraction: true,
      vibrate: [180, 80, 180, 80, 240],
      data: { url: payload.url, roomId: payload.roomId },
      actions: [
        { action: 'accept', title: 'Войти' },
        { action: 'decline', title: 'Отклонить' }
      ]
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
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

self.addEventListener('notificationclose', () => {})
