import { randomId } from './session'

const LIST_KEY = 'vc-rooms'
const FAMILY_KEY = 'vc-family-room'
const ROOM_RE = /^[A-Za-z0-9_-]{6,16}$/

function readList() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIST_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeList(list) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, 24)))
  } catch {
    // ignore private mode
  }
}

export function familyRoom() {
  let id = ''
  try { id = localStorage.getItem(FAMILY_KEY) || '' } catch { /* ignore */ }
  if (!ROOM_RE.test(id)) {
    id = `fam${randomId(8)}`
    try { localStorage.setItem(FAMILY_KEY, id) } catch { /* ignore */ }
  }
  return { id, title: 'Семья', family: true }
}

export function listRooms() {
  const family = familyRoom()
  const rest = readList().filter((item) => item?.id && item.id !== family.id && ROOM_RE.test(item.id))
  return [family, ...rest]
}

export function rememberRoom(roomId, { title = '', family = false } = {}) {
  if (!ROOM_RE.test(String(roomId || ''))) return
  const familyId = familyRoom().id
  if (roomId === familyId || family) {
    try { localStorage.setItem(FAMILY_KEY, roomId) } catch { /* ignore */ }
    return
  }
  const titleClean = String(title || 'Комната').replace(/[<>]/g, '').trim().slice(0, 24) || 'Комната'
  const next = readList().filter((item) => item.id !== roomId)
  next.unshift({ id: roomId, title: titleClean, family: false })
  writeList(next)
}
