import { useEffect, useState } from 'react'
import { BsBell, BsPhone } from 'react-icons/bs'

import {
  armCallsFromGesture,
  canPromptInstall,
  isIos,
  isStandalone,
  onInstallable,
  openNotificationSettings
} from '../utils/push'
import { getStoredName } from '../utils/session'

const InstallHint = ({ compact = false, floating = false }) => {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [showSound, setShowSound] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )

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
  const needsInstallCta = !armed || (isIos() && !standalone) || installable

  const place = async () => {
    setBusy(true)
    setNote('')
    try {
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      setStandalone(isStandalone())
      setInstallable(canPromptInstall())
      if (result.ok) {
        setShowSound(true)
        setNote(result.hint || 'Звонки включены')
        return
      }
      if (result.reason === 'ios-install' || (isIos() && !isStandalone())) {
        setNote('Поделиться → На экран «Домой»')
        return
      }
      if (result.message) setNote(result.message)
    } finally {
      setBusy(false)
    }
  }

  if (!needsInstallCta && !showSound && !note) return null

  const label = busy
    ? '…'
    : armed
      ? 'Обновить звонки'
      : (isIos() ? 'На экран + звонки' : (installable ? 'Установить и звонки' : 'Включить звонки'))

  return (
    <div className={[
      floating ? 'toast-note toast-note-float install-float' : (compact ? 'install-note install-note-compact' : 'install-note')
    ].join(' ')}>
      {needsInstallCta && (
        <button type="button" className="btn btn-success btn-small" disabled={busy} onClick={place}>
          <BsPhone /> {label}
        </button>
      )}
      {showSound && (
        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={() => {
            const ok = openNotificationSettings()
            setNote(ok
              ? 'Включите «Оповещение», звук и вибрацию'
              : (isIos()
                ? 'Настройки → Уведомления → Video Chat'
                : 'Долгое нажатие на уведомление → Оповещение'))
          }}
        >
          <BsBell /> Звук уведомлений
        </button>
      )}
      {note && <p>{note}</p>}
    </div>
  )
}

export default InstallHint
