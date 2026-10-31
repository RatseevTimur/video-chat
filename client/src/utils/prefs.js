/** Shared UI prefs outside the call effects sheet (lobby settings). */

const TRACKING_KEY = 'vc-tracking'

/** Auto face-follow crop. Default on. */
export function trackingEnabled() {
  try {
    const v = localStorage.getItem(TRACKING_KEY)
    if (v == null) return true
    return v !== '0' && v !== 'false'
  } catch {
    return true
  }
}

export function setTrackingEnabled(on) {
  try {
    localStorage.setItem(TRACKING_KEY, on ? '1' : '0')
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('vc-tracking', { detail: { on: Boolean(on) } }))
  } catch { /* ignore */ }
  return Boolean(on)
}
