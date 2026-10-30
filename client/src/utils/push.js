import { listRooms } from './rooms'
import socket from './socket'
import { randomId } from './session'

const ROOMS_KEY = 'vc-call-rooms'
const DEVICE_KEY = 'vc-device'

let installPrompt = null
const installListeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installPrompt = event
    installListeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    installListeners.forEach((fn) => fn())
  })
}

export function onInstallable(listener) {
  installListeners.add(listener)
  return () => installListeners.delete(listener)
}

export function canPromptInstall() {
  return Boolean(installPrompt)
}

export async function promptInstall() {
  if (!installPrompt) return false
  const pending = installPrompt
  installPrompt = null
  installListeners.forEach((fn) => fn())
  pending.prompt()
  const choice = await pending.userChoice.catch(() => ({ outcome: 'dismissed' }))
  return choice?.outcome === 'accepted'
}

/** Install dialog first (needs the tap), then notification permission — same gesture. */
export function beginPlaceIcon() {
  const installed = promptInstall()
  const permission = ('Notification' in window)
    ? Notification.requestPermission().catch(() => 'denied')
    : Promise.resolve('unsupported')
  return { permission, installed }
}

export function isIos() {
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroid() {
  return /android/i.test(navigator.userAgent || '')
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * In-app help for call sound — never navigates away (intent:// left a blank screen).
 * Sends a test notification so Android can open channel settings via long-press.
 */
export async function helpCallSound() {
  const steps = isIos()
    ? [
        'Откройте Настройки → Уведомления → Video Chat (или Safari / Chrome).',
        'Включите уведомления и звук, выключите беззвучный режим телефона.'
      ]
    : [
        'Сейчас появится тестовое уведомление «Проверка звонка».',
        'Долгое нажатие по нему → Настройки / Оповещение.',
        'Режим «Оповещение» (не «Без звука») + звук и вибрация.'
      ]

  let probed = false
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      await probeCallAlert()
      probed = true
    } catch {
      probed = false
    }
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    const permission = await Notification.requestPermission().catch(() => 'denied')
    if (permission === 'granted') {
      try {
        await probeCallAlert()
        probed = true
      } catch {
        probed = false
      }
    }
  }

  return {
    ok: true,
    probed,
    title: 'Звук звонка',
    steps,
    hint: probed
      ? (isIos()
        ? 'Если тихо — проверьте Настройки → Уведомления.'
        : 'Долго нажмите на уведомление «Проверка звонка» и включите «Оповещение».')
      : 'Сначала нажмите «Включить звонки» и разрешите уведомления.'
  }
}

/** @deprecated use helpCallSound — never navigates (old intent:// opened a blank page) */
export function openNotificationSettings() {
  return false
}

export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id || !/^[a-z0-9]{8,32}$/.test(id)) {
      id = randomId(16)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return randomId(16)
  }
}

function readRooms() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeRooms(rooms) {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms))
  } catch {
    // ignore private mode
  }
}

export function alertsEnabled(roomId) {
  return Boolean(readRooms()[roomId]?.on)
}

export function savedAlertRooms() {
  return Object.entries(readRooms())
    .filter(([, value]) => value?.on)
    .map(([roomId]) => roomId)
}

export function watchSavedRooms() {
  const deviceId = getDeviceId()
  const ids = new Set([
    ...savedAlertRooms(),
    ...listRooms().map((room) => room.id)
  ])
  ids.forEach((roomId) => {
    if (roomId) socket.emit('watchRoom', { roomId, deviceId })
  })
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(existing, key) {
  try {
    const a = existing?.options?.applicationServerKey
    // If the browser does not expose the key, keep the existing subscription
    // instead of unsubscribing (that was breaking push after updates).
    if (!a) return true
    const bytes = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a)
    const b = urlBase64ToUint8Array(key)
    if (bytes.length !== b.length) return false
    return bytes.every((value, i) => value === b[i])
  } catch {
    return true
  }
}

async function publicKey() {
  const res = await fetch('/api/push/public-key')
  if (!res.ok) throw new Error('push-key')
  const data = await res.json()
  if (!data?.publicKey) throw new Error('push-key')
  return data.publicKey
}

async function ensureServiceWorker() {
  const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
  reg.update?.().catch(() => {})
  await navigator.serviceWorker.ready
  return reg
}

async function pushSubscription() {
  const reg = await ensureServiceWorker()
  const key = await publicKey()
  const existing = await reg.pushManager.getSubscription()
  if (existing && sameKey(existing, key)) return existing
  if (existing) {
    try {
      // Only replace when we know the VAPID key changed.
      const a = existing.options?.applicationServerKey
      if (a) await existing.unsubscribe().catch(() => {})
      else return existing
    } catch {
      return existing
    }
  }
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  })
}

function fail(reason, message) {
  return { ok: false, reason, message }
}

/** Fires a real OS notice so the user can turn on sound/vibrate in system settings. */
export async function probeCallAlert() {
  if (!pushSupported() || !window.isSecureContext) return false
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await ensureServiceWorker()
    await reg.showNotification('Проверка звонка', {
      body: isAndroid()
        ? 'Долгое нажатие → Настройки → режим «Оповещение» + звук и вибрация.'
        : 'Нужны звук и вибрация для входящих звонков.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'vc-probe-sound',
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [700, 160, 700, 160, 900],
      timestamp: Date.now()
    })
    return true
  } catch {
    return false
  }
}

export function callSoundHint() {
  if (isIos()) {
    return 'Если тихо: отключите беззвучный режим и проверьте уведомления для Video Chat.'
  }
  return 'Если тихо: «Проверить звук» → долгое нажатие на уведомление → «Оповещение».'
}

export async function enableCallAlerts(roomId, name) {
  if (!window.isSecureContext) {
    return fail(
      'insecure',
      'Откройте сайт по HTTPS (или с значка приложения). / Open the site over HTTPS (or from the app icon).'
    )
  }

  if (!pushSupported()) {
    if (isIos() && !isStandalone()) {
      return fail(
        'ios-install',
        'iPhone: Поделиться → На экран «Домой», откройте значок. / iPhone: Share → Add to Home Screen, then open the icon.'
      )
    }
    return fail('unsupported', 'Этот браузер не умеет звонки в фоне. / This browser cannot ring in the background.')
  }

  if (isIos() && !isStandalone()) {
    return fail(
      'ios-install',
      'iPhone: сначала значок на экран «Домой». / iPhone: add the Home Screen icon first.'
    )
  }

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission().catch(() => 'denied')
  }
  if (permission !== 'granted') {
    return fail('denied', 'Разрешите уведомления в настройках. / Allow notifications in settings.')
  }

  try {
    const subscription = await pushSubscription()
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        name: name || '',
        deviceId: getDeviceId(),
        subscription
      })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'subscribe')
    }
    const rooms = readRooms()
    rooms[roomId] = { on: true, name: name || '' }
    writeRooms(rooms)
    socket.emit('watchRoom', { roomId, deviceId: getDeviceId() })
    probeCallAlert().catch(() => {})
    return { ok: true, hint: callSoundHint() }
  } catch (error) {
    const detail = String(error?.message || error || '')
    if (detail.includes('push-key')) {
      return fail('failed', 'Сервер звонков недоступен. / Call server is unavailable.')
    }
    return fail(
      'failed',
      'Не удалось включить звонки. Откройте с значка по HTTPS. / Could not enable calls. Open from the icon over HTTPS.'
    )
  }
}

export async function disableCallAlerts(roomId) {
  const rooms = readRooms()
  if (rooms[roomId]) rooms[roomId].on = false
  writeRooms(rooms)
  socket.emit('unwatchRoom', { roomId, deviceId: getDeviceId() })
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const subscription = await reg?.pushManager?.getSubscription()
    if (!subscription) return
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, endpoint: subscription.endpoint })
    })
  } catch {
    // local flag is already off
  }
}

export async function enableAllRoomAlerts(name) {
  const ids = listRooms().map((room) => room.id)
  if (!ids.length) return { ok: true, count: 0 }
  let last = { ok: true }
  for (const roomId of ids) {
    last = await enableCallAlerts(roomId, name)
    if (!last.ok && last.reason !== 'failed') return last
  }
  return last.ok ? { ok: true, count: ids.length } : last
}

/** One tap: offer install + allow notifications + arm every saved room. */
export async function armCallsFromGesture(name) {
  const pending = beginPlaceIcon()
  const [permission] = await Promise.all([pending.permission, pending.installed])
  if (permission !== 'granted' && Notification.permission !== 'granted') {
    if (isIos() && !isStandalone()) {
      return fail(
        'ios-install',
        'iPhone: Поделиться → На экран «Домой». / iPhone: Share → Add to Home Screen.'
      )
    }
    return fail('denied', 'Нужны уведомления для звонка. / Notifications are required for calls.')
  }
  const armed = await enableAllRoomAlerts(name)
  if (armed.ok) return { ok: true, hint: callSoundHint() }
  return armed
}

export async function resubscribeSaved(name) {
  if (!pushSupported() || !window.isSecureContext) return
  if (Notification.permission !== 'granted') return
  const rooms = savedAlertRooms()
  const ids = rooms.length ? rooms : listRooms().map((room) => room.id)
  if (!ids.length) return
  try {
    const subscription = await pushSubscription()
    await Promise.all(ids.map((roomId) => fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        name: name || readRooms()[roomId]?.name || '',
        deviceId: getDeviceId(),
        subscription
      })
    }).then((res) => {
      if (!res.ok) return
      const map = readRooms()
      map[roomId] = { on: true, name: name || map[roomId]?.name || '' }
      writeRooms(map)
      socket.emit('watchRoom', { roomId, deviceId: getDeviceId() })
    }).catch(() => {})))
  } catch {
    // next visit retries
  }
}
