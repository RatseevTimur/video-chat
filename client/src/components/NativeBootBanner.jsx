import { useEffect, useState } from 'react'

import { apiUrl, getApiOrigin } from '../utils/apiOrigin'
import { isNativeApp } from '../utils/native'

/** Shows a clear status when the Capacitor shell cannot reach the API. */
const NativeBootBanner = () => {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!isNativeApp()) return undefined
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' })
        if (!res.ok) throw new Error('health')
        if (!cancelled) setStatus({ ok: true })
      } catch {
        if (!cancelled) {
          setStatus({
            ok: false,
            origin: getApiOrigin() || '—'
          })
        }
      }
    }
    check()
    const timer = window.setInterval(check, 8000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!isNativeApp() || !status || status.ok) return null

  return (
    <div className="native-boot-banner" role="alert">
      <strong>Нет связи с сервером</strong>
      <p>
        Приложение установлено правильно, но не достучалось до API:
        {' '}
        <code>{status.origin}</code>
      </p>
      <p>Телефон и компьютер должны быть в одной Wi‑Fi сети, сервер — запущен.</p>
    </div>
  )
}

export default NativeBootBanner
