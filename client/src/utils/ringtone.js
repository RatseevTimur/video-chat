export function createRingtone() {
  let ctx = null
  let timer = null
  let stopped = true

  const beep = () => {
    if (stopped || !ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.35)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.42)
  }

  return {
    async start() {
      stopped = false
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {})
      }
      beep()
      timer = setInterval(beep, 1400)
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
