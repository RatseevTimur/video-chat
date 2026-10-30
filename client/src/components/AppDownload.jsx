import { useEffect, useState } from 'react'
import { BsBell, BsPhone } from 'react-icons/bs'

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

/** One install / alerts block for the lobby — no duplicate sound buttons. */
const AppDownload = () => {
  const [apkOk, setApkOk] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const native = isNativeApp()
  const standalone = isStandalone()
  const android = isAndroid()
  const ios = isIos()

  useEffect(() => {
    if (native) return undefined
    fetch(APK_URL, { method: 'GET', headers: { Range: 'bytes=0-0' } })
      .then((res) => setApkOk(res.ok || res.status === 206))
      .catch(() => setApkOk(false))
    return onInstallable(() => setInstallable(canPromptInstall()))
  }, [native])

  const arm = async () => {
    setBusy(true)
    setNote('')
    try {
      if (!native && installable) await promptInstall()
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

  // —— Capacitor APK / native shell ——
  if (native) {
    return (
      <div className="app-download">
        <p className="app-download-note">Нативное приложение · комнаты на этом телефоне</p>
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить звонки'}
        </button>
        <SoundHelpButton />
        <p>Разрешите уведомления — иначе звонок на блокировке будет тихим.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Already installed as Home Screen / PWA ——
  if (standalone) {
    return (
      <div className="app-download">
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить звонки'}
        </button>
        <SoundHelpButton />
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— iPhone / iPad in Safari/Chrome ——
  if (ios) {
    return (
      <div className="app-download">
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsPhone /> {busy ? '…' : 'На экран Домой + звонки'}
        </button>
        <SoundHelpButton />
        <p>iPhone: Поделиться → На экран «Домой», откройте значок, разрешите уведомления. Отдельного App Store IPA пока нет — это PWA.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Android browser ——
  if (android) {
    return (
      <div className="app-download">
        <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
          <BsPhone /> Скачать приложение (APK)
        </a>
        {apkOk === false && (
          <p>APK на сервере ещё недоступен — можно поставить значок Chrome ниже.</p>
        )}
        <button type="button" className="btn btn-outline" disabled={busy} onClick={arm}>
          {busy ? '…' : (installable ? 'Или значок Chrome + звонки' : 'Включить звонки в браузере')}
        </button>
        <SoundHelpButton />
        <p>Для звонка на блокировке нужен APK или значок + уведомления.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Desktop ——
  return (
    <div className="app-download">
      {installable && (
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsPhone /> {busy ? '…' : 'Установить на этот ПК'}
        </button>
      )}
      <p>Приложение для телефона: откройте этот сайт на Android (APK) или iPhone (На экран «Домой»).</p>
      {note && <p>{note}</p>}
    </div>
  )
}

export default AppDownload
