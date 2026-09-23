const KEYS = 'vc-e2e-keys'
const ECDH = { name: 'ECDH', namedCurve: 'P-256' }

const b64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let text = ''
  bytes.forEach((byte) => { text += String.fromCharCode(byte) })
  return btoa(text)
}

const fromB64 = (text) => {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export async function loadOrCreateKeys() {
  const saved = localStorage.getItem(KEYS)
  if (saved) return JSON.parse(saved)
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveKey'])
  const keys = {
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey)
  }
  localStorage.setItem(KEYS, JSON.stringify(keys))
  return keys
}

export function exportBackup() {
  return localStorage.getItem(KEYS) || ''
}

export function importBackup(raw) {
  const keys = JSON.parse(raw)
  if (!keys?.publicJwk || !keys?.privateJwk) throw new Error('bad key')
  localStorage.setItem(KEYS, JSON.stringify(keys))
  return keys
}

async function sharedAes(publicJwk, privateJwk, usage) {
  const theirPub = await crypto.subtle.importKey('jwk', publicJwk, ECDH, false, [])
  const myPriv = await crypto.subtle.importKey('jwk', privateJwk, ECDH, false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPub },
    myPriv,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

export async function encryptFor(publicJwk, privateJwk, text) {
  const key = await sharedAes(publicJwk, privateJwk, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  )
  return { iv: b64(iv), ct: b64(ct) }
}

export async function decryptFrom(publicJwk, privateJwk, box) {
  const key = await sharedAes(publicJwk, privateJwk, 'decrypt')
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(box.iv) },
    key,
    fromB64(box.ct)
  )
  return new TextDecoder().decode(pt)
}

export async function sealForMembers(members, privateJwk, text) {
  const boxes = {}
  await Promise.all(members.map(async (member) => {
    if (!member.publicJwk || !member.email) return
    boxes[member.email] = await encryptFor(member.publicJwk, privateJwk, text)
  }))
  return boxes
}

export async function openBox(boxes, myEmail, senderPublicJwk, privateJwk) {
  const mine = boxes?.[myEmail]
  if (!mine || !senderPublicJwk) return null
  try {
    return await decryptFrom(senderPublicJwk, privateJwk, mine)
  } catch {
    return null
  }
}
