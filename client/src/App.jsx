import { useEffect, useState } from 'react'
import { BsPhoneVibrate } from 'react-icons/bs'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import AuthGate from './components/AuthGate'
import CallModal from './components/CallModal'
import CallWindow from './components/CallWindow'
import MainWindow from './components/MainWindow'
import MaskModule from './components/MaskModule'
import Messenger from './components/Messenger'
import Room from './components/Room'
import RoomManager from './components/RoomManager'
import PeerConnection from './utils/PeerConnection'
import { getStoredId } from './utils/session'
import socket from './utils/socket'
import './styles/app.scss'

export default function App() {
  const [callFrom, setCallFrom] = useState('')
  const [calling, setCalling] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [localSrc, setLocalSrc] = useState(null)
  const [remoteSrc, setRemoteSrc] = useState(null)
  const [pc, setPc] = useState(null)
  const [config, setConfig] = useState(null)

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

  return (
    <div className="app">
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
