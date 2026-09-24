import { useEffect, useRef } from 'react'

function PeerTile({ stream, name, muted = false, mirror = false, videoOff = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream || null
    return () => {
      el.srcObject = null
    }
  }, [stream])

  const letter = (name || '?').slice(0, 1).toUpperCase()

  return (
    <div className={`meet-tile ${videoOff || !stream ? 'is-off' : ''}`}>
      {stream && !videoOff ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} className={mirror ? 'mirror' : ''} />
      ) : (
        <div className="meet-tile-empty">{letter}</div>
      )}
      <span className="video-label">{name}</span>
    </div>
  )
}

export default PeerTile
