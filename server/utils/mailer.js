function parseMailUrl(raw) {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const secure = url.protocol === 'smtps:' || url.port === '465'
    return {
      host: url.hostname,
      port: Number(url.port || (secure ? 465 : 587)),
      secure,
      user: decodeURIComponent(url.username || ''),
      pass: decodeURIComponent(url.password || ''),
      from: process.env.SMTP_FROM || decodeURIComponent(url.username || '')
    }
  } catch {
    return null
  }
}

function smtpConfig() {
  const fromUrl = parseMailUrl(process.env.MAIL_URL || process.env.SMTP_URL)
  if (fromUrl?.host && fromUrl.user && fromUrl.pass) return fromUrl
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== '0',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.SMTP_FROM || process.env.SMTP_USER
    }
  }
  return null
}

function isSmtpBlocked(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return (
    msg.includes('timeout')
    || msg.includes('etimedout')
    || msg.includes('econnrefused')
    || msg.includes('enotfound')
    || msg.includes('blocked')
    || msg.includes('connect')
  )
}

export function mailConfigured() {
  return Boolean(smtpConfig())
}

/** Mode B: copy ciphertext / invites to mailboxes. Default ON when MAIL_URL is set. */
export function mailStoreEnabled() {
  if (!mailConfigured()) return false
  return process.env.MAIL_STORE !== '0'
}

export function mailStatus() {
  const cfg = smtpConfig()
  if (!cfg) {
    return { ok: false, mode: 'console', detail: 'MAIL_URL not set — codes print in server terminal only' }
  }
  return {
    ok: true,
    mode: mailStoreEnabled() ? 'smtp+store' : 'smtp-auth',
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    from: cfg.from
  }
}

function printConsole(to, subject, text, reason) {
  console.log(`[mail:console] ${reason}`)
  console.log(`[mail:console] → ${to}\n${subject}\n${text}\n`)
}

export async function sendMail({ to, subject, text }) {
  const cfg = smtpConfig()
  if (!cfg) {
    printConsole(to, subject, text, 'MAIL_URL is empty — not sending to inbox')
    return { delivered: false, console: true }
  }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 12_000,
      tls: { servername: cfg.host }
    })

    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text
    })
    console.log(`[mail:smtp] sent to ${to} via ${cfg.host}:${cfg.port} id=${info.messageId || '?'}`)
    return { delivered: true }
  } catch (error) {
    console.error(`[mail:smtp] FAILED to ${to} via ${cfg.host}:${cfg.port}:`, error.message)

    // Many VPS providers block outbound 465/587 — don't hang the UI forever.
    if (isSmtpBlocked(error)) {
      printConsole(
        to,
        subject,
        text,
        `SMTP blocked/timeout on ${cfg.host}:${cfg.port} — VPS often blocks mail ports. Code below (fallback).`
      )
      return {
        delivered: false,
        console: true,
        hint: `SMTP недоступен с VPS (порт ${cfg.port} timeout). Код в терминале сервера / SMTP blocked — code is in the server terminal`
      }
    }

    const err = new Error('mail_failed')
    err.cause = error
    err.detail = error.message
    throw err
  }
}
