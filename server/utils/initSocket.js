import { nanoid } from 'nanoid'

const users = {} // userId -> socket
const rooms = {} // roomId -> { participants: [userId], host: userId }

// функция принимает сокет
export default function initSocket(socket) {
    let id
    let currentRoom = null

    // функция принимает `id` адресата, тип события и полезную нагрузку - данные для передачи
    const emit = (userId, event, data) => {
        // определяем получателя
        const receiver = users[userId]
        if (receiver) {
            // вызываем событие
            receiver.emit(event, data)
        }
    }

    // функция для отправки сообщения всем в комнате
    const emitToRoom = (roomId, event, data, excludeSocket = null) => {
        const room = rooms[roomId]
        if (room) {
            room.participants.forEach(userId => {
                const userSocket = users[userId]
                if (userSocket && userSocket !== excludeSocket) {
                    userSocket.emit(event, data)
                }
            })
        }
    }

    // функция для получения информации о комнате
    const getRoomInfo = (roomId) => {
        const room = rooms[roomId]
        if (!room) return null
        
        return {
            roomId,
            participants: room.participants,
            host: room.host,
            participantCount: room.participants.length
        }
    }

    socket
        .on('init', () => {
            id = nanoid(5)
            users[id] = socket
            console.log(id, 'connected')
            socket.emit('init', { id })
        })
        .on('createRoom', () => {
            const roomId = nanoid(8)
            rooms[roomId] = {
                participants: [id],
                host: id,
                createdAt: Date.now()
            }
            currentRoom = roomId
            socket.join(roomId)
            console.log(`Room ${roomId} created by ${id}`)
            socket.emit('roomCreated', { roomId, roomInfo: getRoomInfo(roomId) })
        })
        .on('joinRoom', (data) => {
            const { roomId } = data
            const room = rooms[roomId]
            
            if (room) {
                // Проверяем, не находится ли пользователь уже в комнате
                if (!room.participants.includes(id)) {
                    room.participants.push(id)
                    currentRoom = roomId
                    socket.join(roomId)
                    console.log(`${id} joined room ${roomId}`)
                    
                    // Уведомляем всех в комнате о новом участнике
                    emitToRoom(roomId, 'userJoined', { 
                        userId: id, 
                        roomId,
                        roomInfo: getRoomInfo(roomId)
                    })
                    
                    // Отправляем информацию о комнате новому пользователю
                    socket.emit('roomJoined', { 
                        roomId, 
                        roomInfo: getRoomInfo(roomId)
                    })
                } else {
                    // Пользователь уже в комнате, просто отправляем информацию
                    currentRoom = roomId
                    socket.join(roomId)
                    socket.emit('roomJoined', { 
                        roomId, 
                        roomInfo: getRoomInfo(roomId)
                    })
                }
            } else {
                socket.emit('roomError', { message: 'Room not found' })
            }
        })
        .on('leaveRoom', () => {
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom]
                room.participants = room.participants.filter(userId => userId !== id)
                
                // Уведомляем остальных участников
                emitToRoom(currentRoom, 'userLeft', { 
                    userId: id,
                    roomInfo: getRoomInfo(currentRoom)
                })
                
                // Если комната пустая, удаляем её
                if (room.participants.length === 0) {
                    delete rooms[currentRoom]
                    console.log(`Room ${currentRoom} deleted`)
                } else {
                    // Если хост покинул комнату, назначаем нового хоста
                    if (room.host === id) {
                        room.host = room.participants[0]
                        emitToRoom(currentRoom, 'hostChanged', { 
                            newHost: room.host,
                            roomInfo: getRoomInfo(currentRoom)
                        })
                    }
                }
                
                socket.leave(currentRoom)
                currentRoom = null
                console.log(`${id} left room`)
            }
        })
        .on('request', (data) => {
            emit(data.to, 'request', { from: id })
        })
        .on('call', (data) => {
            emit(data.to, 'call', { ...data, from: id })
        })
        .on('end', (data) => {
            emit(data.to, 'end')
        })
        .on('disconnect', () => {
            // Пользователь покидает комнату при отключении
            if (currentRoom && rooms[currentRoom]) {
                const room = rooms[currentRoom]
                room.participants = room.participants.filter(userId => userId !== id)
                
                emitToRoom(currentRoom, 'userLeft', { 
                    userId: id,
                    roomInfo: getRoomInfo(currentRoom)
                })
                
                if (room.participants.length === 0) {
                    delete rooms[currentRoom]
                    console.log(`Room ${currentRoom} deleted`)
                } else {
                    // Если хост отключился, назначаем нового хоста
                    if (room.host === id) {
                        room.host = room.participants[0]
                        emitToRoom(currentRoom, 'hostChanged', { 
                            newHost: room.host,
                            roomInfo: getRoomInfo(currentRoom)
                        })
                    }
                }
            }
            
            delete users[id]
            console.log(id, 'disconnected')
        })
}