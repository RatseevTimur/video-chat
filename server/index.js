import express from 'express'
import { createServer } from 'http'
import { dirname, join } from 'path'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'

import { attachApi } from './utils/api.js'
import initSocket from './utils/initSocket.js'
import { getPort, printBanner } from './utils/messenger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const server = createServer(app)
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
  res.json({ ok: true, mode: 'ram' })
})

app.use(express.static(join(__dirname, '../client/dist')))

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  res.sendFile(join(__dirname, '../client/dist/index.html'))
})

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  serveClient: false
})

io.on('connection', initSocket)

server.listen(port, '0.0.0.0', () => {
  printBanner()
})
