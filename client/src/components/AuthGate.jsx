import { useMemo, useState } from 'react'
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [backup, setBackup] = useState('')
  const [showBackupOnce, setShowBackupOnce] = useState(false)

  const join = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const keys = await loadOrCreateKeys()
      const result = await api('/api/auth/join', {
        method: 'POST',
        body: { invite, email, name, publicJwk: keys.publicJwk }
      })
      try { localStorage.setItem('vc-invite', invite.trim()) } catch { /* ignore */ }
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
            Сервер ключ не хранит.
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
        <p className="eyebrow">Invite + E2E · без SMTP</p>
        <h1>Семейный чат</h1>
        <p className="lead">
          Откройте <strong>https://</strong> invite-ссылку с сервера. Браузер
          покажет предупреждение о сертификате — нажмите «Дополнительно» →
          «Перейти». По HTTP камера и шифрование в Chrome не работают.
        </p>
        <p className="lead en">
          Use the <strong>https://</strong> invite from the server terminal.
          Accept the self-signed certificate warning. Plain HTTP breaks camera
          and Web Crypto in Chrome.
        </p>

        <form onSubmit={join}>
          <label className="field">
            <span>Invite-код / Invite code</span>
            <input
              required
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="из терминала сервера / from server terminal"
            />
          </label>
          <label className="field">
            <span>Имя / Name</span>
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Мама" />
          </label>
          <label className="field">
            <span>Почта (ID) / Email (ID)</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ivanov@yandex.ru"
            />
          </label>
          <button type="submit" className="btn btn-success" disabled={busy}>
            Войти / Join
          </button>
        </form>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export default AuthGate
