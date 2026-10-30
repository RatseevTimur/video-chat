import { useEffect, useState } from 'react'
import { BsPhone } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'
import {
  armCallsFromGesture,
  canPromptInstall,
  isAndroid,
  isIos,
  isStandalone,
  onInstallable,
  promptInstall
} from '../utils/push'
import { getStoredName } from '../utils/session'
import SoundHelpButton from './SoundHelpButton'

const APK_URL = '/downloads/video-chat.apk'

/** Offer the right install path for this device (Android APK / iOS Home Screen / PWA). */
const AppDownload = () => {
  const [apkOk, setApkOk] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (isNativeApp()) return undefined
    // Prefer GET — some mobile browsers mishandle HEAD on large APKs.
    fetch(APK_URL, { method: 'GET', headers: { Range: 'bytes=0-0' } })
      .then((res) => setApkOk(res.ok || res.status === 206))
      .catch(() => setApkOk(false))
    return onInstallable(() => setInstallable(canPromptInstall()))
  }, [])

  if (isNativeApp()) {
    return (
      <p className="app-download-note">
        Приложение установлено · комнаты привязаны к этому телефону
      </p>
    )
  }

  if (isStandalone()) {
    return (
      <div className="app-download">
        <SoundHelpButton />
        {note && <p>{note}</p>}
      </div>
    )
  }

  const arm = async () => {
    setBusy(true)
    setNote('')
    try {
      if (installable) await promptInstall()
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      if (result.ok) {
        setNote(result.hint || 'Звонки включены')
        return
      }
      setNote(result.message || 'Не удалось')
    } finally {
      setBusy(false)
      setInstallable(canPromptInstall())
    }
  }

  // —— iPhone / iPad ——
  if (isIos()) {
    return (
      <div className="app-download">
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsPhone /> {busy ? '…' : 'На экран Домой + звонки'}
        </button>
        <p>iPhone: Поделиться → На экран «Домой», затем откройте значок и разрешите уведомления.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Android phone/tablet —— always show APK CTA (even while checking)
  if (isAndroid()) {
    return (
      <div className="app-download">
        <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
          <BsPhone /> Скачать Android
        </a>
        {apkOk === false && (
          <p>Файл APK ещё не залит на сервер — ниже можно поставить значок Chrome.</p>
        )}
        <button type="button" className="btn btn-outline" disabled={busy} onClick={arm}>
          {busy ? '…' : (installable ? 'Или установить в Chrome' : 'Включить звонки')}
        </button>
        <SoundHelpButton />
        <p>Для звонка на заблокированный экран нужен значок или APK + уведомления.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Desktop —— no APK primary; point people to their phone
  return (
    <div className="app-download">
      {installable && (
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsPhone /> {busy ? '…' : 'Установить на этот ПК'}
        </button>
      )}
      <p>APK и звонки на блокировке — откройте этот сайт на телефоне Android.</p>
      {note && <p>{note}</p>}
    </div>
  )
}

export default AppDownload
