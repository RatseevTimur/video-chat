/**
 * Backend origin for API + socket.
 * In the Capacitor APK we embed the UI locally, so window.location.origin is
 * https://localhost — VITE_SERVER_URL must point at the real server.
 */
export function getApiOrigin() {
  const baked = String(import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '')
  if (baked) return baked
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

export function apiUrl(path = '/') {
  const base = getApiOrigin()
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}
