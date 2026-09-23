const ID_KEY = 'vc-id'
const NAME_KEY = 'vc-name'

/** Works on http://IP too (randomUUID needs a secure context). */
export function randomId(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(length)
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ''
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function getStoredId() {
  try {
    let id = sessionStorage.getItem(ID_KEY)
    if (!id) {
      id = randomId(8)
      sessionStorage.setItem(ID_KEY, id)
    }
    return id
  } catch {
    return randomId(8)
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

export function isSecureAppContext() {
  return Boolean(globalThis.isSecureContext && globalThis.crypto?.subtle)
}
