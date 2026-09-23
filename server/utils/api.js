import {
  createChat,
  getChat,
  getInvite,
  getPublicUrl,
  getSession,
  listChats,
  listMessages,
  listLanUrls,
  lookupUsers,
  postMessage,
  setPublicUrl,
  startAuth,
  verifyAuth
} from './messenger.js'
import { mailConfigured } from './mailer.js'

function auth(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.body?.token || req.query.token
  const session = getSession(token)
  if (!session) {
    const error = new Error('auth')
    error.status = 401
    throw error
  }
  return session
}

function fail(res, error) {
  const map = {
    bad_invite: [403, 'Нужна invite-ссылка с сервера / Need invite from server'],
    bad_email: [400, 'Некорректная почта / Bad email'],
    bad_key: [400, 'Нет ключа шифрования / Missing encryption key'],
    slow_down: [429, 'Подождите 30 секунд / Wait 30 seconds'],
    expired: [400, 'Код устарел — запросите новый / Code expired'],
    bad_code: [400, 'Неверный код / Wrong code'],
    need_verify: [400, 'Нужно подтвердить почту кодом / Verify email with code'],
    need_members: [400, 'Добавьте хотя бы одного родственника / Add at least one relative'],
    too_many: [400, 'Слишком много участников / Too many members'],
    no_chat: [404, 'Чат не найден / Chat not found'],
    bad_box: [400, 'Сообщение не зашифровано / Message is not encrypted'],
    auth: [401, 'Нужен вход / Sign in required']
  }
  const [status, message] = map[error.message] || [error.status || 500, 'Ошибка / Error']
  res.status(status).json({ error: message })
}

export function attachApi(app) {
  app.get('/api/bootstrap', (_req, res) => {
    res.json({
      mode: 'ram',
      mail: mailConfigured(),
      publicUrl: getPublicUrl() || null,
      inviteHint: true,
      urls: listLanUrls(),
      note: 'Email OTP proves ownership. Ciphertext may be emailed as a mailbox copy.'
    })
  })

  app.post('/api/runtime/public-url', (req, res) => {
    try {
      const { invite, url } = req.body || {}
      if (invite !== getInvite()) throw new Error('bad_invite')
      if (!/^https:\/\/[a-z0-9.-]+$/i.test(String(url || '').replace(/\/$/, ''))) {
        res.status(400).json({ error: 'Bad public URL' })
        return
      }
      setPublicUrl(String(url).replace(/\/$/, ''))
      res.json({ ok: true, publicUrl: getPublicUrl() })
    } catch (error) {
      fail(res, error)
    }
  })

  app.post('/api/auth/start', async (req, res) => {
    try {
      res.json(await startAuth(req.body || {}))
    } catch (error) {
      fail(res, error)
    }
  })

  app.post('/api/auth/verify', (req, res) => {
    try {
      res.json(verifyAuth(req.body || {}))
    } catch (error) {
      fail(res, error)
    }
  })

  app.get('/api/me', (req, res) => {
    try {
      const session = auth(req)
      res.json({ email: session.email })
    } catch (error) {
      fail(res, error)
    }
  })

  app.post('/api/lookup', (req, res) => {
    try {
      auth(req)
      const emails = Array.isArray(req.body?.emails) ? req.body.emails : []
      res.json({ users: lookupUsers(emails.slice(0, 12)) })
    } catch (error) {
      fail(res, error)
    }
  })

  app.get('/api/chats', (req, res) => {
    try {
      const session = auth(req)
      res.json({ chats: listChats(session.email) })
    } catch (error) {
      fail(res, error)
    }
  })

  app.post('/api/chats', async (req, res) => {
    try {
      const session = auth(req)
      const chat = await createChat({
        owner: session.email,
        name: req.body?.name,
        emails: Array.isArray(req.body?.emails) ? req.body.emails : []
      })
      res.json({ chat, inviteHint: getInvite() })
    } catch (error) {
      fail(res, error)
    }
  })

  app.get('/api/chats/:id', (req, res) => {
    try {
      const session = auth(req)
      const chat = getChat(req.params.id, session.email)
      if (!chat) throw new Error('no_chat')
      res.json({
        chat,
        users: lookupUsers(chat.members),
        messages: listMessages(chat.id, session.email)
      })
    } catch (error) {
      fail(res, error)
    }
  })

  app.post('/api/chats/:id/messages', async (req, res) => {
    try {
      const session = auth(req)
      const message = await postMessage({
        chatId: req.params.id,
        email: session.email,
        boxes: req.body?.boxes
      })
      res.json({ message })
    } catch (error) {
      fail(res, error)
    }
  })
}
