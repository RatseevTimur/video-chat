import { useState } from 'react'
import { BsBoxArrowInRight, BsCameraVideo, BsChatDots, BsPlus } from 'react-icons/bs'
import { useNavigate } from 'react-router-dom'

import { getStoredName, setStoredName } from '../utils/session'
import socket from '../utils/socket'

const RoomManager = () => {
  const navigate = useNavigate()
  const [name, setName] = useState(getStoredName())
  const [joinId, setJoinId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rememberName = () => setStoredName(name)

  const createRoom = (type) => {
    rememberName()
    setBusy(true)
    setError('')

    const onCreated = ({ roomId }) => {
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      navigate(`/room/${roomId}`)
    }
    const onError = ({ message }) => {
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      setError(message)
      setBusy(false)
    }

    const timer = setTimeout(() => {
      socket.off('roomCreated', onCreated)
      socket.off('roomError', onError)
      setBusy(false)
      setError('Нет связи с сервером / Cannot reach the server')
    }, 5000)

    const onCreatedWrapped = (payload) => {
      clearTimeout(timer)
      onCreated(payload)
    }
    const onErrorWrapped = (payload) => {
      clearTimeout(timer)
      onError(payload)
    }

    socket.once('roomCreated', onCreatedWrapped)
    socket.once('roomError', onErrorWrapped)
    const emitCreate = () => socket.emit('createRoom', { type, name })
    if (socket.connected) emitCreate()
    else {
      socket.once('connect', emitCreate)
      socket.connect()
    }
  }

  const joinRoom = (event) => {
    event.preventDefault()
    const roomId = joinId.trim()
    if (!roomId) {
      setError('Введите код комнаты / Enter a room code')
      return
    }
    rememberName()
    navigate(`/room/${roomId}`)
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="eyebrow">Легковесный Meet с масками / Lightweight Meet + masks</p>
        <h1>Video Chat</h1>
        <p className="lead">
          Без базы данных, без истории. Видео идёт напрямую (WebRTC), чат живёт
          только пока активен звонок.
        </p>
        <p className="lead en">
          No database and no history. Video is peer-to-peer. Chat is wiped when
          everyone hangs up. The room stays.
        </p>

        <label className="field">
          <span>Ваше имя / Your name</span>
          <input
            value={name}
            maxLength={24}
            placeholder="Анна, Саша..."
            onChange={(event) => setName(event.target.value)}
            onBlur={rememberName}
          />
        </label>

        <div className="landing-actions">
          <button type="button" className="btn btn-success" disabled={busy} onClick={() => createRoom('video')}>
            <BsCameraVideo /> <BsPlus /> Видеокомната / Video room
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => createRoom('text')}>
            <BsChatDots /> <BsPlus /> Текстовый чат / Text room
          </button>
        </div>

        <form className="join-form" onSubmit={joinRoom}>
          <input
            value={joinId}
            onChange={(event) => {
              setJoinId(event.target.value)
              setError('')
            }}
            placeholder="Код комнаты / Room code"
          />
          <button type="submit" className="btn btn-primary">
            <BsBoxArrowInRight /> Войти / Join
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        <ul className="landing-notes">
          <li>Откройте ссылку комнаты у родственника — ему придёт входящий звонок на сайте.</li>
          <li>Маски считаются на вашем устройстве и уходят уже в видео.</li>
          <li>Для сложных сетей добавьте TURN в `.env` сервера.</li>
        </ul>
      </div>
    </div>
  )
}

export default RoomManager
