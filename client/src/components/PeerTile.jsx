import { useEffect, useRef, useState } from 'react'
import { BsCameraVideoOff, BsMicMuteFill } from 'react-icons/bs'

import { aspectOf } from '../utils/camera'
import { tileClass } from '../utils/gridLayout'
import { watchSpeaking } from '../utils/voice'
import ReactionBurst from './ReactionBurst'

function PeerTile({
  stream,
  name,
  muted = false,
  mirror = false,
  videoOff = false,
  micOff = false,
  aspect = 'landscape',
  pinned = false,
  feature = false,
  rail = false,
  pressable = false,
  reaction = null,
  onClick,
  onAspect
}) {
  const videoRef = useRef(null)
  const aspectRef = useRef('')
  const onAspectRef = useRef(onAspect)
  onAspectRef.current = onAspect
  const [speaking, setSpeaking] = useState(false)

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
  }, [stream, videoOff])

  // Remote audio keeps flowing even when the <video> is hidden → meter on the stream itself.
  useEffect(() => {
    if (!stream) {
      setSpeaking(false)
      return undefined
    }
    return watchSpeaking(stream, setSpeaking)
  }, [stream])

  const letter = (name || '?').slice(0, 1).toUpperCase()
  const label = pinned ? 'Убрать увеличение / Unpin' : 'Увеличить / Pin'
  const showVideo = Boolean(stream) && !videoOff

  return (
    <div
      className={`${tileClass({ off: !showVideo, aspect, pinned, feature, rail, pressable })} ${speaking && !micOff ? 'is-speaking' : ''}`}
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
      {/* Keep the element mounted while video is off so audio keeps playing. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`${mirror ? 'mirror' : ''} ${showVideo ? '' : 'is-hidden'}`}
      />
      {!showVideo && <div className="meet-tile-empty">{letter}</div>}
      {reaction && <ReactionBurst kind={reaction.kind} nonce={reaction.nonce} />}
      <div className="tile-badges">
        {micOff && <span className="tile-badge" title="Микрофон выключен"><BsMicMuteFill /></span>}
        {videoOff && <span className="tile-badge" title="Камера выключена"><BsCameraVideoOff /></span>}
      </div>
      <span className="video-label">{name}</span>
    </div>
  )
}

export default PeerTile
