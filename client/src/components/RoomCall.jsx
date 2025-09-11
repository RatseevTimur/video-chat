import React, { useEffect, useRef, useState } from 'react'
import { BsArrowLeft, BsCameraVideo, BsPhone } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'

import PeerConnection from '../utils/PeerConnection'
import socket from '../utils/socket'

const RoomCall = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()
  
  const [localId, setLocalId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [localSrc, setLocalSrc] = useState(null)
  const [remoteSrc, setRemoteSrc] = useState(null)
  const [pc, setPc] = useState(null)
  const [config, setConfig] = useState({ audio: true, video: true })
  const [isInCall, setIsInCall] = useState(false)
  const [error, setError] = useState('')

  const localVideo = useRef()
  const remoteVideo = useRef()

  useEffect(() => {
    socket
      .on('init', ({ id }) => {
        setLocalId(id)
        // Присоединяемся к комнате
        if (roomId) {
          socket.emit('joinRoom', { roomId })
        }
      })
      .on('roomJoined', ({ roomId, roomInfo }) => {
        setRoomInfo(roomInfo)
        setError('')
      })
      .on('roomError', ({ message }) => {
        setError(message)
        navigate('/')
      })
      .on('userJoined', ({ userId, roomInfo }) => {
        setRoomInfo(roomInfo)
      })
      .on('userLeft', ({ userId, roomInfo }) => {
        setRoomInfo(roomInfo)
        // Если пользователь покинул комнату во время звонка
        if (isInCall && pc) {
          pc.stop(true)
          setPc(null)
          setIsInCall(false)
          setLocalSrc(null)
          setRemoteSrc(null)
        }
      })
      .on('hostChanged', ({ newHost, roomInfo }) => {
        setRoomInfo(roomInfo)
      })
      .emit('init')

    return () => {
      socket.off('init')
      socket.off('roomJoined')
      socket.off('roomError')
      socket.off('userJoined')
      socket.off('userLeft')
      socket.off('hostChanged')
    }
  }, [roomId, navigate, isInCall, pc])

  useEffect(() => {
    if (!pc) return

    socket
      .on('call', (data) => {
        if (data.sdp) {
          pc.setRemoteDescription(data.sdp)

          if (data.sdp.type === 'offer') {
            pc.createAnswer()
          }
        } else {
          pc.addIceCandidate(data.candidate)
        }
      })
      .on('end', () => {
        endCall()
      })
  }, [pc])

  useEffect(() => {
    if (localVideo.current && localSrc) {
      localVideo.current.srcObject = localSrc
    }
    if (remoteVideo.current && remoteSrc) {
      remoteVideo.current.srcObject = remoteSrc
    }
  }, [localSrc, remoteSrc])

  const startCall = () => {
    if (!roomInfo || roomInfo.participantCount < 2) {
      setError('Нужно минимум 2 участника для звонка')
      return
    }

    setIsInCall(true)
    setError('')

    // Находим первого участника для звонка (не себя)
    const remoteParticipant = roomInfo.participants.find(id => id !== localId)
    if (!remoteParticipant) {
      setError('Нет участников для звонка')
      setIsInCall(false)
      return
    }

    const _pc = new PeerConnection(remoteParticipant)
      .on('localStream', (stream) => {
        setLocalSrc(stream)
      })
      .on('remoteStream', (stream) => {
        setRemoteSrc(stream)
      })
      .start(true, config) // Мы инициаторы звонка

    setPc(_pc)
  }

  const endCall = () => {
    if (pc) {
      pc.stop(true)
      setPc(null)
    }
    setIsInCall(false)
    setLocalSrc(null)
    setRemoteSrc(null)
  }

  const leaveRoom = () => {
    socket.emit('leaveRoom')
    navigate('/')
  }

  const toggleVideo = () => {
    setConfig(prev => ({ ...prev, video: !prev.video }))
    if (pc?.mediaDevice) {
      pc.mediaDevice.toggle('Video')
    }
  }

  const toggleAudio = () => {
    setConfig(prev => ({ ...prev, audio: !prev.audio }))
    if (pc?.mediaDevice) {
      pc.mediaDevice.toggle('Audio')
    }
  }

  return (
    <div className="room-call">
      <div className="room-header">
        <button onClick={leaveRoom} className="btn btn-outline">
          <BsArrowLeft /> Покинуть комнату
        </button>
        <h2>Комната: {roomId}</h2>
        <div className="participants-count">
          Участников: {roomInfo?.participantCount || 0}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!isInCall ? (
        <div className="call-setup">
          <div className="participants-list">
            <h3>Участники:</h3>
            {roomInfo?.participants?.map(participantId => (
              <div key={participantId} className="participant">
                <span className="participant-id">{participantId}</span>
                {participantId === localId && <span className="you">(Вы)</span>}
                {participantId === roomInfo?.host && <span className="host">👑</span>}
              </div>
            ))}
          </div>

          <div className="call-controls">
            <button 
              onClick={startCall} 
              className="btn btn-primary"
              disabled={!roomInfo || roomInfo.participantCount < 2}
            >
              <BsCameraVideo /> Начать видеозвонок
            </button>
            <p className="help-text">
              {!roomInfo || roomInfo.participantCount < 2
                ? 'Пригласите участников для начала звонка' 
                : 'Готово к началу видеозвонка'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="call-active">
          <div className="video-container">
            <div className="remote-video">
              <video ref={remoteVideo} autoPlay />
              <div className="video-label">Удаленный участник</div>
            </div>
            
            <div className="local-video">
              <video ref={localVideo} autoPlay muted />
              <div className="video-label">Вы</div>
            </div>
          </div>

          <div className="call-controls">
            <button 
              onClick={toggleVideo} 
              className={`btn ${config.video ? 'btn-secondary' : 'btn-danger'}`}
            >
              <BsCameraVideo />
            </button>
            <button 
              onClick={toggleAudio} 
              className={`btn ${config.audio ? 'btn-secondary' : 'btn-danger'}`}
            >
              <BsPhone />
            </button>
            <button onClick={endCall} className="btn btn-danger">
              <FiPhoneOff />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RoomCall