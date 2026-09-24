import { useState } from 'react'
import { BsBoxArrowInRight, BsCameraVideo, BsChatDots, BsPlus } from 'react-icons/bs'
import { Link, useNavigate } from 'react-router-dom'

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
    const roomId = joinId.trim().replace(/^.*\/room\//, '').split(/[?#]/)[0]
    if (!roomId) {
      setError('Введите код или ссылку комнаты / Enter room code or link')
      return
    }
    rememberName()
    navigate(`/room/${roomId}`)
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <p className="eyebrow">Свободный режим / Open link mode</p>
        <h1>Video Chat</h1>
        <p className="lead">
          Создайте комнату → скопируйте ссылку → отправьте родственникам.
          Кто откроет ссылку — сразу в созвоне. Без почты и паролей.
        </p>
        <p className="lead en">
          Create a room, copy the link, send it. Anyone with the link joins.
          No email, no passwords.
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
            <BsCameraVideo /> <BsPlus /> Создать видеозвонок / Create video call
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
            placeholder="Код или ссылка / Code or paste link"
          />
          <button type="submit" className="btn btn-primary">
            <BsBoxArrowInRight /> Войти / Join
          </button>
        </form>

        {error && <div className="error">{error}</div>}

        <ul className="landing-notes">
          <li>В комнате нажмите «Ссылка» и отправьте её кому угодно.</li>
          <li>Маски считаются на устройстве и уже встроены в видео.</li>
          <li>
            Семейный чат с почтой (опционально):{' '}
            <Link to="/family">/family</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}

export default RoomManager
