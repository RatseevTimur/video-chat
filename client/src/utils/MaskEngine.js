import { FaceDetector, FilesetResolver, GestureRecognizer, ImageSegmenter } from '@mediapipe/tasks-vision'

import { apiUrl } from './apiOrigin'
import { loadBackground } from './backgrounds'
import { acceptedTracks, aimCrop, approach, groupBox, smoothCrop, updateTracks } from './framing'
import { getMaskById, loadMaskLayers } from './masks'

// Absolute when VITE_SERVER_URL is set (slim APK loads wasm/models from the server).
const WASM_URL = apiUrl('/mediapipe/wasm')
const FACE_MODEL = apiUrl('/models/blaze_face_short_range.tflite')
const SEG_MODEL = apiUrl('/models/selfie_segmenter.tflite')
const GESTURE_MODEL = apiUrl('/models/gesture_recognizer.task')
const DETECT_WIDTH = 320
const SEG_WIDTH = 256
const OUT_LONG = 960

function fitSize(srcW, srcH) {
  const scale = Math.min(1, OUT_LONG / Math.max(srcW, srcH))
  return {
    w: Math.max(2, Math.round((srcW * scale) / 2) * 2),
    h: Math.max(2, Math.round((srcH * scale) / 2) * 2)
  }
}

function approachAngle(current, next, alpha, dead) {
  const delta = Math.atan2(Math.sin(next - current), Math.cos(next - current))
  if (Math.abs(delta) <= dead) return current
  return current + delta * alpha
}

async function withFallback(create, options) {
  try {
    return await create({ ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } })
  } catch {
    return create({ ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
  }
}

export default class MaskEngine {
  constructor() {
    this.vision = null
    this.detector = null
    this.segmenter = null
    this.gesture = null
    this.ready = false
    this.running = false
    this.raf = 0
    this.timer = 0
    this.hidden = false
    this.busy = false
    this.lastVideoTime = -1
    this.frame = 0

    this.mask = getMaskById('none')
    this.layers = []
    this.bgId = 'none'
    this.bgImage = null
    this.segReady = false
    this.segMask = null // canvas with alpha = person confidence
    this.segPersonIndex = -1
    this.gesturesOn = false
    this.trackingOn = true
    this.onGesture = null
    this.gestureState = { kind: '', count: 0, fired: Object.create(null) }

    this.video = null
    this.canvas = null
    this.ctx = null
    this.detectCanvas = document.createElement('canvas')
    this.detectCtx = this.detectCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
    this.segInput = document.createElement('canvas')
    this.segInputCtx = this.segInput.getContext('2d', { alpha: false, willReadFrequently: true })
    this.personCanvas = document.createElement('canvas')
    this.personCtx = this.personCanvas.getContext('2d')
    this.bgSmall = document.createElement('canvas')
    this.bgSmallCtx = this.bgSmall.getContext('2d', { alpha: false })
    this.outputStream = null
    this.crop = { x: 0, y: 0, w: 1, h: 1 }
    this.viewCrop = null
    this.aim = null
    this.tracks = []
    this.poses = new Map() // track id → smoothed pose
    this.lost = 0
    this.fps = 24
    this.onSize = null
  }

  async init() {
    if (this.ready) return this
    try {
      this.vision = await FilesetResolver.forVisionTasks(WASM_URL)
      this.detector = await withFallback(
        (opts) => FaceDetector.createFromOptions(this.vision, opts),
        { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: 'VIDEO', minDetectionConfidence: 0.35 }
      )
      this.ready = true
    } catch (error) {
      console.error('MaskEngine init failed', WASM_URL, FACE_MODEL, error)
      this.ready = false
      this.detector = null
    }
    return this
  }

  async setMask(id) {
    this.mask = getMaskById(id)
    this.layers = await loadMaskLayers(this.mask)
    return this.mask
  }

  async setBackground(id) {
    this.bgId = id || 'none'
    this.bgImage = await loadBackground(this.bgId).catch(() => null)
    if (this.bgId === 'photo' && !this.bgImage) this.bgId = 'none'
    if (this.bgId !== 'none' && !this.segmenter) await this.ensureSegmenter()
    return this.bgId
  }

  async ensureSegmenter() {
    if (this.segmenter || !this.vision) return
    try {
      this.segmenter = await withFallback(
        (opts) => ImageSegmenter.createFromOptions(this.vision, opts),
        {
          baseOptions: { modelAssetPath: SEG_MODEL },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        }
      )
      const labels = (this.segmenter.getLabels?.() || []).map((l) => String(l).toLowerCase())
      this.segPersonIndex = labels.findIndex((l) => /person|selfie|foreground|hair|skin/.test(l))
      this.segReady = true
    } catch (error) {
      console.error('segmenter failed', error)
      this.segmenter = null
      this.segReady = false
    }
  }

  /** Auto crop that follows faces. Off → full frame (masks/gestures still work). */
  setTracking(on) {
    this.trackingOn = Boolean(on)
    if (!this.trackingOn) {
      this.aim = null
      this.viewCrop = null
      this.lost = 0
    }
    return this.trackingOn
  }

  async setGestures(on) {
    this.gesturesOn = Boolean(on)
    if (this.gesturesOn && !this.gesture && this.vision) {
      try {
        this.gesture = await withFallback(
          (opts) => GestureRecognizer.createFromOptions(this.vision, opts),
          {
            baseOptions: { modelAssetPath: GESTURE_MODEL },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.55,
            minTrackingConfidence: 0.5
          }
        )
      } catch (error) {
        console.error('gesture recognizer failed', error)
        this.gesture = null
        this.gesturesOn = false
      }
    }
    return this.gesturesOn
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
    if (!this.outputStream) this.outputStream = this.canvas.captureStream(fps)
    return this.outputStream
  }

  /** Background tabs stop rAF; keep a slow timer loop so the canvas track isn't frozen forever. */
  setHidden(hidden) {
    this.hidden = Boolean(hidden)
    if (!this.running) return
    cancelAnimationFrame(this.raf)
    clearTimeout(this.timer)
    this.loop()
  }

  stop({ keepCanvas = false } = {}) {
    this.running = false
    cancelAnimationFrame(this.raf)
    clearTimeout(this.timer)
    this.outputStream = null
    if (this.video) this.video.srcObject = null
    if (!keepCanvas && this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
  }

  dispose() {
    this.stop()
    this.detector?.close?.()
    this.segmenter?.close?.()
    this.gesture?.close?.()
    this.detector = null
    this.segmenter = null
    this.gesture = null
    this.ready = false
  }

  loop = () => {
    if (!this.running) return
    if (this.hidden) this.timer = setTimeout(this.loop, 200)
    else this.raf = requestAnimationFrame(this.loop)
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

    const newFrame = video.currentTime !== this.lastVideoTime
    if (newFrame) {
      this.lastVideoTime = video.currentTime
      this.frame += 1
      const bgActive = this.bgId !== 'none' && this.segReady
      const every = bgActive ? 2 : 1
      if (this.detector && this.frame % every === 0) this.detect(video, width, height)
      if (bgActive && this.frame % 2 === 1) this.segment(video, width, height)
      if (this.gesturesOn && this.gesture && this.frame % 4 === 2) this.recognize(video, width, height)
    }

    const full = { x: 0, y: 0, w: width, h: height }
    let crop = full
    if (this.trackingOn) {
      const desired = this.lost > 18 ? full : (this.aim || full)
      this.viewCrop = smoothCrop(this.viewCrop, desired, this.lost > 18 ? 0.02 : 0.065)
      crop = this.viewCrop
    } else {
      this.viewCrop = full
    }
    this.crop = crop

    if (this.bgId !== 'none' && this.segMask) {
      this.composeBackground(video, crop, canvas, ctx)
    } else {
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height)
    }

    if (this.layers.length) this.drawMasks(width, height, crop, canvas, ctx)
  }

  /* ----------------------------------------------------------- background */

  composeBackground(video, crop, canvas, ctx) {
    const cw = canvas.width
    const ch = canvas.height
    if (this.bgId === 'blur' || !this.bgImage) {
      const sw = Math.max(8, Math.round(cw / 10))
      const sh = Math.max(8, Math.round(ch / 10))
      if (this.bgSmall.width !== sw || this.bgSmall.height !== sh) {
        this.bgSmall.width = sw
        this.bgSmall.height = sh
      }
      this.bgSmallCtx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, sw, sh)
      ctx.save()
      try { ctx.filter = 'blur(6px) brightness(0.85)' } catch { /* old Safari */ }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'low'
      ctx.drawImage(this.bgSmall, -8, -8, cw + 16, ch + 16)
      ctx.restore()
    } else {
      const img = this.bgImage
      const iw = img.width || img.naturalWidth
      const ih = img.height || img.naturalHeight
      const scale = Math.max(cw / iw, ch / ih)
      const dw = iw * scale
      const dh = ih * scale
      ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh)
    }

    const pc = this.personCanvas
    const pctx = this.personCtx
    if (pc.width !== cw || pc.height !== ch) {
      pc.width = cw
      pc.height = ch
    }
    pctx.save()
    pctx.globalCompositeOperation = 'source-over'
    pctx.clearRect(0, 0, cw, ch)
    pctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, cw, ch)
    pctx.globalCompositeOperation = 'destination-in'
    try { pctx.filter = 'blur(2px)' } catch { /* ignore */ }
    const m = this.segMask
    const sx = m.width / video.videoWidth
    const sy = m.height / video.videoHeight
    pctx.drawImage(m, crop.x * sx, crop.y * sy, crop.w * sx, crop.h * sy, 0, 0, cw, ch)
    pctx.restore()
    ctx.drawImage(pc, 0, 0)
  }

  segment(video, width, height) {
    if (!this.segmenter || this.segBusy) return
    this.segBusy = true
    try {
      const sw = SEG_WIDTH
      const sh = Math.max(8, Math.round(SEG_WIDTH * (height / width)))
      if (this.segInput.width !== sw || this.segInput.height !== sh) {
        this.segInput.width = sw
        this.segInput.height = sh
      }
      this.segInputCtx.drawImage(video, 0, 0, sw, sh)
      const result = this.segmenter.segmentForVideo(this.segInput, performance.now())
      const masks = result?.confidenceMasks || []
      if (!masks.length) return
      const index = this.segPersonIndex >= 0 && this.segPersonIndex < masks.length
        ? this.segPersonIndex
        : masks.length - 1
      const mask = masks[index]
      const data = mask.getAsFloat32Array()
      const mw = mask.width
      const mh = mask.height
      if (!this.segMask) this.segMask = document.createElement('canvas')
      if (this.segMask.width !== mw || this.segMask.height !== mh) {
        this.segMask.width = mw
        this.segMask.height = mh
        this.segImage = null
      }
      if (!this.segImage) this.segImage = new ImageData(mw, mh)
      const px = this.segImage.data
      for (let i = 0, j = 3; i < data.length; i += 1, j += 4) {
        // soft threshold 0.25..0.75 → crisp body, soft hair edge
        const v = (data[i] - 0.25) * 2
        px[j] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0
      }
      this.segMask.getContext('2d').putImageData(this.segImage, 0, 0)
      masks.forEach((item) => item.close?.())
    } catch (error) {
      if (!this.segWarned) {
        this.segWarned = true
        console.warn('segment', error)
      }
    } finally {
      this.segBusy = false
    }
  }

  /* ---------------------------------------------------------------- faces */

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
        return
      }
      this.lost = 0
      const box = groupBox(stable)
      if (box) this.aim = aimCrop(box, width, height)
    } catch {
      this.lost += 1
    } finally {
      this.busy = false
    }
  }

  /** Smoothed per-face pose in video pixels: eye centre, tilt, face width, anchors in face units. */
  poseFor(track, width, height) {
    const prev = this.poses.get(track.id)
    const pts = track.pts || {}
    const eyeL = pts.eyeL
    const eyeR = pts.eyeR
    let ex
    let ey
    let rotation
    let eyeDist
    if (eyeL && eyeR) {
      const left = eyeL.x <= eyeR.x ? eyeL : eyeR
      const right = eyeL.x <= eyeR.x ? eyeR : eyeL
      ex = ((left.x + right.x) / 2) * width
      ey = ((left.y + right.y) / 2) * height
      rotation = Math.atan2((right.y - left.y) * height, (right.x - left.x) * width)
      eyeDist = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height)
    } else {
      ex = track.cx * width
      ey = (track.cy - track.h * 0.12) * height
      rotation = prev?.rotation || 0
      eyeDist = track.w * width * 0.42
    }
    const boxW = track.w * width
    // Face width: box is steadier than eye distance; eye distance tracks head turn. Blend.
    const faceW = boxW * 0.6 + (eyeDist / 0.42) * 0.4

    // Face-local frame (unit = faceW, rotated by `rotation`)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const local = (p) => {
      if (!p) return null
      const dx = p.x * width - ex
      const dy = p.y * height - ey
      return { x: (dx * cos + dy * sin) / faceW, y: (-dx * sin + dy * cos) / faceW }
    }
    const nose = local(pts.nose) || { x: 0, y: 0.34 }
    const mouth = local(pts.mouth) || { x: nose.x, y: nose.y + 0.26 }
    const boxTopLocal = ((track.cy - track.h / 2) * height - ey) / faceW // negative
    const headTopY = Math.min(-0.42, Math.max(-0.95, boxTopLocal * 1.25 - 0.1))

    const target = {
      x: ex,
      y: ey,
      rotation,
      faceW,
      eyeDist,
      noseX: nose.x,
      noseY: nose.y,
      mouthX: mouth.x,
      mouthY: mouth.y,
      headTopY,
      earLX: local(pts.earL)?.x ?? -0.52,
      earLY: local(pts.earL)?.y ?? 0.08,
      earRX: local(pts.earR)?.x ?? 0.52,
      earRY: local(pts.earR)?.y ?? 0.08,
      visible: 1
    }
    if (!prev) {
      const pose = { ...target, visible: 0.15 }
      this.poses.set(track.id, pose)
      return pose
    }
    const dead = Math.max(0.6, faceW * 0.004)
    prev.x = approach(prev.x, target.x, 0.55, dead)
    prev.y = approach(prev.y, target.y, 0.55, dead)
    prev.rotation = approachAngle(prev.rotation, target.rotation, 0.4, 0.01)
    prev.faceW = approach(prev.faceW, target.faceW, 0.25, faceW * 0.01)
    prev.eyeDist = approach(prev.eyeDist, target.eyeDist, 0.3, eyeDist * 0.01)
    for (const key of ['noseX', 'noseY', 'mouthX', 'mouthY', 'headTopY', 'earLX', 'earLY', 'earRX', 'earRY']) {
      prev[key] = approach(prev[key], target[key], 0.35, 0.004)
    }
    prev.visible = Math.min(1, prev.visible + 0.12)
    return prev
  }

  anchorPoint(pose, name) {
    switch (name) {
      case 'nose': return { x: pose.noseX, y: pose.noseY }
      case 'mouth': return { x: pose.mouthX, y: pose.mouthY }
      // Mustache zone: between nose tip and the mouth centre, nearer the nose (upper lip is ~0.6).
      case 'lip': return { x: (pose.noseX + pose.mouthX) / 2, y: pose.noseY + (pose.mouthY - pose.noseY) * 0.42 }
      case 'chin': return { x: pose.mouthX, y: pose.mouthY + (pose.mouthY - pose.noseY) * 0.95 }
      case 'headTop': return { x: 0, y: pose.headTopY }
      case 'earL': return { x: pose.earLX, y: pose.earLY }
      case 'earR': return { x: pose.earRX, y: pose.earRY }
      case 'eyeL': return { x: -(pose.eyeDist / pose.faceW) / 2, y: 0 }
      case 'eyeR': return { x: (pose.eyeDist / pose.faceW) / 2, y: 0 }
      default: return { x: 0, y: 0 }
    }
  }

  drawMasks(width, height, crop, canvas, ctx) {
    const live = this.tracks.filter((track) => track.missed <= 4 && track.seen >= 2)
    const liveIds = new Set(live.map((track) => track.id))
    for (const id of [...this.poses.keys()]) {
      if (!liveIds.has(id)) this.poses.delete(id)
    }
    const scaleX = canvas.width / crop.w
    const scaleY = canvas.height / crop.h
    const toCanvas = (x, y) => ({ x: (x - crop.x) * scaleX, y: (y - crop.y) * scaleY })

    for (const track of live.slice(0, 4)) {
      const pose = this.poseFor(track, width, height)
      const alpha = pose.visible * (track.missed ? 1 - track.missed / 6 : 1)
      if (alpha <= 0.05) continue
      const cos = Math.cos(pose.rotation)
      const sin = Math.sin(pose.rotation)
      for (const layer of this.layers) {
        const anchor = this.anchorPoint(pose, layer.at)
        const lx = (anchor.x + (layer.dx || 0)) * pose.faceW
        const ly = (anchor.y + (layer.dy || 0)) * pose.faceW
        const vx = pose.x + lx * cos - ly * sin
        const vy = pose.y + lx * sin + ly * cos
        const p = toCanvas(vx, vy)
        const [ref, k] = layer.width || ['face', 1]
        const base = ref === 'eye' ? pose.eyeDist : pose.faceW
        const w = base * k * scaleX
        const img = layer.img
        const h = w * (img.height / img.width)
        const [px, py] = layer.pivot || [0.5, 0.5]
        ctx.save()
        ctx.globalAlpha = Math.min(1, alpha)
        ctx.translate(p.x, p.y)
        ctx.rotate(pose.rotation + (layer.rot || 0))
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, -w * px, -h * py, w, h)
        ctx.restore()
      }
    }
  }

  /* -------------------------------------------------------------- gestures */

  recognize(video, width, height) {
    if (!this.gesture || this.gestureBusy) return
    this.gestureBusy = true
    try {
      // detectCanvas already holds this frame when the detector ran; redraw if not.
      const detectHeight = Math.max(1, Math.round(DETECT_WIDTH * (height / width)))
      if (this.detectCanvas.width !== DETECT_WIDTH || this.detectCanvas.height !== detectHeight) {
        this.detectCanvas.width = DETECT_WIDTH
        this.detectCanvas.height = detectHeight
      }
      this.detectCtx.drawImage(video, 0, 0, DETECT_WIDTH, detectHeight)
      const result = this.gesture.recognizeForVideo(this.detectCanvas, performance.now())
      let kind = ''
      const hands = result?.gestures || []
      for (let i = 0; i < hands.length && !kind; i += 1) {
        const top = hands[i]?.[0]
        kind = classifyGesture(top?.categoryName, top?.score ?? 0, result.landmarks?.[i])
      }
      const state = this.gestureState
      if (kind && kind === state.kind) state.count += 1
      else {
        state.kind = kind
        state.count = kind ? 1 : 0
      }
      const now = performance.now()
      if (kind && state.count >= 2 && now - (state.fired[kind] || 0) > 3500) {
        state.fired[kind] = now
        state.count = 0
        this.onGesture?.(kind)
      }
    } catch (error) {
      if (!this.gestureWarned) {
        this.gestureWarned = true
        console.warn('gesture', error)
      }
    } finally {
      this.gestureBusy = false
    }
  }
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function fingerUp(lm, tip, pip) {
  return dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.12
}

/** Map MediaPipe canned gestures (+ a landmark rule for 🤘) onto our reactions. */
export function classifyGesture(category, score, landmarks) {
  if (landmarks?.length >= 21) {
    const index = fingerUp(landmarks, 8, 6)
    const middle = fingerUp(landmarks, 12, 10)
    const ring = fingerUp(landmarks, 16, 14)
    const pinky = fingerUp(landmarks, 20, 18)
    if (index && pinky && !middle && !ring) return 'rock'
  }
  if (score < 0.55) return ''
  switch (category) {
    case 'Thumb_Up': return 'thumbs'
    case 'Open_Palm': return 'palm'
    case 'Closed_Fist': return 'fist'
    case 'ILoveYou': return 'rock'
    default: return ''
  }
}

function faceFromDetection(detection, canvasW, canvasH) {
  const box = detection?.boundingBox
  const score = detection?.categories?.[0]?.score ?? 0
  if (!box || !canvasW || !canvasH || score < 0.35) return null
  const w = box.width / canvasW
  const h = box.height / canvasH
  if (w < 0.04 || h < 0.04 || w > 0.98 || h > 0.98) return null
  const pts = indexKeypoints(detection.keypoints, canvasW, canvasH)
  return {
    cx: (box.originX + box.width / 2) / canvasW,
    cy: (box.originY + box.height / 2) / canvasH,
    w,
    h,
    score,
    eyes: pts.eyeL && pts.eyeR ? { x: (pts.eyeL.x + pts.eyeR.x) / 2, y: (pts.eyeL.y + pts.eyeR.y) / 2 } : null,
    pts
  }
}

/** BlazeFace keypoints: 0 right eye, 1 left eye, 2 nose tip, 3 mouth, 4 right ear, 5 left ear. */
function indexKeypoints(keypoints = []) {
  const byLabel = {}
  keypoints.forEach((point, index) => {
    const label = String(point.label || point.name || '').toLowerCase().replace(/[^a-z]/g, '')
    if (label) byLabel[label] = point
    byLabel[index] = point
  })
  const pick = (...keys) => {
    for (const key of keys) {
      const p = byLabel[key]
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y }
    }
    return null
  }
  return {
    eyeR: pick('righteye', 0),
    eyeL: pick('lefteye', 1),
    nose: pick('nosetip', 'nose', 2),
    mouth: pick('mouthcenter', 'mouth', 3),
    earR: pick('righteartragion', 'rightear', 4),
    earL: pick('lefteartragion', 'leftear', 5)
  }
}
