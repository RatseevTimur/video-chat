import React, { useEffect, useState } from 'react'
import { BsBoxArrowInRight, BsCheck, BsCopy, BsPlus } from 'react-icons/bs'
import { Link, useParams } from 'react-router-dom'

import socket from '../utils/socket'

const RoomManager = () => {
  const { roomId: urlRoomId } = useParams()
  const [localId, setLocalId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [createdRoomId, setCreatedRoomId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    socket
      .on('init', ({ id }) => {
        setLocalId(id)
        // Если есть roomId в URL, автоматически присоединяемся
        if (urlRoomId) {
          socket.emit('joinRoom', { roomId: urlRoomId })
        }
      })
      .on('roomCreated', ({ roomId, roomInfo }) => {
        setCreatedRoomId(roomId)
        setRoomId(roomId)
        setRoomInfo(roomInfo)
        setError('')
      })
      .on('roomJoined', ({ roomId, roomInfo }) => {
        setRoomId(roomId)
        setRoomInfo(roomInfo)
        setError('')
      })
      .on('roomError', ({ message }) => {
        setError(message)
      })
      .on('userJoined', ({ userId, roomInfo }) => {
        setRoomInfo(roomInfo)
      })
      .on('userLeft', ({ userId, roomInfo }) => {
        setRoomInfo(roomInfo)
      })
      .on('hostChanged', ({ newHost, roomInfo }) => {
        setRoomInfo(roomInfo)
      })
      .emit('init')

    return () => {
      socket.off('init')
      socket.off('roomCreated')
      socket.off('roomJoined')
      socket.off('roomError')
      socket.off('userJoined')
      socket.off('userLeft')
      socket.off('hostChanged')
    }
  }, [urlRoomId])

  const createRoom = () => {
    socket.emit('createRoom')
  }

  const joinRoom = () => {
    if (!roomId.trim()) {
      setError('Введите ID комнаты')
      return
    }
    socket.emit('joinRoom', { roomId })
  }

  const leaveRoom = () => {
    socket.emit('leaveRoom')
    setRoomId('')
    setCreatedRoomId('')
    setRoomInfo(null)
  }

  const copyRoomLink = () => {
    const link = `${window.location.origin}/room/${createdRoomId}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const getRoomLink = () => {
    return `${window.location.origin}/room/${createdRoomId}`
  }

  return (
    <div className="room-manager">
      <div className="container">
        <h1>🎥 Video Chat Rooms</h1>
        
        <div className="user-info">
          <p><strong>Ваш ID:</strong> {localId}</p>
        </div>

        {!roomId ? (
          <div className="room-actions">
            <div className="create-room">
              <h3>Создать новую комнату</h3>
              <button onClick={createRoom} className="btn btn-primary">
                <BsPlus /> Создать комнату
              </button>
            </div>

            <div className="join-room">
              <h3>Присоединиться к комнате</h3>
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Введите ID комнаты"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value)
                    setError('')
                  }}
                />
                <button onClick={joinRoom} className="btn btn-secondary">
                  <BsBoxArrowInRight /> Присоединиться
                </button>
              </div>
            </div>

            {error && <div className="error">{error}</div>}
          </div>
        ) : (
          <div className="room-info">
            <h3>Комната: {roomId}</h3>
            
            {createdRoomId && (
              <div className="room-link">
                <h4>Ссылка для приглашения:</h4>
                <div className="link-container">
                  <input 
                    type="text" 
                    value={getRoomLink()} 
                    readOnly 
                    className="link-input"
                  />
                  <button 
                    onClick={copyRoomLink} 
                    className="btn btn-small"
                    title="Копировать ссылку"
                  >
                    {copied ? <BsCheck /> : <BsCopy />}
                  </button>
                </div>
              </div>
            )}

            <div className="participants">
              <h4>Участники ({roomInfo?.participantCount || 0}):</h4>
              <div className="participants-list">
                {roomInfo?.participants?.map(participantId => (
                  <div key={participantId} className="participant">
                    <span className="participant-id">{participantId}</span>
                    {participantId === localId && <span className="you">(Вы)</span>}
                    {participantId === roomInfo?.host && <span className="host">👑</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="room-controls">
              <Link to={`/room/${roomId}/call`} className="btn btn-success">
                🎥 Начать видеозвонок
              </Link>
              <button onClick={leaveRoom} className="btn btn-danger">
                Покинуть комнату
              </button>
            </div>
          </div>
        )}

        <div className="legacy-mode">
          <h3>Классический режим</h3>
          <p>Используйте ID пользователя для прямого звонка</p>
          <Link to="/call" className="btn btn-outline">
            Перейти к классическому режиму
          </Link>
        </div>

        <div className="masks-demo">
          <h3>Демо масок</h3>
          <p>Посмотрите на распознавание лиц и наложение масок</p>
          <Link to="/masks" className="btn btn-outline">
            🎭 Демо масок
          </Link>
        </div>
      </div>
    </div>
  )
}

export default RoomManager