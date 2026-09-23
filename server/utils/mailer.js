function canSend() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

async function transport() {
  const nodemailer = await import('nodemailer')
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== '0',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })
}

export async function sendMail({ to, subject, text }) {
  if (!canSend()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mail:dev] to domain ${String(to).split('@')[1] || '?'} :: ${text}`)
    }
    return { delivered: false, dev: true }
  }

  const mailer = await transport()
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text
  })
  return { delivered: true }
}

export function mailConfigured() {
  return canSend()
}
