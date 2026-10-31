import { io } from 'socket.io-client'

import { getApiOrigin } from './apiOrigin'
import { getStoredId } from './session'

const SERVER_URI = getApiOrigin() || window.location.origin
const socket = io(SERVER_URI, {
  transports: ['polling', 'websocket'],
  autoConnect: true,
  // Never give up: phones drop Wi‑Fi all the time; a dead socket looked like a "broken app".
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
  timeout: 10000
})

// Re-claim the same seat on every (re)connect so the server never mints a second "Гость".
socket.on('connect', () => {
  socket.emit('init', { id: getStoredId() })
})
socket.on('init', ({ id } = {}) => {
  if (!id) return
  try { sessionStorage.setItem('vc-id', id) } catch { /* ignore */ }
})

// Debug hook for automated tests (opt-in via localStorage 'vc-debug').
try {
  if (import.meta.env.DEV || localStorage.getItem('vc-debug')) window.__vcSocket = socket
} catch { /* ignore */ }

export default socket
