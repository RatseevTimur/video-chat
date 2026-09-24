import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

import { getMaskById, loadMaskImage } from './masks'

const WASM_URL = '/mediapipe/wasm'
const MODEL_URL = '/models/blaze_face_short_range.tflite'
const DETECT_WIDTH = 320
const SMOOTH = 0.28
const OUT_W = 640
const OUT_H = 480

const emptyPose = () => ({
  x: 0.5,
  y: 0.38,
  scale: 0,
  rotation: 0,
  visible: 0
})

function coverCrop(srcW, srcH, dstW, dstH, faceX, faceY) {
  const srcAspect = srcW / srcH
  const dstAspect = dstW / dstH
  let cropW
  let cropH
  if (srcAspect > dstAspect) {
    cropH = srcH
    cropW = srcH * dstAspect
  } else {
    cropW = srcW
    cropH = srcW / dstAspect
  }
  const cx = Math.max(0, Math.min(srcW - cropW, faceX * srcW - cropW / 2))
  const cy = Math.max(0, Math.min(srcH - cropH, faceY * srcH - cropH / 2))
  return { x: cx, y: cy, w: cropW, h: cropH }
}

export default class MaskEngine {
  constructor() {
    this.detector = null
    this.ready = false
    this.running = false
    this.raf = 0
    this.busy = false
    this.lastVideoTime = -1
    this.frame = 0
    this.pose = emptyPose()
    this.target = emptyPose()
    this.mask = getMaskById('none')
    this.maskImage = null
    this.video = null
    this.canvas = null
    this.ctx = null
    this.detectCanvas = document.createElement('canvas')
    this.detectCtx = this.detectCanvas.getContext('2d', { alpha: false })
    this.outputStream = null
    this.crop = { x: 0, y: 0, w: 1, h: 1 }
  }

  async init() {
    if (this.ready) return this

    const vision = await FilesetResolver.forVisionTasks(WASM_URL)
    const options = {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.45
    }

    try {
      this.detector = await FaceDetector.createFromOptions(vision, options)
    } catch {
      options.baseOptions.delegate = 'CPU'
      this.detector = await FaceDetector.createFromOptions(vision, options)
    }

    this.ready = true
    return this
  }

  async setMask(id) {
    this.mask = getMaskById(id)
    this.maskImage = this.mask.src ? await loadMaskImage(this.mask) : null
    if (this.mask.id === 'none') {
      this.pose = { ...this.pose, scale: 0, rotation: 0, visible: this.pose.visible }
      this.target = { ...this.target, scale: 0, rotation: 0 }
    }
    return this.mask
  }

  attach({ stream, canvas }) {
    if (!this.video) {
      this.video = document.createElement('video')
      this.video.playsInline = true
      this.video.muted = true
      this.video.autoplay = true
    }

    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
    this.video.srcObject = stream
    const play = this.video.play()
    if (play) play.catch(() => {})

    this.running = true
    this.loop()
    return this
  }

  getStream(fps = 24) {
    if (!this.canvas) return null
    if (!this.outputStream) {
      this.outputStream = this.canvas.captureStream(fps)
    }
    return this.outputStream
  }

  stop({ keepCanvas = false } = {}) {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.outputStream = null
    if (this.video) {
      this.video.srcObject = null
    }
    if (!keepCanvas && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  dispose() {
    this.stop()
    this.detector?.close?.()
    this.detector = null
    this.ready = false
  }

  loop = () => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    this.draw()
  }

  draw() {
    const video = this.video
    const canvas = this.canvas
    const ctx = this.ctx
    if (!video || !canvas || !ctx || video.readyState < 2) return

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return

    if (canvas.width !== OUT_W || canvas.height !== OUT_H) {
      canvas.width = OUT_W
      canvas.height = OUT_H
    }

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime
      this.frame += 1
      if (this.detector && this.frame % 2 === 0) {
        this.detect(video, width, height)
      }
    }

    this.pose.x += (this.target.x - this.pose.x) * SMOOTH
    this.pose.y += (this.target.y - this.pose.y) * SMOOTH
    this.pose.scale += (this.target.scale - this.pose.scale) * SMOOTH
    this.pose.rotation += (this.target.rotation - this.pose.rotation) * SMOOTH
    this.pose.visible += (this.target.visible - this.pose.visible) * SMOOTH

    const faceX = this.pose.visible > 0.2 ? this.pose.x : 0.5
    const faceY = this.pose.visible > 0.2 ? this.pose.y : 0.38
    const crop = coverCrop(width, height, OUT_W, OUT_H, faceX, faceY)
    this.crop = crop

    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, OUT_W, OUT_H)

    if (this.mask.id === 'none' || !this.maskImage || this.pose.visible < 0.12) return

    const img = this.maskImage
    const maskWidth = (this.pose.scale * width) * (OUT_W / crop.w)
    const ratio = (img.height || img.naturalHeight) / (img.width || img.naturalWidth || 1)
    const maskHeight = maskWidth * ratio
    const mx = ((this.pose.x * width) - crop.x) / crop.w * OUT_W
    const my = ((this.pose.y * height) - crop.y) / crop.h * OUT_H

    ctx.save()
    ctx.globalAlpha = Math.min(1, this.pose.visible)
    ctx.translate(mx, my)
    ctx.rotate(this.pose.rotation)
    ctx.drawImage(img, -maskWidth / 2, -maskHeight / 2, maskWidth, maskHeight)
    ctx.restore()
  }

  detect(video, width, height) {
    if (this.busy) return
    this.busy = true

    try {
      const detectHeight = Math.max(1, Math.round(DETECT_WIDTH * (height / width)))
      if (this.detectCanvas.width !== DETECT_WIDTH || this.detectCanvas.height !== detectHeight) {
        this.detectCanvas.width = DETECT_WIDTH
        this.detectCanvas.height = detectHeight
      }
      this.detectCtx.drawImage(video, 0, 0, DETECT_WIDTH, detectHeight)

      const result = this.detector.detectForVideo(this.detectCanvas, performance.now())
      const detection = result?.detections?.[0]
      if (!detection) {
        this.target.visible = Math.max(0, this.target.visible - 0.15)
        return
      }

      const keypoints = indexKeypoints(detection.keypoints)
      const a = keypoints.leftEye
      const b = keypoints.rightEye
      if (!a || !b) {
        this.target.visible = 0
        return
      }

      // Image-space left/right — avoids ~180° rotate that flipped masks
      const left = a.x <= b.x ? a : b
      const right = a.x <= b.x ? b : a
      const dx = right.x - left.x
      const dy = right.y - left.y
      const dist = Math.hypot(dx, dy)
      this.target = {
        x: (left.x + right.x) / 2,
        y: (left.y + right.y) / 2 + (this.mask.offsetY || 0),
        scale: dist * (this.mask.scale || 0),
        rotation: Math.atan2(dy, dx),
        visible: 1
      }
    } catch {
      this.target.visible = 0
    } finally {
      this.busy = false
    }
  }
}

function indexKeypoints(keypoints = []) {
  const named = {}
  keypoints.forEach((point, index) => {
    const label = normalizeLabel(point.label || point.name)
    if (label) named[label] = point
    named[index] = point
  })

  return {
    rightEye: named.righteye || named[0],
    leftEye: named.lefteye || named[1],
    nose: named.nosetip || named.nose || named[2]
  }
}

function normalizeLabel(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}
