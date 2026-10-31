/**
 * Tiny voice-activity meter. One shared AudioContext; one analyser per stream.
 * onChange(speaking: boolean) fires with hysteresis so borders don't flicker.
 */

let audioCtx = null

export function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

// Autoplay policy: resume on the first gesture after load.
if (typeof document !== 'undefined') {
  const kick = () => { getAudioContext() }
  document.addEventListener('pointerdown', kick, { passive: true })
  document.addEventListener('keydown', kick)
}

/**
 * Watch a stream. Remote streams get their tracks one at a time (video first, audio later),
 * so re-bind whenever an audio track is added.
 */
export function watchSpeaking(stream, onChange, opts = {}) {
  if (!stream?.getAudioTracks) return () => {}
  let stopTrack = watchTrack(stream.getAudioTracks()[0], onChange, opts)
  const onAddTrack = (event) => {
    if (event.track?.kind !== 'audio') return
    stopTrack()
    stopTrack = watchTrack(event.track, onChange, opts)
  }
  stream.addEventListener?.('addtrack', onAddTrack)
  return () => {
    stream.removeEventListener?.('addtrack', onAddTrack)
    stopTrack()
    onChange(false)
  }
}

function watchTrack(track, onChange, { on = 0.035, off = 0.018, hold = 450 } = {}) {
  const ctx = getAudioContext()
  if (!track || !ctx) return () => {}

  let source
  let analyser
  try {
    source = ctx.createMediaStreamSource(new MediaStream([track]))
    analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
  } catch {
    return () => {}
  }

  const buf = new Float32Array(analyser.fftSize)
  let speaking = false
  let lastLoud = 0
  const timer = window.setInterval(() => {
    if (track.readyState === 'ended') return
    if (!track.enabled || track.muted) {
      if (speaking) { speaking = false; onChange(false) }
      return
    }
    analyser.getFloatTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
    const rms = Math.sqrt(sum / buf.length)
    const now = Date.now()
    if (rms > on) lastLoud = now
    const next = rms > on || (speaking && (rms > off || now - lastLoud < hold))
    if (next !== speaking) {
      speaking = next
      onChange(speaking)
    }
  }, 100)

  return () => {
    window.clearInterval(timer)
    try { source.disconnect() } catch { /* ignore */ }
  }
}
