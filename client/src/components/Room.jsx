import { useEffect, useRef, useState } from 'react'
import { BsArrowLeft, BsCameraVideo, BsCheck, BsCopy, BsPhone } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'

import MaskEngine from '../utils/MaskEngine'
import PeerConnection from '../utils/PeerConnection'
import { createRingtone, notifyIncoming, requestNotifyPermission } from '../utils/ringtone'
import { getStoredId, getStoredName } from '../utils/session'
import socket from '../utils/socket'
import InCallChat from './InCallChat'
import IncomingCall from './IncomingCall'
import MaskPicker from './MaskPicker'

const Room = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [localId, setLocalId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [phase, setPhase] = useState('lobby')
  const [incoming, setIncoming] = useState(null)
  const [remoteSrc, setRemoteSrc] = useState(null)
  const [remoteName, setRemoteName] = useState('')
  const [messages, setMessages] = useState([])
  const [maskId, setMaskId] = useState('glasses')
  const [videoOn, setVideoOn] = useState(true)
  const [audioOn, setAudioOn] = useState(true)
  const [maskReady, setMaskReady] = useState(false)

  const localCanvas = useRef(null)
  const remoteVideo = useRef(null)
  const engineRef = useRef(null)
  const rawStreamRef = useRef(null)
  const outboundRef = useRef(null)
  const pcRef = useRef(null)
  const ringtoneRef = useRef(null)
  const messagesRef = useRef([])

  const displayName = (id) => roomInfo?.names?.[id] || id

  const setChat = (next) => {
    messagesRef.current = next
    setMessages(next)
  }

  const addMessage = (message) => {
    if (!message?.id || messagesRef.current.some((item) => item.id === message.id)) return
    setChat([...messagesRef.current, message])
  }

  const stopRingtone = () => {
    ringtoneRef.current?.stop()
    ringtoneRef.current = null
  }

  const closePeer = (notifyRemote) => {
    if (pcRef.current) {
      pcRef.current.stop(notifyRemote)
      pcRef.current = null
    }
    setRemoteSrc(null)
  }

  useEffect(() => {
    requestNotifyPermission()
    engineRef.current = new MaskEngine()

    const onInit = ({ id }) => {
      setLocalId(id)
      socket.emit('joinRoom', { roomId, name: getStoredName() })
    }

    socket
      .on('init', onInit)
      .on('roomJoined', ({ roomInfo: info, chat }) => {
        setRoomInfo(info)
        setChat(Array.isArray(chat) ? chat : [])
        setError('')
      })
      .on('roomError', ({ message }) => {
        setError(message)
        if (message.toLowerCase().includes('не найдена') || message.toLowerCase().includes('not found')) {
          navigate('/')
        }
      })
      .on('userJoined', ({ roomInfo: info }) => setRoomInfo(info))
      .on('userLeft', ({ roomInfo: info }) => setRoomInfo(info))
      .on('hostChanged', ({ roomInfo: info }) => setRoomInfo(info))
      .on('incomingCall', async ({ from, fromName, roomInfo: info }) => {
        setRoomInfo(info)
        setIncoming({ from, fromName })
        setPhase('incoming')
        stopRingtone()
        ringtoneRef.current = createRingtone()
        ringtoneRef.current.start()
        notifyIncoming('Входящий звонок / Incoming call', fromName || from)
      })
      .on('callRinging', ({ roomInfo: info }) => {
        setRoomInfo(info)
        setPhase((current) => (current === 'in-call' ? current : 'ringing'))
      })
      .on('callAccepted', async ({ userId, userName, callerId, roomInfo: info }) => {
        setRoomInfo(info)
        stopRingtone()
        setIncoming(null)
        if (userId === getCurrentId()) return
        setRemoteName(userName || userId)
        if (callerId === getCurrentId()) {
          await connectPeer(true, userId)
        }
      })
      .on('callRejected', ({ roomInfo: info }) => {
        setRoomInfo(info)
        setPhase((current) => (current === 'in-call' ? current : 'lobby'))
      })
      .on('userHungUp', ({ userId, roomInfo: info }) => {
        setRoomInfo(info)
        if (userId !== getStoredId()) hangUp(false)
      })
      .on('callEnded', ({ roomInfo: info }) => {
        setRoomInfo(info)
        stopRingtone()
        closePeer(false)
        setIncoming(null)
        setChat([])
        setPhase('lobby')
      })
      .on('chatMessage', ({ message }) => addMessage(message))
      .on('call', (data) => {
        if (pcRef.current) pcRef.current.applySignal(data)
      })
      .on('end', () => hangUp(false))

    const boot = () => socket.emit('init', { id: getStoredId() })
    if (socket.connected) boot()
    else socket.once('connect', boot)

    return () => {
      stopRingtone()
      closePeer(false)
      socket.emit('leaveRoom')
      socket.off('init')
      socket.off('roomJoined')
      socket.off('roomError')
      socket.off('userJoined')
      socket.off('userLeft')
      socket.off('hostChanged')
      socket.off('incomingCall')
      socket.off('callRinging')
      socket.off('callAccepted')
      socket.off('callRejected')
      socket.off('userHungUp')
      socket.off('callEnded')
      socket.off('chatMessage')
      socket.off('call')
      socket.off('end')
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      engineRef.current?.dispose()
    }
  }, [roomId, navigate])

  useEffect(() => {
    if (!roomInfo || roomInfo.type === 'text') return undefined
    let cancelled = false

    const startPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: {
            facingMode: 'user',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        rawStreamRef.current = stream
        const engine = engineRef.current
        await engine.init()
        await engine.setMask(maskId)
        if (localCanvas.current) {
          engine.attach({ stream, canvas: localCanvas.current })
        }
        const canvasStream = engine.getStream(24)
        outboundRef.current = new MediaStream([
          ...(canvasStream ? canvasStream.getVideoTracks() : stream.getVideoTracks()),
          ...stream.getAudioTracks()
        ])
        setMaskReady(true)
      } catch (err) {
        console.error(err)
        setError('Нужен доступ к камере и микрофону / Camera and microphone are required')
      }
    }

    startPreview()
    return () => {
      cancelled = true
    }
  }, [roomInfo?.type, roomId])

  useEffect(() => {
    if (remoteVideo.current && remoteSrc) {
      remoteVideo.current.srcObject = remoteSrc
    }
  }, [remoteSrc])

  const getCurrentId = () => localId || getStoredId()

  const connectPeer = async (isCaller, remoteId) => {
    if (pcRef.current) {
      pcRef.current.stop(false)
      pcRef.current = null
    }

    const pc = await PeerConnection.create(remoteId)
    pc
      .on('remoteStream', (stream) => {
        setRemoteSrc(stream)
        setPhase('in-call')
      })
      .on('chat', (payload) => {
        addMessage({
          id: `${payload.ts || Date.now()}-${remoteId}`,
          from: remoteId,
          fromName: remoteName || displayName(remoteId),
          text: payload.text,
          ts: payload.ts || Date.now()
        })
      })
      .start(isCaller, { audio: true, video: true }, {
        skipRequest: true,
        stream: outboundRef.current || rawStreamRef.current
      })

    pcRef.current = pc
    setPhase('in-call')
  }

  const startCall = () => {
    if (!roomInfo || roomInfo.participantCount < 2) {
      setError('Пригласите ещё одного человека / Invite one more person')
      return
    }
    setError('')
    setPhase('ringing')
    socket.emit('startCall', { video: true })
  }

  const acceptCall = async () => {
    if (!incoming) return
    stopRingtone()
    setRemoteName(incoming.fromName || incoming.from)
    socket.emit('acceptCall')
    await connectPeer(false, incoming.from)
    setIncoming(null)
  }

  const rejectCall = () => {
    stopRingtone()
    socket.emit('rejectCall')
    setIncoming(null)
    setPhase('lobby')
  }

  const hangUp = (notifyServer = true) => {
    stopRingtone()
    closePeer(false)
    if (notifyServer) socket.emit('endCall')
    setIncoming(null)
    setPhase('lobby')
  }

  const leaveRoom = () => {
    hangUp(true)
    socket.emit('leaveRoom')
    navigate('/')
  }

  const changeMask = async (id) => {
    setMaskId(id)
    await engineRef.current?.setMask(id)
  }

  const toggleVideo = () => {
    const next = !videoOn
    setVideoOn(next)
    rawStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next
    })
    outboundRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next
    })
  }

  const toggleAudio = () => {
    const next = !audioOn
    setAudioOn(next)
    rawStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next
    })
    outboundRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = next
    })
  }

  const sendMessage = (text) => {
    const message = {
      id: `${Date.now()}-${getCurrentId()}`,
      from: getCurrentId(),
      fromName: getStoredName() || getCurrentId(),
      text,
      ts: Date.now()
    }
    addMessage(message)
    const sent = pcRef.current?.sendChat(text)
    if (!sent) socket.emit('chatMessage', { text, id: message.id })
  }

  const copyLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const isTextRoom = roomInfo?.type === 'text'
  const inCall = phase === 'in-call'

  return (
    <div className={`meet-room ${inCall ? 'is-call' : ''}`}>
      <header className="meet-header">
        <button type="button" className="btn btn-outline" onClick={leaveRoom}>
          <BsArrowLeft /> Назад / Back
        </button>
        <div>
          <h1>{isTextRoom ? 'Текстовый чат / Text room' : 'Комната / Room'} {roomId}</h1>
          <p>
            {roomInfo?.participantCount || 0} участник(а) · сообщения не сохраняются
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={copyLink}>
          {copied ? <BsCheck /> : <BsCopy />} Ссылка / Link
        </button>
      </header>

      {error && (
        <div className="error">
          {error}
          {error.toLowerCase().includes('камер') && (
            <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
              Повторить / Retry
            </button>
          )}
        </div>
      )}

      {phase === 'incoming' && incoming && (
        <IncomingCall
          fromName={incoming.fromName || incoming.from}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {isTextRoom ? (
        <div className="text-room">
          <div className="people-list">
            {roomInfo?.participants?.map((id) => (
              <span key={id} className="person">
                {displayName(id)} {id === localId ? '(Вы)' : ''}
              </span>
            ))}
          </div>
          <InCallChat
            messages={messages}
            onSend={sendMessage}
            localId={localId}
            hint="Короткий кеш: сообщения исчезнут через 10 минут или когда все выйдут."
          />
        </div>
      ) : (
        <div className="meet-body">
          <section className="stage">
            <div className={`remote-pane ${inCall ? 'live' : ''}`}>
              {inCall && remoteSrc ? (
                <video ref={remoteVideo} autoPlay playsInline />
              ) : (
                <div className="placeholder">
                  {phase === 'ringing'
                    ? 'Звоним… / Calling…'
                    : 'Ожидание второго участника / Waiting for the other person'}
                </div>
              )}
              <span className="video-label">{remoteName || 'Собеседник / Peer'}</span>
            </div>

            <div className="local-pane">
              <canvas ref={localCanvas} className="local-canvas" />
              <span className="video-label">Вы / You {maskReady ? '' : '· загрузка маски'}</span>
            </div>
          </section>

          {(inCall || phase === 'ringing') && (
            <InCallChat
              messages={messages}
              onSend={sendMessage}
              localId={localId}
              hint="Чат очистится, когда все завершат звонок. Комната останется."
            />
          )}
        </div>
      )}

      {!isTextRoom && (
        <footer className="meet-controls">
          <MaskPicker value={maskId} onChange={changeMask} disabled={!maskReady} />
          <div className="control-buttons">
            <button type="button" className={`btn ${videoOn ? 'btn-secondary' : 'btn-danger'}`} onClick={toggleVideo}>
              <BsCameraVideo />
            </button>
            <button type="button" className={`btn ${audioOn ? 'btn-secondary' : 'btn-danger'}`} onClick={toggleAudio}>
              <BsPhone />
            </button>
            {inCall || phase === 'ringing' ? (
              <button type="button" className="btn btn-danger" onClick={() => hangUp(true)}>
                <FiPhoneOff /> Завершить / Hang up
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-success"
                onClick={startCall}
                disabled={!roomInfo || roomInfo.participantCount < 2}
              >
                <BsCameraVideo /> Позвонить / Call
              </button>
            )}
          </div>
          <div className="people-list">
            {roomInfo?.participants?.map((id) => (
              <span key={id} className="person">
                {displayName(id)} {id === localId ? '(Вы)' : ''}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}

export default Room
