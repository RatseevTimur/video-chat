import { nanoid } from 'nanoid'

import { bindSocket, getChat, getSession, lookupUsers, notifyMembers, unbindSocket } from './messenger.js'

const users = {}
const rooms = {}

const ID_RE = /^[A-Za-z0-9_-]{4,16}$/
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/
const MAX_NAME = 24
const MAX_MSG = 2000
const MAX_CHAT = 60
const MAX_PARTICIPANTS = 8
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
  return {
    roomId,
    type: room.type,
    participants: room.participants,
    names: room.names,
    host: room.host,
    participantCount: room.participants.length,
    callActive: Boolean(room.call.active),
    inCall: room.call.inCall
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

function leaveRoom(socketState) {
  const { id, currentRoom, socket } = socketState
  if (!currentRoom || !rooms[currentRoom]) {
    socketState.currentRoom = null
    return
  }

  const room = rooms[currentRoom]
  room.participants = room.participants.filter((userId) => userId !== id)
  room.call.inCall = room.call.inCall.filter((userId) => userId !== id)
  delete room.names[id]

  emitToRoom(currentRoom, 'userLeft', {
    userId: id,
    roomInfo: getRoomInfo(currentRoom)
  }, socket)

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
  } else if (room.host === id) {
    room.host = room.participants[0]
    emitToRoom(currentRoom, 'hostChanged', {
      newHost: room.host,
      roomInfo: getRoomInfo(currentRoom)
    })
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
  socket.emit('init', { id: state.id })
  return state.id
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
      if (requested && (!users[requested] || users[requested] === socket)) {
        state.id = requested
      } else {
        state.id = nanoid(8)
      }
      users[state.id] = socket
      socket.emit('init', { id: state.id })
    })
    .on('createRoom', (data = {}) => {
      ensureId(state, socket)
      const type = data.type === 'text' ? 'text' : 'video'
      const roomId = nanoid(10)
      rooms[roomId] = {
        type,
        participants: [state.id],
        names: { [state.id]: sanitizeName(data.name) || state.id },
        host: state.id,
        createdAt: Date.now(),
        call: { active: false, callerId: null, inCall: [] },
        chat: [],
        chatExpiresAt: 0
      }
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
        rooms[roomId] = {
          type: 'video',
          participants: [],
          names: {},
          host: state.id,
          createdAt: Date.now(),
          call: { active: false, callerId: null, inCall: [] },
          chat: [],
          chatExpiresAt: 0
        }
      }

      const room = rooms[roomId]
      if (room.participants.length >= MAX_PARTICIPANTS && !room.participants.includes(state.id)) {
        socket.emit('roomError', { message: 'Комната заполнена / Room is full' })
        return
      }

      if (state.currentRoom && state.currentRoom !== roomId) {
        leaveRoom(state)
      }

      if (!room.participants.includes(state.id)) {
        room.participants.push(state.id)
      }
      room.names[state.id] = sanitizeName(data.name) || state.id
      room.emptyAt = 0
      state.currentRoom = roomId
      socket.join(roomId)

      emitToRoom(roomId, 'userJoined', {
        userId: state.id,
        roomInfo: getRoomInfo(roomId)
      }, socket)

      socket.emit('roomJoined', {
        roomId,
        roomInfo: getRoomInfo(roomId),
        chat: room.type === 'text' || room.call.active ? room.chat : []
      })
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
      if (room.type === 'video' && !room.call.active) return
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
      emitToRoom(state.currentRoom, 'chatMessage', { message }, socket)
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
        rooms[roomId] = {
          type: 'video',
          participants: [],
          names: {},
          host: state.id,
          createdAt: Date.now(),
          call: { active: false, callerId: null, inCall: [] },
          chat: [],
          chatExpiresAt: 0
        }
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
      if (state.id) delete users[state.id]
    })
}
