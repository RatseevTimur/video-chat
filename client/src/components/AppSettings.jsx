import { useEffect, useState } from 'react'
import { BsBell, BsGear, BsPhone, BsX } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'
import {
  armCallsFromGesture,
  canPromptInstall,
  helpCallSound,
  isAndroid,
  isIos,
  isStandalone,
  onInstallable,
  promptInstall
} from '../utils/push'
import { getStoredName } from '../utils/session'

const APK_URL = '/downloads/video-chat.apk'

/**
 * Single gear on the lobby. Install / calls / sound test live here — not on the home screen.
 */
const AppSettings = () => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [soundBusy, setSoundBusy] = useState(false)
  const [note, setNote] = useState('')
  const [sound, setSound] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [apkOk, setApkOk] = useState(null)

  const native = isNativeApp()
  const standalone = isStandalone()
  const android = isAndroid()
  const ios = isIos()

  useEffect(() => {
    if (native) return undefined
    return onInstallable(() => setInstallable(canPromptInstall()))
  }, [native])

  useEffect(() => {
    if (!open || native || !android) return undefined
    fetch(APK_URL, { method: 'GET', headers: { Range: 'bytes=0-0' } })
      .then((res) => setApkOk(res.ok || res.status === 206))
      .catch(() => setApkOk(false))
    return undefined
  }, [open, native, android])

  const arm = async () => {
    setBusy(true)
    setNote('')
    try {
      if (!native && !standalone && installable) await promptInstall()
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      if (result.ok) setNote(result.hint || 'Звонки включены')
      else setNote(result.message || 'Не удалось')
    } finally {
      setBusy(false)
      setInstallable(canPromptInstall())
    }
  }

  const testSound = async () => {
    setSoundBusy(true)
    try {
      setSound(await helpCallSound())
    } finally {
      setSoundBusy(false)
    }
  }

  const modeLabel = native
    ? 'Нативное приложение (APK)'
    : standalone
      ? 'Значок на экране (PWA)'
      : ios
        ? 'Браузер iPhone'
        : android
          ? 'Браузер Android'
          : 'Браузер'

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-small settings-gear"
        aria-label="Настройки"
        title="Настройки"
        onClick={() => setOpen(true)}
      >
        <BsGear />
      </button>

      {open && (
        <div
          className="settings-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={() => setOpen(false)}
        >
          <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <header className="settings-head">
              <strong id="settings-title">Настройки</strong>
              <button type="button" className="btn btn-outline btn-small" aria-label="Закрыть" onClick={() => setOpen(false)}>
                <BsX />
              </button>
            </header>

            <p className="settings-mode">{modeLabel}</p>

            {native && (
              <p className="settings-hint">
                Вы в оболочке Video Chat — без адресной строки Chrome. Если видите адрес сайта, вы открыли вкладку браузера, а не иконку приложения.
              </p>
            )}

            {!native && android && (
              <div className="settings-block">
                <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
                  <BsPhone /> Скачать APK
                </a>
                {apkOk === false && <p className="settings-hint">Файл APK на сервере недоступен.</p>}
                <p className="settings-hint">
                  Установите APK → откройте иконку «Video Chat» (не вкладку Chrome). Так появляется настоящее приложение без адресной строки.
                </p>
              </div>
            )}

            {!native && ios && !standalone && (
              <div className="settings-block">
                <p className="settings-hint">
                  iPhone: Поделиться → На экран «Домой», затем откройте значок. Отдельного App Store IPA пока нет.
                </p>
              </div>
            )}

            <div className="settings-block">
              <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
                <BsBell /> {busy ? '…' : 'Включить звонки'}
              </button>
              <button type="button" className="btn btn-outline" disabled={soundBusy} onClick={testSound}>
                {soundBusy ? '…' : 'Проверить звук уведомлений'}
              </button>
              {note && <p className="settings-hint">{note}</p>}
            </div>

            {sound && (
              <div className="settings-sound">
                <strong>{sound.title}</strong>
                <ol>
                  {sound.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p>{sound.hint}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default AppSettings
