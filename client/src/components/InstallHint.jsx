import { useEffect, useState } from 'react'
import { BsBell, BsPhone } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'
import {
  armCallsFromGesture,
  canPromptInstall,
  isAndroid,
  isIos,
  isStandalone,
  onInstallable
} from '../utils/push'
import { getStoredName } from '../utils/session'

/**
 * Compact floating hint inside a room only.
 * Lobby uses AppDownload alone — do not mount both on the same screen.
 */
const InstallHint = ({ compact = false, floating = false }) => {
  const [standalone, setStandalone] = useState(() => isStandalone() || isNativeApp())
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const native = isNativeApp()
  const mobile = native || isAndroid() || isIos()

  useEffect(() => {
    const sync = () => {
      setStandalone(isStandalone() || isNativeApp())
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

  if (!mobile) return null

  const armed = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  // Native / already installed: only nudge if alerts are still off.
  if ((native || standalone) && armed && !note) return null
  if (!native && !standalone) {
    const needsInstall = !armed || (isIos() && !standalone) || installable
    if (!needsInstall && !note) return null
  }

  const place = async () => {
    setBusy(true)
    setNote('')
    try {
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      setStandalone(isStandalone() || isNativeApp())
      setInstallable(canPromptInstall())
      if (result.ok) {
        setNote(result.hint || 'Звонки включены')
        return
      }
      if (result.reason === 'ios-install' || (isIos() && !isStandalone() && !native)) {
        setNote('Поделиться → На экран «Домой»')
        return
      }
      if (result.message) setNote(result.message)
    } finally {
      setBusy(false)
    }
  }

  const label = busy
    ? '…'
    : armed
      ? 'Обновить звонки'
      : (native || standalone)
        ? 'Включить звонки'
        : (isIos() ? 'На экран + звонки' : (installable ? 'Установить и звонки' : 'Включить звонки'))

  return (
    <div className={[
      floating ? 'toast-note toast-note-float install-float' : (compact ? 'install-note install-note-compact' : 'install-note')
    ].join(' ')}>
      <button type="button" className="btn btn-success btn-small" disabled={busy} onClick={place}>
        {armed ? <BsBell /> : <BsPhone />} {label}
      </button>
      {note && <p>{note}</p>}
    </div>
  )
}

export default InstallHint
