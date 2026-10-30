import { io } from 'socket.io-client'

import { getApiOrigin } from './apiOrigin'

const SERVER_URI = getApiOrigin() || window.location.origin
const socket = io(SERVER_URI, {
  transports: ['polling', 'websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 8
})

export default socket
