const KEY = 'vc-unread'

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function write(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function getUnread(roomId) {
  return Number(read()[roomId] || 0) || 0
}

export function bumpUnread(roomId, by = 1) {
  if (!roomId) return 0
  const map = read()
  map[roomId] = (Number(map[roomId]) || 0) + by
  write(map)
  return map[roomId]
}

export function clearUnread(roomId) {
  if (!roomId) return
  const map = read()
  delete map[roomId]
  write(map)
}

export function allUnread() {
  return read()
}
