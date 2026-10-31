import 'dotenv/config'
import express from 'express'
import { existsSync } from 'fs'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { dirname, join } from 'path'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'

import { attachApi } from './utils/api.js'
import initSocket from './utils/initSocket.js'
import { attachPush } from './utils/push.js'
import { getPort, printBanner } from './utils/messenger.js'
import { ensureTls } from './utils/tls.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const port = getPort()
const distIndex = join(__dirname, '../client/dist/index.html')
// Render's proxy terminates TLS and forwards plain HTTP to $PORT.
const behindProxy = process.env.RENDER === 'true' || process.env.FORCE_HTTP === '1'

if (behindProxy) app.set('trust proxy', 1)

app.disable('x-powered-by')

const HTTPS_PORT = Number(process.env.HTTPS_PORT || 4443)
let httpsReady = false

function isLocalHost(host = '') {
  const name = String(host).replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  return name === 'localhost' || name === '127.0.0.1' || name === '::1'
}

// Browsers on http://192.168.x.x can't open the camera (not a secure context).
// Send page navigations to the HTTPS twin; API/socket stay on HTTP for the APK.
app.use((req, res, next) => {
  if (!httpsReady || req.secure || req.method !== 'GET') return next()
  // Already TLS at a tunnel/proxy (cloudflared → http://127.0.0.1:PORT).
  if (String(req.headers['x-forwarded-proto'] || '').includes('https')) return next()
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
  if (!String(req.headers.accept || '').includes('text/html')) return next()
  const host = req.headers.host || ''
  if (isLocalHost(host)) return next()
  const name = host.replace(/:\d+$/, '')
  res.redirect(302, `https://${name}:${HTTPS_PORT}${req.originalUrl}`)
})

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // Capacitor Android embeds UI at https://localhost and calls this API cross-origin.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  // Allow Capacitor WebView to embed only same-app flows; APIs stay frame-deny.
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.setHeader('X-Frame-Options', 'DENY')
  }
  next()
})
app.use(express.json({ limit: '256kb' }))
attachApi(app)
attachPush(app)

app.get('/api/ice', (_req, res) => {
  // STUN + public TURN so phones on cellular can see each other (pure STUN often fails).
  const iceServers = [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:80?transport=tcp',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: process.env.TURN_USERNAME || 'openrelayproject',
      credential: process.env.TURN_CREDENTIAL || 'openrelayproject'
    }
  ]
  res.json({ iceServers })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'free', version: 'meet-mesh-v4', secure: true })
})

app.use(express.static(join(__dirname, '../client/dist'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    } else if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive')
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Content-Disposition', 'attachment; filename="video-chat.apk"')
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

// One process, two listeners:
//   http://0.0.0.0:PORT        — APK (cleartext API), Vite proxy, localhost browsers
//   https://0.0.0.0:HTTPS_PORT — LAN browsers (camera needs a secure context)
// Behind Render's proxy only HTTP is started.
const server = createHttpServer(app)
let httpsServer = null
if (!behindProxy) {
  try {
    httpsServer = createHttpsServer(ensureTls(), app)
  } catch (error) {
    console.warn('HTTPS unavailable (openssl?), HTTP only:', error.message)
  }
}

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  serveClient: false
})
if (httpsServer) io.attach(httpsServer)

io.on('connection', initSocket)

if (behindProxy && !existsSync(distIndex)) {
  console.error('Missing client/dist/index.html. Build command on Render must be: yarn build')
  process.exit(1)
}

server.on('error', (error) => {
  console.error(`HTTP :${port} failed — ${error.code}. Is another server already running?`)
  process.exit(1)
})

server.listen(port, '0.0.0.0', () => {
  if (!httpsServer) {
    printBanner('http', { httpPort: port })
    return
  }
  httpsServer.on('error', (error) => {
    console.warn(`HTTPS :${HTTPS_PORT} failed — ${error.code}. Continuing HTTP only.`)
    printBanner('http', { httpPort: port })
  })
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    httpsReady = true
    printBanner('https', { httpPort: port, httpsPort: HTTPS_PORT })
  })
})
