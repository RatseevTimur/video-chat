import 'dotenv/config'
import express from 'express'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { dirname, join } from 'path'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'

import { attachApi } from './utils/api.js'
import initSocket from './utils/initSocket.js'
import { getPort, printBanner } from './utils/messenger.js'
import { ensureTls } from './utils/tls.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = getPort()

app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})
app.use(express.json({ limit: '256kb' }))
attachApi(app)

app.get('/api/ice', (_req, res) => {
  res.json({
    iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }
    ]
  })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'free', version: 'meet-mesh-v3', secure: true })
})

app.use(express.static(join(__dirname, '../client/dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    } else if (/\.[a-f0-9]{8}\.(js|css)$/i.test(filePath) || filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
  }
}))

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.sendFile(join(__dirname, '../client/dist/index.html'))
})

let server
let protocol = 'https'
try {
  const tls = ensureTls()
  server = createHttpsServer(tls, app)
} catch (error) {
  console.warn('HTTPS unavailable (openssl?), falling back to HTTP:', error.message)
  server = createHttpServer(app)
  protocol = 'http'
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  serveClient: false
})

io.on('connection', initSocket)

server.listen(port, '0.0.0.0', () => {
  printBanner(protocol)
})
