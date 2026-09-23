import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api, getSession, setSession } from '../utils/auth'
import { exportBackup, loadOrCreateKeys } from '../utils/e2e'
import { setStoredName } from '../utils/session'

const AuthGate = ({ children }) => {
  const [params] = useSearchParams()
  const [session, setLocal] = useState(getSession())
  const defaultInvite = useMemo(() => params.get('invite') || localStorage.getItem('vc-invite') || '', [params])
  const [invite, setInvite] = useState(defaultInvite)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('form')
  const [hint, setHint] = useState('')
  const [mailOn, setMailOn] = useState(false)
  const [mailStore, setMailStore] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [backup, setBackup] = useState('')
  const [showBackupOnce, setShowBackupOnce] = useState(false)

  useEffect(() => {
    api('/api/bootstrap').then((data) => {
      setMailOn(Boolean(data.mail))
      setMailStore(Boolean(data.mailStore))
    }).catch(() => {})
  }, [])

  const start = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const keys = await loadOrCreateKeys()
      const result = await api('/api/auth/start', {
        method: 'POST',
        body: { invite, email, name, publicJwk: keys.publicJwk }
      })
      try { localStorage.setItem('vc-invite', invite.trim()) } catch { /* ignore */ }
      setHint(result.hint || '')
      setStep('code')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/auth/verify', {
        method: 'POST',
        body: { email, code }
      })
      const next = { token: result.token, email: result.user.email, name: result.user.name }
      setSession(next)
      setStoredName(result.user.name)
      setLocal(next)
      if (!localStorage.getItem('vc-key-saved')) {
        setBackup(exportBackup())
        setShowBackupOnce(true)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (session?.token && !(showBackupOnce && backup)) return children

  if (session?.token && showBackupOnce && backup) {
    return (
      <div className="landing">
        <div className="landing-card">
          <h1>Сохраните ключ / Save this key</h1>
          <p className="lead">
            Один раз: без ключа на новом телефоне старые сообщения не прочитать.
          </p>
          <textarea className="backup" readOnly value={backup} rows={6} />
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              try { await navigator.clipboard.writeText(backup) } catch { /* ignore */ }
              try { localStorage.setItem('vc-key-saved', '1') } catch { /* ignore */ }
              setBackup('')
              setShowBackupOnce(false)
            }}
          >
            Скопировал, дальше / Copied, continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="eyebrow">Invite + подтверждение почты / Email verified</p>
        <h1>Семейный чат</h1>
        <p className="lead">
          Вход: только почта + код. После входа чат идёт в памяти (E2E), без
          писем на каждое сообщение — если сервер без MAIL_URL.
        </p>
        <p className="lead en">
          Sign-in: email + code only. After that, chat stays in RAM (E2E).
          Per-message mail is used only when MAIL_URL is configured (mail-as-DB).
        </p>
        <p className="lead">
          {mailStore
            ? '✓ Режим B: почта = авторизация + «БД» (уведомления и шифротекст в письмах)'
            : '✓ Режим A: почта только для кода входа; сообщения только в RAM / сокете'}
        </p>
        <p className="lead">
          {mailOn
            ? 'Код придёт на почту / Code arrives by email'
            : 'Код смотрите в терминале сервера / Code is in the server terminal'}
        </p>

        {step === 'form' ? (
          <form onSubmit={start}>
            <label className="field">
              <span>Invite-код / Invite</span>
              <input required value={invite} onChange={(e) => setInvite(e.target.value)} />
            </label>
            <label className="field">
              <span>Имя / Name</span>
              <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Мама" />
            </label>
            <label className="field">
              <span>Почта / Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivanov@yandex.ru" />
            </label>
            <button type="submit" className="btn btn-success" disabled={busy}>
              Получить код / Get code
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="lead">{hint}</p>
            <label className="field">
              <span>Код из письма / Code from email</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" required />
            </label>
            <button type="submit" className="btn btn-success" disabled={busy}>
              Подтвердить / Verify
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setStep('form')}>
              Назад / Back
            </button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export default AuthGate
