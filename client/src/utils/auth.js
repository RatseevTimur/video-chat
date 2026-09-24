const SESSION = 'vc-session'

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION) || 'null')
  } catch {
    return null
  }
}

export function setSession(session) {
  localStorage.setItem(SESSION, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION)
}

export function authHeaders() {
  const session = getSession()
  return session?.token ? { Authorization: `Bearer ${session.token}` } : {}
}

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg = data.detail ? `${data.error}: ${data.detail}` : (data.error || 'Ошибка / Error')
    throw new Error(msg)
  }
  return data
}
