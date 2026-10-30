import { useEffect, useState } from 'react'
import { BsPhone } from 'react-icons/bs'

import {
  armCallsFromGesture,
  canPromptInstall,
  isIos,
  isStandalone,
  onInstallable
} from '../utils/push'
import { getStoredName } from '../utils/session'

const InstallHint = ({ compact = false, floating = false }) => {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const sync = () => {
      setStandalone(isStandalone())
      setInstallable(canPromptInstall())
    }
    const media = window.matchMedia('(display-mode: standalone)')
    media.addEventListener?.('change', sync)
    const off = onInstallable(sync)
    return () => {
      media.removeEventListener?.('change', sync)
      off()
    }
  }, [])

  const armed = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  if (hidden || (standalone && armed) || (armed && !installable && !isIos())) {
    return note ? (
      <div className={`toast-note ${floating ? 'toast-note-float' : ''}`}>{note}</div>
    ) : null
  }

  const place = async () => {
    setBusy(true)
    setNote('')
    try {
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      setStandalone(isStandalone())
      setInstallable(canPromptInstall())
      if (result.ok) {
        setNote('Звонки включены')
        setHidden(true)
        return
      }
      if (result.reason === 'ios-install' || (isIos() && !isStandalone())) {
        setNote('Поделиться → На экран «Домой»')
        return
      }
      if (!canPromptInstall() && !isStandalone()) {
        setNote('Меню браузера → На экран')
        return
      }
      if (result.message) setNote(result.message)
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? '…'
    : (standalone || armed)
      ? 'Включить звонки'
      : (installable ? 'Установить и звонки' : 'Значок + звонки')

  return (
    <div className={[
      floating ? 'toast-note toast-note-float' : (compact ? 'install-note install-note-compact' : 'install-note'),
      floating ? 'install-float' : ''
    ].filter(Boolean).join(' ')}>
      <button type="button" className="btn btn-success btn-small" disabled={busy} onClick={place}>
        <BsPhone /> {label}
      </button>
      {note && <p>{note}</p>}
    </div>
  )
}

export default InstallHint
