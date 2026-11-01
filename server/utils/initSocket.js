import { nanoid } from 'nanoid'

import { bindSocket, getChat, getSession, lookupUsers, notifyMembers, unbindSocket } from './messenger.js'
import { listRingTargets, sendCancelRing, sendChatPush, sendRing } from './push.js'

const users = {}
/** id → socket state, so a reconnecting tab can take its seat back. */
const states = {}
const rooms = {}
/** roomId → { ringId, from, fromName, at } */
const activeRings = Object.create(null)

const ID_RE = /^[A-Za-z0-9_-]{4,16}$/
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/
const MAX_NAME = 24
const MAX_MSG = 2000
const MAX_CHAT = 60
const MAX_PARTICIPANTS = 10
const CHAT_TTL_MS = 10 * 60 * 1000
const ROOM_TTL_MS = 6 * 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.chatExpiresAt && now > room.chatExpiresAt) {
      room.chat = []
    }
    if (room.participants.length === 0 && now - (room.emptyAt || room.createdAt) > ROOM_TTL_MS) {
      delete rooms[roomId]
    }
  }
}, 60_000)

function sanitizeName(name) {
  if (typeof name !== 'string') return ''
  return name.replace(/[<>]/g, '').trim().slice(0, MAX_NAME)
}

function sanitizeText(text) {
  if (typeof text !== 'string') return ''
  return text.slice(0, MAX_MSG)
}

function getRoomInfo(roomId) {
  const room = rooms[roomId]
  if (!room) return null
  const waiting = Object.entries(room.waiting || {}).map(([id, item]) => ({
    id,
    name: item.name || id
  }))
  return {
    roomId,
    type: room.type,
    participants: room.participants,
    names: room.names,
    host: room.host,
    participantCount: room.participants.length,
    waiting,
    callActive: Boolean(room.call?.active),
    inCall: room.call?.inCall || [],
    media: room.media || {},
    ringTargets: listRingTargets(roomId)
  }
}

function clearChat(room) {
  room.chat = []
  room.chatExpiresAt = 0
}

function pushMessage(room, message) {
  room.chat.push(message)
  if (room.chat.length > MAX_CHAT) room.chat.shift()
  room.chatExpiresAt = Date.now() + CHAT_TTL_MS
}

function emptyRoom(type, hostId) {
  return {
    type,
    participants: [],
    waiting: Object.create(null),
    names: Object.create(null),
    host: hostId,
    createdAt: Date.now(),
    call: { active: false, callerId: null, inCall: [] },
    chat: [],
    chatExpiresAt: 0,
    deviceIds: Object.create(null),
    media: Object.create(null)
  }
}

function rememberDevice(room, id, deviceId, socket) {
  if (!room.deviceIds) room.deviceIds = Object.create(null)
  if (typeof deviceId === 'string' && /^[a-z0-9]{8,32}$/.test(deviceId)) {
    room.deviceIds[id] = deviceId
    if (socket) socket.data.deviceId = deviceId
  }
}

function notifyHostWaiting(roomId) {
  const room = rooms[roomId]
  if (!room?.host) return
  emit(room.host, 'waitingUpdated', { roomInfo: getRoomInfo(roomId) })
}

function broadcastRingCancelled(roomId, payload, socket) {
  const nsp = socket?.nsp
  if (nsp) {
    nsp.to(roomId).emit('ringCancelled', payload)
    nsp.to(`watch:${roomId}`).emit('ringCancelled', payload)
  } else if (socket) {
    socket.to(roomId).emit('ringCancelled', payload)
    socket.to(`watch:${roomId}`).emit('ringCancelled', payload)
    socket.emit('ringCancelled', payload)
  }
  // Direct map emit so the caller always gets it even if room membership is odd.
  emitToRoom(roomId, 'ringCancelled', payload)
}

async function cancelActiveRing(roomId, { by, socket } = {}) {
  const active = activeRings[roomId]
  const payload = { roomId, ringId: active?.ringId || '', by: by || '' }
  if (!active) {
    broadcastRingCancelled(roomId, payload, socket)
    return null
  }
  delete activeRings[roomId]
  const room = rooms[roomId]
  const skipDevices = Object.values(room?.deviceIds || {}).filter(Boolean)
  try {
    await sendCancelRing(roomId, { ringId: active.ringId, skipDevices })
  } catch (error) {
    console.warn('cancel push failed', error.message)
  }
  broadcastRingCancelled(roomId, payload, socket)
  return active
}

function leaveRoom(socketState) {
  const { id, currentRoom, socket } = socketState
  if (!currentRoom || !rooms[currentRoom]) {
    socketState.currentRoom = null
    return
  }

  const room = rooms[currentRoom]
  const wasWaiting = Boolean(room.waiting?.[id])
  if (room.waiting) delete room.waiting[id]

  const wasParticipant = room.participants.includes(id)
  // If the caller leaves while a ring is active, stop it so callees don't join an empty room.
  if (wasParticipant && activeRings[currentRoom]?.from === id) {
    cancelActiveRing(currentRoom, { by: id, socket }).catch(() => {})
  }
  room.participants = room.participants.filter((userId) => userId !== id)
  room.call.inCall = room.call.inCall.filter((userId) => userId !== id)
  delete room.names[id]
  if (room.deviceIds) delete room.deviceIds[id]
  if (room.media) delete room.media[id]

  if (wasWaiting && !wasParticipant) {
    notifyHostWaiting(currentRoom)
    socket.leave(currentRoom)
    socketState.currentRoom = null
    return
  }

  if (wasParticipant) {
    emitToRoom(currentRoom, 'userLeft', {
      userId: id,
      roomInfo: getRoomInfo(currentRoom)
    }, socket)
  }

  if (room.call.active && room.call.inCall.length === 0) {
    room.call = { active: false, callerId: null, inCall: [] }
    if (room.type === 'video') {
      clearChat(room)
      emitToRoom(currentRoom, 'callEnded', { chatCleared: true })
    }
  }

  if (room.participants.length === 0) {
    room.emptyAt = Date.now()
    if (room.type === 'video') clearChat(room)
    // Clear leftover waiting knocks if room emptied
    room.waiting = Object.create(null)
  } else if (room.host === id) {
    room.host = room.participants[0]
    emitToRoom(currentRoom, 'hostChanged', {
      newHost: room.host,
      roomInfo: getRoomInfo(currentRoom)
    })
    notifyHostWaiting(currentRoom)
  }

  socket.leave(currentRoom)
  socketState.currentRoom = null
}

function emit(userId, event, data) {
  users[userId]?.emit(event, data)
}

function emitToRoom(roomId, event, data, excludeSocket = null) {
  const room = rooms[roomId]
  if (!room) return
  room.participants.forEach((userId) => {
    const userSocket = users[userId]
    if (userSocket && userSocket !== excludeSocket) {
      userSocket.emit(event, data)
    }
  })
}

function ensureId(state, socket) {
  if (state.id) return state.id
  state.id = nanoid(8)
  users[state.id] = socket
  states[state.id] = state
  socket.emit('init', { id: state.id })
  return state.id
}

/**
 * Same tab reconnected (Wi‑Fi blip, background → foreground) before the old socket timed out.
 * Hand the seat over instead of minting a fresh "Гость" that lingers as a black tile.
 */
function adoptSeat(requested, state, socket) {
  const prevSocket = users[requested]
  const prev = states[requested]
  if (prevSocket && prevSocket !== socket && prev) {
    state.currentRoom = prev.currentRoom
    state.email = prev.email
    state.deviceId = prev.deviceId
    if (prev.deviceId) socket.data.deviceId = prev.deviceId
    // Detach the stale state so its late 'disconnect' is a no-op.
    prev.id = null
    prev.currentRoom = null
    prev.email = null
    try { prevSocket.disconnect(true) } catch { /* ignore */ }
  }
  state.id = requested
  users[requested] = socket
  states[requested] = state
  const room = state.currentRoom ? rooms[state.currentRoom] : null
  if (room && room.participants.includes(requested)) {
    socket.join(state.currentRoom)
  } else {
    state.currentRoom = null
  }
}

function rateLimit(bucket, key, max, windowMs) {
  const now = Date.now()
  const item = bucket[key] || { count: 0, from: now }
  if (now - item.from > windowMs) {
    item.count = 0
    item.from = now
  }
  item.count += 1
  bucket[key] = item
  return item.count <= max
}

export default function initSocket(socket) {
  const state = { id: null, currentRoom: null, email: null, socket }
  const limits = {}

  socket
    .on('init', (data = {}) => {
      const requested = typeof data.id === 'string' && ID_RE.test(data.id) ? data.id : null
      if (requested) {
        if (state.id && state.id !== requested) {
          delete users[state.id]
          delete states[state.id]
        }
        adoptSeat(requested, state, socket)
      } else if (!state.id) {
        state.id = nanoid(8)
        users[state.id] = socket
        states[state.id] = state
      }
      socket.emit('init', { id: state.id })
    })
    .on('createRoom', (data = {}) => {
      ensureId(state, socket)
      const type = data.type === 'text' ? 'text' : 'video'
      const roomId = nanoid(10)
      const room = emptyRoom(type, state.id)
      room.participants = [state.id]
      room.names[state.id] = sanitizeName(data.name) || state.id
      rememberDevice(room, state.id, data.deviceId, socket)
      rooms[roomId] = room
      state.currentRoom = roomId
      socket.join(roomId)
      socket.emit('roomCreated', { roomId, roomInfo: getRoomInfo(roomId) })
    })
    .on('joinRoom', (data = {}) => {
      ensureId(state, socket)
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!ROOM_RE.test(roomId)) {
        socket.emit('roomError', { message: 'Комната не найдена / Room not found' })
        return
      }

      if (!rooms[roomId]) {
        rooms[roomId] = emptyRoom('video', state.id)
      }
      const room = rooms[roomId]
      if (!room.waiting) room.waiting = Object.create(null)

      const name = sanitizeName(data.name) || state.id

      if (state.currentRoom && state.currentRoom !== roomId) {
        leaveRoom(state)
      }

      // Already inside → rejoin
      if (room.participants.includes(state.id)) {
        room.names[state.id] = name
        rememberDevice(room, state.id, data.deviceId, socket)
        room.emptyAt = 0
        state.currentRoom = roomId
        socket.join(roomId)
        socket.emit('roomJoined', {
          roomId,
          status: 'joined',
          roomInfo: getRoomInfo(roomId),
          chat: room.chat || []
        })
        return
      }

      // Empty room → first person is host (no knock)
      if (room.participants.length === 0) {
        room.host = state.id
        room.participants = [state.id]
        room.names[state.id] = name
        rememberDevice(room, state.id, data.deviceId, socket)
        room.waiting = Object.create(null)
        room.emptyAt = 0
        state.currentRoom = roomId
        socket.join(roomId)
        socket.emit('roomJoined', {
          roomId,
          status: 'joined',
          roomInfo: getRoomInfo(roomId),
          chat: room.chat || []
        })
        return
      }

      if (room.participants.length >= MAX_PARTICIPANTS) {
        socket.emit('roomError', { message: 'Комната заполнена / Room is full' })
        return
      }

      room.participants.push(state.id)
      room.names[state.id] = name
      rememberDevice(room, state.id, data.deviceId, socket)
      room.emptyAt = 0
      state.currentRoom = roomId
      socket.join(roomId)
      emitToRoom(roomId, 'userJoined', {
        userId: state.id,
        roomInfo: getRoomInfo(roomId)
      }, socket)
      socket.emit('roomJoined', {
        roomId,
        status: 'joined',
        roomInfo: getRoomInfo(roomId),
        chat: room.chat || []
      })
    })
    .on('mediaReady', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || !state.id || !room.participants.includes(state.id)) return
      // `session` changes when the tab reloads → peers know to rebuild their RTCPeerConnection.
      const session = typeof data?.session === 'string' ? data.session.slice(0, 16) : ''
      emitToRoom(state.currentRoom, 'peerMediaReady', {
        userId: state.id,
        session,
        roomInfo: getRoomInfo(state.currentRoom)
      }, socket)
    })
    .on('mediaState', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || !state.id || !room.participants.includes(state.id)) return
      if (!room.media) room.media = Object.create(null)
      const next = { audio: data?.audio !== false, video: data?.video !== false }
      room.media[state.id] = next
      emitToRoom(state.currentRoom, 'peerMediaState', { userId: state.id, ...next }, socket)
    })
    .on('reaction', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || !state.id || !room.participants.includes(state.id)) return
      if (!rateLimit(limits, 'reaction', 30, 60_000)) return
      const kind = typeof data?.kind === 'string' ? data.kind.slice(0, 16) : ''
      if (!/^[a-z]+$/.test(kind)) return
      emitToRoom(state.currentRoom, 'reaction', { from: state.id, kind }, socket)
    })
    .on('requestJoin', (data = {}) => {
      // Second (nth) attempt after deny — same as knocking again
      ensureId(state, socket)
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : state.currentRoom
      const room = rooms[roomId]
      if (!room || room.type !== 'video') return
      if (room.participants.includes(state.id)) return
      if (room.participants.length >= MAX_PARTICIPANTS) {
        socket.emit('roomError', { message: 'Комната заполнена / Room is full' })
        return
      }
      const name = sanitizeName(data.name) || room.waiting?.[state.id]?.name || state.id
      if (!room.waiting) room.waiting = Object.create(null)
      room.waiting[state.id] = { name, at: Date.now() }
      state.currentRoom = roomId
      socket.emit('joinPending', {
        roomId,
        hostName: room.names[room.host] || room.host,
        roomInfo: getRoomInfo(roomId)
      })
      emit(room.host, 'joinRequest', {
        userId: state.id,
        name,
        roomInfo: getRoomInfo(roomId)
      })
    })
    .on('admitJoin', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || state.id !== room.host) return
      const userId = typeof data.userId === 'string' ? data.userId : ''
      const waiting = room.waiting?.[userId]
      if (!waiting) return
      if (room.participants.length >= MAX_PARTICIPANTS) {
        socket.emit('roomError', { message: 'Комната заполнена / Room is full' })
        return
      }

      delete room.waiting[userId]
      room.participants.push(userId)
      room.names[userId] = waiting.name || userId
      room.emptyAt = 0

      const guest = users[userId]
      guest?.join(state.currentRoom)

      const info = getRoomInfo(state.currentRoom)
      guest?.emit('roomJoined', {
        roomId: state.currentRoom,
        status: 'joined',
        roomInfo: info,
        chat: room.chat || []
      })
      emitToRoom(state.currentRoom, 'userJoined', {
        userId,
        roomInfo: info
      })
      socket.emit('waitingUpdated', { roomInfo: info })
    })
    .on('denyJoin', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || state.id !== room.host) return
      const userId = typeof data.userId === 'string' ? data.userId : ''
      if (!room.waiting?.[userId]) return
      delete room.waiting[userId]
      emit(userId, 'joinDenied', {
        roomId: state.currentRoom,
        hostName: room.names[room.host] || room.host
      })
      socket.emit('waitingUpdated', { roomInfo: getRoomInfo(state.currentRoom) })
    })
    .on('leaveRoom', () => leaveRoom(state))
    .on('startCall', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || room.type !== 'video' || !state.id) return
      if (room.participants.length < 2) {
        socket.emit('roomError', { message: 'Нужен ещё один участник / Need another participant' })
        return
      }

      room.call = { active: true, callerId: state.id, inCall: [state.id] }
      emitToRoom(state.currentRoom, 'incomingCall', {
        from: state.id,
        fromName: room.names[state.id] || state.id,
        video: data.video !== false,
        roomInfo: getRoomInfo(state.currentRoom)
      }, socket)
      socket.emit('callRinging', { roomInfo: getRoomInfo(state.currentRoom) })
    })
    .on('acceptCall', () => {
      const room = rooms[state.currentRoom]
      if (!room?.call.active || !state.id) return
      if (!room.call.inCall.includes(state.id)) {
        room.call.inCall.push(state.id)
      }
      emitToRoom(state.currentRoom, 'callAccepted', {
        userId: state.id,
        userName: room.names[state.id] || state.id,
        callerId: room.call.callerId,
        roomInfo: getRoomInfo(state.currentRoom)
      })
    })
    .on('rejectCall', () => {
      const room = rooms[state.currentRoom]
      if (!room?.call.active || !state.id) return
      emitToRoom(state.currentRoom, 'callRejected', {
        userId: state.id,
        callerId: room.call.callerId,
        roomInfo: getRoomInfo(state.currentRoom)
      }, socket)
    })
    .on('endCall', () => {
      const room = rooms[state.currentRoom]
      if (!room || !state.id) return
      room.call.inCall = room.call.inCall.filter((userId) => userId !== state.id)
      emitToRoom(state.currentRoom, 'userHungUp', {
        userId: state.id,
        roomInfo: getRoomInfo(state.currentRoom)
      }, socket)

      if (room.call.inCall.length === 0) {
        room.call = { active: false, callerId: null, inCall: [] }
        if (room.type === 'video') {
          clearChat(room)
          emitToRoom(state.currentRoom, 'callEnded', {
            chatCleared: true,
            roomInfo: getRoomInfo(state.currentRoom)
          })
        }
      }
    })
    .on('chatMessage', (data = {}) => {
      const room = rooms[state.currentRoom]
      if (!room || !state.id) return
      // Meet-style: chat works whenever people are in the room (no "call" gate)
      if (!rateLimit(limits, 'chat', 40, 60_000)) return

      const text = sanitizeText(data.text)
      if (!text.trim()) return

      const message = {
        id: typeof data.id === 'string' && data.id.slice(0, 24) || nanoid(8),
        from: state.id,
        fromName: room.names[state.id] || state.id,
        text,
        ts: Date.now()
      }
      pushMessage(room, message)
      const roomId = state.currentRoom
      emitToRoom(roomId, 'chatMessage', { message }, socket)
      // Watchers (app open on home, not in room) also get the message for unread badges.
      socket.to(`watch:${roomId}`).emit('chatMessage', { message, roomId })
      // Offline push for devices subscribed to this room but not currently in it.
      const inRoomDevices = Object.values(room.deviceIds || {}).filter(Boolean)
      sendChatPush(roomId, {
        fromName: message.fromName,
        text: message.text,
        skipDevices: inRoomDevices
      }).catch(() => {})
    })
    .on('watchRoom', (data = {}) => {
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!ROOM_RE.test(roomId)) return
      const deviceId = typeof data.deviceId === 'string' ? data.deviceId.trim() : ''
      if (/^[a-z0-9]{8,32}$/.test(deviceId)) {
        state.deviceId = deviceId
        socket.data.deviceId = deviceId
      }
      socket.data.watching = roomId
      socket.join(`watch:${roomId}`)

      // Late watcher while a ring is active → ring them now (phone opened after the call started).
      const active = activeRings[roomId]
      const room = rooms[roomId]
      if (active && room && !room.participants.includes(state.id)) {
        const inRoomDevices = new Set(Object.values(room.deviceIds || {}).filter(Boolean))
        if (!deviceId || !inRoomDevices.has(deviceId)) {
          socket.emit('incomingRing', {
            roomId,
            ringId: active.ringId,
            fromName: active.fromName,
            from: active.from
          })
        }
      }
    })
    .on('getRingTargets', (_data, ack) => {
      const done = typeof ack === 'function' ? ack : () => {}
      const roomId = state.currentRoom
      if (!roomId || !rooms[roomId]) {
        done({ names: [] })
        return
      }
      const names = listRingTargets(roomId)
      done({ names, roomId })
      socket.emit('ringTargets', { roomId, names })
    })
    .on('unwatchRoom', (data = {}) => {
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!ROOM_RE.test(roomId)) return
      if (socket.data.watching === roomId) socket.data.watching = null
      socket.leave(`watch:${roomId}`)
    })
    .on('ringRoom', async (_data, ack) => {
      const done = typeof ack === 'function' ? ack : () => {}
      const room = rooms[state.currentRoom]
      if (!room || !state.id) {
        done({ sent: 0, total: 0 })
        return
      }
      if (!rateLimit(limits, 'ring', 1, 10_000)) {
        done({ sent: 0, total: 0, error: 'slow' })
        return
      }
      const roomId = state.currentRoom
      const fromName = room.names[state.id] || 'Участник'
      const ringId = nanoid(10)
      const inRoomDevices = new Set(Object.values(room.deviceIds || {}).filter(Boolean))
      activeRings[roomId] = {
        ringId,
        from: state.id,
        fromName,
        at: Date.now()
      }
      // Auto-expire unanswered rings after 45s
      setTimeout(() => {
        if (activeRings[roomId]?.ringId === ringId) {
          cancelActiveRing(roomId, { by: 'timeout', socket }).catch(() => {})
        }
      }, 45_000)
      try {
        const watchers = await socket.server.in(`watch:${roomId}`).fetchSockets()
        const online = watchers.filter((peer) => {
          if (peer.id === socket.id) return false
          if (peer.rooms.has(roomId)) return false
          const deviceId = peer.data?.deviceId
          if (deviceId && inRoomDevices.has(deviceId)) return false
          return true
        }).length

        const result = await sendRing(roomId, {
          fromName,
          ringId,
          skipDevices: [...inRoomDevices]
        })
        socket.to(`watch:${roomId}`).emit('incomingRing', {
          roomId,
          ringId,
          fromName,
          from: state.id
        })
        const ringTargets = listRingTargets(roomId, { skipDevices: [...inRoomDevices] })
        done({
          sent: Math.max(result.sent || 0, online),
          // reachable = other devices (push subs not in room) + online watchers
          others: Math.max(result.others || 0, online),
          total: Math.max(result.total || 0, online),
          participants: room.participants.length,
          pushed: result.sent || 0,
          online,
          ringId,
          ringTargets
        })
      } catch (error) {
        console.error('ring failed', error)
        delete activeRings[roomId]
        done({ sent: 0, total: 0, error: 'failed' })
      }
    })
    .on('cancelRing', async (_data, ack) => {
      const done = typeof ack === 'function' ? ack : () => {}
      const roomId = state.currentRoom
      if (!roomId || !activeRings[roomId]) {
        done({ ok: false })
        return
      }
      if (activeRings[roomId].from !== state.id) {
        done({ ok: false, error: 'forbidden' })
        return
      }
      await cancelActiveRing(roomId, { by: state.id, socket })
      done({ ok: true })
    })
    .on('answerRing', (data = {}, ack) => {
      const done = typeof ack === 'function' ? ack : () => {}
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      const ringId = typeof data.ringId === 'string' ? data.ringId.trim() : ''
      if (!ROOM_RE.test(roomId)) {
        done({ ok: false, error: 'gone' })
        return
      }
      const active = activeRings[roomId]
      const room = rooms[roomId]
      if (!active || (ringId && active.ringId !== ringId)) {
        done({ ok: false, error: 'cancelled' })
        return
      }
      if (!room || room.participants.length === 0) {
        delete activeRings[roomId]
        done({ ok: false, error: 'empty' })
        return
      }
      // Accept consumes the ring so others stop.
      delete activeRings[roomId]
      sendCancelRing(roomId, {
        ringId: active.ringId,
        skipDevices: Object.values(room.deviceIds || {}).filter(Boolean)
      }).catch(() => {})
      socket.to(`watch:${roomId}`).emit('ringCancelled', {
        roomId,
        ringId: active.ringId,
        by: 'answered'
      })
      done({ ok: true, roomId, ringId: active.ringId })
    })
    .on('ringDeclined', async (data = {}) => {
      const roomId = typeof data.roomId === 'string' ? data.roomId.trim() : ''
      if (!ROOM_RE.test(roomId)) return
      if (!rateLimit(limits, 'decline', 5, 10_000)) return
      const name = sanitizeName(data.name) || 'Участник'
      // Stop caller's ringback + clear push loop for everyone.
      await cancelActiveRing(roomId, { by: name, socket })
      emitToRoom(roomId, 'ringDeclined', { name })
    })
    .on('identify', ({ token } = {}) => {
      const session = getSession(token)
      if (!session) return
      state.email = session.email
      bindSocket(session.email, socket)
    })
    .on('mailMessage', ({ chatId, message } = {}) => {
      if (!state.email || !chatId || !message?.boxes) return
      const chat = getChat(chatId, state.email)
      if (!chat) return
      notifyMembers(chatId, state.email, 'mailMessage', {
        message,
        users: lookupUsers(chat.members)
      })
    })
    .on('startChatCall', ({ chatId } = {}) => {
      if (!state.email || !state.id) return
      const chat = getChat(chatId, state.email)
      if (!chat) return
      const roomId = chat.roomId
      if (!rooms[roomId]) {
        rooms[roomId] = emptyRoom('video', state.id)
      }
      notifyMembers(chatId, state.email, 'familyCall', {
        from: state.id,
        fromName: state.email,
        roomId,
        chatId
      })
    })
    .on('request', (data) => {
      if (!data?.to || !users[data.to]) return
      emit(data.to, 'request', { from: state.id })
    })
    .on('call', (data) => {
      if (!data?.to || !users[data.to]) return
      emit(data.to, 'call', { ...data, from: state.id })
    })
    .on('end', (data) => {
      if (!data?.to) return
      emit(data.to, 'end')
    })
    .on('disconnect', () => {
      leaveRoom(state)
      if (state.email) unbindSocket(state.email, socket)
      if (state.id && users[state.id] === socket) {
        delete users[state.id]
        delete states[state.id]
      }
    })
}
