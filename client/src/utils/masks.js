/**
 * Face overlays — crisp procedurally drawn canvases (WhatsApp-style),
 * not the broken black-on-black PNGs that knocked out frames.
 */

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  return { canvas, ctx, w, h }
}

function drawGlasses(style = 'clear') {
  const { canvas, ctx, w, h } = makeCanvas(640, 280)
  const cy = h * 0.5
  const left = { x: w * 0.28, y: cy }
  const right = { x: w * 0.72, y: cy }
  const rx = w * 0.17
  const ry = h * 0.32

  const fillLens = (x, y) => {
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    if (style === 'sun') {
      const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry)
      g.addColorStop(0, 'rgba(40, 28, 18, 0.82)')
      g.addColorStop(0.55, 'rgba(90, 55, 30, 0.78)')
      g.addColorStop(1, 'rgba(25, 18, 12, 0.88)')
      ctx.fillStyle = g
    } else if (style === 'heart') {
      ctx.fillStyle = 'rgba(220, 40, 70, 0.35)'
    } else {
      const g = ctx.createLinearGradient(x - rx, y - ry, x + rx, y + ry)
      g.addColorStop(0, 'rgba(180, 220, 255, 0.28)')
      g.addColorStop(1, 'rgba(120, 170, 230, 0.18)')
      ctx.fillStyle = g
    }
    ctx.fill()
    ctx.lineWidth = 14
    ctx.strokeStyle = style === 'heart' ? '#c4183a' : '#111'
    ctx.stroke()
    // highlight
    ctx.beginPath()
    ctx.ellipse(x - rx * 0.35, y - ry * 0.35, rx * 0.22, ry * 0.14, -0.4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fill()
  }

  if (style === 'heart') {
    const heart = (cx, cy, s) => {
      ctx.beginPath()
      ctx.moveTo(cx, cy + s * 0.35)
      ctx.bezierCurveTo(cx - s, cy - s * 0.2, cx - s * 0.55, cy - s, cx, cy - s * 0.45)
      ctx.bezierCurveTo(cx + s * 0.55, cy - s, cx + s, cy - s * 0.2, cx, cy + s * 0.35)
      ctx.closePath()
      ctx.fillStyle = 'rgba(230, 50, 80, 0.45)'
      ctx.fill()
      ctx.lineWidth = 10
      ctx.strokeStyle = '#b01030'
      ctx.stroke()
    }
    heart(left.x, left.y, rx * 1.15)
    heart(right.x, right.y, rx * 1.15)
  } else {
    drawLensPair()
  }

  function drawLensPair() {
    drawGlassesBridge()
    fillLens(left.x, left.y)
    fillLens(right.x, right.y)
    // temples
    ctx.lineWidth = 12
    ctx.strokeStyle = '#111'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(left.x - rx, left.y)
    ctx.lineTo(w * 0.04, left.y - h * 0.05)
    ctx.moveTo(right.x + rx, right.y)
    ctx.lineTo(w * 0.96, right.y - h * 0.05)
    ctx.stroke()
  }

  function drawGlassesBridge() {
    ctx.lineWidth = 12
    ctx.strokeStyle = '#111'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(left.x + rx * 0.92, left.y - ry * 0.1)
    ctx.quadraticCurveTo(w * 0.5, cy - ry * 0.55, right.x - rx * 0.92, right.y - ry * 0.1)
    ctx.stroke()
  }

  if (style === 'heart') {
    ctx.lineWidth = 10
    ctx.strokeStyle = '#b01030'
    ctx.beginPath()
    ctx.moveTo(left.x + rx * 0.7, left.y)
    ctx.quadraticCurveTo(w * 0.5, cy - 20, right.x - rx * 0.7, right.y)
    ctx.stroke()
  }

  return canvas
}

function drawAnimal(kind) {
  const { canvas, ctx, w, h } = makeCanvas(720, 720)
  const cx = w * 0.5
  // Eye line sits at canvas center so MaskEngine centering on eyes looks natural.
  const eyesY = h * 0.5
  const faceY = eyesY + h * 0.12

  const ear = (side, tall = false) => {
    const dir = side === 'left' ? -1 : 1
    const baseX = cx + dir * w * 0.28
    const baseY = eyesY - h * 0.06
    const tipY = tall ? h * 0.02 : h * 0.1
    const tipX = cx + dir * w * (tall ? 0.22 : 0.38)
    ctx.beginPath()
    ctx.moveTo(baseX - dir * 28, baseY)
    ctx.quadraticCurveTo(tipX, tipY, baseX + dir * 36, baseY + 10)
    ctx.closePath()
    if (kind === 'dog') ctx.fillStyle = '#c47a3a'
    else if (kind === 'cat') ctx.fillStyle = '#f0b429'
    else ctx.fillStyle = '#f2e6de'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 4
    ctx.stroke()
    // inner ear
    ctx.beginPath()
    ctx.moveTo(baseX - dir * 10, baseY - 8)
    ctx.quadraticCurveTo(tipX - dir * 8, tipY + (tall ? 70 : 50), baseX + dir * 14, baseY)
    ctx.closePath()
    ctx.fillStyle = kind === 'bunny' ? '#f7b0c4' : '#e89aa0'
    ctx.fill()
  }

  ear('left', kind === 'bunny')
  ear('right', kind === 'bunny')

  // snout / nose
  if (kind === 'dog') {
    ctx.beginPath()
    ctx.ellipse(cx, faceY + 40, 90, 70, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#e8c9a8'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx, faceY + 20, 38, 28, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    // tongue
    ctx.beginPath()
    ctx.ellipse(cx, faceY + 95, 28, 42, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#e3566d'
    ctx.fill()
  } else if (kind === 'cat') {
    ctx.beginPath()
    ctx.moveTo(cx, faceY + 10)
    ctx.lineTo(cx - 28, faceY + 42)
    ctx.lineTo(cx + 28, faceY + 42)
    ctx.closePath()
    ctx.fillStyle = '#f2a0b4'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, faceY + 8, 14, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    // whiskers
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ;[-1, 1].forEach((dir) => {
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath()
        ctx.moveTo(cx + dir * 20, faceY + 28 + i * 10)
        ctx.quadraticCurveTo(cx + dir * 90, faceY + 18 + i * 14, cx + dir * 160, faceY + 10 + i * 18)
        ctx.stroke()
      }
    })
  } else {
    // bunny nose
    ctx.beginPath()
    ctx.ellipse(cx - 12, faceY + 18, 16, 12, -0.2, 0, Math.PI * 2)
    ctx.ellipse(cx + 12, faceY + 18, 16, 12, 0.2, 0, Math.PI * 2)
    ctx.fillStyle = '#f4a0b8'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, faceY + 22, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
  }

  return canvas
}

function drawMustache() {
  const { canvas, ctx, w, h } = makeCanvas(640, 240)
  const cx = w * 0.5
  const cy = h * 0.55
  ctx.fillStyle = '#1c140e'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.bezierCurveTo(cx - 40, cy - 50, cx - 140, cy - 30, cx - 200, cy + 10)
  ctx.bezierCurveTo(cx - 120, cy + 50, cx - 40, cy + 30, cx, cy + 8)
  ctx.bezierCurveTo(cx + 40, cy + 30, cx + 120, cy + 50, cx + 200, cy + 10)
  ctx.bezierCurveTo(cx + 140, cy - 30, cx + 40, cy - 50, cx, cy)
  ctx.fill()
  return canvas
}

function drawCrown() {
  const { canvas, ctx, w, h } = makeCanvas(640, 320)
  const baseY = h * 0.72
  ctx.beginPath()
  ctx.moveTo(w * 0.12, baseY)
  ctx.lineTo(w * 0.18, h * 0.28)
  ctx.lineTo(w * 0.32, baseY * 0.78)
  ctx.lineTo(w * 0.5, h * 0.12)
  ctx.lineTo(w * 0.68, baseY * 0.78)
  ctx.lineTo(w * 0.82, h * 0.28)
  ctx.lineTo(w * 0.88, baseY)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#ffe566')
  g.addColorStop(1, '#d4a017')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#8a6a10'
  ctx.lineWidth = 6
  ctx.stroke()
  ;[0.18, 0.5, 0.82].forEach((px, i) => {
    ctx.beginPath()
    ctx.arc(w * px, i === 1 ? h * 0.16 : h * 0.3, 14, 0, Math.PI * 2)
    ctx.fillStyle = i === 1 ? '#5ec8ff' : '#ff5e7a'
    ctx.fill()
  })
  return canvas
}

function drawClownNose() {
  const { canvas, ctx, w, h } = makeCanvas(280, 280)
  const g = ctx.createRadialGradient(w * 0.38, h * 0.35, 10, w * 0.5, h * 0.5, w * 0.42)
  g.addColorStop(0, '#ff7a7a')
  g.addColorStop(1, '#d01828')
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.5, w * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(w * 0.38, h * 0.36, 22, 14, -0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fill()
  return canvas
}

function drawPartyHat() {
  const { canvas, ctx, w, h } = makeCanvas(420, 520)
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.06)
  ctx.lineTo(w * 0.12, h * 0.92)
  ctx.lineTo(w * 0.88, h * 0.92)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#ff5ea8')
  g.addColorStop(0.5, '#7a5cff')
  g.addColorStop(1, '#44d7c0')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 8
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.08, 22, 0, Math.PI * 2)
  ctx.fillStyle = '#ffd24a'
  ctx.fill()
  return canvas
}

function drawFaceMask() {
  const { canvas, ctx, w, h } = makeCanvas(560, 680)
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.08)
  ctx.bezierCurveTo(w * 0.92, h * 0.12, w * 0.95, h * 0.55, w * 0.72, h * 0.88)
  ctx.quadraticCurveTo(w * 0.5, h * 0.98, w * 0.28, h * 0.88)
  ctx.bezierCurveTo(w * 0.05, h * 0.55, w * 0.08, h * 0.12, w * 0.5, h * 0.08)
  ctx.closePath()
  ctx.fillStyle = '#f4f1ea'
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 5
  ctx.stroke()
  // eyes
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.ellipse(w * 0.35, h * 0.42, 42, 28, 0, 0, Math.PI * 2)
  ctx.ellipse(w * 0.65, h * 0.42, 42, 28, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  // nose hint
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.48)
  ctx.lineTo(w * 0.44, h * 0.6)
  ctx.lineTo(w * 0.56, h * 0.6)
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = 4
  ctx.stroke()
  return canvas
}

const BUILDERS = {
  glasses: () => drawGlasses('clear'),
  sunglasses: () => drawGlasses('sun'),
  hearts: () => drawGlasses('heart'),
  dog: () => drawAnimal('dog'),
  cat: () => drawAnimal('cat'),
  bunny: () => drawAnimal('bunny'),
  mustache: () => drawMustache(),
  crown: () => drawCrown(),
  clown: () => drawClownNose(),
  party: () => drawPartyHat(),
  mask: () => drawFaceMask()
}

export const MASKS = [
  { id: 'none', name: 'Без маски', src: null, scale: 0, offsetY: 0 },
  { id: 'glasses', name: '👓 Очки', builder: 'glasses', scale: 2.55, offsetY: 0 },
  { id: 'sunglasses', name: '🕶️ Тёмные', builder: 'sunglasses', scale: 2.55, offsetY: 0 },
  { id: 'hearts', name: '😍 Сердечки', builder: 'hearts', scale: 2.6, offsetY: 0 },
  { id: 'dog', name: '🐶 Собака', builder: 'dog', scale: 4.2, offsetY: 0.02 },
  { id: 'cat', name: '🐱 Кот', builder: 'cat', scale: 4.2, offsetY: 0.02 },
  { id: 'bunny', name: '🐰 Заяц', builder: 'bunny', scale: 4.4, offsetY: -0.02 },
  { id: 'mustache', name: '🥸 Усы', builder: 'mustache', scale: 2.1, offsetY: 0.22 },
  { id: 'clown', name: '🤡 Нос', builder: 'clown', scale: 1.15, offsetY: 0.16 },
  { id: 'crown', name: '👑 Корона', builder: 'crown', scale: 3.4, offsetY: -0.55 },
  { id: 'party', name: '🎉 Колпак', builder: 'party', scale: 2.8, offsetY: -0.62 },
  { id: 'mask', name: '🎭 Маска', builder: 'mask', scale: 3.5, offsetY: 0.1 }
]

const imageCache = new Map()

export function loadMaskImage(mask) {
  if (!mask || mask.id === 'none') return Promise.resolve(null)
  if (imageCache.has(mask.id)) return Promise.resolve(imageCache.get(mask.id))

  return new Promise((resolve) => {
    const build = BUILDERS[mask.builder]
    if (build) {
      const canvas = build()
      imageCache.set(mask.id, canvas)
      resolve(canvas)
      return
    }
    resolve(null)
  })
}

export function getMaskById(id) {
  return MASKS.find((item) => item.id === id) || MASKS[0]
}
