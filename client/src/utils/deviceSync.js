import { getDeviceId } from './push'
import { listRooms, rememberRoom } from './rooms'
import { getStoredName, setStoredName } from './session'

/** Push local rooms to the server keyed by this device. */
export async function pushDeviceRooms(name = getStoredName()) {
  const deviceId = getDeviceId()
  const rooms = listRooms().map((room) => ({
    id: room.id,
    title: room.title,
    family: Boolean(room.family)
  }))
  try {
    const res = await fetch('/api/device/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, name: name || '', rooms })
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

/** Pull rooms bound to this device and merge into local storage. */
export async function pullDeviceRooms() {
  const deviceId = getDeviceId()
  try {
    const res = await fetch(`/api/device/rooms?deviceId=${encodeURIComponent(deviceId)}`)
    if (!res.ok) return listRooms()
    const data = await res.json()
    if (data?.name) setStoredName(data.name)
    ;(data?.rooms || []).forEach((room) => {
      rememberRoom(room.id, { title: room.title, family: room.family })
    })
    return listRooms()
  } catch {
    return listRooms()
  }
}

export async function syncDeviceNow(name) {
  await pushDeviceRooms(name)
  return pullDeviceRooms()
}
