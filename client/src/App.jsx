import './styles/app.scss'

import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { BsPhoneVibrate } from 'react-icons/bs'

import PeerConnection from './utils/PeerConnection'
import socket from './utils/socket'

// import { MainWindow, CallWindow, CallModal } from './components'
import CallModal from './components/CallModal'
import MainWindow from './components/MainWindow'
import CallWindow from './components/CallWindow'

import MaskModule from './components/MaskModule'

export default function App() {
 const [callFrom, setCallFrom] = useState('')
 const [calling, setCalling] = useState(false)

 const [showModal, setShowModal] = useState(false)

 const [localSrc, setLocalSrc] = useState(null)
 const [remoteSrc, setRemoteSrc] = useState(null)

 const [pc, setPc] = useState(null)
 const [config, setConfig] = useState(null)

 useEffect(() => {
   socket.on('request', ({ from }) => {
     setCallFrom(from)
     setShowModal(true)
   })
 }, [])

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
     .on('end', () => finishCall(false))
 }, [pc])

 const startCall = (isCaller, remoteId, config) => {
   setShowModal(false)
   setCalling(true)
   setConfig(config)

   const _pc = new PeerConnection(remoteId)
     .on('localStream', (stream) => {
       setLocalSrc(stream)
     })
     .on('remoteStream', (stream) => {
       setRemoteSrc(stream)
       setCalling(false)
     })
     .start(isCaller, config)

   setPc(_pc)
 }

 const rejectCall = () => {
   socket.emit('end', { to: callFrom })

   setShowModal(false)
 }

 const finishCall = (isCaller) => {
   pc.stop(isCaller)

   setPc(null)
   setConfig(null)

   setCalling(false)
   setShowModal(false)

   setLocalSrc(null)
   setRemoteSrc(null)
 }

 const CallPage = () => {
  return(
    <>
    <h1>Video-Chat</h1>
     <MainWindow startCall={startCall} />
     {calling && (
       <div className='calling'>
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
 }

 return (
  <div className='app'>
    
    <Routes>
      <Route path="/" element={<MaskModule />}/>
      <Route path="/call" element={<CallPage />}/>
      
      {/* <Route path="/*" element={<NotFound/>}/> */}
    </Routes>
     
  </div>
 )
}