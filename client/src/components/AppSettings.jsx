import { useEffect, useState } from 'react'
import { BsBell, BsGear, BsHouseDoor, BsPhone, BsX } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'
import { setTrackingEnabled, trackingEnabled } from '../utils/prefs'
import {
  armCallsFromGesture,
  canInstallFromHere,
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
  const [installBusy, setInstallBusy] = useState(false)
  const [soundBusy, setSoundBusy] = useState(false)
  const [note, setNote] = useState('')
  const [installNote, setInstallNote] = useState('')
  const [sound, setSound] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [apkOk, setApkOk] = useState(null)
  const [tracking, setTracking] = useState(() => trackingEnabled())

  const native = isNativeApp()
  const standalone = isStandalone()
  const android = isAndroid()
  const ios = isIos()
  const onHome = canInstallFromHere()

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
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      if (result.ok) setNote(result.hint || 'Уведомления о звонках включены')
      else setNote(result.message || 'Не удалось')
    } finally {
      setBusy(false)
    }
  }

  const placeIcon = async () => {
    setInstallBusy(true)
    setInstallNote('')
    try {
      if (!onHome) {
        setInstallNote('Откройте главную страницу (/), затем снова нажмите — иначе ярлык откроет комнату.')
        return
      }
      if (standalone || native) {
        setInstallNote('Приложение уже установлено. Если ярлык открывает комнату — удалите его и поставьте снова с главной.')
        return
      }
      if (ios) {
        setInstallNote('iPhone: Поделиться → На экран «Домой». Делайте это с главной страницы, не из комнаты.')
        return
      }
      if (!installable) {
        setInstallNote('Браузер пока не предлагает ярлык. Откройте главную в Chrome или скачайте APK ниже.')
        return
      }
      const ok = await promptInstall()
      setInstallNote(ok
        ? 'Ярлык создан — он открывает главную. Звонки включите кнопкой ниже.'
        : 'Установка отменена.')
    } finally {
      setInstallBusy(false)
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

            <div className="settings-block">
              <label className="effects-toggle">
                <input
                  type="checkbox"
                  checked={tracking}
                  onChange={(event) => {
                    const on = event.target.checked
                    setTracking(on)
                    setTrackingEnabled(on)
                  }}
                />
                Режим слежения за лицом
              </label>
              <p className="settings-hint">
                Камера мягко кадрирует лицо в кадре. Выключите, если нужен полный обзор комнаты.
              </p>
            </div>

            {native && (
              <div className="settings-block">
                <p className="settings-hint">
                  Режим APK: UI внутри приложения. Для входящего поверх блокировки нужен Firebase: файл google-services.json в android/app и FCM_SERVER_KEY на сервере.
                </p>
              </div>
            )}

            {!native && (
              <div className="settings-block">
                <p className="settings-label">Приложение на телефон</p>
                {android && (
                  <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
                    <BsPhone /> Скачать APK
                  </a>
                )}
                {apkOk === false && <p className="settings-hint">Файл APK на сервере недоступен.</p>}
                {!standalone && !native && (
                  <button type="button" className="btn btn-outline" disabled={installBusy} onClick={placeIcon}>
                    <BsHouseDoor /> {installBusy ? '…' : 'Ярлык на экран (главная)'}
                  </button>
                )}
                <p className="settings-hint">
                  Ярлык и APK всегда открывают главную, не комнату. Если старый ярлык ведёт в комнату — удалите его и поставьте снова отсюда.
                </p>
                {ios && !standalone && (
                  <p className="settings-hint">
                    iPhone: Поделиться → На экран «Домой» (только с главной). Полноценный входящий как в WhatsApp на iOS — отдельный этап (CallKit).
                  </p>
                )}
                {installNote && <p className="settings-hint">{installNote}</p>}
              </div>
            )}

            <div className="settings-block">
              <p className="settings-label">Звонки</p>
              <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
                <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
              </button>
              <button type="button" className="btn btn-outline" disabled={soundBusy} onClick={testSound}>
                {soundBusy ? '…' : 'Проверить звук уведомлений'}
              </button>
              <p className="settings-hint">
                Это разрешение на уведомления, а не установка приложения. Без него входящий при закрытом приложении не дойдёт.
              </p>
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
