import { useEffect, useState } from 'react'
import { BsCameraVideo, BsLink45Deg, BsTrash } from 'react-icons/bs'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { enterRoom } from '../utils/appNav'
import { syncDeviceNow } from '../utils/deviceSync'
import { alertsEnabled, armCallsFromGesture, getDeviceId } from '../utils/push'
import { forgetRoom, listRooms, rememberRoom } from '../utils/rooms'
import { getStoredName, setStoredName } from '../utils/session'
import socket from '../utils/socket'
import { allUnread, clearUnread, getUnread } from '../utils/unread'
import AppSettings from './AppSettings'
import NativeBootBanner from './NativeBootBanner'

/** Google Meet–style: name + one click → shareable room link. No email. */
const RoomManager = () => {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState(getStoredName() || 'Гость')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rooms, setRooms] = useState(() => listRooms())
  const [unreadMap, setUnreadMap] = useState(() => allUnread())

  const legacyInvite = params.get('invite')

  useEffect(() => {
    syncDeviceNow(name).then((next) => {
      setRooms(next)
      const stored = getStoredName()
      if (stored) setName(stored)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const refresh = () => setUnreadMap(allUnread())
    const onChat = (payload) => {
      const roomId = payload?.roomId || payload?.message?.roomId
      if (!roomId) return
      if (window.location.pathname === `/room/${roomId}`) return
      // App.jsx owns bumpUnread; we only refresh the badge UI.
      refresh()
    }
    socket.on('chatMessage', onChat)
    window.addEventListener('vc-unread', refresh)
    return () => {
      socket.off('chatMessage', onChat)
      window.removeEventListener('vc-unread', refresh)
    }
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
      enterRoom(navigate, roomId)
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
    enterRoom(navigate, roomId)
  }

  const openRoom = (room) => {
    rememberName()
    armQuietly()
    clearUnread(room.id)
    setUnreadMap(allUnread())
    enterRoom(navigate, room.id)
  }

  const removeRoom = (event, room) => {
    event.stopPropagation()
    if (room.family) return
    if (!window.confirm(`Удалить комнату ${room.title} (${room.id})?`)) return
    setRooms(forgetRoom(room.id))
    setUnreadMap(allUnread())
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <NativeBootBanner />
        <div className="landing-top">
          <h1>Чаты</h1>
          <AppSettings />
        </div>
        <div className="room-list">
          {rooms.map((room) => {
            const unread = Number(unreadMap[room.id] || getUnread(room.id) || 0)
            const callsOn = alertsEnabled(room.id)
            return (
              <div key={room.id} className="room-row-wrap">
                <button type="button" className="room-row" onClick={() => openRoom(room)}>
                  <span className="room-row-main">
                    <strong>{room.family ? 'Семья' : room.title}</strong>
                    <span className={`room-alert-badge ${callsOn ? 'is-on' : ''}`}>
                      {callsOn ? 'звонки вкл' : 'звонки выкл'}
                    </span>
                    {unread > 0 && <span className="room-unread">{unread > 99 ? '99+' : unread}</span>}
                  </span>
                  <span className="room-id">{room.id}</span>
                </button>
                {!room.family && (
                  <button
                    type="button"
                    className="btn btn-outline btn-small room-delete"
                    aria-label={`Удалить ${room.id}`}
                    title="Удалить комнату"
                    onClick={(event) => removeRoom(event, room)}
                  >
                    <BsTrash /> Удалить
                  </button>
                )}
              </div>
            )
          })}
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
