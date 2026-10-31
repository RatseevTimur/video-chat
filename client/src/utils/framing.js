export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

let trackSeq = 0

/** Keypoints (normalized) smoothed per track — positions fast, so masks don't lag; sizes slower. */
function blendPoints(prev, pts, alpha) {
  if (!pts) return prev || null
  if (!prev) return { ...pts }
  const out = {}
  for (const key of Object.keys(pts)) {
    const p = pts[key]
    const q = prev[key]
    out[key] = p && q
      ? { x: q.x + (p.x - q.x) * alpha, y: q.y + (p.y - q.y) * alpha }
      : (p || q || null)
  }
  return out
}

export function updateTracks(tracks, faces) {
  const next = tracks.map((track) => ({ ...track }))
  const used = new Set()

  for (const track of next) {
    let best = -1
    let bestDistance = 0.15
    faces.forEach((face, index) => {
      if (used.has(index)) return
      const distance = Math.hypot(face.cx - track.cx, face.cy - track.cy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })

    if (best >= 0) {
      used.add(best)
      const face = faces[best]
      track.cx = track.cx * 0.5 + face.cx * 0.5
      track.cy = track.cy * 0.5 + face.cy * 0.5
      track.w = track.w * 0.7 + face.w * 0.3
      track.h = track.h * 0.7 + face.h * 0.3
      track.seen += 1
      track.missed = 0
      track.score = face.score
      track.eyes = face.eyes || null
      track.pts = blendPoints(track.pts, face.pts, 0.55)
    } else {
      track.missed += 1
    }
  }

  faces.forEach((face, index) => {
    if (used.has(index)) return
    trackSeq += 1
    next.push({
      id: trackSeq,
      cx: face.cx,
      cy: face.cy,
      w: face.w,
      h: face.h,
      seen: 1,
      missed: 0,
      score: face.score,
      eyes: face.eyes || null,
      pts: face.pts ? { ...face.pts } : null
    })
  })

  return next.filter((track) => track.missed <= 8).slice(0, 6)
}

/** A face joins the frame only after it stays put. One-frame ghosts in the dark are ignored. */
export function acceptedTracks(tracks) {
  return tracks.filter((track) => track.missed === 0 && (
    (track.score >= 0.7 && track.seen >= 2)
    || (track.score >= 0.5 && track.seen >= 3)
    || (track.score >= 0.35 && track.seen >= 5)
  ))
}

export function groupBox(tracks) {
  if (!tracks.length) return null
  let x0 = 1
  let y0 = 1
  let x1 = 0
  let y1 = 0
  for (const track of tracks) {
    x0 = Math.min(x0, track.cx - track.w / 2)
    y0 = Math.min(y0, track.cy - track.h / 2)
    x1 = Math.max(x1, track.cx + track.w / 2)
    y1 = Math.max(y1, track.cy + track.h / 2)
  }
  const boxW = Math.max(0.04, x1 - x0)
  const boxH = Math.max(0.04, y1 - y0)
  const padX = boxW * 0.4 + 0.05
  const padY = boxH * 0.5 + 0.07
  const x = clamp(x0 - padX, 0, 0.98)
  const y = clamp(y0 - padY, 0, 0.98)
  return {
    x,
    y,
    w: clamp(boxW + padX * 2, 0.08, 1 - x),
    h: clamp(boxH + padY * 2, 0.08, 1 - y)
  }
}

export function aimCrop(box, srcW, srcH) {
  if (!box || !srcW || !srcH) return { x: 0, y: 0, w: srcW || 0, h: srcH || 0 }
  const aspect = srcW / srcH
  let cropW = box.w * srcW
  let cropH = box.h * srcH
  if (cropW / Math.max(cropH, 1) > aspect) cropH = cropW / aspect
  else cropW = cropH * aspect

  const minW = srcW * 0.7
  if (cropW < minW) {
    cropW = minW
    cropH = cropW / aspect
  }
  if (cropW > srcW) {
    cropW = srcW
    cropH = cropW / aspect
  }
  if (cropH > srcH) {
    cropH = srcH
    cropW = cropH * aspect
  }

  const centerX = (box.x + box.w / 2) * srcW
  const centerY = (box.y + box.h / 2) * srcH
  return {
    x: clamp(centerX - cropW / 2, 0, Math.max(0, srcW - cropW)),
    y: clamp(centerY - cropH / 2, 0, Math.max(0, srcH - cropH)),
    w: cropW,
    h: cropH
  }
}

export function approach(current, next, alpha, dead) {
  const delta = next - current
  if (Math.abs(delta) <= dead) return current
  return current + delta * alpha
}

export function smoothCrop(current, next, alpha = 0.065) {
  if (!current) return { ...next }
  const deadPos = Math.max(4, next.w * 0.014)
  const deadSize = Math.max(6, next.w * 0.025)
  return {
    x: approach(current.x, next.x, alpha, deadPos),
    y: approach(current.y, next.y, alpha, deadPos),
    w: approach(current.w, next.w, alpha * 0.7, deadSize),
    h: approach(current.h, next.h, alpha * 0.7, deadSize)
  }
}
