import { useEffect, useState } from 'react'
import { BsPhone } from 'react-icons/bs'

import { isNativeApp } from '../utils/native'

const APK_URL = '/downloads/video-chat.apk'

const AppDownload = () => {
  const [available, setAvailable] = useState(null)

  useEffect(() => {
    if (isNativeApp()) return
    fetch(APK_URL, { method: 'HEAD' })
      .then((res) => setAvailable(res.ok))
      .catch(() => setAvailable(false))
  }, [])

  if (isNativeApp()) {
    return (
      <p className="app-download-note">
        Приложение установлено · комнаты привязаны к этому телефону
      </p>
    )
  }

  if (available === false) return null
  if (available === null) return null

  return (
    <div className="app-download">
      <a className="btn btn-outline" href={APK_URL} download="video-chat.apk">
        <BsPhone /> Скачать Android
      </a>
      <p>
        Одна сборка для всех. Установите → откройте свои комнаты: они сохраняются на устройстве
        и подтягиваются при следующем запуске.
      </p>
    </div>
  )
}

export default AppDownload
