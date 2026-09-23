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

export function mailConfigured() {
  return Boolean(smtpConfig())
}

/** Mode B: copy ciphertext / invites to mailboxes. Default ON when MAIL_URL is set. */
export function mailStoreEnabled() {
  if (!mailConfigured()) return false
  return process.env.MAIL_STORE !== '0'
}

export async function sendMail({ to, subject, text }) {
  const cfg = smtpConfig()
  if (!cfg) {
    console.log(`[mail:console] → ${to}\n${subject}\n${text}\n`)
    return { delivered: false, console: true }
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass }
  })

  await transporter.sendMail({
    from: cfg.from,
    to,
    subject,
    text
  })
  return { delivered: true }
}
