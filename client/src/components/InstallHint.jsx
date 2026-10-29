import { useEffect, useState } from 'react'
import { BsPhone } from 'react-icons/bs'

import { canPromptInstall, isIos, isStandalone, onInstallable, promptInstall } from '../utils/push'

const InstallHint = ({ compact = false }) => {
  const [standalone, setStandalone] = useState(() => isStandalone())
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)

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

  const install = async () => {
    setBusy(true)
    try {
      await promptInstall()
    } finally {
      setBusy(false)
      setInstallable(canPromptInstall())
    }
  }

  if (standalone) return null

  if (compact) {
    return (
      <div className="install-note install-note-compact">
        <p>
          Чтобы звонок дошёл на заблокированный телефон, добавьте значок на экран «Домой» и нажмите «Включить звонки».
          {' '}
          Add the Home Screen icon, then tap Enable calls.
        </p>
        {installable && (
          <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={install}>
            <BsPhone /> На экран / Add
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="install-note">
      <p>
        Чтобы вам можно было позвонить с заблокированного телефона, поставьте значок Video Chat на экран «Домой», откройте его и в комнате нажмите «Включить звонки».
      </p>
      <p>
        To be rung on a locked phone, add the Video Chat icon to your Home Screen, open it, and tap Enable calls inside the room.
      </p>
      {installable ? (
        <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={install}>
          <BsPhone /> На экран / Add to Home Screen
        </button>
      ) : (
        <p className="install-steps">
          {isIos()
            ? 'iPhone: Поделиться → На экран «Домой». / iPhone: Share → Add to Home Screen.'
            : 'Меню браузера → Добавить на главный экран. / Browser menu → Add to Home screen.'}
        </p>
      )}
    </div>
  )
}

export default InstallHint
