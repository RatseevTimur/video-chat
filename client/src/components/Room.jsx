import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BsBell,
  BsBellFill,
  BsCameraVideo,
  BsCameraVideoOff,
  BsChatDots,
  BsCheck,
  BsCopy,
  BsMicFill,
  BsMicMuteFill,
  BsTelephone
} from 'react-icons/bs'
import { MdFlipCameraIos } from 'react-icons/md'
import { FiPhoneOff } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'

import { aspectOf, openCamera, videoConstraints } from '../utils/camera'
import { planGrid, tileClass } from '../utils/gridLayout'
import MaskEngine from '../utils/MaskEngine'
import PeerConnection from '../utils/PeerConnection'
import {
  alertsEnabled,
  armCallsFromGesture,
  disableCallAlerts,
  enableCallAlerts,
  getDeviceId
} from '../utils/push'
import { createRingback } from '../utils/ringtone'
import { goAppBack } from '../utils/appNav'
import { familyRoom, rememberRoom } from '../utils/rooms'
import { getStoredId, getStoredName } from '../utils/session'
import socket from '../utils/socket'
import InCallChat from './InCallChat'
import InstallHint from './InstallHint'
import MaskPicker from './MaskPicker'
import PeerTile from './PeerTile'

function shouldOffer(localId, remoteId) {
  return String(localId) < String(remoteId)
}

function shouldRestart(pc) {
  return ['failed', 'disconnected', 'closed'].includes(pc?.connectionState)
}

const Room = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [localId, setLocalId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [maskId, setMaskId] = useState('none')
  const [videoOn, setVideoOn] = useState(true)
  const [audioOn, setAudioOn] = useState(true)
  const [mediaReady, setMediaReady] = useState(false)
  const [facing, setFacing] = useState('user')
  const [canFlip, setCanFlip] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [aspects, setAspects] = useState({})
  const [pinnedId, setPinnedId] = useState(null)
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 })
  const [alertsOn, setAlertsOn] = useState(() => alertsEnabled(roomId))
  const [callNote, setCallNote] = useState('')
  const [ringing, setRinging] = useState(false)
  const [activeRingId, setActiveRingId] = useState('')
  const [ringTargets, setRingTargets] = useState(0)
  const ringbackRef = useRef(null)
  const leaveRoomTimerRef = useRef(null)
  const stopRingbackRef = useRef(() => {})
  const flashNoteRef = useRef(() => {})

  const localVideo = useRef(null)
  const localCanvas = useRef(null)
  const engineRef = useRef(null)
  const rawStreamRef = useRef(null)
  const outboundRef = useRef(null)
  const peersRef = useRef(new Map())
  const queueRef = useRef(new Map())
  const localIdRef = useRef('')
  const mediaReadyRef = useRef(false)
  const roomInfoRef = useRef(null)
  const creatingRef = useRef(new Set())
  const messagesRef = useRef([])
  const chatOpenRef = useRef(false)
  const facingRef = useRef('user')
  const maskIdRef = useRef('none')
  const gridRef = useRef(null)

  const displayName = useCallback((id) => roomInfoRef.current?.names?.[id] || id, [])

  const attachLocalPreview = useCallback((stream) => {
    if (localVideo.current && stream) localVideo.current.srcObject = stream
  }, [])

  const setChat = (next) => {
    messagesRef.current = next
    setMessages(next)
  }

  const addMessage = useCallback((message) => {
    if (!message?.id || messagesRef.current.some((item) => item.id === message.id)) return
    setChat([...messagesRef.current, message])
    if (!chatOpenRef.current && message.from !== localIdRef.current) {
      setUnread((n) => n + 1)
    }
  }, [])

  const closePeer = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId)
    if (pc && !pc.pending) {
      try { pc.stop(false) } catch { /* ignore */ }
    }
    peersRef.current.delete(peerId)
    creatingRef.current.delete(peerId)
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

  const flushQueue = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId)
    if (!pc || pc.pending) return
    const queued = queueRef.current.get(peerId) || []
    queueRef.current.set(peerId, [])
    queued.forEach((data) => pc.applySignal(data))
  }, [])

  const pushVideoTrack = useCallback((track) => {
    if (!track) return
    peersRef.current.forEach((pc) => {
      if (pc && !pc.pending) pc.replaceVideoTrack?.(track)
    })
  }, [])

  const rememberAspect = useCallback((id, width, height) => {
    const next = width === 'portrait' || width === 'landscape' ? width : aspectOf(width, height)
    setAspects((prev) => (prev[id] === next ? prev : { ...prev, [id]: next }))
  }, [])

  const bindComposer = useCallback(async (raw) => {
    if (!engineRef.current) engineRef.current = new MaskEngine()
    const engine = engineRef.current
    engine.onSize = (w, h, stream) => {
      rememberAspect('local', w, h)
      const video = stream?.getVideoTracks?.()[0]
      if (!video) return
      const audio = rawStreamRef.current?.getAudioTracks() || []
      const mixed = new MediaStream([video, ...audio])
      const previous = outboundRef.current
      outboundRef.current = mixed
      attachLocalPreview(mixed)
      pushVideoTrack(video)
      previous?.getVideoTracks().forEach((track) => {
        if (track !== video) track.stop()
      })
    }
    await engine.init()
    await engine.setMask(maskIdRef.current)
    if (localCanvas.current) engine.attach({ stream: raw, canvas: localCanvas.current })
    const canvasStream = engine.getStream(24)
    const settings = raw.getVideoTracks()[0]?.getSettings?.() || {}
    if (settings.width && settings.height) rememberAspect('local', settings.width, settings.height)
    const mixed = new MediaStream([
      ...(canvasStream?.getVideoTracks() || raw.getVideoTracks()),
      ...raw.getAudioTracks()
    ])
    outboundRef.current = mixed
    attachLocalPreview(mixed)
    pushVideoTrack(mixed.getVideoTracks()[0])
    return mixed
  }, [attachLocalPreview, pushVideoTrack, rememberAspect])

  const ensurePeer = useCallback(async (remoteId, { restart = false } = {}) => {
    const me = localIdRef.current
    if (!remoteId || !me || remoteId === me) return null
    if (!mediaReadyRef.current || !outboundRef.current) return null

    const existing = peersRef.current.get(remoteId)
    if (existing && !existing.pending && !restart && !['failed', 'closed'].includes(existing.connectionState)) {
      flushQueue(remoteId)
      return existing
    }

    if (creatingRef.current.has(remoteId) && !restart) {
      for (let i = 0; i < 50; i += 1) {
        await new Promise((r) => setTimeout(r, 50))
        const next = peersRef.current.get(remoteId)
        if (next && !next.pending) {
          flushQueue(remoteId)
          return next
        }
      }
    }

    if (existing) closePeer(remoteId)
    creatingRef.current.add(remoteId)
    peersRef.current.set(remoteId, { pending: true })

    try {
      const asCaller = shouldOffer(me, remoteId)
      const pc = await PeerConnection.create(remoteId, { polite: !asCaller })
      if (!mediaReadyRef.current || !outboundRef.current) {
        try { pc.stop(false) } catch { /* ignore */ }
        peersRef.current.delete(remoteId)
        return null
      }

      pc.on('remoteStream', (stream) => {
        setRemoteStreams((prev) => ({ ...prev, [remoteId]: stream }))
      })
      pc.on('connectionState', (state) => {
        if (state === 'failed' || state === 'disconnected') {
          window.setTimeout(() => {
            const current = peersRef.current.get(remoteId)
            if (current === pc && shouldRestart(pc)) {
              ensurePeer(remoteId, { restart: true }).catch(() => {})
            }
          }, 1200)
        }
      })
      pc.start(asCaller, { audio: true, video: true }, {
        skipRequest: true,
        stream: outboundRef.current
      })

      peersRef.current.set(remoteId, pc)
      flushQueue(remoteId)
      return pc
    } catch (err) {
      console.error('peer failed', remoteId, err)
      peersRef.current.delete(remoteId)
      return null
    } finally {
      creatingRef.current.delete(remoteId)
    }
  }, [closePeer, flushQueue])

  const meshWith = useCallback((participants) => {
    const me = localIdRef.current
    if (!me || !mediaReadyRef.current) return
    const list = (participants || []).filter((id) => id && id !== me)
    for (const id of [...peersRef.current.keys()]) {
      if (!list.includes(id)) closePeer(id)
    }
    list.forEach((id) => { ensurePeer(id) })
  }, [closePeer, ensurePeer])

  useEffect(() => {
    const onInit = ({ id }) => {
      setLocalId(id)
      localIdRef.current = id
      try { sessionStorage.setItem('vc-id', id) } catch { /* ignore */ }
      socket.emit('joinRoom', { roomId, name: getStoredName() || 'Гость', deviceId: getDeviceId() })
    }

    socket
      .on('init', onInit)
      .on('roomJoined', ({ roomInfo: info, chat }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        if (Array.isArray(chat)) setChat(chat)
        setError('')
        meshWith(info?.participants)
      })
      .on('roomError', ({ message }) => {
        setError(message)
        if (String(message).toLowerCase().includes('не найдена') || String(message).toLowerCase().includes('not found')) {
          goAppBack(navigate)
        }
      })
      .on('userJoined', ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        meshWith(info?.participants)
        if (userId) ensurePeer(userId)
      })
      .on('userLeft', ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        if (userId) {
          queueRef.current.delete(userId)
          closePeer(userId)
        }
      })
      .on('hostChanged', ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
      })
      .on('peerMediaReady', ({ userId, roomInfo: info }) => {
        if (info) {
          roomInfoRef.current = info
          setRoomInfo(info)
        }
        if (!userId || userId === localIdRef.current) return
        const existing = peersRef.current.get(userId)
        ensurePeer(userId, { restart: Boolean(existing && !existing.pending && shouldRestart(existing)) })
      })
      .on('chatMessage', ({ message }) => addMessage(message))
      .on('ringDeclined', ({ name }) => {
        setRinging(false)
        setActiveRingId('')
        setRingTargets(0)
        stopRingbackRef.current()
        flashNoteRef.current(`${name || 'Участник'} отклонил звонок`)
      })
      .on('call', async (data) => {
        const from = data?.from
        if (!from || from === localIdRef.current) return
        const queued = queueRef.current.get(from) || []
        queued.push(data)
        queueRef.current.set(from, queued)
        if (mediaReadyRef.current) {
          await ensurePeer(from)
          flushQueue(from)
        }
      })

    const boot = () => socket.emit('init', { id: getStoredId() })
    if (socket.connected) boot()
    else socket.once('connect', boot)

    // StrictMode remounts quickly — defer leave so the second mount can cancel it.
    let leaveTimer = null
    return () => {
      closeAllPeers()
      leaveTimer = setTimeout(() => socket.emit('leaveRoom'), 600)
      ;['init', 'roomJoined', 'roomError', 'userJoined', 'userLeft', 'hostChanged', 'peerMediaReady', 'chatMessage', 'call', 'ringDeclined']
        .forEach((ev) => socket.off(ev))
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      engineRef.current?.dispose()
      // Cancel deferred leave if this cleanup is from StrictMode remount.
      // (A new effect for the same roomId will clear this via the ref below.)
      if (leaveRoomTimerRef.current) clearTimeout(leaveRoomTimerRef.current)
      leaveRoomTimerRef.current = leaveTimer
    }
  }, [roomId, navigate, meshWith, ensurePeer, closePeer, closeAllPeers, flushQueue, addMessage])

  useEffect(() => {
    if (!roomInfo || roomInfo.type === 'text') return undefined
    let cancelled = false

    const startPreview = async () => {
      try {
        const stream = await openCamera(facingRef.current)
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        rawStreamRef.current = stream
        await bindComposer(stream)
        mediaReadyRef.current = true
        setMediaReady(true)
        socket.emit('mediaReady')
        meshWith(roomInfoRef.current?.participants)

        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const cams = devices.filter((item) => item.kind === 'videoinput').length
          setCanFlip(cams > 1 || ('ontouchstart' in window))
        } catch { /* ignore */ }
      } catch (err) {
        console.error(err)
        setError('Нужен доступ к камере и микрофону / Allow camera and microphone')
      }
    }

    startPreview()
    return () => { cancelled = true }
  }, [roomInfo?.type, roomId, meshWith, bindComposer])

  useEffect(() => {
    if (mediaReady && roomInfo?.participants) meshWith(roomInfo.participants)
  }, [mediaReady, roomInfo?.participants, meshWith])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return undefined
    const watch = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) setStageBox({ w: width, h: height })
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  useEffect(() => {
    const el = localVideo.current
    if (!el) return undefined
    const report = () => {
      if (el.videoWidth && el.videoHeight) rememberAspect('local', el.videoWidth, el.videoHeight)
    }
    el.addEventListener('loadedmetadata', report)
    el.addEventListener('resize', report)
    report()
    return () => {
      el.removeEventListener('loadedmetadata', report)
      el.removeEventListener('resize', report)
    }
  }, [rememberAspect, mediaReady])

  useEffect(() => {
    if (!mediaReady) return undefined
    let portrait = window.innerHeight > window.innerWidth
    const onChange = async () => {
      const next = window.innerHeight > window.innerWidth
      if (next === portrait) return
      portrait = next
      const track = rawStreamRef.current?.getVideoTracks()?.[0]
      if (!track) return
      try {
        await track.applyConstraints(videoConstraints(facingRef.current))
      } catch (err) {
        console.warn('orientation', err)
      }
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
    }
  }, [mediaReady])

  useEffect(() => {
    // Cancel a pending StrictMode leave from the previous mount of this room.
    if (leaveRoomTimerRef.current) {
      clearTimeout(leaveRoomTimerRef.current)
      leaveRoomTimerRef.current = null
    }
    setAlertsOn(alertsEnabled(roomId))
    setPinnedId(null)
    const family = familyRoom()
    rememberRoom(roomId, {
      title: roomId === family.id ? 'Семья' : 'Комната',
      family: roomId === family.id
    })
    import('../utils/unread').then((mod) => mod.clearUnread(roomId)).catch(() => {})
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      enableCallAlerts(roomId, getStoredName() || 'Гость').then((result) => {
        if (result?.ok) setAlertsOn(true)
      })
    }
  }, [roomId])

  const changeMask = async (id) => {
    maskIdRef.current = id
    setMaskId(id)
    await engineRef.current?.setMask(id)
  }

  const flipCamera = async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user'
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints(next)
      })
      const newVideo = fresh.getVideoTracks()[0]
      const raw = rawStreamRef.current
      raw?.getVideoTracks().forEach((track) => {
        raw.removeTrack(track)
        track.stop()
      })
      if (raw) raw.addTrack(newVideo)
      else rawStreamRef.current = new MediaStream([newVideo, ...(outboundRef.current?.getAudioTracks() || [])])
      facingRef.current = next
      setFacing(next)
      await bindComposer(rawStreamRef.current)
      rawStreamRef.current.getVideoTracks().forEach((track) => { track.enabled = videoOn })
    } catch (err) {
      console.error(err)
      setError('Не удалось переключить камеру / Cannot switch camera')
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

  const stopRingback = () => {
    ringbackRef.current?.stop()
    ringbackRef.current = null
  }
  stopRingbackRef.current = stopRingback

  const startRingback = () => {
    stopRingback()
    ringbackRef.current = createRingback()
    ringbackRef.current.start().catch(() => {})
  }

  const leaveRoom = () => {
    if (ringing || activeRingId) {
      socket.emit('cancelRing', {})
      setRinging(false)
      setActiveRingId('')
      setRingTargets(0)
      stopRingback()
    }
    closeAllPeers()
    socket.emit('leaveRoom')
    goAppBack(navigate)
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

  const toggleChat = () => {
    const next = !chatOpen
    chatOpenRef.current = next
    setChatOpen(next)
    if (next) setUnread(0)
  }

  const copyLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`
    try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const others = (roomInfo?.participants || []).filter((id) => id !== localId)
  const ids = ['local', ...others]
  const layout = planGrid({
    ids,
    aspects,
    pinnedId,
    stageW: stageBox.w,
    stageH: stageBox.h
  })
  const pressable = ids.length > 1

  const togglePin = (id) => {
    if (!pressable) return
    setPinnedId((current) => (current === id ? null : id))
  }

  const flashNote = (text) => {
    setCallNote(text)
    window.clearTimeout(flashNote.timer)
    flashNote.timer = window.setTimeout(() => setCallNote(''), 4200)
  }
  flashNoteRef.current = flashNote

  const toggleAlerts = async () => {
    if (alertsOn) {
      await disableCallAlerts(roomId)
      setAlertsOn(false)
      flashNote('Звонки выкл')
      return
    }
    const result = await armCallsFromGesture(getStoredName() || 'Гость')
    if (result.ok) {
      setAlertsOn(true)
      flashNote(result.hint || 'Звонки вкл — проверьте звук уведомления')
      return
    }
    flashNote(result.message || 'Не удалось включить звонки')
  }

  const cancelOutgoingRing = () => {
    socket.emit('cancelRing', {}, () => {
      setRinging(false)
      setActiveRingId('')
      setRingTargets(0)
      stopRingback()
      flashNote('Звонок отменён')
    })
  }

  useEffect(() => {
    const stopOutgoing = () => {
      setRinging(false)
      setActiveRingId('')
      setRingTargets(0)
      stopRingbackRef.current()
    }
    const onCancelled = ({ roomId: id } = {}) => {
      if (id && id !== roomId) return
      stopOutgoing()
    }
    const onDeclined = () => stopOutgoing()
    socket.on('ringCancelled', onCancelled)
    socket.on('ringDeclined', onDeclined)
    return () => {
      socket.off('ringCancelled', onCancelled)
      socket.off('ringDeclined', onDeclined)
      stopRingbackRef.current()
    }
  }, [roomId])

  const ringSubscribers = async () => {
    if (ringing) {
      cancelOutgoingRing()
      return
    }
    const name = getStoredName() || 'Гость'
    // Always refresh our own subscription first (Render restarts wipe server subs).
    const armed = await enableCallAlerts(roomId, name).catch(() => null)
    if (armed?.ok) setAlertsOn(true)
    else if (!alertsOn) {
      const bulk = await armCallsFromGesture(name)
      if (bulk.ok) setAlertsOn(true)
    }

    setRinging(true)
    startRingback()
    socket.emit('ringRoom', {}, (res) => {
      if (res?.error === 'slow') {
        setRinging(false)
        stopRingback()
        flashNote('Подождите…')
        return
      }
      // Keep ringback for the full server window (45s) even if nobody is subscribed yet —
      // otherwise phones looked like the call "instantly reset".
      setActiveRingId(res?.ringId || '')
      setRingTargets(res?.sent || 0)
      if (!res?.total) {
        flashNote('На другом телефоне откройте этот чат и включите уведомления')
        return
      }
      if (!res.sent) {
        setRinging(false)
        stopRingback()
        flashNote('Все уже в комнате')
        return
      }
      flashNote(`Звоним · ${res.sent}`)
    })
  }

  const gridStyle = {
    '--cols': layout.cols || 1,
    '--rows': layout.rows || 1,
    '--feature': layout.feature || 2,
    '--rail': layout.rail || 1,
    '--rail-cols': layout.railCols || 1,
    '--rail-rows': layout.railRows || 1
  }
  const gridMode = [
    'meet-grid',
    layout.mode === 'spotlight' ? 'layout-spotlight' : '',
    layout.mode === 'five' ? 'layout-five' : '',
    layout.mode === 'equal' ? 'layout-equal' : '',
    layout.stacked ? 'is-stacked' : '',
    layout.mode === 'spotlight' && aspects[layout.featureId] === 'portrait' ? 'feature-portrait' : '',
    layout.mode === 'spotlight' ? ((layout.railCols || 1) > 1 ? 'rails-2' : 'rails-1') : ''
  ].filter(Boolean).join(' ')

  return (
    <div className={`meet-room ${chatOpen ? 'has-chat' : ''}`}>
      <header className="meet-header">
        <div>
          <h1>{roomInfo?.participantCount || 1}</h1>
        </div>
        <div className="meet-header-actions">
          <button type="button" className={`btn btn-small ${alertsOn ? 'btn-success' : 'btn-outline'}`} onClick={toggleAlerts} aria-label={alertsOn ? 'Звонки включены' : 'Включить звонки'}>
            {alertsOn ? <BsBellFill /> : <BsBell />}
          </button>
          <button
            type="button"
            className={`btn btn-small ${ringing ? 'btn-danger is-ringing' : 'btn-primary'}`}
            onClick={ringSubscribers}
            aria-label={ringing ? 'Отменить звонок' : 'Позвонить'}
            title={ringing ? 'Отменить звонок' : 'Позвонить'}
          >
            {ringing ? <FiPhoneOff /> : <BsTelephone />}
          </button>
          <button type="button" className="btn btn-success btn-small" onClick={copyLink} aria-label={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}>
            {copied ? <BsCheck /> : <BsCopy />}
          </button>
        </div>
      </header>

      {ringing && (
        <div className="outgoing-call">
          <div className="outgoing-call-pulse" aria-hidden />
          <div className="outgoing-call-card">
            <p className="outgoing-call-label">Исходящий звонок</p>
            <h2>Звоним{ringTargets ? ` · ${ringTargets}` : '…'}</h2>
            <p className="outgoing-call-hint">Ожидаем ответ</p>
            <button type="button" className="btn btn-danger" onClick={cancelOutgoingRing}>
              <FiPhoneOff /> Отменить
            </button>
          </div>
        </div>
      )}

      <InstallHint compact floating />
      {callNote && !ringing && <div className="toast-note toast-note-float">{callNote}</div>}
      {error && (
        <div className="toast-note toast-note-float toast-error">
          {error}
          <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </div>
      )}

      <div className="meet-stage">
        <section ref={gridRef} className={gridMode} style={gridStyle}>
          <div
            className={`meet-tile-local ${tileClass({
              off: !videoOn,
              aspect: aspects.local,
              pinned: layout.pinnedId === 'local',
              feature: layout.featureId === 'local',
              rail: layout.mode === 'spotlight' && layout.featureId !== 'local',
              pressable
            })}`}
            onClick={pressable ? () => togglePin('local') : undefined}
            onKeyDown={pressable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                togglePin('local')
              }
            } : undefined}
            role={pressable ? 'button' : undefined}
            tabIndex={pressable ? 0 : undefined}
            aria-pressed={pressable ? layout.pinnedId === 'local' : undefined}
            title={pressable ? (layout.pinnedId === 'local' ? 'Убрать увеличение / Unpin' : 'Увеличить / Pin') : undefined}
          >
            <video
              ref={localVideo}
              className={facing === 'user' ? 'mirror' : ''}
              autoPlay
              playsInline
              muted
            />
            <canvas ref={localCanvas} className="mask-canvas-hidden" />
            {!videoOn && <div className="meet-tile-empty">{(getStoredName() || 'Вы').slice(0, 1)}</div>}
            <span className="video-label">Вы</span>
          </div>

          {others.map((id) => (
            <PeerTile
              key={id}
              stream={remoteStreams[id]}
              name={displayName(id)}
              videoOff={!remoteStreams[id]}
              aspect={aspects[id] || 'landscape'}
              pinned={layout.pinnedId === id}
              feature={layout.featureId === id}
              rail={layout.mode === 'spotlight' && layout.featureId !== id}
              pressable={pressable}
              onClick={() => togglePin(id)}
              onAspect={(value) => rememberAspect(id, value)}
            />
          ))}
        </section>

        {chatOpen && (
          <InCallChat
            messages={messages}
            onSend={sendMessage}
            localId={localId}
            title="Чат"
            hint="Только пока комната открыта"
            onClose={toggleChat}
          />
        )}
      </div>

      <footer className="meet-controls">
        <div className="control-buttons">
          <button
            type="button"
            className={`ctrl ${audioOn ? '' : 'ctrl-off'}`}
            onClick={toggleAudio}
            title={audioOn ? 'Выкл. микрофон' : 'Вкл. микрофон'}
          >
            {audioOn ? <BsMicFill /> : <BsMicMuteFill />}
          </button>
          <button
            type="button"
            className={`ctrl ${videoOn ? '' : 'ctrl-off'}`}
            onClick={toggleVideo}
            title={videoOn ? 'Выкл. камеру' : 'Вкл. камеру'}
          >
            {videoOn ? <BsCameraVideo /> : <BsCameraVideoOff />}
          </button>
          {canFlip && (
            <button type="button" className="ctrl" onClick={flipCamera} title="Сменить камеру">
              <MdFlipCameraIos />
            </button>
          )}
          <MaskPicker value={maskId} onChange={changeMask} disabled={!mediaReady} />
          <button
            type="button"
            className={`ctrl ${chatOpen ? 'ctrl-on' : ''}`}
            onClick={toggleChat}
            title="Чат"
          >
            <BsChatDots />
            {unread > 0 && <span className="ctrl-badge">{unread}</span>}
          </button>
          <button type="button" className="ctrl ctrl-leave" onClick={leaveRoom} title="Выйти">
            <FiPhoneOff />
          </button>
        </div>
      </footer>
    </div>
  )
}

export default Room
