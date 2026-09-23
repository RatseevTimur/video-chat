import { useEffect, useRef, useState } from 'react'
import { BsCameraVideo, BsPhone } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'

const CallWindow = ({
  remoteSrc,
  localSrc,
  config,
  mediaDevice,
  finishCall
}) => {
  const remoteVideo = useRef()
  const localVideo = useRef()
  const [video, setVideo] = useState(config?.video)
  const [audio, setAudio] = useState(config?.audio)

  useEffect(() => {
    if (remoteVideo.current && remoteSrc) remoteVideo.current.srcObject = remoteSrc
    if (localVideo.current && localSrc) localVideo.current.srcObject = localSrc
  }, [remoteSrc, localSrc])

  const toggleMediaDevice = (deviceType) => {
    if (deviceType === 'video') {
      setVideo(!video)
      mediaDevice.toggle('Video')
    }
    if (deviceType === 'audio') {
      setAudio(!audio)
      mediaDevice.toggle('Audio')
    }
  }

  return (
    <div className="call-window">
      <div className="inner">
        <div className="video">
          <video className="remote" ref={remoteVideo} autoPlay playsInline />
          <video className="local" ref={localVideo} autoPlay muted playsInline />
        </div>
        <div className="control">
          <button className={video ? '' : 'reject'} onClick={() => toggleMediaDevice('video')}>
            <BsCameraVideo />
          </button>
          <button className={audio ? '' : 'reject'} onClick={() => toggleMediaDevice('audio')}>
            <BsPhone />
          </button>
          <button className="reject" onClick={() => finishCall(true)}>
            <FiPhoneOff />
          </button>
        </div>
      </div>
    </div>
  )
}

export default CallWindow
