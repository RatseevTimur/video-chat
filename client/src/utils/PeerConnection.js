import Emitter from './Emitter'
import { getIceServers } from './ice'
import MediaDevice from './MediaDevices'
import socket from './socket'

class PeerConnection extends Emitter {
  constructor(remoteId, iceServers) {
    super()
    this.remoteId = remoteId
    this.pendingRemote = null
    this.pendingCandidates = []
    this.channel = null

    this.pc = new RTCPeerConnection({
      iceServers: iceServers || [{ urls: ['stun:stun.cloudflare.com:3478'] }]
    })

    this.pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      socket.emit('call', { to: this.remoteId, candidate })
    }

    this.pc.ontrack = ({ streams }) => {
      if (streams[0]) this.emit('remoteStream', streams[0])
    }

    this.pc.onconnectionstatechange = () => {
      this.emit('connectionState', this.pc.connectionState)
    }

    this.mediaDevice = new MediaDevice()
    this.getDescription = this.getDescription.bind(this)
  }

  static async create(remoteId) {
    const iceServers = await getIceServers()
    return new PeerConnection(remoteId, iceServers)
  }

  start(isCaller, config, options = {}) {
    const { skipRequest = false, stream = null } = options
    this.isCaller = isCaller

    if (isCaller) {
      this.channel = this.pc.createDataChannel('chat', { ordered: true })
      this.bindChannel(this.channel)
    } else {
      this.pc.ondatachannel = ({ channel }) => {
        this.channel = channel
        this.bindChannel(channel)
      }
    }

    const onReady = (mediaStream) => {
      mediaStream.getTracks().forEach((track) => {
        this.pc.addTrack(track, mediaStream)
      })
      this.emit('localStream', mediaStream)

      if (isCaller && !skipRequest) {
        socket.emit('request', { to: this.remoteId })
      }
      if (isCaller) {
        this.createOffer()
      }
      if (this.pendingRemote) {
        this.applySignal(this.pendingRemote)
        this.pendingRemote = null
      }
    }

    if (stream) {
      this.mediaDevice.stream = stream
      onReady(stream)
    } else {
      this.mediaDevice.on('stream', onReady).start(config)
    }

    return this
  }

  bindChannel(channel) {
    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload?.type === 'chat') this.emit('chat', payload)
      } catch {
        this.emit('chat', { type: 'chat', text: String(event.data), ts: Date.now() })
      }
    }
    channel.onopen = () => this.emit('chatReady')
    channel.onclose = () => this.emit('chatClosed')
  }

  sendChat(text) {
    if (this.channel?.readyState !== 'open') return false
    this.channel.send(JSON.stringify({
      type: 'chat',
      text,
      ts: Date.now()
    }))
    return true
  }

  replaceVideoTrack(track) {
    const videoSender = this.pc.getSenders().find((item) => item.track?.kind === 'video')
    if (videoSender && track) videoSender.replaceTrack(track)
    return this
  }

  stop(isCaller) {
    if (isCaller && this.remoteId) {
      socket.emit('end', { to: this.remoteId })
    }
    try { this.channel?.close() } catch { /* ignore */ }
    try { this.pc.close() } catch { /* ignore */ }
    this.off()
    return this
  }

  createOffer() {
    this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      .then(this.getDescription)
      .catch(console.error)
    return this
  }

  createAnswer() {
    this.pc.createAnswer()
      .then(this.getDescription)
      .catch(console.error)
    return this
  }

  getDescription(desc) {
    this.pc.setLocalDescription(desc)
    socket.emit('call', { to: this.remoteId, sdp: desc })
    return this
  }

  applySignal(data) {
    if (data.sdp) {
      const desc = new RTCSessionDescription(data.sdp)
      const apply = () => this.pc.setRemoteDescription(desc).then(() => {
        this.flushCandidates()
        if (data.sdp.type === 'offer') this.createAnswer()
      })

      if (this.pc.signalingState === 'closed') return this
      if (!this.pc.getSenders().length && data.sdp.type === 'offer') {
        this.pendingRemote = data
        return this
      }
      apply().catch(console.error)
      return this
    }

    if (data.candidate) {
      this.addIceCandidate(data.candidate)
    }
    return this
  }

  setRemoteDescription(desc) {
    return this.applySignal({ sdp: desc })
  }

  addIceCandidate(candidate) {
    if (!candidate) return this
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(candidate)
      return this
    }
    this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    return this
  }

  flushCandidates() {
    this.pendingCandidates.forEach((candidate) => {
      this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    })
    this.pendingCandidates = []
  }
}

export default PeerConnection
