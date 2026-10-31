import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'

import { apiUrl } from './apiOrigin'
import { acceptedTracks, aimCrop, approach, groupBox, smoothCrop, updateTracks } from './framing'
import { getMaskById, loadMaskImage } from './masks'

// Absolute when VITE_SERVER_URL is set (slim APK loads wasm from the server, not from the package).
const WASM_URL = apiUrl('/mediapipe/wasm')
const MODEL_URL = apiUrl('/models/blaze_face_short_range.tflite')
const DETECT_WIDTH = 320
const OUT_LONG = 960

function fitSize(srcW, srcH) {
  const scale = Math.min(1, OUT_LONG / Math.max(srcW, srcH))
  return {
    w: Math.max(2, Math.round((srcW * scale) / 2) * 2),
    h: Math.max(2, Math.round((srcH * scale) / 2) * 2)
  }
}

const emptyPose = () => ({
  x: 0.5,
  y: 0.38,
  scale: 0,
  rotation: 0,
  visible: 0
})

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
    this.viewCrop = null
    this.aim = null
    this.tracks = []
    this.lost = 0
    this.fps = 24
    this.onSize = null
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
      minDetectionConfidence: 0.35
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
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {}
    if (settings.width && settings.height) {
      const size = fitSize(settings.width, settings.height)
      canvas.width = size.w
      canvas.height = size.h
    }
    this.video.srcObject = stream
    const play = this.video.play()
    if (play) play.catch(() => {})

    this.running = true
    this.loop()
    return this
  }

  getStream(fps = 24) {
    if (!this.canvas) return null
    this.fps = fps
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

    const size = fitSize(width, height)
    if (canvas.width !== size.w || canvas.height !== size.h) {
      canvas.width = size.w
      canvas.height = size.h
      if (this.outputStream) {
        const next = canvas.captureStream(this.fps || 24)
        const prev = this.outputStream
        this.outputStream = next
        this.onSize?.(size.w, size.h, next)
        if (prev !== next) prev.getVideoTracks().forEach((track) => track.stop())
      } else {
        this.onSize?.(size.w, size.h, null)
      }
    }

    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime
      this.frame += 1
      if (this.detector && this.frame % 2 === 0) {
        this.detect(video, width, height)
      }
    }

    const poseAlpha = 0.08
    this.pose.x = approach(this.pose.x, this.target.x, poseAlpha, 0.008)
    this.pose.y = approach(this.pose.y, this.target.y, poseAlpha, 0.008)
    this.pose.scale = approach(this.pose.scale, this.target.scale, poseAlpha, 0.004)
    this.pose.rotation = approachAngle(this.pose.rotation, this.target.rotation, poseAlpha, 0.04)
    this.pose.visible = approach(this.pose.visible, this.target.visible, 0.06, 0.01)

    const full = { x: 0, y: 0, w: width, h: height }
    const desired = this.lost > 18 ? full : (this.aim || full)
    this.viewCrop = smoothCrop(this.viewCrop, desired, this.lost > 18 ? 0.02 : 0.065)
    const crop = this.viewCrop
    this.crop = crop

    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height)

    if (this.mask.id === 'none' || !this.maskImage || this.pose.visible < 0.12) return

    const img = this.maskImage
    const maskWidth = (this.pose.scale * width) * (canvas.width / crop.w)
    const ratio = (img.height || img.naturalHeight) / (img.width || img.naturalWidth || 1)
    const maskHeight = maskWidth * ratio
    const mx = ((this.pose.x * width) - crop.x) / crop.w * canvas.width
    const my = ((this.pose.y * height) - crop.y) / crop.h * canvas.height

    ctx.save()
    // Keep overlays solid — old assets looked "washed out" with low alpha.
    ctx.globalAlpha = Math.min(1, 0.55 + this.pose.visible * 0.45)
    ctx.translate(mx, my)
    ctx.rotate(this.pose.rotation)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
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
      const faces = (result?.detections || [])
        .map((detection) => faceFromDetection(detection, this.detectCanvas.width, this.detectCanvas.height))
        .filter(Boolean)
      this.tracks = updateTracks(this.tracks, faces)
      const stable = acceptedTracks(this.tracks)
      if (!stable.length) {
        this.lost += 1
        this.target.visible = Math.max(0, this.target.visible - 0.03)
        return
      }

      this.lost = 0
      const box = groupBox(stable)
      if (box) this.aim = aimCrop(box, width, height)
      const primary = stable.reduce((best, track) => (
        track.w * track.h > best.w * best.h ? track : best
      ))
      this.target = maskTarget(primary, this.mask, this.target)
    } catch {
      this.lost += 1
      this.target.visible = Math.max(0, this.target.visible - 0.03)
    } finally {
      this.busy = false
    }
  }
}

function faceFromDetection(detection, canvasW, canvasH) {
  const box = detection?.boundingBox
  const score = detection?.categories?.[0]?.score ?? 0
  if (!box || !canvasW || !canvasH || score < 0.35) return null
  const w = box.width / canvasW
  const h = box.height / canvasH
  if (w < 0.04 || h < 0.04 || w > 0.98 || h > 0.98) return null
  const keypoints = indexKeypoints(detection.keypoints)
  return {
    cx: (box.originX + box.width / 2) / canvasW,
    cy: (box.originY + box.height / 2) / canvasH,
    w,
    h,
    score,
    eyes: eyePose(keypoints)
  }
}

function eyePose(keypoints) {
  const a = keypoints.leftEye
  const b = keypoints.rightEye
  if (!a || !b) return null
  const left = a.x <= b.x ? a : b
  const right = a.x <= b.x ? b : a
  const dx = right.x - left.x
  const dy = right.y - left.y
  const dist = Math.hypot(dx, dy)
  if (dist < 0.01) return null
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    dist,
    rotation: Math.atan2(dy, dx)
  }
}

function maskTarget(track, mask, previous) {
  const eyes = track.eyes
  if (!eyes) {
    return {
      x: track.cx,
      y: track.cy,
      scale: track.w * (mask.scale || 0),
      rotation: previous.rotation || 0,
      visible: 1
    }
  }
  let rotation = eyes.rotation
  const turn = Math.atan2(Math.sin(rotation - (previous.rotation || 0)), Math.cos(rotation - (previous.rotation || 0)))
  if (Math.abs(turn) > 0.45 && (previous.visible || 0) > 0.4) rotation = previous.rotation
  return {
    x: eyes.x,
    y: eyes.y + (mask.offsetY || 0),
    scale: eyes.dist * (mask.scale || 0),
    rotation,
    visible: 1
  }
}

function approachAngle(current, next, alpha, dead) {
  const delta = Math.atan2(Math.sin(next - current), Math.cos(next - current))
  if (Math.abs(delta) <= dead) return current
  return current + delta * alpha
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
