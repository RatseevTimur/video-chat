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
  BsPersonPlus,
  BsShare,
  BsTelephone,
  BsX
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
import { trackingEnabled } from '../utils/prefs'
import { getStoredId, getStoredName, randomId } from '../utils/session'
import socket from '../utils/socket'
import { watchSpeaking } from '../utils/voice'
import EffectsPanel from './EffectsPanel'
import InCallChat from './InCallChat'
import PeerTile from './PeerTile'
import ReactionBurst, { REACTION_MS, REACTIONS } from './ReactionBurst'

function shouldOffer(localId, remoteId) {
  return String(localId) < String(remoteId)
}

function shouldRestart(pc) {
  return ['failed', 'disconnected', 'closed'].includes(pc?.connectionState)
}

const FX_KEY = 'vc-fx'
function loadFx() {
  try {
    const saved = JSON.parse(localStorage.getItem(FX_KEY) || '{}')
    return {
      mask: typeof saved.mask === 'string' ? saved.mask : 'none',
      background: typeof saved.background === 'string' ? saved.background : 'none',
      gestures: saved.gestures !== false
    }
  } catch {
    return { mask: 'none', background: 'none', gestures: true }
  }
}
function saveFx(fx) {
  try { localStorage.setItem(FX_KEY, JSON.stringify(fx)) } catch { /* ignore */ }
}

const Room = () => {
  const { roomId } = useParams()
  const navigate = useNavigate()

  const [localId, setLocalId] = useState('')
  const [roomInfo, setRoomInfo] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [ringableNames, setRingableNames] = useState([])
  const [ringHint, setRingHint] = useState('')
  const [maskId, setMaskId] = useState(() => loadFx().mask)
  const [background, setBackground] = useState(() => loadFx().background)
  const [gestures, setGestures] = useState(() => loadFx().gestures)
  const [peerMedia, setPeerMedia] = useState({})
  const [reactions, setReactions] = useState({})
  const [localSpeaking, setLocalSpeaking] = useState(false)
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
  const [link, setLink] = useState(socket.connected ? 'connecting' : 'offline')
  const [linkSlow, setLinkSlow] = useState(false)
  const ringbackRef = useRef(null)
  const leaveRoomTimerRef = useRef(null)
  const previewGenRef = useRef(0)
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
  const maskIdRef = useRef(loadFx().mask)
  const fxRef = useRef(loadFx())
  const fireReactionRef = useRef(() => {})
  const showReactionRef = useRef(() => {})
  const stopLocalMeterRef = useRef(() => {})
  const reactionTimersRef = useRef(new Map())
  const audioOnRef = useRef(true)
  const videoOnRef = useRef(true)
  const gridRef = useRef(null)
  // Per-mount media session token; peers use it to detect our reload (see peerMediaReady).
  const sessionRef = useRef(randomId(10))
  const peerSessionRef = useRef(new Map())

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
    if (window.__vcSocket) { // debug hooks (same opt-in as the socket)
      window.__vcEngine = engine
      window.__vcPeers = peersRef.current
    }
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
    engine.onGesture = (kind) => fireReactionRef.current(kind)
    engine.setBackground(fxRef.current.background).catch(() => {})
    engine.setGestures(fxRef.current.gestures).catch(() => {})
    engine.setTracking(trackingEnabled())
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
    const join = () => {
      socket.emit('joinRoom', { roomId, name: getStoredName() || 'Гость', deviceId: getDeviceId() })
    }
    // `init` arrives on every (re)connect (see utils/socket.js) → always re-take our seat.
    const onInit = ({ id }) => {
      setLocalId(id)
      localIdRef.current = id
      join()
    }

    const handlers = {
      init: onInit,
      roomJoined: ({ roomInfo: info, chat }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        setLink('online')
        if (Array.isArray(chat)) setChat(chat)
        // Keep a camera error visible; clear stale room errors.
        setError((prev) => (mediaReadyRef.current ? '' : prev))
        if (info?.media) setPeerMedia(info.media)
        if (Array.isArray(info?.ringTargets)) setRingableNames(info.ringTargets)
        else socket.emit('getRingTargets', {})
        meshWith(info?.participants)
        if (mediaReadyRef.current) {
          socket.emit('mediaReady', { session: sessionRef.current })
          socket.emit('mediaState', { audio: audioOnRef.current, video: videoOnRef.current })
        }
      },
      ringTargets: ({ names, roomId: id }) => {
        if (id && id !== roomId) return
        if (Array.isArray(names)) setRingableNames(names)
      },
      peerMediaState: ({ userId, audio, video }) => {
        if (!userId) return
        setPeerMedia((prev) => ({ ...prev, [userId]: { audio: audio !== false, video: video !== false } }))
      },
      reaction: ({ from, kind }) => {
        if (from && REACTIONS[kind]) showReactionRef.current(from, kind)
      },
      roomError: ({ message }) => {
        setError(message)
        if (String(message).toLowerCase().includes('не найдена') || String(message).toLowerCase().includes('not found')) {
          goAppBack(navigate)
        }
      },
      userJoined: ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        meshWith(info?.participants)
        if (userId) ensurePeer(userId)
      },
      userLeft: ({ roomInfo: info, userId }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        if (userId) {
          queueRef.current.delete(userId)
          closePeer(userId)
        }
      },
      hostChanged: ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
      },
      peerMediaReady: ({ userId, session, roomInfo: info }) => {
        if (info) {
          roomInfoRef.current = info
          setRoomInfo(info)
        }
        if (!userId || userId === localIdRef.current) return
        const existing = peersRef.current.get(userId)
        // Peer reloaded/reconnected with a new media session → its old RTCPeerConnection is dead
        // on their side; rebuild ours instead of leaving a frozen black tile.
        const known = peerSessionRef.current.get(userId)
        const fresh = Boolean(session && known && known !== session)
        if (session) peerSessionRef.current.set(userId, session)
        ensurePeer(userId, {
          restart: Boolean(existing && !existing.pending && (fresh || shouldRestart(existing)))
        })
      },
      chatMessage: ({ message }) => addMessage(message),
      ringDeclined: ({ name }) => {
        setRinging(false)
        setActiveRingId('')
        setRingTargets(0)
        stopRingbackRef.current()
        flashNoteRef.current(`${name || 'Участник'} отклонил звонок`)
      },
      call: async (data) => {
        const from = data?.from
        if (!from || from === localIdRef.current) return
        const queued = queueRef.current.get(from) || []
        queued.push(data)
        queueRef.current.set(from, queued)
        if (mediaReadyRef.current) {
          await ensurePeer(from)
          flushQueue(from)
        }
      },
      disconnect: () => setLink('offline'),
      connect_error: () => setLink('offline')
    }
    Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn))

    // Already connected → no `init` event will come; claim the seat ourselves.
    if (socket.connected) socket.emit('init', { id: getStoredId() })
    else setLink('offline')

    // StrictMode remounts quickly — defer leave so the second mount can cancel it.
    let leaveTimer = null
    return () => {
      closeAllPeers()
      leaveTimer = setTimeout(() => socket.emit('leaveRoom'), 600)
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn))
      // Cancel deferred leave if this cleanup is from StrictMode remount.
      // (A new effect for the same roomId will clear this via the ref below.)
      if (leaveRoomTimerRef.current) clearTimeout(leaveRoomTimerRef.current)
      leaveRoomTimerRef.current = leaveTimer
    }
  }, [roomId, navigate, meshWith, ensurePeer, closePeer, closeAllPeers, flushQueue, addMessage])

  const startPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext
        ? 'Браузер не поддерживает камеру'
        : `Камера недоступна по http. Откройте https://${window.location.hostname}:4443 или http://localhost:4000`)
      return false
    }
    // Only the latest request may win (StrictMode double-mount, quick camera flips).
    const gen = ++previewGenRef.current
    const stale = () => gen !== previewGenRef.current
    try {
      const stream = await openCamera(facingRef.current)
      if (stale()) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      rawStreamRef.current = stream
      await bindComposer(stream)
      if (stale()) return false
      mediaReadyRef.current = true
      setMediaReady(true)
      setError('')
      socket.emit('mediaReady', { session: sessionRef.current })
      socket.emit('mediaState', { audio: audioOnRef.current, video: videoOnRef.current })
      meshWith(roomInfoRef.current?.participants)
      stopLocalMeterRef.current()
      stopLocalMeterRef.current = watchSpeaking(stream, setLocalSpeaking)

      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const cams = devices.filter((item) => item.kind === 'videoinput').length
        setCanFlip(cams > 1 || ('ontouchstart' in window))
      } catch { /* ignore */ }
      return true
    } catch (err) {
      console.error('camera', err)
      const name = err?.name || ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Нужен доступ к камере и микрофону — нажмите «Разрешить» в браузере')
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('Камера или микрофон не найдены')
      } else if (name === 'NotReadableError') {
        setError('Камера занята другим приложением')
      } else {
        setError('Нужен доступ к камере и микрофону / Allow camera and microphone')
      }
      return false
    }
  }, [bindComposer, meshWith])

  // Ask for camera/mic right away (don't wait for the server) — users must see the prompt instantly.
  useEffect(() => {
    startPreview()
    return () => {
      previewGenRef.current += 1 // invalidate any in-flight getUserMedia
      mediaReadyRef.current = false
      stopLocalMeterRef.current()
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      rawStreamRef.current = null
      engineRef.current?.dispose()
      engineRef.current = null
      outboundRef.current = null
    }
  }, [roomId, startPreview])

  // Lobby settings → apply face-follow crop without remounting the room.
  useEffect(() => {
    const apply = (on) => engineRef.current?.setTracking(on !== false)
    const onCustom = (event) => apply(event.detail?.on)
    const onStorage = (event) => {
      if (event.key === 'vc-tracking') apply(event.newValue !== '0' && event.newValue !== 'false')
    }
    window.addEventListener('vc-tracking', onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('vc-tracking', onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  // Hidden tab: rAF stops → canvas track freezes. Send the raw camera track instead
  // (unless a virtual background is on — then privacy wins and we keep the slow canvas loop).
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden'
      const engine = engineRef.current
      engine?.setHidden(hidden)
      const raw = rawStreamRef.current?.getVideoTracks()[0]
      const composed = engine?.outputStream?.getVideoTracks()[0]
      if (hidden && fxRef.current.background === 'none' && raw) pushVideoTrack(raw)
      else if (!hidden && composed) pushVideoTrack(composed)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pushVideoTrack])

  // Reactions: local burst + broadcast; remote bursts arrive via socket.
  showReactionRef.current = (peerId, kind) => {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setReactions((prev) => ({ ...prev, [peerId]: { kind, nonce } }))
    const timers = reactionTimersRef.current
    window.clearTimeout(timers.get(peerId))
    timers.set(peerId, window.setTimeout(() => {
      setReactions((prev) => {
        if (prev[peerId]?.nonce !== nonce) return prev
        const next = { ...prev }
        delete next[peerId]
        return next
      })
    }, REACTION_MS))
  }
  fireReactionRef.current = (kind) => {
    if (!REACTIONS[kind]) return
    showReactionRef.current('local', kind)
    socket.emit('reaction', { kind })
  }

  // "Connecting…" that never resolves is the worst UX; surface it.
  useEffect(() => {
    if (link === 'online') return undefined
    const timer = window.setTimeout(() => setLinkSlow(true), 5000)
    return () => {
      window.clearTimeout(timer)
      setLinkSlow(false)
    }
  }, [link])

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
    fxRef.current = { ...fxRef.current, mask: id }
    saveFx(fxRef.current)
    await engineRef.current?.setMask(id)
  }

  const changeBackground = async (id) => {
    setBackground(id)
    fxRef.current = { ...fxRef.current, background: id }
    saveFx(fxRef.current)
    const applied = await engineRef.current?.setBackground(id)
    if (applied && applied !== id) {
      setBackground(applied)
      fxRef.current = { ...fxRef.current, background: applied }
    }
  }

  const changeGestures = async (on) => {
    setGestures(on)
    fxRef.current = { ...fxRef.current, gestures: on }
    saveFx(fxRef.current)
    await engineRef.current?.setGestures(on)
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
    videoOnRef.current = next
    rawStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
    outboundRef.current?.getVideoTracks().forEach((track) => { track.enabled = next })
    socket.emit('mediaState', { audio: audioOnRef.current, video: next })
  }

  const toggleAudio = () => {
    const next = !audioOn
    setAudioOn(next)
    audioOnRef.current = next
    rawStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
    outboundRef.current?.getAudioTracks().forEach((track) => { track.enabled = next })
    socket.emit('mediaState', { audio: next, video: videoOnRef.current })
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

  const roomLink = () => `${window.location.origin}/room/${roomId}`

  const refreshRingTargets = useCallback(() => {
    socket.emit('getRingTargets', {}, (res) => {
      if (Array.isArray(res?.names)) setRingableNames(res.names)
    })
  }, [])

  const copyLink = async () => {
    const link = roomLink()
    try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const shareInvite = async () => {
    const link = roomLink()
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Video Chat',
          text: 'Присоединяйтесь к видеозвонку. Откройте ссылку и разрешите уведомления — тогда вам смогут позвонить.',
          url: link
        })
        return
      }
    } catch {
      // fall through to copy
    }
    await copyLink()
    flashNoteRef.current?.('Ссылка скопирована — отправьте человеку')
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
      refreshRingTargets()
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
      if (res?.error) {
        setRinging(false)
        stopRingback()
        flashNote('Не удалось позвонить — попробуйте ещё раз')
        return
      }
      // Ring stays active on the server for 45s; anyone who opens the app meanwhile gets it.
      setActiveRingId(res?.ringId || '')
      const others = Number(res?.others || 0)
      const participants = Number(res?.participants || 1)
      const names = Array.isArray(res?.ringTargets) ? res.ringTargets : []
      if (names.length) setRingableNames(names)
      setRingTargets(others)
      if (others > 0) {
        const who = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '') : ''
        setRingHint(who ? `Услышат: ${who}` : 'Ожидаем ответ')
        flashNote(`Звоним ${others} ${others === 1 ? 'устройству' : 'устройствам'}${who ? ` · ${who}` : ''}`)
        return
      }
      if (participants > 1) {
        setRinging(false)
        stopRingback()
        setRingHint('')
        flashNote('Все уже в комнате')
        return
      }
      setRinging(false)
      stopRingback()
      setRingHint('')
      socket.emit('cancelRing', {})
      flashNote('Некому звонить — нажмите «Пригласить», человек откроет ссылку и 🔔')
      setInviteOpen(true)
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
          <button type="button" className={`btn btn-small ${alertsOn ? 'btn-success' : 'btn-outline'}`} onClick={toggleAlerts} aria-label={alertsOn ? 'Звонки включены' : 'Включить звонки'} title={alertsOn ? 'Звонки включены' : 'Включить уведомления о звонках'}>
            {alertsOn ? <BsBellFill /> : <BsBell />}
          </button>
          <button
            type="button"
            className={`btn btn-small ${ringing ? 'btn-danger is-ringing' : 'btn-primary'}`}
            onClick={ringSubscribers}
            aria-label={ringing ? 'Отменить звонок' : 'Позвонить'}
            title={ringing ? 'Отменить звонок' : (ringableNames.length ? `Позвонить · ${ringableNames.length}` : 'Позвонить')}
          >
            {ringing ? <FiPhoneOff /> : <BsTelephone />}
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => { setInviteOpen(true); refreshRingTargets() }} aria-label="Пригласить" title="Пригласить в комнату">
            <BsPersonPlus />
          </button>
          <button type="button" className="btn btn-success btn-small" onClick={copyLink} aria-label={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}>
            {copied ? <BsCheck /> : <BsCopy />}
          </button>
        </div>
      </header>

      {ringableNames.length > 0 && !ringing && (
        <p className="ringable-strip" title={ringableNames.join(', ')}>
          Услышат звонок: {ringableNames.slice(0, 4).join(', ')}{ringableNames.length > 4 ? '…' : ''}
        </p>
      )}
      {!ringableNames.length && !ringing && link === 'online' && (
        <p className="ringable-strip is-empty">
          Пока никто не подписан на звонки — пригласите по ссылке
        </p>
      )}

      {inviteOpen && (
        <div className="invite-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={() => setInviteOpen(false)}>
          <div className="invite-sheet" onClick={(event) => event.stopPropagation()}>
            <header className="effects-head">
              <strong id="invite-title">Пригласить в комнату</strong>
              <button type="button" className="icon-btn" aria-label="Закрыть" onClick={() => setInviteOpen(false)}><BsX /></button>
            </header>
            <p className="settings-hint">
              Отправьте ссылку → человек открывает → нажимает 🔔 (уведомления) → появится в списке «Услышат звонок». Потом можно звонить.
            </p>
            <p className="invite-link">{roomLink()}</p>
            <div className="invite-actions">
              <button type="button" className="btn btn-success" onClick={shareInvite}>
                <BsShare /> Поделиться
              </button>
              <button type="button" className="btn btn-outline" onClick={async () => { await copyLink(); flashNoteRef.current?.('Ссылка скопирована') }}>
                <BsCopy /> {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            {ringableNames.length > 0 ? (
              <p className="settings-hint">Уже услышат: {ringableNames.join(', ')}</p>
            ) : (
              <p className="settings-hint">Пока список пуст — дождитесь, пока человек откроет ссылку и включит 🔔.</p>
            )}
          </div>
        </div>
      )}

      {ringing && (
        <div className="outgoing-call">
          <div className="outgoing-call-pulse" aria-hidden />
          <div className="outgoing-call-card">
            <p className="outgoing-call-label">Исходящий звонок</p>
            <h2>{ringTargets > 0 ? `Звоним · ${ringTargets}` : 'Некому звонить'}</h2>
            <p className="outgoing-call-hint">{ringHint || 'Ожидаем ответ'}</p>
            {ringTargets === 0 && (
              <button type="button" className="btn btn-success" onClick={() => { setInviteOpen(true); refreshRingTargets() }}>
                <BsPersonPlus /> Пригласить
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={cancelOutgoingRing}>
              <FiPhoneOff /> Отменить
            </button>
          </div>
        </div>
      )}

      {(callNote && !ringing) || (link !== 'online' && linkSlow && !error) || error ? (
        <div className="meet-banners" aria-live="polite">
          {callNote && !ringing && <div className="toast-note">{callNote}</div>}
          {link !== 'online' && linkSlow && !error && (
            <div className="toast-note toast-error">
              {link === 'offline' ? 'Нет связи с сервером — переподключаемся…' : 'Подключаемся к комнате…'}
              <button type="button" className="btn btn-small" onClick={() => { socket.connect(); socket.emit('init', { id: getStoredId() }) }}>
                Повторить
              </button>
            </div>
          )}
          {error && (
            <div className="toast-note toast-error">
              {error}
              {!mediaReady && navigator.mediaDevices?.getUserMedia ? (
                <button type="button" className="btn btn-small" onClick={() => startPreview()}>
                  Разрешить камеру
                </button>
              ) : (
                <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
                  Повторить
                </button>
              )}
            </div>
          )}
        </div>
      ) : null}

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
            })} ${localSpeaking && audioOn ? 'is-speaking' : ''}`}
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
            {reactions.local && <ReactionBurst kind={reactions.local.kind} nonce={reactions.local.nonce} />}
            <div className="tile-badges">
              {!audioOn && <span className="tile-badge"><BsMicMuteFill /></span>}
              {!videoOn && <span className="tile-badge"><BsCameraVideoOff /></span>}
            </div>
            <span className="video-label">Вы</span>
          </div>

          {others.map((id) => (
            <PeerTile
              key={id}
              stream={remoteStreams[id]}
              name={displayName(id)}
              videoOff={!remoteStreams[id] || peerMedia[id]?.video === false}
              micOff={peerMedia[id]?.audio === false}
              reaction={reactions[id] || null}
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
          <EffectsPanel
            mask={maskId}
            onMask={changeMask}
            background={background}
            onBackground={changeBackground}
            gestures={gestures}
            onGestures={changeGestures}
            disabled={!mediaReady}
          />
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
