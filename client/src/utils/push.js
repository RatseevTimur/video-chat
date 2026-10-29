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

/** Install dialog and notification permission must both start inside the same tap. */
export function beginPlaceIcon() {
  const permission = ('Notification' in window)
    ? Notification.requestPermission().catch(() => 'denied')
    : Promise.resolve('unsupported')
  const installed = promptInstall()
  return { permission, installed }
}

export function isIos() {
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
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
  savedAlertRooms().forEach((roomId) => {
    socket.emit('watchRoom', { roomId, deviceId })
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

async function publicKey() {
  const res = await fetch('/api/push/public-key')
  if (!res.ok) throw new Error('push-key')
  const data = await res.json()
  if (!data?.publicKey) throw new Error('push-key')
  return data.publicKey
}

async function pushSubscription() {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  const key = await publicKey()
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  })
}

export async function enableCallAlerts(roomId, name) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (isIos() && !isStandalone()) {
      return {
        ok: false,
        reason: 'ios-install',
        message: 'На iPhone звонок с заблокированного экрана работает только с иконки на экране «Домой». Нажмите Поделиться → На экран «Домой», откройте Video Chat и снова включите звонки. / On iPhone, lock-screen calls need the Home Screen icon: Share → Add to Home Screen, open it, then enable calls.'
      }
    }
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Этот браузер не умеет присылать звонки в фоне. Откройте Chrome или Safari и добавьте значок на экран. / This browser cannot ring in the background. Use Chrome or Safari and add the home screen icon.'
    }
  }

  if (isIos() && !isStandalone()) {
    return {
      ok: false,
      reason: 'ios-install',
      message: 'Сначала добавьте значок: Поделиться → На экран «Домой». Затем откройте Video Chat с экрана и нажмите «Включить звонки». / Add the icon first: Share → Add to Home Screen. Open Video Chat from that icon, then enable calls.'
    }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Разрешите уведомления, иначе телефон не зазвонит. / Allow notifications, otherwise the phone will not ring.'
    }
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
    if (!res.ok) throw new Error('subscribe')
    const rooms = readRooms()
    rooms[roomId] = { on: true, name: name || '' }
    writeRooms(rooms)
    socket.emit('watchRoom', { roomId, deviceId: getDeviceId() })
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'failed',
      message: 'Не удалось включить звонки. Нужен HTTPS и открытый сервер. / Could not enable calls. HTTPS and a reachable server are required.'
    }
  }
}

export async function disableCallAlerts(roomId) {
  const rooms = readRooms()
  if (rooms[roomId]) rooms[roomId].on = false
  writeRooms(rooms)
  socket.emit('unwatchRoom', { roomId })
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
  let last = { ok: true }
  for (const roomId of ids) {
    last = await enableCallAlerts(roomId, name)
    if (!last.ok && last.reason !== 'failed') return last
  }
  return last.ok ? { ok: true, count: ids.length } : last
}

export async function resubscribeSaved(name) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const rooms = savedAlertRooms()
  if (!rooms.length) return
  try {
    const subscription = await pushSubscription()
    await Promise.all(rooms.map((roomId) => fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId,
        name: name || readRooms()[roomId]?.name || '',
        deviceId: getDeviceId(),
        subscription
      })
    }).catch(() => {})))
  } catch {
    // keep the saved flag; the next visit retries
  }
}
