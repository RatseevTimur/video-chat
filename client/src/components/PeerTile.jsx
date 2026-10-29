import { useEffect, useRef } from 'react'

import { aspectOf } from '../utils/camera'
import { tileClass } from '../utils/gridLayout'

function PeerTile({
  stream,
  name,
  muted = false,
  mirror = false,
  videoOff = false,
  aspect = 'landscape',
  pinned = false,
  feature = false,
  rail = false,
  pressable = false,
  onClick,
  onAspect
}) {
  const videoRef = useRef(null)
  const aspectRef = useRef('')
  const onAspectRef = useRef(onAspect)
  onAspectRef.current = onAspect

  useEffect(() => {
    const el = videoRef.current
    if (!el) return undefined
    el.srcObject = stream || null

    const report = () => {
      if (!el.videoWidth || !el.videoHeight) return
      const next = aspectOf(el.videoWidth, el.videoHeight)
      if (aspectRef.current === next) return
      aspectRef.current = next
      onAspectRef.current?.(next)
    }

    el.addEventListener('loadedmetadata', report)
    el.addEventListener('resize', report)
    report()
    return () => {
      el.removeEventListener('loadedmetadata', report)
      el.removeEventListener('resize', report)
      el.srcObject = null
    }
  }, [stream])

  const letter = (name || '?').slice(0, 1).toUpperCase()
  const label = pinned ? 'Убрать увеличение / Unpin' : 'Увеличить / Pin'

  return (
    <div
      className={tileClass({ off: videoOff || !stream, aspect, pinned, feature, rail, pressable })}
      onClick={pressable ? onClick : undefined}
      onKeyDown={pressable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick?.()
        }
      } : undefined}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      aria-pressed={pressable ? pinned : undefined}
      title={pressable ? label : undefined}
    >
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
