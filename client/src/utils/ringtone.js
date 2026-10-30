/** Dual-tone phone-style ringtone (pleasant chords, not a single beep). */
export function createRingtone() {
  let ctx = null
  let timer = null
  let stopped = true

  const tone = (freq, start, dur, type = 'sine', peak = 0.12) => {
    if (!ctx || stopped) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime + start)
    osc.stop(ctx.currentTime + start + dur + 0.02)
  }

  const ringBurst = () => {
    if (stopped || !ctx || document.visibilityState === 'hidden') return
    // Classic-ish pair + soft lower harmony
    tone(523.25, 0, 0.38, 'sine', 0.11) // C5
    tone(659.25, 0, 0.38, 'triangle', 0.07) // E5
    tone(523.25, 0.42, 0.38, 'sine', 0.11)
    tone(659.25, 0.42, 0.38, 'triangle', 0.07)
    tone(392.0, 0.05, 0.7, 'sine', 0.04) // G4 pad
  }

  return {
    async start() {
      stopped = false
      if (document.visibilityState === 'hidden') return
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      ringBurst()
      timer = setInterval(ringBurst, 1600)
    },
    async resumeIfVisible() {
      if (stopped || document.visibilityState === 'hidden') return
      if (!ctx) {
        await this.start()
        return
      }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      ringBurst()
    },
    stop() {
      stopped = true
      clearInterval(timer)
      timer = null
      if (ctx) {
        ctx.close().catch(() => {})
        ctx = null
      }
    }
  }
}

let vibrateTimer = null

export function startVibrate() {
  if (!navigator.vibrate || document.visibilityState === 'hidden') return
  stopVibrate()
  const pulse = () => {
    if (document.visibilityState === 'hidden') return
    navigator.vibrate([500, 180, 500, 180, 700])
  }
  pulse()
  vibrateTimer = setInterval(pulse, 1600)
}

export function stopVibrate() {
  if (vibrateTimer) clearInterval(vibrateTimer)
  vibrateTimer = null
  navigator.vibrate?.(0)
}
