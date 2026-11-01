import { useEffect, useRef, useState } from 'react'
import { BsPhoneVibrate } from 'react-icons/bs'
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams
} from 'react-router-dom'

import AuthGate from './components/AuthGate'
import CallModal from './components/CallModal'
import CallWindow from './components/CallWindow'
import IncomingCall from './components/IncomingCall'
import MainWindow from './components/MainWindow'
import MaskModule from './components/MaskModule'
import Messenger from './components/Messenger'
import Room from './components/Room'
import RoomManager from './components/RoomManager'
import { enterRoom, goAppBack, resolveTreeBack } from './utils/appNav'
import { isNativeApp } from './utils/native'
import { initNativePush } from './utils/nativePush'
import PeerConnection from './utils/PeerConnection'
import { resubscribeSaved, watchSavedRooms } from './utils/push'
import { createRingtone, startVibrate, stopVibrate } from './utils/ringtone'
import { getStoredName } from './utils/session'
import socket from './utils/socket'
import { bumpUnread } from './utils/unread'
import './styles/app.scss'

/** Browser/Android back → route-tree parent only (not arbitrary history entries). */
function TreeBackGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const prevRef = useRef({ pathname: location.pathname, search: location.search })
  const bootedRef = useRef(false)
  const snappingRef = useRef(false)

  useEffect(() => {
    // RR reports POP on the initial document load — skip that once.
    if (!bootedRef.current) {
      bootedRef.current = true
      prevRef.current = { pathname: location.pathname, search: location.search }
      return
    }

    const prev = prevRef.current
    // Same location as before (StrictMode double-run, hash-only change) → not a real Back.
    const moved = prev.pathname !== location.pathname || prev.search !== location.search
    if (navType === 'POP' && moved && !snappingRef.current) {
      const snapTo = resolveTreeBack(prev, location)
      if (snapTo != null) {
        snappingRef.current = true
        navigate(snapTo, { replace: true })
        prevRef.current = { pathname: snapTo, search: '' }
        queueMicrotask(() => { snappingRef.current = false })
        return
      }
    }
    prevRef.current = { pathname: location.pathname, search: location.search }
  }, [location, navType, navigate])

  useEffect(() => {
    if (!isNativeApp()) return undefined
    let handle = null
    let cancelled = false
    const pkg = '@capacitor/app'
    import(/* @vite-ignore */ pkg).then(({ App }) => {
      if (cancelled) return
      handle = App.addListener('backButton', () => {
        if (goAppBack(navigate)) return
        App.exitApp()
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      handle?.then?.((h) => h.remove()).catch?.(() => {})
      handle?.remove?.()
    }
  }, [navigate])

  return null
}

export default function App() {
  const navigate = useNavigate()
  const [callFrom, setCallFrom] = useState('')
  const [calling, setCalling] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [localSrc, setLocalSrc] = useState(null)
  const [remoteSrc, setRemoteSrc] = useState(null)
  const [pc, setPc] = useState(null)
  const [config, setConfig] = useState(null)
  const [incoming, setIncoming] = useState(null)
  const [ringError, setRingError] = useState('')
  const ringtoneRef = useRef(null)
  const lastRingRef = useRef({ at: 0, roomId: '', ringId: '' })
  const incomingRef = useRef(null)

  useEffect(() => {
    const joinWatch = () => watchSavedRooms()
    if (socket.connected) joinWatch()
    socket.on('connect', joinWatch)
    resubscribeSaved(getStoredName() || 'Гость')
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => reg.update?.())
        .catch(() => {})
    }
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then(() => resubscribeSaved(getStoredName() || 'Гость')).catch(() => {})
    }
    initNativePush().catch(() => {})
    return () => {
      socket.off('connect', joinWatch)
      ringtoneRef.current?.stop()
      stopVibrate()
    }
  }, [])

  useEffect(() => {
    const stopLocalRing = () => {
      ringtoneRef.current?.stop()
      ringtoneRef.current = null
      stopVibrate()
      setIncoming(null)
      lastRingRef.current = { at: 0, roomId: '' }
    }

    const showRing = (payload) => {
      const roomId = payload?.roomId
      if (!roomId) return
      if (window.location.pathname === `/room/${roomId}`) return
      const now = Date.now()
      if (
        lastRingRef.current.roomId === roomId
        && lastRingRef.current.ringId === (payload.ringId || '')
        && now - lastRingRef.current.at < 4000
      ) return
      lastRingRef.current = { at: now, roomId, ringId: payload.ringId || '' }
      setIncoming({
        roomId,
        ringId: payload.ringId || '',
        fromName: payload.fromName || 'Участник'
      })
      ringtoneRef.current?.stop()
      ringtoneRef.current = createRingtone()
      if (document.visibilityState === 'visible') {
        ringtoneRef.current.start()
        startVibrate()
      }
    }

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!lastRingRef.current.roomId) return
      if (Date.now() - lastRingRef.current.at > 45000) return
      if (!ringtoneRef.current) ringtoneRef.current = createRingtone()
      ringtoneRef.current.resumeIfVisible?.()
      startVibrate()
    }

    const onCancelled = (payload) => {
      const roomId = payload?.roomId
      if (!roomId) return
      if (incomingRef.current?.roomId === roomId || lastRingRef.current.roomId === roomId) {
        navigator.serviceWorker?.controller?.postMessage({ type: 'stop-ring', roomId })
        stopLocalRing()
      }
    }

    const answerFromNotice = (url, roomId, ringId) => {
      ringtoneRef.current?.stop()
      stopVibrate()
      setIncoming(null)
      const go = () => {
        if (roomId) {
          enterRoom(navigate, roomId)
          return
        }
        const path = String(url || '/').replace(window.location.origin, '')
        navigate(path.startsWith('/') ? path : `/${path}`, { replace: true })
      }
      if (!roomId) {
        go()
        return
      }
      socket.emit('answerRing', { roomId, ringId: ringId || '' }, (res) => {
        if (!res?.ok) {
          stopLocalRing()
          setRingError(res?.error === 'empty'
            ? 'Комната уже пуста — звонок отменён'
            : 'Звонок уже отменён')
          window.setTimeout(() => setRingError(''), 4000)
          return
        }
        go()
      })
    }

    const onChatMessage = (payload) => {
      const roomId = payload?.roomId
      const message = payload?.message
      if (!roomId || !message) return
      if (window.location.pathname === `/room/${roomId}`) return
      bumpUnread(roomId, 1)
      window.dispatchEvent(new Event('vc-unread'))
    }

    const onServiceMessage = (event) => {
      if (event.data?.type === 'incoming-call') showRing(event.data)
      if (event.data?.type === 'ring-cancelled') onCancelled(event.data)
      if (event.data?.type === 'ring-declined') {
        if (event.data.roomId) {
          socket.emit('ringDeclined', { roomId: event.data.roomId, name: getStoredName() || 'Участник' })
        }
        onCancelled(event.data)
      }
      if (event.data?.type === 'chat-message' && event.data.roomId) {
        bumpUnread(event.data.roomId, 1)
        window.dispatchEvent(new Event('vc-unread'))
      }
      if (event.data?.type === 'navigate-call') {
        answerFromNotice(event.data.url, event.data.roomId, event.data.ringId)
      }
    }

    socket.on('incomingRing', showRing)
    socket.on('ringCancelled', onCancelled)
    socket.on('chatMessage', onChatMessage)
    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener('message', onServiceMessage)
    return () => {
      socket.off('incomingRing', showRing)
      socket.off('ringCancelled', onCancelled)
      socket.off('chatMessage', onChatMessage)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onServiceMessage)
    }
  }, [navigate])

  useEffect(() => {
    incomingRef.current = incoming
  }, [incoming])

  useEffect(() => {
    // socket.js re-sends `init` on every connect; here only legacy 1:1 call requests.
    const onRequest = ({ from }) => {
      setCallFrom(from)
      setShowModal(true)
    }
    socket.on('request', onRequest)
    return () => {
      socket.off('request', onRequest)
    }
  }, [])

  useEffect(() => {
    if (!pc) return
    const onCall = (data) => pc.applySignal(data)
    const onEnd = () => finishCall(false)
    socket.on('call', onCall)
    socket.on('end', onEnd)
    return () => {
      socket.off('call', onCall)
      socket.off('end', onEnd)
    }
  }, [pc])

  const startCall = async (isCaller, remoteId, nextConfig) => {
    setShowModal(false)
    setCalling(true)
    setConfig(nextConfig)

    const connection = await PeerConnection.create(remoteId)
    connection
      .on('localStream', (stream) => setLocalSrc(stream))
      .on('remoteStream', (stream) => {
        setRemoteSrc(stream)
        setCalling(false)
      })
      .start(isCaller, nextConfig)

    setPc(connection)
  }

  const rejectCall = () => {
    socket.emit('end', { to: callFrom })
    setShowModal(false)
  }

  const finishCall = (isCaller) => {
    pc?.stop(isCaller)
    pc?.mediaDevice?.stop()
    setPc(null)
    setConfig(null)
    setCalling(false)
    setShowModal(false)
    setLocalSrc(null)
    setRemoteSrc(null)
  }

  const CallPage = () => (
    <>
      <h1>Video-Chat</h1>
      <MainWindow startCall={startCall} />
      {calling && (
        <div className="calling">
          <button disabled>
            <BsPhoneVibrate />
          </button>
        </div>
      )}
      {showModal && (
        <CallModal
          callFrom={callFrom}
          startCall={startCall}
          rejectCall={rejectCall}
        />
      )}
      {remoteSrc && (
        <CallWindow
          localSrc={localSrc}
          remoteSrc={remoteSrc}
          config={config}
          mediaDevice={pc?.mediaDevice}
          finishCall={finishCall}
        />
      )}
    </>
  )

  const answerRing = () => {
    const roomId = incoming?.roomId
    const ringId = incoming?.ringId || ''
    ringtoneRef.current?.stop()
    stopVibrate()
    if (!roomId) {
      setIncoming(null)
      return
    }
    socket.emit('answerRing', { roomId, ringId }, (res) => {
      setIncoming(null)
      if (!res?.ok) {
        lastRingRef.current = { at: 0, roomId: '', ringId: '' }
        navigator.serviceWorker?.controller?.postMessage({ type: 'stop-ring', roomId })
        setRingError(res?.error === 'empty'
          ? 'Комната уже пуста — звонок отменён'
          : 'Звонок уже отменён')
        window.setTimeout(() => setRingError(''), 4000)
        return
      }
      enterRoom(navigate, roomId)
    })
  }

  const declineRing = () => {
    if (incoming?.roomId) {
      socket.emit('ringDeclined', { roomId: incoming.roomId, name: getStoredName() || 'Участник' })
      navigator.serviceWorker?.controller?.postMessage({ type: 'stop-ring', roomId: incoming.roomId })
    }
    ringtoneRef.current?.stop()
    stopVibrate()
    setIncoming(null)
    lastRingRef.current = { at: 0, roomId: '', ringId: '' }
  }

  return (
    <div className="app">
      <TreeBackGuard />
      {ringError && <div className="toast-note toast-note-float toast-error">{ringError}</div>}
      {incoming && (
        <IncomingCall
          fromName={incoming.fromName}
          onAccept={answerRing}
          onReject={declineRing}
        />
      )}
      <Routes>
        {/* Free mode (default): anyone with a room link joins — no email */}
        <Route path="/" element={<RoomManager />} />
        <Route path="/guest" element={<RoomManager />} />
        {/* Optional family messenger with email OTP */}
        <Route path="/family" element={<AuthGate><Messenger /></AuthGate>} />
        <Route path="/family/chat/:chatId" element={<AuthGate><Messenger /></AuthGate>} />
        <Route path="/chat/:chatId" element={<AuthGate><Messenger /></AuthGate>} />
        <Route path="/masks" element={<MaskModule />} />
        <Route path="/call" element={<CallPage />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/room/:roomId/call" element={<RedirectLegacyCall />} />
      </Routes>
    </div>
  )
}

function RedirectLegacyCall() {
  const { roomId } = useParams()
  return <Navigate to={`/room/${roomId}`} replace />
}
