export function createRingtone() {
  let ctx = null
  let timer = null
  let stopped = true

  const beep = () => {
    if (stopped || !ctx || document.visibilityState === 'hidden') return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.35)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.42)
  }

  return {
    async start() {
      stopped = false
      // Background tabs cannot play Web Audio — OS notification must ring instead.
      if (document.visibilityState === 'hidden') return
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {})
      }
      beep()
      timer = setInterval(beep, 1400)
    },
    async resumeIfVisible() {
      if (stopped || document.visibilityState === 'hidden') return
      if (!ctx) {
        await this.start()
        return
      }
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
      beep()
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
    navigator.vibrate([520, 160, 520, 160, 740])
  }
  pulse()
  vibrateTimer = setInterval(pulse, 1600)
}

export function stopVibrate() {
  if (vibrateTimer) clearInterval(vibrateTimer)
  vibrateTimer = null
  navigator.vibrate?.(0)
}

export function notifyIncoming(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, silent: false })
  } catch {
    // Safari can throw if the tab is not focused enough
  }
}

export function requestNotifyPermission() {
  if (!('Notification' in window) || Notification.permission !== 'default') return
  Notification.requestPermission().catch(() => {})
}
