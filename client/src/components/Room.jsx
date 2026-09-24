import { useCallback, useEffect, useRef, useState } from 'react'
import { BsCameraVideo, BsCameraVideoOff, BsCheck, BsCopy, BsMicFill, BsMicMuteFill } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'

import MaskEngine from '../utils/MaskEngine'
import PeerConnection from '../utils/PeerConnection'
import { getStoredId, getStoredName } from '../utils/session'
import socket from '../utils/socket'
import MaskPicker from './MaskPicker'
import PeerTile from './PeerTile'

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
  const [remoteStreams, setRemoteStreams] = useState({})

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

  const displayName = useCallback((id) => roomInfoRef.current?.names?.[id] || id, [])

  const attachLocalPreview = useCallback((stream) => {
    if (localVideo.current && stream) {
      localVideo.current.srcObject = stream
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
      socket.emit('joinRoom', { roomId, name: getStoredName() || 'Гость' })
    }

    socket
      .on('init', onInit)
      .on('roomJoined', ({ roomInfo: info }) => {
        roomInfoRef.current = info
        setRoomInfo(info)
        setError('')
        meshWith(info?.participants)
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

    return () => {
      closeAllPeers()
      socket.emit('leaveRoom')
      ;['init', 'roomJoined', 'roomError', 'userJoined', 'userLeft', 'hostChanged', 'peerMediaReady', 'call']
        .forEach((ev) => socket.off(ev))
      rawStreamRef.current?.getTracks().forEach((track) => track.stop())
      engineRef.current?.dispose()
    }
  }, [roomId, navigate, meshWith, ensurePeer, closePeer, closeAllPeers, flushQueue])

  useEffect(() => {
    if (!roomInfo || roomInfo.type === 'text') return undefined
    let cancelled = false

    const startPreview = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
        outboundRef.current = stream
        attachLocalPreview(stream)
        mediaReadyRef.current = true
        setMediaReady(true)
        socket.emit('mediaReady')
        meshWith(roomInfoRef.current?.participants)
      } catch (err) {
        console.error(err)
        setError('Нужен доступ к камере и микрофону / Allow camera and microphone')
      }
    }

    startPreview()
    return () => { cancelled = true }
  }, [roomInfo?.type, roomId, meshWith, attachLocalPreview])

  useEffect(() => {
    if (mediaReady && roomInfo?.participants) meshWith(roomInfo.participants)
  }, [mediaReady, roomInfo?.participants, meshWith])

  const pushVideoTrack = (track) => {
    peersRef.current.forEach((pc) => {
      if (pc && !pc.pending) pc.replaceVideoTrack?.(track)
    })
  }

  const changeMask = async (id) => {
    setMaskId(id)
    const raw = rawStreamRef.current
    if (!raw) return

    if (id === 'none') {
      engineRef.current?.stop({ keepCanvas: true })
      outboundRef.current = raw
      attachLocalPreview(raw)
      pushVideoTrack(raw.getVideoTracks()[0])
      return
    }

    if (!engineRef.current) engineRef.current = new MaskEngine()
    const engine = engineRef.current
    await engine.init()
    await engine.setMask(id)
    if (localCanvas.current) {
      engine.attach({ stream: raw, canvas: localCanvas.current })
    }
    const canvasStream = engine.getStream(24)
    const mixed = new MediaStream([
      ...(canvasStream?.getVideoTracks() || raw.getVideoTracks()),
      ...raw.getAudioTracks()
    ])
    outboundRef.current = mixed
    attachLocalPreview(mixed)
    pushVideoTrack(mixed.getVideoTracks()[0])
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

  const leaveRoom = () => {
    closeAllPeers()
    socket.emit('leaveRoom')
    navigate('/')
  }

  const copyLink = async () => {
    const link = `${window.location.origin}/room/${roomId}`
    try { await navigator.clipboard.writeText(link) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const peerIds = Object.keys(remoteStreams)
  const others = (roomInfo?.participants || []).filter((id) => id !== localId)
  const tiles = others.length ? others : []
  const tileCount = 1 + Math.max(tiles.length, peerIds.length ? peerIds.length : 0)

  return (
    <div className="meet-room">
      <header className="meet-header">
        <div>
          <h1>{roomInfo?.participantCount || 1} в встрече</h1>
          <p>{copied ? 'Ссылка скопирована' : 'Отправьте ссылку — кто откроет, тот в эфире'}</p>
        </div>
        <button type="button" className="btn btn-success" onClick={copyLink}>
          {copied ? <BsCheck /> : <BsCopy />} {copied ? 'Готово' : 'Ссылка'}
        </button>
      </header>

      {error && (
        <div className="error">
          {error}
          <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
            Повторить
          </button>
        </div>
      )}

      <section className={`meet-grid ${gridClass(Math.max(1, tileCount))}`}>
        <div className={`meet-tile meet-tile-local ${videoOn ? '' : 'is-off'}`}>
          <video ref={localVideo} className="mirror" autoPlay playsInline muted />
          <canvas ref={localCanvas} className="mask-canvas-hidden" />
          {!videoOn && <div className="meet-tile-empty">{(getStoredName() || 'Вы').slice(0, 1)}</div>}
          <span className="video-label">Вы</span>
        </div>

        {tiles.map((id) => (
          <PeerTile
            key={id}
            stream={remoteStreams[id]}
            name={displayName(id)}
            videoOff={!remoteStreams[id]}
          />
        ))}
      </section>

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
          <MaskPicker value={maskId} onChange={changeMask} disabled={!mediaReady} />
          <button type="button" className="ctrl ctrl-leave" onClick={leaveRoom} title="Выйти">
            <FiPhoneOff />
          </button>
        </div>
      </footer>
    </div>
  )
}

export default Room
