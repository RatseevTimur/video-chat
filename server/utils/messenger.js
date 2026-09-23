import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { networkInterfaces } from 'os'
import { nanoid } from 'nanoid'

import { mailConfigured, sendMail } from './mailer.js'

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const CODE_TTL = 10 * 60 * 1000
const MAX_MEMBERS = 12
const MAX_MSG = 4000

/** Everything lives in RAM. Restart = wipe. No disk, no DB. */
const users = Object.create(null)
const chats = Object.create(null)
const messages = Object.create(null)
const sessions = Object.create(null)
const pending = Object.create(null)
const emailSockets = new Map()

let INVITE = process.env.INVITE || randomBytes(9).toString('base64url')
const PORT = Number(process.env.PORT || 4000)
let PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '')

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

export function setPublicUrl(url) {
  PUBLIC_URL = String(url || '').replace(/\/$/, '')
}

export function getPublicUrl() {
  return PUBLIC_URL
}

export function appLink(path = '/') {
  const base = PUBLIC_URL || `https://127.0.0.1:${PORT}`
  const suffix = path.startsWith('/') ? path : `/${path}`
  const join = suffix.includes('?') ? '&' : '?'
  return `${base}${suffix}${join}invite=${INVITE}`
}

export function listLanUrls(port = PORT, protocol = 'https') {
  const urls = []
  if (PUBLIC_URL) urls.push(PUBLIC_URL)
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
    // ignore
  }
  if (!urls.length) urls.push(`${protocol}://127.0.0.1:${port}`)
  return [...new Set(urls)]
}

export function printBanner(protocol = 'https') {
  const urls = listLanUrls(PORT, protocol)
  const invitePaths = urls.map((base) => `${base}/?invite=${INVITE}`)
  const line = '═'.repeat(56)
  const mailNote = mailConfigured()
    ? '  Mail: ON — email OTP + message notifications\n'
    : '  Mail: OFF — OTP printed in this terminal (set MAIL_URL to send real mail)\n'
  const tunnelNote = PUBLIC_URL
    ? `  Public HTTPS (trusted cert): ${PUBLIC_URL}/?invite=${INVITE}\n`
    : '  Tip: run with Cloudflare tunnel for a green-lock random https URL\n'
  console.log(`
${line}
  Family Chat  ·  RAM only  ·  E2E
${line}
${tunnelNote}  Local:   ${protocol}://127.0.0.1:${PORT}/?invite=${INVITE}

  Share:
${invitePaths.map((u) => `  → ${u}`).join('\n')}

  Invite code: ${INVITE}
${mailNote}
  Self-signed IP links need Advanced → Proceed in the browser.
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
    publicJwk: user.publicJwk,
    verified: Boolean(user.verified)
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

export async function startAuth({ invite, email, name, publicJwk }) {
  if (!safeEqual(String(invite || '').trim(), INVITE)) throw new Error('bad_invite')
  const clean = normalizeEmail(email)
  if (!validEmail(clean)) throw new Error('bad_email')
  if (!publicJwk?.x || !publicJwk?.y) throw new Error('bad_key')

  const recent = pending[clean]
  if (recent && now() - recent.at < 25_000) throw new Error('slow_down')

  const code = String(Math.floor(100000 + Math.random() * 900000))
  pending[clean] = {
    hash: hash(code),
    name: String(name || '').replace(/[<>]/g, '').trim().slice(0, 24) || clean.split('@')[0],
    publicJwk,
    at: now(),
    exp: now() + CODE_TTL
  }

  const link = appLink('/')
  const body = [
    `Код подтверждения / Verification code: ${code}`,
    '',
    `Откройте приложение / Open app: ${link}`,
    '',
    'Если это не вы — игнорируйте письмо.'
  ].join('\n')

  const sent = await sendMail({
    to: clean,
    subject: 'Код входа Family Chat / Sign-in code',
    text: body
  })

  return {
    email: clean,
    mail: mailConfigured(),
    delivered: Boolean(sent.delivered),
    hint: sent.delivered
      ? 'Код отправлен на почту / Code sent to email'
      : 'Код напечатан в терминале сервера / Code printed on the server terminal'
  }
}

export function verifyAuth({ email, code }) {
  const clean = normalizeEmail(email)
  const item = pending[clean]
  if (!item || item.exp < now()) throw new Error('expired')
  const a = Buffer.from(item.hash)
  const b = Buffer.from(hash(String(code || '').trim()))
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad_code')
  delete pending[clean]

  users[clean] = {
    email: clean,
    name: item.name,
    publicJwk: item.publicJwk,
    verified: true,
    createdAt: users[clean]?.createdAt || now()
  }

  const token = randomBytes(24).toString('hex')
  sessions[hash(token)] = { email: clean, exp: now() + SESSION_TTL }
  return { token, user: publicUser(users[clean]), invite: INVITE }
}

export function joinWithInvite() {
  throw new Error('need_verify')
}

export function lookupUsers(emailList) {
  return emailList.map(normalizeEmail).filter(validEmail).map((email) => {
    const user = users[email]
    return user
      ? { ...publicUser(user), online: emailSockets.has(email) }
      : { email, missing: true, online: false }
  })
}

export async function createChat({ owner, name, emails }) {
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

  const link = appLink(`/chat/${id}`)
  const ownerName = users[owner]?.name || owner
  await Promise.all(members.filter((m) => m !== owner).map((member) => sendMail({
    to: member,
    subject: `Вас добавили в чат «${chats[id].name}» / Chat invite`,
    text: [
      `${ownerName} добавил(а) вас в семейный чат.`,
      `${ownerName} added you to a family chat.`,
      '',
      `Откройте: ${link}`,
      `Войдите почтой: ${member}`,
      '',
      'Нужен код из письма при входе (подтверждение почты).'
    ].join('\n')
  })))

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

export async function postMessage({ chatId, email, boxes }) {
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

  const link = appLink(`/chat/${chatId}`)
  const fromName = users[email]?.name || email
  await Promise.all(chat.members.filter((m) => m !== normalizeEmail(email)).map((member) => {
    const box = cleanBoxes[member]
    const opaque = box ? `ENC:${item.id}:${box.iv}:${box.ct}` : `ENC:${item.id}`
    return sendMail({
      to: member,
      subject: `Новое сообщение в «${chat.name}» / New message`,
      text: [
        `${fromName} написал(а) вам.`,
        `${fromName} sent you a message.`,
        '',
        `Откройте чат: ${link}`,
        '',
        'Ниже шифротекст (почта его не прочитает):',
        opaque
      ].join('\n')
    })
  }))

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
