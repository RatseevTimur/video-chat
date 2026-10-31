/**
 * Face overlays, drawn as layered vector parts.
 *
 * Each mask is a list of layers. A layer is a part image attached to a facial anchor:
 *   at     — anchor name (eyes | eyeL | eyeR | nose | mouth | lip | chin | headTop | earL | earR)
 *   dx/dy  — offset from the anchor in face widths (face-local frame, +y down)
 *   width  — ['face', k] → k·faceWidth, or ['eye', k] → k·eyeDistance
 *   pivot  — [px, py] point of the image (0..1) that sits on the anchor
 *   rot    — extra rotation (rad) on top of the head tilt
 * Parts are drawn once into canvases (cached), with soft shading so they don't look flat.
 */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  return { canvas, ctx, w, h }
}

function softShadow(ctx, blur = 10, alpha = 0.35, dy = 4) {
  ctx.shadowColor = `rgba(0,0,0,${alpha})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = dy
}

function noShadow(ctx) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function highlight(ctx, x, y, rx, ry, rot = -0.5, alpha = 0.35) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${alpha})`
  ctx.fill()
}

/* ------------------------------------------------------------------ glasses */

function glasses(style) {
  const { canvas, ctx, w, h } = makeCanvas(640, 280)
  const cy = h * 0.5
  const left = w * 0.28
  const right = w * 0.72
  const rx = w * 0.165
  const ry = h * 0.31
  const frame = style === 'heart' ? '#c4183a' : '#141414'

  const lensPath = (x) => {
    ctx.beginPath()
    if (style === 'heart') {
      const s = rx * 1.12
      ctx.moveTo(x, cy + s * 0.42)
      ctx.bezierCurveTo(x - s * 1.05, cy - s * 0.15, x - s * 0.58, cy - s * 1.02, x, cy - s * 0.42)
      ctx.bezierCurveTo(x + s * 0.58, cy - s * 1.02, x + s * 1.05, cy - s * 0.15, x, cy + s * 0.42)
      ctx.closePath()
    } else {
      ctx.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2)
    }
  }

  // temples (behind lenses)
  ctx.lineCap = 'round'
  ctx.lineWidth = 11
  ctx.strokeStyle = frame
  ctx.beginPath()
  ctx.moveTo(left - rx + 4, cy - 4)
  ctx.lineTo(w * 0.035, cy - h * 0.09)
  ctx.moveTo(right + rx - 4, cy - 4)
  ctx.lineTo(w * 0.965, cy - h * 0.09)
  ctx.stroke()

  // bridge
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.moveTo(left + rx * 0.9, cy - ry * 0.12)
  ctx.quadraticCurveTo(w * 0.5, cy - ry * 0.6, right - rx * 0.9, cy - ry * 0.12)
  ctx.stroke()

  for (const x of [left, right]) {
    // lens fill
    lensPath(x)
    let g
    if (style === 'sun') {
      g = ctx.createLinearGradient(x - rx, cy - ry, x + rx, cy + ry)
      g.addColorStop(0, 'rgba(70, 45, 25, 0.9)')
      g.addColorStop(0.5, 'rgba(120, 70, 35, 0.86)')
      g.addColorStop(1, 'rgba(30, 20, 12, 0.94)')
    } else if (style === 'heart') {
      g = ctx.createLinearGradient(x - rx, cy - ry, x + rx, cy + ry)
      g.addColorStop(0, 'rgba(255, 90, 130, 0.42)')
      g.addColorStop(1, 'rgba(230, 40, 90, 0.5)')
    } else {
      g = ctx.createLinearGradient(x - rx, cy - ry, x + rx, cy + ry)
      g.addColorStop(0, 'rgba(190, 225, 255, 0.26)')
      g.addColorStop(1, 'rgba(120, 170, 230, 0.14)')
    }
    ctx.fillStyle = g
    ctx.fill()
    // frame with a soft drop shadow
    softShadow(ctx, 8, 0.4, 3)
    ctx.lineWidth = 13
    ctx.strokeStyle = frame
    ctx.stroke()
    noShadow(ctx)
    // thin inner bevel
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.stroke()
    highlight(ctx, x - rx * 0.4, cy - ry * 0.42, rx * 0.26, ry * 0.13, -0.5, style === 'sun' ? 0.3 : 0.42)
  }
  return canvas
}

/* -------------------------------------------------------------------- animals */

function furFill(ctx, x0, y0, x1, y1, a, b) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  g.addColorStop(0, a)
  g.addColorStop(1, b)
  return g
}

function dogEar(side) {
  const { canvas, ctx, w, h } = makeCanvas(220, 300)
  // Draw the right ear; mirror the canvas for the left one.
  if (side === 'left') {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }
  const cx = w / 2
  softShadow(ctx, 14, 0.38, 6)
  ctx.beginPath()
  ctx.moveTo(cx - 44, 16)
  ctx.bezierCurveTo(cx - 120, 90, cx - 96, h * 0.8, cx - 10, h - 16)
  ctx.bezierCurveTo(cx + 78, h * 0.86, cx + 92, 110, cx + 44, 12)
  ctx.closePath()
  ctx.fillStyle = furFill(ctx, 0, 0, w, h, '#b9742f', '#8a4f1c')
  ctx.fill()
  noShadow(ctx)
  // inner ear
  ctx.beginPath()
  ctx.moveTo(cx - 20, 64)
  ctx.bezierCurveTo(cx - 74, 120, cx - 60, h * 0.74, cx - 6, h - 52)
  ctx.bezierCurveTo(cx + 42, h * 0.78, cx + 52, 120, cx + 22, 66)
  ctx.closePath()
  ctx.fillStyle = 'rgba(232, 170, 150, 0.72)'
  ctx.fill()
  // fur strokes
  ctx.strokeStyle = 'rgba(70, 35, 10, 0.3)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath()
    ctx.moveTo(cx - 26 + i * 9, 46 + i * 26)
    ctx.lineTo(cx - 34 + i * 9, 78 + i * 26)
    ctx.stroke()
  }
  highlight(ctx, cx - 10, 70, 22, 9, -0.5, 0.2)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  return canvas
}

function catEar(side) {
  const { canvas, ctx, w, h } = makeCanvas(220, 240)
  const dir = side === 'left' ? -1 : 1
  softShadow(ctx, 12, 0.35, 5)
  ctx.beginPath()
  ctx.moveTo(20, h - 20)
  ctx.quadraticCurveTo(w * 0.45 + 30 * dir, -10, w - 20, h - 24)
  ctx.quadraticCurveTo(w / 2, h - 60, 20, h - 20)
  ctx.closePath()
  ctx.fillStyle = furFill(ctx, 0, 0, 0, h, '#f6c046', '#d4891c')
  ctx.fill()
  noShadow(ctx)
  ctx.beginPath()
  ctx.moveTo(60, h - 48)
  ctx.quadraticCurveTo(w * 0.47 + 24 * dir, 46, w - 60, h - 50)
  ctx.quadraticCurveTo(w / 2, h - 76, 60, h - 48)
  ctx.closePath()
  ctx.fillStyle = furFill(ctx, 0, 40, 0, h, '#ffd1dc', '#f08aa5')
  ctx.fill()
  // fur edge strokes along the outer rim
  ctx.strokeStyle = 'rgba(120, 70, 10, 0.35)'
  ctx.lineCap = 'round'
  ctx.lineWidth = 4
  for (let i = 0; i < 4; i += 1) {
    const t = 0.25 + i * 0.16
    const x = 20 + (w * 0.45 + 30 * dir - 20) * t
    const y = (h - 20) - (h - 30) * t
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 10 * dir, y - 14)
    ctx.stroke()
  }
  return canvas
}

function bunnyEar(side) {
  const { canvas, ctx, w, h } = makeCanvas(170, 440)
  const dir = side === 'left' ? -1 : 1
  const cx = w / 2
  softShadow(ctx, 14, 0.35, 6)
  ctx.beginPath()
  ctx.moveTo(cx - 48, h - 16)
  ctx.bezierCurveTo(cx - 70, h * 0.55, cx - 60 + 10 * dir, 20, cx + 6 * dir, 16)
  ctx.bezierCurveTo(cx + 66 + 10 * dir, 20, cx + 72, h * 0.55, cx + 48, h - 16)
  ctx.closePath()
  ctx.fillStyle = furFill(ctx, 0, 0, w, 0, '#fbf5ef', '#e7d7cc')
  ctx.fill()
  noShadow(ctx)
  ctx.beginPath()
  ctx.moveTo(cx - 22, h - 50)
  ctx.bezierCurveTo(cx - 40, h * 0.55, cx - 30 + 8 * dir, 70, cx + 4 * dir, 62)
  ctx.bezierCurveTo(cx + 38 + 8 * dir, 70, cx + 44, h * 0.55, cx + 22, h - 50)
  ctx.closePath()
  ctx.fillStyle = furFill(ctx, 0, 60, 0, h, '#ffc3d4', '#f19ab5')
  ctx.fill()
  highlight(ctx, cx - 26, h * 0.3, 10, 50, 0.08, 0.35)
  return canvas
}

function dogNose() {
  const { canvas, ctx, w } = makeCanvas(320, 260)
  const cx = w / 2
  // muzzle
  softShadow(ctx, 12, 0.3, 5)
  ctx.beginPath()
  ctx.ellipse(cx, 120, 118, 86, 0, 0, Math.PI * 2)
  const muzzle = ctx.createRadialGradient(cx - 30, 80, 10, cx, 120, 130)
  muzzle.addColorStop(0, '#f3dcc2')
  muzzle.addColorStop(1, '#d9b087')
  ctx.fillStyle = muzzle
  ctx.fill()
  noShadow(ctx)
  // mouth line
  ctx.strokeStyle = 'rgba(80, 40, 20, 0.55)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, 116)
  ctx.lineTo(cx, 150)
  ctx.quadraticCurveTo(cx - 30, 180, cx - 58, 158)
  ctx.moveTo(cx, 150)
  ctx.quadraticCurveTo(cx + 30, 180, cx + 58, 158)
  ctx.stroke()
  // tongue
  softShadow(ctx, 6, 0.3, 3)
  ctx.beginPath()
  ctx.ellipse(cx, 198, 34, 48, 0, 0, Math.PI * 2)
  const tongue = ctx.createLinearGradient(0, 150, 0, 250)
  tongue.addColorStop(0, '#f27d93')
  tongue.addColorStop(1, '#d4445f')
  ctx.fillStyle = tongue
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(160, 30, 60, 0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, 170)
  ctx.lineTo(cx, 236)
  ctx.stroke()
  // nose
  softShadow(ctx, 8, 0.45, 3)
  ctx.beginPath()
  ctx.ellipse(cx, 80, 50, 36, 0, 0, Math.PI * 2)
  const nose = ctx.createRadialGradient(cx - 14, 64, 6, cx, 82, 52)
  nose.addColorStop(0, '#4a4a52')
  nose.addColorStop(1, '#101014')
  ctx.fillStyle = nose
  ctx.fill()
  noShadow(ctx)
  highlight(ctx, cx - 20, 64, 14, 8, -0.4, 0.5)
  return canvas
}

function catNose() {
  const { canvas, ctx, w } = makeCanvas(460, 220)
  const cx = w / 2
  // whiskers
  ctx.strokeStyle = 'rgba(20,20,20,0.85)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ;[-1, 1].forEach((dir) => {
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath()
      ctx.moveTo(cx + dir * 34, 86 + i * 16)
      ctx.quadraticCurveTo(cx + dir * 120, 70 + i * 22, cx + dir * 220, 56 + i * 32)
      ctx.stroke()
    }
  })
  // nose
  softShadow(ctx, 8, 0.4, 3)
  ctx.beginPath()
  ctx.moveTo(cx - 34, 62)
  ctx.quadraticCurveTo(cx, 50, cx + 34, 62)
  ctx.quadraticCurveTo(cx + 30, 100, cx, 112)
  ctx.quadraticCurveTo(cx - 30, 100, cx - 34, 62)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 50, 0, 112)
  g.addColorStop(0, '#ffb1c6')
  g.addColorStop(1, '#e8718f')
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(120, 30, 60, 0.6)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, 112)
  ctx.lineTo(cx, 134)
  ctx.moveTo(cx - 26, 150)
  ctx.quadraticCurveTo(cx, 128, cx + 26, 150)
  ctx.stroke()
  highlight(ctx, cx - 12, 66, 9, 5, -0.4, 0.5)
  return canvas
}

function bunnyNose() {
  const { canvas, ctx, w } = makeCanvas(220, 170)
  const cx = w / 2
  softShadow(ctx, 6, 0.3, 3)
  ctx.beginPath()
  ctx.ellipse(cx - 14, 48, 20, 15, -0.25, 0, Math.PI * 2)
  ctx.ellipse(cx + 14, 48, 20, 15, 0.25, 0, Math.PI * 2)
  ctx.fillStyle = '#f6a5bd'
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(120, 40, 60, 0.6)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx, 60)
  ctx.lineTo(cx, 84)
  ctx.moveTo(cx - 30, 98)
  ctx.quadraticCurveTo(cx, 78, cx + 30, 98)
  ctx.stroke()
  // teeth
  softShadow(ctx, 4, 0.3, 2)
  ctx.fillStyle = '#fffdf5'
  ctx.fillRect(cx - 22, 92, 20, 40)
  ctx.fillRect(cx + 2, 92, 20, 40)
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(cx - 22, 92, 20, 40)
  ctx.strokeRect(cx + 2, 92, 20, 40)
  return canvas
}

/* ---------------------------------------------------------------------- misc */

function mustache() {
  const { canvas, ctx, w, h } = makeCanvas(640, 240)
  const cx = w * 0.5
  const cy = h * 0.5
  softShadow(ctx, 10, 0.4, 4)
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.bezierCurveTo(cx - 40, cy - 55, cx - 150, cy - 40, cx - 215, cy + 6)
  ctx.bezierCurveTo(cx - 160, cy + 58, cx - 50, cy + 36, cx, cy + 10)
  ctx.bezierCurveTo(cx + 50, cy + 36, cx + 160, cy + 58, cx + 215, cy + 6)
  ctx.bezierCurveTo(cx + 150, cy - 40, cx + 40, cy - 55, cx, cy)
  const g = ctx.createLinearGradient(0, cy - 60, 0, cy + 60)
  g.addColorStop(0, '#3a2a1e')
  g.addColorStop(1, '#120c08')
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 3
  for (let i = -3; i <= 3; i += 1) {
    ctx.beginPath()
    ctx.moveTo(cx + i * 40, cy - 20)
    ctx.quadraticCurveTo(cx + i * 56, cy + 6, cx + i * 64, cy + 26)
    ctx.stroke()
  }
  return canvas
}

function crown() {
  const { canvas, ctx, w, h } = makeCanvas(640, 320)
  const baseY = h * 0.78
  softShadow(ctx, 12, 0.4, 5)
  ctx.beginPath()
  ctx.moveTo(w * 0.1, baseY)
  ctx.lineTo(w * 0.16, h * 0.26)
  ctx.lineTo(w * 0.32, baseY * 0.74)
  ctx.lineTo(w * 0.5, h * 0.1)
  ctx.lineTo(w * 0.68, baseY * 0.74)
  ctx.lineTo(w * 0.84, h * 0.26)
  ctx.lineTo(w * 0.9, baseY)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#fff0a0')
  g.addColorStop(0.45, '#f6c93a')
  g.addColorStop(1, '#c98d12')
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = '#8a6210'
  ctx.lineWidth = 5
  ctx.stroke()
  // band
  ctx.fillStyle = 'rgba(140, 95, 15, 0.35)'
  ctx.fillRect(w * 0.1, baseY - 26, w * 0.8, 26)
  ;[0.16, 0.5, 0.84].forEach((px, i) => {
    softShadow(ctx, 6, 0.4, 2)
    ctx.beginPath()
    ctx.arc(w * px, i === 1 ? h * 0.14 : h * 0.29, 15, 0, Math.PI * 2)
    const jewel = ctx.createRadialGradient(w * px - 5, (i === 1 ? h * 0.14 : h * 0.29) - 5, 2, w * px, i === 1 ? h * 0.14 : h * 0.29, 16)
    jewel.addColorStop(0, i === 1 ? '#bfe9ff' : '#ffb3c2')
    jewel.addColorStop(1, i === 1 ? '#1e8fd6' : '#d8174a')
    ctx.fillStyle = jewel
    ctx.fill()
    noShadow(ctx)
  })
  ;[0.25, 0.41, 0.59, 0.75].forEach((px) => {
    ctx.beginPath()
    ctx.arc(w * px, baseY - 13, 7, 0, Math.PI * 2)
    ctx.fillStyle = '#5fd3c7'
    ctx.fill()
  })
  return canvas
}

function clownNose() {
  const { canvas, ctx, w, h } = makeCanvas(280, 280)
  softShadow(ctx, 14, 0.45, 6)
  const g = ctx.createRadialGradient(w * 0.36, h * 0.34, 8, w * 0.5, h * 0.5, w * 0.42)
  g.addColorStop(0, '#ff8f8f')
  g.addColorStop(0.6, '#e7212f')
  g.addColorStop(1, '#9d0f1c')
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.5, w * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  highlight(ctx, w * 0.37, h * 0.35, 26, 15, -0.6, 0.55)
  return canvas
}

function partyHat() {
  const { canvas, ctx, w, h } = makeCanvas(420, 520)
  softShadow(ctx, 14, 0.4, 6)
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.07)
  ctx.lineTo(w * 0.1, h * 0.93)
  ctx.quadraticCurveTo(w * 0.5, h * 1.02, w * 0.9, h * 0.93)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#ff5ea8')
  g.addColorStop(0.5, '#7a5cff')
  g.addColorStop(1, '#44d7c0')
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  // stripes
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 16
  for (let i = -2; i < 8; i += 1) {
    ctx.beginPath()
    ctx.moveTo(-40 + i * 90, h)
    ctx.lineTo(160 + i * 90, 0)
    ctx.stroke()
  }
  ctx.restore()
  // pompom
  softShadow(ctx, 8, 0.4, 3)
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.08, 26, 0, Math.PI * 2)
  const pom = ctx.createRadialGradient(w * 0.46, h * 0.06, 4, w * 0.5, h * 0.08, 26)
  pom.addColorStop(0, '#fff2b0')
  pom.addColorStop(1, '#f2b705')
  ctx.fillStyle = pom
  ctx.fill()
  noShadow(ctx)
  return canvas
}

function faceMask() {
  const { canvas, ctx, w, h } = makeCanvas(560, 680)
  softShadow(ctx, 16, 0.45, 8)
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.06)
  ctx.bezierCurveTo(w * 0.94, h * 0.1, w * 0.97, h * 0.56, w * 0.72, h * 0.9)
  ctx.quadraticCurveTo(w * 0.5, h * 0.99, w * 0.28, h * 0.9)
  ctx.bezierCurveTo(w * 0.03, h * 0.56, w * 0.06, h * 0.1, w * 0.5, h * 0.06)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#fbf8f1')
  g.addColorStop(1, '#d9d2c4')
  ctx.fillStyle = g
  ctx.fill()
  noShadow(ctx)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 4
  ctx.stroke()
  // cheeks shading
  ctx.fillStyle = 'rgba(0,0,0,0.06)'
  ctx.beginPath()
  ctx.ellipse(w * 0.3, h * 0.6, 60, 90, 0.3, 0, Math.PI * 2)
  ctx.ellipse(w * 0.7, h * 0.6, 60, 90, -0.3, 0, Math.PI * 2)
  ctx.fill()
  // eye holes (centres at 0.35/0.65 × 0.42 — the engine pins these on the eyes)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.ellipse(w * 0.35, h * 0.42, 46, 30, 0, 0, Math.PI * 2)
  ctx.ellipse(w * 0.65, h * 0.42, 46, 30, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.ellipse(w * 0.35, h * 0.42, 46, 30, 0, 0, Math.PI * 2)
  ctx.ellipse(w * 0.65, h * 0.42, 46, 30, 0, 0, Math.PI * 2)
  ctx.stroke()
  // nose + mouth hints
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.5)
  ctx.lineTo(w * 0.45, h * 0.62)
  ctx.lineTo(w * 0.55, h * 0.62)
  ctx.moveTo(w * 0.4, h * 0.76)
  ctx.quadraticCurveTo(w * 0.5, h * 0.82, w * 0.6, h * 0.76)
  ctx.stroke()
  return canvas
}

const PARTS = {
  glassesClear: () => glasses('clear'),
  glassesSun: () => glasses('sun'),
  glassesHeart: () => glasses('heart'),
  dogEarL: () => dogEar('left'),
  dogEarR: () => dogEar('right'),
  catEarL: () => catEar('left'),
  catEarR: () => catEar('right'),
  bunnyEarL: () => bunnyEar('left'),
  bunnyEarR: () => bunnyEar('right'),
  dogNose,
  catNose,
  bunnyNose,
  mustache,
  crown,
  clownNose,
  partyHat,
  faceMask
}

// Glasses lens centres are 0.44·w apart → width = eyeDistance · (1 / 0.44)
const GLASSES_W = ['eye', 2.3]

export const MASKS = [
  { id: 'none', name: 'Без маски', emoji: '🚫', layers: [] },
  { id: 'glasses', name: 'Очки', emoji: '👓', layers: [
    { part: 'glassesClear', at: 'eyes', width: GLASSES_W, pivot: [0.5, 0.5] }
  ] },
  { id: 'sunglasses', name: 'Тёмные', emoji: '🕶️', layers: [
    { part: 'glassesSun', at: 'eyes', width: GLASSES_W, pivot: [0.5, 0.5] }
  ] },
  { id: 'hearts', name: 'Сердечки', emoji: '😍', layers: [
    { part: 'glassesHeart', at: 'eyes', width: GLASSES_W, pivot: [0.5, 0.5] }
  ] },
  { id: 'dog', name: 'Собака', emoji: '🐶', layers: [
    { part: 'dogEarL', at: 'headTop', dx: -0.4, dy: 0.1, width: ['face', 0.3], pivot: [0.5, 0.06], rot: -0.12 },
    { part: 'dogEarR', at: 'headTop', dx: 0.4, dy: 0.1, width: ['face', 0.3], pivot: [0.5, 0.06], rot: 0.12 },
    { part: 'dogNose', at: 'nose', dy: 0.02, width: ['face', 0.56], pivot: [0.5, 0.3] }
  ] },
  { id: 'cat', name: 'Кот', emoji: '🐱', layers: [
    { part: 'catEarL', at: 'headTop', dx: -0.3, dy: 0.06, width: ['face', 0.36], pivot: [0.5, 0.92], rot: -0.18 },
    { part: 'catEarR', at: 'headTop', dx: 0.3, dy: 0.06, width: ['face', 0.36], pivot: [0.5, 0.92], rot: 0.18 },
    { part: 'catNose', at: 'nose', dy: 0.0, width: ['face', 0.98], pivot: [0.5, 0.34] }
  ] },
  { id: 'bunny', name: 'Заяц', emoji: '🐰', layers: [
    { part: 'bunnyEarL', at: 'headTop', dx: -0.18, dy: 0.04, width: ['face', 0.26], pivot: [0.5, 0.97], rot: -0.14 },
    { part: 'bunnyEarR', at: 'headTop', dx: 0.18, dy: 0.04, width: ['face', 0.26], pivot: [0.5, 0.97], rot: 0.14 },
    { part: 'bunnyNose', at: 'nose', dy: 0.01, width: ['face', 0.42], pivot: [0.5, 0.3] }
  ] },
  { id: 'mustache', name: 'Усы', emoji: '🥸', layers: [
    { part: 'mustache', at: 'lip', width: ['face', 0.74], pivot: [0.5, 0.5] }
  ] },
  { id: 'clown', name: 'Нос', emoji: '🤡', layers: [
    { part: 'clownNose', at: 'nose', width: ['face', 0.3], pivot: [0.5, 0.5] }
  ] },
  { id: 'crown', name: 'Корона', emoji: '👑', layers: [
    { part: 'crown', at: 'headTop', dy: 0.06, width: ['face', 0.92], pivot: [0.5, 0.86] }
  ] },
  { id: 'party', name: 'Колпак', emoji: '🎉', layers: [
    { part: 'partyHat', at: 'headTop', dy: 0.05, width: ['face', 0.58], pivot: [0.5, 0.95], rot: 0.1 }
  ] },
  { id: 'mask', name: 'Маска', emoji: '🎭', layers: [
    // eye holes at 0.35/0.65 of 560 → 168px apart → width = eyeDistance · 3.33
    { part: 'faceMask', at: 'eyes', width: ['eye', 3.33], pivot: [0.5, 0.42] }
  ] }
]

const partCache = new Map()

export function getPart(name) {
  if (partCache.has(name)) return partCache.get(name)
  const build = PARTS[name]
  if (!build) return null
  const canvas = build()
  partCache.set(name, canvas)
  return canvas
}

/** Build all part images for a mask (cached). Resolves to the layer list with `img` attached. */
export function loadMaskLayers(mask) {
  if (!mask || !mask.layers?.length) return Promise.resolve([])
  return Promise.resolve(mask.layers.map((layer) => ({ ...layer, img: getPart(layer.part) })).filter((l) => l.img))
}

/** Back-compat for places that only need "some image" (e.g. previews): first part. */
export function loadMaskImage(mask) {
  if (!mask || !mask.layers?.length) return Promise.resolve(null)
  return Promise.resolve(getPart(mask.layers[0].part))
}

export function getMaskById(id) {
  return MASKS.find((item) => item.id === id) || MASKS[0]
}
