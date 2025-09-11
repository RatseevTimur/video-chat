import { io } from 'socket.io-client'

// Определяем адрес сервера в зависимости от окружения
const getServerUri = () => {
  if (import.meta.env.DEV) {
    // В режиме разработки используем текущий хост
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:4000'
    } else {
      // Если мы на мобильном устройстве в локальной сети
      return `http://${hostname}:4000`
    }
  } else {
    // В продакшене используем тот же хост
    return window.location.origin
  }
}

const SERVER_URI = getServerUri()
console.log('Connecting to Socket.IO server:', SERVER_URI)

const socket = io(SERVER_URI)

export default socket