/**
 * Virtual backgrounds. `blur` softens the real room; scenes are drawn procedurally (no downloads);
 * `photo` is a user-picked image kept in localStorage (small) or memory.
 */

const PHOTO_KEY = 'vc-bg-photo'

function scene(w, h, paint) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  paint(ctx, w, h)
  return canvas
}

function stars(ctx, w, h, n, alpha = 0.9) {
  for (let i = 0; i < n; i += 1) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = Math.random() * 1.6 + 0.3
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${alpha * Math.random()})`
    ctx.fill()
  }
}

const SCENES = {
  sunset: () => scene(1280, 720, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#2b1055')
    sky.addColorStop(0.45, '#ff6a3d')
    sky.addColorStop(0.75, '#ffb347')
    sky.addColorStop(1, '#1c1a2e')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    const sun = ctx.createRadialGradient(w * 0.5, h * 0.66, 10, w * 0.5, h * 0.66, 160)
    sun.addColorStop(0, '#fff3c4')
    sun.addColorStop(0.5, '#ffb347')
    sun.addColorStop(1, 'rgba(255,179,71,0)')
    ctx.fillStyle = sun
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1c1a2e'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.78)
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, h * 0.78 - Math.abs(Math.sin(x / 90)) * 70 - (x % 80 === 0 ? 20 : 0))
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    ctx.fill()
  }),
  ocean: () => scene(1280, 720, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55)
    sky.addColorStop(0, '#5ec6ff')
    sky.addColorStop(1, '#d9f3ff')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h * 0.55)
    const sea = ctx.createLinearGradient(0, h * 0.55, 0, h)
    sea.addColorStop(0, '#1aa6c8')
    sea.addColorStop(1, '#0b4f7a')
    ctx.fillStyle = sea
    ctx.fillRect(0, h * 0.55, w, h * 0.45)
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    for (let i = 0; i < 14; i += 1) {
      const y = h * 0.58 + i * 26
      ctx.beginPath()
      for (let x = 0; x <= w; x += 20) {
        ctx.lineTo(x, y + Math.sin(x / 60 + i) * 5)
      }
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ;[[200, 120, 90], [760, 90, 120], [1050, 160, 70]].forEach(([x, y, r]) => {
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2)
      ctx.ellipse(x + r * 0.5, y - r * 0.2, r * 0.7, r * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
    })
  }),
  space: () => scene(1280, 720, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 20, w * 0.5, h * 0.5, w * 0.8)
    g.addColorStop(0, '#2a1a5e')
    g.addColorStop(1, '#05060f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    stars(ctx, w, h, 420)
    const planet = ctx.createRadialGradient(w * 0.78, h * 0.3, 10, w * 0.8, h * 0.32, 110)
    planet.addColorStop(0, '#ffd59e')
    planet.addColorStop(1, '#c2552e')
    ctx.fillStyle = planet
    ctx.beginPath()
    ctx.arc(w * 0.8, h * 0.32, 100, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.ellipse(w * 0.8, h * 0.32, 170, 36, -0.35, 0, Math.PI * 2)
    ctx.stroke()
  }),
  forest: () => scene(1280, 720, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#c9e9d2')
    sky.addColorStop(0.5, '#86c99a')
    sky.addColorStop(1, '#1f4d2b')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
    for (let layer = 0; layer < 4; layer += 1) {
      const base = h * (0.45 + layer * 0.14)
      ctx.fillStyle = `rgba(${20 + layer * 12}, ${70 + layer * 20}, ${35 + layer * 14}, 1)`
      for (let x = -60; x < w + 60; x += 90 - layer * 10) {
        const tw = 70 + layer * 14
        const th = 200 + layer * 40
        ctx.beginPath()
        ctx.moveTo(x, base)
        ctx.lineTo(x + tw / 2, base - th)
        ctx.lineTo(x + tw, base)
        ctx.closePath()
        ctx.fill()
      }
    }
    const light = ctx.createRadialGradient(w * 0.3, h * 0.1, 10, w * 0.3, h * 0.1, 500)
    light.addColorStop(0, 'rgba(255,255,220,0.5)')
    light.addColorStop(1, 'rgba(255,255,220,0)')
    ctx.fillStyle = light
    ctx.fillRect(0, 0, w, h)
  }),
  studio: () => scene(1280, 720, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 40, w * 0.5, h * 0.5, w * 0.75)
    g.addColorStop(0, '#5a6378')
    g.addColorStop(1, '#161a24')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
}

export const BACKGROUNDS = [
  { id: 'none', name: 'Нет', emoji: '🚫' },
  { id: 'blur', name: 'Размытие', emoji: '🌫️' },
  { id: 'studio', name: 'Студия', emoji: '🎬' },
  { id: 'sunset', name: 'Закат', emoji: '🌅' },
  { id: 'ocean', name: 'Море', emoji: '🌊' },
  { id: 'space', name: 'Космос', emoji: '🪐' },
  { id: 'forest', name: 'Лес', emoji: '🌲' },
  { id: 'photo', name: 'Фото', emoji: '🖼️' }
]

const sceneCache = new Map()
let photoImage = null

export function getBackgroundById(id) {
  return BACKGROUNDS.find((item) => item.id === id) || BACKGROUNDS[0]
}

export function hasPhoto() {
  if (photoImage) return true
  try { return Boolean(localStorage.getItem(PHOTO_KEY)) } catch { return false }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Returns a drawable (canvas/image) for scene/photo backgrounds, or null for none/blur. */
export async function loadBackground(id) {
  if (id === 'none' || id === 'blur') return null
  if (id === 'photo') {
    if (photoImage) return photoImage
    try {
      const saved = localStorage.getItem(PHOTO_KEY)
      if (saved) {
        photoImage = await loadImage(saved)
        return photoImage
      }
    } catch { /* ignore */ }
    return null
  }
  if (sceneCache.has(id)) return sceneCache.get(id)
  const build = SCENES[id]
  if (!build) return null
  const canvas = build()
  sceneCache.set(id, canvas)
  return canvas
}

/** Downscale a picked file to ≤1280px and remember it. */
export async function setPhotoFromFile(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', 0.82)
    photoImage = await loadImage(data)
    try {
      if (data.length < 1_500_000) localStorage.setItem(PHOTO_KEY, data)
    } catch { /* quota */ }
    return photoImage
  } finally {
    URL.revokeObjectURL(url)
  }
}
