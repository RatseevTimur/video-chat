import { useEffect, useRef, useState } from 'react'

/** One remote participant tile — object-fit:cover like Google Meet */
function PeerTile({ stream, name, muted = false }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream || null
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div className="meet-tile">
      {stream ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} />
      ) : (
        <div className="meet-tile-empty">{(name || '?').slice(0, 1).toUpperCase()}</div>
      )}
      <span className="video-label">{name}</span>
    </div>
  )
}

export default PeerTile
