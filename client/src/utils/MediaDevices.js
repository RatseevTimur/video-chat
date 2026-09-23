import Emitter from './Emitter'

class MediaDevice extends Emitter {
  start(config = { audio: true, video: true }) {
    const constraints = {
      audio: config.audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        : false,
      video: config.video
        ? {
            facingMode: 'user',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        : false
    }

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        this.stream = stream
        this.emit('stream', stream)
      })
      .catch((error) => {
        console.error(error)
        this.emit('error', error)
      })

    return this
  }

  toggle(type, on) {
    if (!this.stream) return this
    this.stream[`get${type}Tracks`]().forEach((track) => {
      track.enabled = typeof on === 'boolean' ? on : !track.enabled
    })
    return this
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    this.off()
    return this
  }
}

export default MediaDevice
