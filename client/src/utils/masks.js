import glasses from '../assets/images/glasses.png'
import sunglasses from '../assets/images/sunglasses.png'
import faceMask from '../assets/images/Mask.png'

export const MASKS = [
  { id: 'none', name: 'Без маски / No mask', src: null, scale: 0, offsetY: 0 },
  { id: 'glasses', name: 'Очки / Glasses', src: glasses, scale: 2.55, offsetY: 0.01, knockout: true },
  { id: 'sunglasses', name: 'Тёмные очки / Sunglasses', src: sunglasses, scale: 2.55, offsetY: 0.01, knockout: true },
  { id: 'mask', name: 'Маска / Mask', src: faceMask, scale: 3.35, offsetY: 0.12, knockout: false }
]

const imageCache = new Map()

function knockoutDarkPixels(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = frame.data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 18 && data[i + 1] < 18 && data[i + 2] < 18) {
      data[i + 3] = 0
    }
  }
  ctx.putImageData(frame, 0, 0)
  return canvas
}

export function loadMaskImage(mask) {
  if (!mask?.src) return Promise.resolve(null)
  if (imageCache.has(mask.id)) return Promise.resolve(imageCache.get(mask.id))

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      const ready = mask.knockout ? knockoutDarkPixels(img) : img
      imageCache.set(mask.id, ready)
      resolve(ready)
    }
    img.onerror = reject
    img.src = mask.src
  })
}

export function getMaskById(id) {
  return MASKS.find((item) => item.id === id) || MASKS[0]
}
