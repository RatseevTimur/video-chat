/** Prefer the phone's real orientation instead of a forced 16:9 frame. */
export function videoConstraints(facing = 'user') {
  const portrait = window.innerHeight > window.innerWidth
  return {
    facingMode: { ideal: facing },
    width: portrait ? { ideal: 720, max: 1280 } : { ideal: 1280, max: 1920 },
    height: portrait ? { ideal: 1280, max: 1920 } : { ideal: 720, max: 1080 },
    aspectRatio: { ideal: portrait ? 9 / 16 : 16 / 9 },
    frameRate: { ideal: 24, max: 30 }
  }
}

export async function openCamera(facing = 'user') {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio,
      video: videoConstraints(facing)
    })
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio,
      video: { facingMode: { ideal: facing } }
    })
  }
}

export function aspectOf(width, height) {
  if (!width || !height) return 'landscape'
  return height > width * 1.05 ? 'portrait' : 'landscape'
}
