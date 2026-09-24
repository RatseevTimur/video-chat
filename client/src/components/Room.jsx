import { useCallback, useEffect, useRef, useState } from 'react'
import { BsArrowLeft, BsCameraVideo, BsCheck, BsCopy, BsPhone } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'

import MaskEngine from '../utils/MaskEngine'
import PeerConnection from '../utils/PeerConnection'
import { requestNotifyPermission } from '../utils/ringtone'
import { getStoredId, getStoredName, setStoredName } from '../utils/session'
import socket from '../utils/socket'
import InCallChat from './InCallChat'
import MaskPicker from './MaskPicker'
import PeerTile from './PeerTile'

/** Who creates the offer — avoids double-offer glare */
function shouldOffer(localId, remoteId) {
  return String(localId) < String(remoteId)
}

function gridClass(count) {
  if (count <= 1) return 'grid-1'
  if (count === 2) return 'grid-2'
  if (count <= 4) return 'grid-4'
  if (count <= 6) return 'grid-6'
  if (count <= 9) return 'grid-9'
  return 'grid-10'
}

/**
 * Flow:
 * 1) Host creates room → already inside (admin)
 * 2) Guests open link → knock (joinPending) → host admit/deny
 * 3) Denied → can requestJoin again
 * 4) After joined → mesh WebRTC (up to 10)
 */
const Room = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [localId, setLocalId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [gate, setGate] = useState('loading') // loading | pending | denied | joined
  const [hostName, setHostName] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [messages, setMessages] = useState([])
  const [maskId, setMaskId] = useState('glasses')
  const [videoOn, setVideoOn] = useState(true)
  const [audioOn, setAudioOn] = useState(true)
  const [maskReady, setMaskReady] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState(getStoredName() || 'Гость')
  /** { [peerId]: MediaStream } */
  const [remoteStreams, setRemoteStreams] = useState({})

  const localCanvas = useRef(null)
  const engineRef = useRef(null)
  const rawStreamRef = useRef(null)
  const outboundRef = useRef(null)
  const peersRef = useRef(new Map())
  const localIdRef = useRef('')
  const mediaReadyRef = useRef(false)
  const messagesRef = useRef([])
  const roomInfoRef = useRef(null)
  const gateRef = useRef('loading')

  const displayName = useCallback((id) => {
    return roomInfoRef.current?.names?.[id] || id
  }, [])

  const isHost = roomInfo?.host && roomInfo.host === localId
  const waitingList = roomInfo?.waiting || []

  const setChat = (next) => {
    messagesRef.current = next
    setMessages(next)
  }

  const addMessage = (message) => {
    if (!message?.id || messagesRef.current.some((item) => item.id === message.id)) return
    setChat([...messagesRef.current, message])
  }

  const closePeer = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId)
    if (!pc) return
    try { pc.stop(false) } catch { /* ignore */ }
    peersRef.current.delete(peerId)
    setRemoteStreams((prev) => {
      if (!prev[peerId]) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const closeAllPeers = useCallback(() => {
    for (const id of [...peersRef.current.keys()]) closePeer(id)
  }, [closePeer])

  const ensurePeer = useCallback(async (remoteId, asCaller) => {
    const me = localIdRef.current
    if (!remoteId || !me || remoteId === me) return null
    if (gateRef.current !== 'joined') return null
    if (!mediaReadyRef.current || !outboundRef.current) return null

    const existing = peersRef.current.get(remoteId)
    if (existing) {
      if (existing.pending) {
        for (let i = 0; i < 40; i += 1) {
          await new Promise((r) => setTimeout(r, 50))
          const next = peersRef.current.get(remoteId)
          if (next && !next.pending) return next
          if (!next) break
        }
        return peersRef.current.get(remoteId) || null
      }
      return existing
    }

    peersRef.current.set(remoteId, { pending: true })

    try {
      const pc = await PeerConnection.create(remoteId)
      if (!mediaReadyRef.current || !outboundRef.current || gateRef.current !== 'joined') {
        try { pc.stop(false) } catch { /* ignore */ }
        peersRef.current.delete(remoteId)
        return null
      }

      pc
        .on('remoteStream', (stream) => {
          setRemoteStreams((prev) => ({ ...prev, [remoteId]: stream }))
        })
        .start(asCaller, { audio: true, video: true }, {
          skipRequest: true,
          stream: outboundRef.current
        })

      peersRef.current.set(remoteId, pc)
      return pc
    } catch (err) {
      console.error('peer failed', remoteId, err)
      peersRef.current.delete(remoteId)
      return null
    }
  }, [])

  const meshWithParticipants = useCallback((participants) => {
    if (gateRef.current !== 'joined') return
    const me = localIdRef.current
    if (!me || !mediaReadyRef.current) return
    const list = (participants || []).filter((id) => id && id !== me)

    for (const id of [...peersRef.current.keys()]) {
      if (!list.includes(id)) closePeer(id)
    }

    list.forEach((id) => {
      if (peersRef.current.has(id)) return
      if (shouldOffer(me, id)) ensurePeer(id, true)
    })
  }, [closePeer, ensurePeer])

  const enterJoined = useCallback((info, chat) => {
    gateRef.current = 'joined'
    setGate('joined')
    roomInfoRef.current = info
    setRoomInfo(info)
    if (Array.isArray(chat)) setChat(chat)
    setError('')
    const link = `${window.location.origin}/room/${roomId}`
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }).catch(() => {})
  }, [roomId])

  // Socket lifecycle
  useEffect(() => {
    requestNotifyPermission()
    engineRef.current = new MaskEngine()

    const onInit = ({ id }) => {
      setLocalId(id)
      localIdRef.current = id
      try { sessionStorage.setItem('vc-id', id) } catch { /* ignore */ }
      socket.emit('joinRoom', { roomId, name: getStoredName() || 'Гость' })
    }

    socket
      .on('init', onInit)
      .on('roomJoined', ({ roomInfo: info, chat, status }) => {
        if (status && status !== 'joined') return
        enterJoined(info, chat)
        meshWithParticipants(info?.participants)
      })
      .on('joinPending', ({ hostName: hn, roomInfo: info }) => {
        gateRef.current = 'pending'
        setGate('pending')
        setHostName(hn || '')
        roomInfoRef.current = info
        setRoomInfo(info)
      })
      .on('joinDenied', ({ hostName: hn }) => {
        gateRef.current = 'denied'
        setGate('denied')
        setHostName(hn || '')
        closeAllPeers()
      })
      .on('joinRequest', ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
      })
      .on('waitingUpdated', ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
      })
      .on('roomError', ({ message }) => {
        setError(message)
        if (String(message).toLowerCase().includes('не найдена') || String(message).toLowerCase().includes('not found')) {
          navigate('/')
        }
      })
      .on('userJoined', ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        if (gateRef.current !== 'joined') return
        meshWithParticipants(info?.participants)
        const me = localIdRef.current
        if (userId && me && shouldOffer(me, userId)) ensurePeer(userId, true)
      })
      .on('userLeft', ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        if (userId) closePeer(userId)
      })
      .on('hostChanged', ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
      })
      .on('chatMessage', ({ message }) => {
        if (gateRef.current === 'joined') addMessage(message)
      })
      .on('call', async (data) => {
        if (gateRef.current !== 'joined') return
        const from = data?.from
        if (!from || from === localIdRef.current) return
        const pc = await ensurePeer(from, false)
        if (pc && !pc.pending) pc.applySignal(data)
      })

    const boot = () => socket.emit('init', { id: getStoredId() })
    if (socket.connected) boot()
    else socket.once('connect', boot)

    return () => {
      closeAllPeers()
      socket.emit('leaveRoom')
      ;['init', 'roomJoined', 'joinPending', 'joinDenied', 'joinRequest', 'waitingUpdated',
        'roomError', 'userJoined', 'userLeft', 'hostChanged', 'chatMessage', 'call'
      ].forEach((ev) => socket.off(ev))
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      engineRef.current?.dispose()
    }
  }, [roomId, navigate, meshWithParticipants, ensurePeer, closePeer, closeAllPeers, enterJoined])

  // Camera only after admitted
  useEffect(() => {
    if (gate !== 'joined') return undefined
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
        mediaReadyRef.current = true
        setMediaReady(true)
        meshWithParticipants(roomInfoRef.current?.participants)
      } catch (err) {
        console.error(err)
        setError('Нужен доступ к камере и микрофону / Camera and microphone are required')
      }
    }

    startPreview()
    return () => {
      cancelled = true
    }
  }, [gate, roomInfo?.type, roomId, meshWithParticipants])

  useEffect(() => {
    if (mediaReady && gate === 'joined' && roomInfo?.participants) {
      meshWithParticipants(roomInfo.participants)
    }
  }, [mediaReady, gate, roomInfo?.participants, meshWithParticipants])

  const leaveRoom = () => {
    closeAllPeers()
    socket.emit('leaveRoom')
    navigate('/')
  }

  const retryJoin = () => {
    const name = displayNameInput.trim() || 'Гость'
    setStoredName(name)
    setGate('pending')
    gateRef.current = 'pending'
    socket.emit('requestJoin', { roomId, name })
  }

  const admit = (userId) => socket.emit('admitJoin', { userId })
  const deny = (userId) => socket.emit('denyJoin', { userId })

  const changeMask = async (id) => {
    setMaskId(id)
    await engineRef.current?.setMask(id)
    const track = outboundRef.current?.getVideoTracks()?.[0]
    if (track) {
      peersRef.current.forEach((pc) => {
        if (pc && !pc.pending) pc.replaceVideoTrack?.(track)
      })
    }
  }

  const toggleVideo = () => {
    const next = !videoOn
    setVideoOn(next)
    rawStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
    outboundRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
  }

  const toggleAudio = () => {
    const next = !audioOn
    setAudioOn(next)
    rawStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
    outboundRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
  }

  const sendMessage = (text) => {
    const message = {
      id: `${Date.now()}-${localIdRef.current}`,
      from: localIdRef.current,
      fromName: getStoredName() || localIdRef.current,
      text,
      ts: Date.now()
    }
    addMessage(message)
    socket.emit('chatMessage', { text, id: message.id })
  }

  const copyLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  // ── Waiting / denied gate (guest) ──────────────────────────
  if (gate === 'pending' || gate === 'denied' || gate === 'loading') {
    return (
      <div className="landing">
        <div className="landing-card">
          <p className="eyebrow">Комната / Room {roomId}</p>
          <h1>
            {gate === 'denied'
              ? 'Вход отклонён'
              : gate === 'pending'
                ? 'Ожидание хоста…'
                : 'Подключение…'}
          </h1>
          <p className="lead">
            {gate === 'denied'
              ? 'Хост не пустил. Можно попросить снова.'
              : gate === 'pending'
                ? `Запрос отправлен${hostName ? ` · хост: ${hostName}` : ''}. Ждите «Принять».`
                : 'Стук в комнату…'}
          </p>
          <p className="lead en">
            {gate === 'denied'
              ? 'Host declined. You can ask to join again.'
              : 'Knock to join — host must accept (not the same as a phone call).'}
          </p>

          {(gate === 'pending' || gate === 'denied') && (
            <label className="field">
              <span>Ваше имя / Your name</span>
              <input
                value={displayNameInput}
                maxLength={24}
                onChange={(e) => setDisplayNameInput(e.target.value)}
              />
            </label>
          )}

          {gate === 'denied' && (
            <button type="button" className="btn btn-success" onClick={retryJoin}>
              Попросить снова / Ask again
            </button>
          )}

          {error && <div className="error">{error}</div>}

          <button type="button" className="btn btn-outline" style={{ marginTop: '1rem' }} onClick={leaveRoom}>
            <BsArrowLeft /> Назад / Back
          </button>
        </div>
      </div>
    )
  }

  const isTextRoom = roomInfo?.type === 'text'
  const peerIds = Object.keys(remoteStreams)
  const tileCount = Math.max(1, 1 + peerIds.length)
  const alone = peerIds.length === 0

  return (
    <div className={`meet-room ${!alone ? 'is-call' : ''}`}>
      <header className="meet-header">
        <button type="button" className="btn btn-outline" onClick={leaveRoom}>
          <BsArrowLeft /> Назад / Back
        </button>
        <div>
          <h1>
            {isTextRoom ? 'Текстовый чат' : 'Встреча / Meeting'}
            {isHost ? ' · вы хост' : ''}
          </h1>
          <p>
            {roomInfo?.participantCount || 0} в комнате
            {waitingList.length ? ` · ${waitingList.length} ждут` : ''}
            {copied ? ' · ссылка ✓' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-success" onClick={copyLink}>
          {copied ? <BsCheck /> : <BsCopy />} {copied ? 'Скопировано!' : 'Ссылка / Link'}
        </button>
      </header>

      {isHost && waitingList.length > 0 && (
        <div className="admit-bar">
          <strong>Хотят войти / Waiting:</strong>
          {waitingList.map((item) => (
            <div key={item.id} className="admit-row">
              <span>{item.name}</span>
              <button type="button" className="btn btn-success btn-small" onClick={() => admit(item.id)}>
                Принять / Admit
              </button>
              <button type="button" className="btn btn-danger btn-small" onClick={() => deny(item.id)}>
                Отклонить / Deny
              </button>
            </div>
          ))}
        </div>
      )}

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
            hint="Сообщения в RAM · очистятся когда все выйдут"
          />
        </div>
      ) : (
        <div className="meet-body meet-body-full">
          <section className={`meet-grid ${gridClass(tileCount)}`}>
            <div className="meet-tile meet-tile-local">
              <canvas ref={localCanvas} className="local-canvas" />
              <span className="video-label">
                Вы / You{maskReady ? '' : ' · маска…'}
              </span>
            </div>

            {alone && (
              <div className="meet-tile meet-tile-wait">
                <div className="meet-tile-empty">+</div>
                <span className="video-label">
                  {isHost
                    ? 'Шлите ссылку — вы примете гостей'
                    : 'Ждём остальных'}
                </span>
              </div>
            )}

            {peerIds.map((id) => (
              <PeerTile key={id} stream={remoteStreams[id]} name={displayName(id)} />
            ))}
          </section>

          <InCallChat
            messages={messages}
            onSend={sendMessage}
            localId={localId}
            hint="До 10 участников · видео обрезается как в Meet"
          />
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
            <button type="button" className="btn btn-danger" onClick={leaveRoom}>
              <FiPhoneOff /> Выйти / Leave
            </button>
          </div>
          <div className="people-list">
            {roomInfo?.participants?.map((id) => (
              <span key={id} className={`person ${remoteStreams[id] || id === localId ? 'live' : ''}`}>
                {displayName(id)}
                {id === localId ? ' (Вы)' : ''}
                {id === roomInfo.host ? ' ★' : ''}
              </span>
            ))}
          </div>
        </footer>
      )}
    </div>
  )
}

export default Room
