import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { networkInterfaces } from 'os'
import { nanoid } from 'nanoid'

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const MAX_MEMBERS = 12
const MAX_MSG = 4000

/** Everything lives in RAM. Restart = wipe. No disk, no DB. */
const users = Object.create(null)
const chats = Object.create(null)
const messages = Object.create(null)
const sessions = Object.create(null)
const emailSockets = new Map()

let INVITE = process.env.INVITE || randomBytes(9).toString('base64url')
const PORT = Number(process.env.PORT || 4000)

function now() {
  return Date.now()
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function getInvite() {
  return INVITE
}

export function getPort() {
  return PORT
}

export function listLanUrls(port = PORT, protocol = 'https') {
  const urls = []
  try {
    const nets = networkInterfaces()
    for (const list of Object.values(nets || {})) {
      for (const item of list || []) {
        if (item.family !== 'IPv4' && item.family !== 4) continue
        if (item.internal) continue
        urls.push(`${protocol}://${item.address}:${port}`)
      }
    }
  } catch {
    // sandbox / restricted hosts may block os.networkInterfaces()
  }
  if (!urls.length) urls.push(`${protocol}://127.0.0.1:${port}`)
  return [...new Set(urls)]
}

export function printBanner(protocol = 'https') {
  const urls = listLanUrls(PORT, protocol)
  const invitePaths = urls.map((base) => `${base}/?invite=${INVITE}`)
  const line = '═'.repeat(56)
  const certNote = protocol === 'https'
    ? `
  Browser will warn about the certificate (self-signed).
  Click Advanced → Proceed / Принять риск — это нормально.
`
    : `
  WARNING: plain HTTP. Chrome blocks camera + crypto on http://IP.
  Install openssl and restart for HTTPS.
`
  console.log(`
${line}
  Family Chat  ·  zero-config  ·  RAM only (no database)
${line}
  Local:   ${protocol}://127.0.0.1:${PORT}/?invite=${INVITE}

  Share this invite link with family / friends:
${invitePaths.map((u) => `  → ${u}`).join('\n')}

  Invite code (if they open the site without link):
  → ${INVITE}
${certNote}
  Notes:
  • Restart clears chats/users in RAM (by design).
  • E2E keys stay in the browser.
  • No Yandex password / no SMTP.
${line}
`)
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function validEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email))
}

export function publicUser(user) {
  if (!user) return null
  return {
    email: user.email,
    name: user.name,
    publicJwk: user.publicJwk
  }
}

export function getUser(email) {
  return users[normalizeEmail(email)] || null
}

export function getSession(token) {
  if (!token) return null
  const item = sessions[hash(token)]
  if (!item || item.exp < now()) {
    if (item) delete sessions[hash(token)]
    return null
  }
  return item
}

export function bindSocket(email, socket) {
  emailSockets.set(normalizeEmail(email), socket)
}

export function unbindSocket(email, socket) {
  const key = normalizeEmail(email)
  if (emailSockets.get(key) === socket) emailSockets.delete(key)
}

export function joinWithInvite({ invite, email, name, publicJwk }) {
  if (!safeEqual(String(invite || '').trim(), INVITE)) throw new Error('bad_invite')
  const clean = normalizeEmail(email)
  if (!validEmail(clean)) throw new Error('bad_email')
  if (!publicJwk?.x || !publicJwk?.y) throw new Error('bad_key')

  users[clean] = {
    email: clean,
    name: String(name || '').replace(/[<>]/g, '').trim().slice(0, 24) || clean.split('@')[0],
    publicJwk,
    createdAt: users[clean]?.createdAt || now()
  }

  const token = randomBytes(24).toString('hex')
  sessions[hash(token)] = { email: clean, exp: now() + SESSION_TTL }
  return { token, user: publicUser(users[clean]), invite: INVITE }
}

export function lookupUsers(emailList) {
  return emailList.map(normalizeEmail).filter(validEmail).map((email) => {
    const user = users[email]
    return user
      ? { ...publicUser(user), online: emailSockets.has(email) }
      : { email, missing: true, online: false }
  })
}

export function createChat({ owner, name, emails }) {
  const members = [...new Set([owner, ...emails.map(normalizeEmail)])].filter(validEmail)
  if (members.length < 2) throw new Error('need_members')
  if (members.length > MAX_MEMBERS) throw new Error('too_many')

  const id = nanoid(10)
  chats[id] = {
    id,
    name: String(name || 'Семья / Family').replace(/[<>]/g, '').trim().slice(0, 40),
    members,
    owner,
    roomId: nanoid(10),
    createdAt: now()
  }
  return chats[id]
}

export function listChats(email) {
  const clean = normalizeEmail(email)
  return Object.values(chats).filter((chat) => chat.members.includes(clean))
}

export function getChat(chatId, email) {
  const chat = chats[chatId]
  if (!chat || !chat.members.includes(normalizeEmail(email))) return null
  return chat
}

export function postMessage({ chatId, email, boxes }) {
  const chat = getChat(chatId, email)
  if (!chat) throw new Error('no_chat')
  if (!boxes || typeof boxes !== 'object') throw new Error('bad_box')

  const cleanBoxes = {}
  for (const [member, box] of Object.entries(boxes)) {
    if (!chat.members.includes(normalizeEmail(member))) continue
    if (!box?.iv || !box?.ct || String(box.ct).length > MAX_MSG * 4) continue
    cleanBoxes[normalizeEmail(member)] = {
      iv: String(box.iv).slice(0, 64),
      ct: String(box.ct).slice(0, MAX_MSG * 4)
    }
  }
  if (!Object.keys(cleanBoxes).length) throw new Error('bad_box')

  const item = {
    id: nanoid(10),
    chatId,
    from: normalizeEmail(email),
    ts: now(),
    boxes: cleanBoxes
  }
  const list = messages[chatId] || []
  list.push(item)
  messages[chatId] = list.slice(-200)
  return item
}

export function listMessages(chatId, email) {
  if (!getChat(chatId, email)) return []
  return messages[chatId] || []
}

export function notifyMembers(chatId, exceptEmail, event, payload) {
  const chat = chats[chatId]
  if (!chat) return
  chat.members.forEach((email) => {
    if (email === normalizeEmail(exceptEmail)) return
    emailSockets.get(email)?.emit(event, payload)
  })
}
