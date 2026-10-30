import { useEffect, useRef, useState } from 'react'
import { BsPhoneVibrate } from 'react-icons/bs'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'

import AuthGate from './components/AuthGate'
import CallModal from './components/CallModal'
import CallWindow from './components/CallWindow'
import IncomingCall from './components/IncomingCall'
import MainWindow from './components/MainWindow'
import MaskModule from './components/MaskModule'
import Messenger from './components/Messenger'
import Room from './components/Room'
import RoomManager from './components/RoomManager'
import PeerConnection from './utils/PeerConnection'
import { resubscribeSaved, watchSavedRooms } from './utils/push'
import { createRingtone, startVibrate, stopVibrate } from './utils/ringtone'
import { getStoredId, getStoredName } from './utils/session'
import socket from './utils/socket'
import './styles/app.scss'

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
        const path = String(url || `/room/${roomId}`).replace(window.location.origin, '')
        navigate(path.startsWith('/') ? path : `/${path}`)
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

    const onServiceMessage = (event) => {
      if (event.data?.type === 'incoming-call') showRing(event.data)
      if (event.data?.type === 'ring-cancelled') onCancelled(event.data)
      if (event.data?.type === 'ring-declined') {
        if (event.data.roomId) {
          socket.emit('ringDeclined', { roomId: event.data.roomId, name: getStoredName() || 'Участник' })
        }
        onCancelled(event.data)
      }
      if (event.data?.type === 'navigate-call') {
        answerFromNotice(event.data.url, event.data.roomId, event.data.ringId)
      }
    }

    socket.on('incomingRing', showRing)
    socket.on('ringCancelled', onCancelled)
    document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener('message', onServiceMessage)
    return () => {
      socket.off('incomingRing', showRing)
      socket.off('ringCancelled', onCancelled)
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onServiceMessage)
    }
  }, [navigate])

  useEffect(() => {
    incomingRef.current = incoming
  }, [incoming])

  useEffect(() => {
    socket.emit('init', { id: getStoredId() })
    socket.on('init', ({ id }) => {
      try { sessionStorage.setItem('vc-id', id) } catch { /* ignore */ }
    })
    socket.on('request', ({ from }) => {
      setCallFrom(from)
      setShowModal(true)
    })
    return () => {
      socket.off('init')
      socket.off('request')
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
      navigate(`/room/${roomId}`)
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
