import { useState } from 'react'
import { BsCameraVideo, BsLink45Deg } from 'react-icons/bs'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { listRooms, rememberRoom } from '../utils/rooms'
import { getStoredName, setStoredName } from '../utils/session'
import socket from '../utils/socket'
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

  const rememberName = () => setStoredName(name.trim() || 'Гость')

  const startMeeting = () => {
    rememberName()
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
    const emit = () => socket.emit('createRoom', { type: 'video', name: name.trim() || 'Гость' })
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
    rememberRoom(roomId, { title: 'Комната' })
    setRooms(listRooms())
    navigate(`/room/${roomId}`)
  }

  const openRoom = (room) => {
    rememberName()
    navigate(`/room/${room.id}`)
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="eyebrow">Семейные комнаты · Family rooms</p>
        <h1>Чаты</h1>
        <InstallHint />
        <div className="room-list">
          {rooms.map((room) => (
            <button key={room.id} type="button" className="room-row" onClick={() => openRoom(room)}>
              <strong>{room.family ? 'Семья' : room.title}</strong>
              <span>{room.family ? 'Семейная комната · Family room' : 'Можно позвонить · Can call'}</span>
            </button>
          ))}
        </div>

        {legacyInvite && (
          <p className="lead" style={{ color: '#0b57d0' }}>
            Старая invite-ссылка больше не нужна. Просто создайте встречу ниже.
          </p>
        )}

        <label className="field">
          <span>Ваше имя / Your name</span>
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
            <BsCameraVideo /> {busy ? 'Создаём…' : 'Начать встречу / Start meeting'}
          </button>
        </div>

        <form className="join-form" onSubmit={joinFromPaste}>
          <input name="code" placeholder="Или вставьте ссылку комнаты / Paste room link" />
          <button type="submit" className="btn btn-primary">
            <BsLink45Deg /> Войти / Join
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        <p className="lead" style={{ marginTop: '1.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
          Семейный чат с почтой (не для созвона): <Link to="/family">/family</Link>
        </p>
      </div>
    </div>
  )
}

export default RoomManager
