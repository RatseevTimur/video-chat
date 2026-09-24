import glasses from '../assets/images/glasses.png'
import sunglasses from '../assets/images/sunglasses.png'
import faceMask from '../assets/images/Mask.png'

export const MASKS = [
  { id: 'none', name: 'Без маски', src: null, scale: 0, offsetY: 0 },
  { id: 'glasses', name: 'Очки', src: glasses, scale: 2.7, offsetY: 0.01, rebuild: true },
  { id: 'sunglasses', name: 'Тёмные очки', src: sunglasses, scale: 2.7, offsetY: 0.01, rebuild: true },
  { id: 'mask', name: 'Маска', src: faceMask, scale: 3.35, offsetY: 0.12, rebuild: false }
]

const imageCache = new Map()

/** Black frames sit on a black background — threshold knockout ate the glasses.
 *  Keep colored pixels (lenses) and rebuild a visible frame from the outline. */
function rebuildFrame(img) {
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const frame = ctx.getImageData(0, 0, width, height)
  const src = frame.data
  const out = new Uint8ClampedArray(src)

  const isColor = (i) => {
    const r = src[i]
    const g = src[i + 1]
    const b = src[i + 2]
    const a = src[i + 3]
    if (a < 16) return false
    return r > 36 || g > 36 || b > 36
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (isColor(i)) {
        out[i + 3] = 255
        continue
      }
      let near = false
      for (let ny = y - 2; ny <= y + 2 && !near; ny += 1) {
        for (let nx = x - 2; nx <= x + 2; nx += 1) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          if (isColor((ny * width + nx) * 4)) near = true
        }
      }
      if (near) {
        out[i] = 22
        out[i + 1] = 22
        out[i + 2] = 22
        out[i + 3] = 255
      } else {
        out[i + 3] = 0
      }
    }
  }

  frame.data.set(out)
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
      const ready = mask.rebuild ? rebuildFrame(img) : img
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
