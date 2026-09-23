const ID_KEY = 'vc-id'
const NAME_KEY = 'vc-name'

export function getStoredId() {
  try {
    let id = sessionStorage.getItem(ID_KEY)
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      sessionStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  }
}

export function getStoredName() {
  try {
    return localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

export function setStoredName(name) {
  const clean = String(name || '').trim().slice(0, 24)
  try {
    localStorage.setItem(NAME_KEY, clean)
  } catch {
    // ignore quota / private mode
  }
  return clean
}
