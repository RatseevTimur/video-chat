import { Capacitor } from '@capacitor/core'

import { apiUrl } from './apiOrigin'
import { isNativeApp } from './native'
import { getDeviceId } from './push'
import { listRooms } from './rooms'
import { getStoredName } from './session'

/**
 * Android APK: register FCM token with the server so rings can wake a locked phone.
 * No-ops on web / when Push plugin or google-services.json is missing.
 */
export async function initNativePush() {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return { ok: false, reason: 'not-android' }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const { LocalNotifications } = await import('@capacitor/local-notifications')

    try {
      await LocalNotifications.createChannel({
        id: 'vc_calls',
        name: 'Звонки',
        description: 'Входящие видеозвонки',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'default'
      })
    } catch {
      // older Android / already exists
    }

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'denied' }
    }

    await PushNotifications.register()

    PushNotifications.addListener('registration', (token) => {
      registerNativeToken(token?.value).catch(() => {})
    })
    PushNotifications.addListener('registrationError', (error) => {
      console.warn('native push registration', error)
    })
    PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const data = event?.notification?.data || {}
      const roomId = data.roomId
      if (!roomId) return
      const ringId = data.ringId || ''
      const path = `/room/${roomId}${ringId ? `?ring=${encodeURIComponent(ringId)}` : ''}`
      if (window.location.pathname !== `/room/${roomId}`) {
        window.location.assign(path)
      }
    })

    return { ok: true }
  } catch (error) {
    console.warn('native push unavailable', error)
    return { ok: false, reason: 'unavailable' }
  }
}

async function registerNativeToken(token) {
  if (!token) return
  const roomIds = listRooms().map((room) => room.id)
  if (!roomIds.length) {
    // Still store token against a placeholder watch — server keeps device→token map.
    roomIds.push('_device')
  }
  await fetch(apiUrl('/api/push/native-subscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      deviceId: getDeviceId(),
      name: getStoredName() || 'Гость',
      platform: 'android',
      roomIds: roomIds.filter((id) => id !== '_device'),
      allRooms: true
    })
  })
}

/** Re-bind FCM token to the rooms this device cares about (after arming alerts). */
export async function syncNativePushRooms() {
  if (!isNativeApp() || Capacitor.getPlatform() !== 'android') return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    // Token is delivered via registration listener; request another register to refresh.
    await PushNotifications.register()
  } catch {
    // ignore
  }
}
