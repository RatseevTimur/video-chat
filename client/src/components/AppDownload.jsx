import { useEffect, useState } from 'react'
import { BsBell, BsHouseDoor, BsPhone } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'
import {
  armCallsFromGesture,
  canInstallFromHere,
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

/** Lobby install / alerts — install never runs from a room page. */
const AppDownload = () => {
  const [apkOk, setApkOk] = useState(null)
  const [installable, setInstallable] = useState(() => canPromptInstall())
  const [busy, setBusy] = useState(false)
  const [installBusy, setInstallBusy] = useState(false)
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
      const result = await armCallsFromGesture(getStoredName() || 'Гость')
      if (result.ok) setNote(result.hint || 'Уведомления о звонках включены')
      else setNote(result.message || 'Не удалось')
    } finally {
      setBusy(false)
    }
  }

  const placeIcon = async () => {
    setInstallBusy(true)
    setNote('')
    try {
      if (!canInstallFromHere()) {
        setNote('Откройте главную (/), иначе ярлык откроет комнату.')
        return
      }
      if (ios) {
        setNote('iPhone: Поделиться → На экран «Домой» (с главной страницы).')
        return
      }
      if (!installable) {
        setNote('Браузер не предлагает ярлык — скачайте APK или откройте в Chrome.')
        return
      }
      const ok = await promptInstall()
      setNote(ok ? 'Ярлык на главную создан. Теперь включите уведомления о звонках.' : 'Установка отменена.')
    } finally {
      setInstallBusy(false)
      setInstallable(canPromptInstall())
    }
  }

  if (native) {
    return (
      <div className="app-download">
        <p className="app-download-note">Нативное приложение · комнаты на этом телефоне</p>
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
        </button>
        <SoundHelpButton />
        <p>Разрешите уведомления — иначе звонок на блокировке будет тихим.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  if (standalone) {
    return (
      <div className="app-download">
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
        </button>
        <SoundHelpButton />
        {note && <p>{note}</p>}
      </div>
    )
  }

  if (ios) {
    return (
      <div className="app-download">
        <button type="button" className="btn btn-outline" disabled={installBusy} onClick={placeIcon}>
          <BsHouseDoor /> {installBusy ? '…' : 'Ярлык на экран (главная)'}
        </button>
        <button type="button" className="btn btn-success" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
        </button>
        <SoundHelpButton />
        <p>Сначала ярлык с главной (Поделиться → На экран «Домой»), потом уведомления.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  if (android) {
    return (
      <div className="app-download">
        <a className="btn btn-success" href={APK_URL} download="video-chat.apk">
          <BsPhone /> Скачать приложение (APK)
        </a>
        {apkOk === false && (
          <p>APK на сервере ещё недоступен — можно поставить значок Chrome ниже.</p>
        )}
        <button type="button" className="btn btn-outline" disabled={installBusy} onClick={placeIcon}>
          <BsHouseDoor /> {installBusy ? '…' : (installable ? 'Ярлык Chrome (главная)' : 'Ярлык пока недоступен')}
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={arm}>
          <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
        </button>
        <SoundHelpButton />
        <p>Ярлык всегда с главной. Для звонка на блокировке лучше APK + уведомления.</p>
        {note && <p>{note}</p>}
      </div>
    )
  }

  return (
    <div className="app-download">
      {installable && (
        <button type="button" className="btn btn-success" disabled={installBusy} onClick={placeIcon}>
          <BsHouseDoor /> {installBusy ? '…' : 'Установить на этот ПК (главная)'}
        </button>
      )}
      <button type="button" className="btn btn-outline" disabled={busy} onClick={arm}>
        <BsBell /> {busy ? '…' : 'Включить уведомления о звонках'}
      </button>
      <p>Телефон: Android — APK; iPhone — На экран «Домой» с главной.</p>
      {note && <p>{note}</p>}
    </div>
  )
}

export default AppDownload
