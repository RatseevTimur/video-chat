import { useEffect, useState } from 'react'
import { BsCameraVideo, BsLink45Deg } from 'react-icons/bs'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { syncDeviceNow } from '../utils/deviceSync'
import { armCallsFromGesture, getDeviceId } from '../utils/push'
import { listRooms, rememberRoom } from '../utils/rooms'
import { getStoredName, setStoredName } from '../utils/session'
import socket from '../utils/socket'
import AppDownload from './AppDownload'
import InstallHint from './InstallHint'

/** Google Meet–style: name + one click → shareable room link. No email. */
const RoomManager = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState(getStoredName() || 'Гость')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rooms, setRooms] = useState(() => listRooms())

  // Old bookmarks /?invite=… must NOT open email form — stay in free mode
  const legacyInvite = params.get('invite')

  useEffect(() => {
    syncDeviceNow(name).then((next) => {
      setRooms(next)
      const stored = getStoredName()
      if (stored) setName(stored)
    }).catch(() => {})
  }, [])

  const rememberName = () => setStoredName(name.trim() || 'Гость')

  const armQuietly = () => {
    armCallsFromGesture(name.trim() || 'Гость').catch(() => {})
  }

  const startMeeting = () => {
    rememberName()
    armQuietly()
    setBusy(true)
    setError('')

    const timer = setTimeout(() => {
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      setBusy(false)
      setError('Нет связи с сервером / Cannot reach the server')
    }, 8000)

    const onCreated = ({ roomId }) => {
      clearTimeout(timer)
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      rememberRoom(roomId, { title: 'Комната' })
      setRooms(listRooms())
      navigate(`/room/${roomId}`)
    }
    const onError = ({ message }) => {
      clearTimeout(timer)
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      setError(message || 'Ошибка')
      setBusy(false)
    }

    socket.once('roomCreated', onCreated)
    socket.once('roomError', onError)
    const emit = () => socket.emit('createRoom', {
      type: 'video',
      name: name.trim() || 'Гость',
      deviceId: getDeviceId()
    })
    if (socket.connected) emit()
    else {
      socket.once('connect', emit)
      socket.connect()
    }
  }

  const joinFromPaste = (event) => {
    event.preventDefault()
    const raw = new FormData(event.target).get('code')
    const roomId = String(raw || '').trim().replace(/^.*\/room\//, '').split(/[?#]/)[0]
    if (!roomId) {
      setError('Вставьте ссылку или код / Paste link or code')
      return
    }
    rememberName()
    armQuietly()
    rememberRoom(roomId, { title: 'Комната' })
    setRooms(listRooms())
    navigate(`/room/${roomId}`)
  }

  const openRoom = (room) => {
    rememberName()
    armQuietly()
    navigate(`/room/${room.id}`)
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <h1>Чаты</h1>
        <AppDownload />
        <InstallHint />
        <div className="room-list">
          {rooms.map((room) => (
            <button key={room.id} type="button" className="room-row" onClick={() => openRoom(room)}>
              <strong>{room.family ? 'Семья' : room.title}</strong>
            </button>
          ))}
        </div>

        {legacyInvite && (
          <p className="lead" style={{ color: '#0b57d0' }}>
            Старая invite-ссылка больше не нужна. Просто создайте встречу ниже.
          </p>
        )}

        <label className="field">
          <span>Имя</span>
          <input
            value={name}
            maxLength={24}
            placeholder="Анна"
            onChange={(e) => setName(e.target.value)}
            onBlur={rememberName}
            onKeyDown={(e) => e.key === 'Enter' && startMeeting()}
          />
        </label>

        <div className="landing-actions">
          <button
            type="button"
            className="btn btn-success"
            disabled={busy}
            onClick={startMeeting}
            style={{ fontSize: '1.1rem', padding: '0.9rem 1.2rem' }}
          >
            <BsCameraVideo /> {busy ? '…' : 'Встреча'}
          </button>
        </div>

        <form className="join-form" onSubmit={joinFromPaste}>
          <input name="code" placeholder="Ссылка комнаты" />
          <button type="submit" className="btn btn-primary">
            <BsLink45Deg /> Войти
          </button>
        </form>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  )
}

export default RoomManager
