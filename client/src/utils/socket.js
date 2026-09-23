import { io } from 'socket.io-client'

const SERVER_URI = window.location.origin
const socket = io(SERVER_URI, {
  transports: ['polling', 'websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 8
})

export default socket
