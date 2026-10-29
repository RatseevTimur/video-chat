import { useEffect, useState } from 'react'
import { BsPhone } from 'react-icons/bs'

import {
  beginPlaceIcon,
  canPromptInstall,
  enableAllRoomAlerts,
  isIos,
  isStandalone,
  onInstallable
} from '../utils/push'
import { getStoredName } from '../utils/session'

const InstallHint = ({ compact = false }) => {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

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

  if (standalone && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    return null
  }

  const place = async () => {
    setBusy(true)
    setNote('')
    const pending = beginPlaceIcon()
    try {
      const [permission, installed] = await Promise.all([pending.permission, pending.installed])
      if (permission === 'granted') {
        const armed = await enableAllRoomAlerts(getStoredName() || 'Гость')
        if (!armed.ok && armed.message) setNote(armed.message)
      }
      if (installed || isStandalone()) {
        setStandalone(true)
        setNote('Значок создан. Откройте его с экрана — звонки придут даже при блокировке. / Icon added. Open it from the home screen so calls arrive while the phone is locked.')
        return
      }
      if (isIos()) {
        setNote('iPhone не даёт сайту поставить значок сам. Нажмите Поделиться → На экран «Домой», затем откройте значок. / iPhone does not let a site place the icon. Tap Share → Add to Home Screen, then open the icon.')
        return
      }
      if (!installable && !canPromptInstall()) {
        setNote('Меню браузера → Добавить на главный экран. / Browser menu → Add to Home screen.')
      }
    } finally {
      setBusy(false)
      setInstallable(canPromptInstall())
    }
  }

  return (
    <div className={compact ? 'install-note install-note-compact' : 'install-note'}>
      <button type="button" className="btn btn-success" disabled={busy} onClick={place}>
        <BsPhone /> {busy ? '…' : (standalone ? 'Включить звонки / Enable calls' : 'Значок на экран / Add icon')}
      </button>
      {note && <p>{note}</p>}
    </div>
  )
}

export default InstallHint
