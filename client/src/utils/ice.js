const FALLBACK = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }
]

let cached = null

export async function getIceServers() {
  if (cached) return cached
  try {
    const response = await fetch('/api/ice', { cache: 'no-store' })
    if (!response.ok) throw new Error('ice')
    const data = await response.json()
    cached = Array.isArray(data.iceServers) && data.iceServers.length ? data.iceServers : FALLBACK
    return cached
  } catch {
    cached = FALLBACK
    return cached
  }
}
