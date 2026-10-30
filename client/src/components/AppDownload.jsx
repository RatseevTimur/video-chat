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
  openNotificationSettings,
  promptInstall
} from '../utils/push'
import { getStoredName } from '../utils/session'

const APK_URL = '/downloads/video-chat.apk'

/** Offer the right install path for this device (Android APK / iOS Home Screen / PWA). */
const AppDownload = () => {
  const [apkOk, setApkOk] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (isNativeApp()) return undefined
    fetch(APK_URL, { method: 'HEAD' })
      .then((res) => setApkOk(res.ok))
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

  if (isStandalone()) return null

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

  // —— Android ——
  if (isAndroid()) {
    return (
      <div className="app-download">
        {apkOk && (
          <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
            <BsPhone /> Скачать Android
          </a>
        )}
        {(installable || !apkOk) && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={arm}>
            {busy ? '…' : (installable ? 'Установить в Chrome' : 'Включить звонки')}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-small"
          onClick={() => {
            const ok = openNotificationSettings()
            setNote(ok
              ? 'В настройках включите «Оповещение», звук и вибрацию'
              : 'Долгое нажатие на уведомление → Настройки → Оповещение')
          }}
        >
          Звук уведомлений
        </button>
        <p>Android: установите приложение, разрешите уведомления, затем «Звук уведомлений».</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  // —— Desktop / other ——
  return (
    <div className="app-download">
      {installable && (
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsPhone /> {busy ? '…' : 'Установить приложение'}
        </button>
      )}
      {apkOk && (
        <a className="btn btn-outline" href={APK_URL} download="video-chat.apk">
          APK для Android
        </a>
      )}
      <p>На телефоне откройте этот сайт — предложим установку под вашу платформу.</p>
      {note && <p>{note}</p>}
    </div>
  )
}

export default AppDownload
