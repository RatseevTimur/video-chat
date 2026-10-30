/**
 * App navigation follows the route tree, not free browser history.
 * Max depth ≈ parent → child (e.g. / → /room/:id). Back always goes to the parent.
 */

const ROOTS = new Set(['/', '/guest', '/family'])

export function parentPath(pathname, search = '') {
  const path = String(pathname || '/')
  if (path.startsWith('/room/')) {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    if (params.get('family') === '1') return '/family'
    return '/'
  }
  if (/^\/family\/chat\//.test(path) || /^\/chat\//.test(path)) return '/family'
  if (path === '/masks' || path === '/call' || path === '/guest' || path === '/family') return '/'
  return null
}

export function isRootPath(pathname) {
  return ROOTS.has(String(pathname || '/'))
}

function samePath(a, b) {
  if (a === b) return true
  if ((a === '/' || a === '/guest') && (b === '/' || b === '/guest')) return true
  return false
}

/** Enter a room: one push from a root screen; replace when switching rooms (no sibling stack). */
export function enterRoom(navigate, roomId, { family = false, replace = false } = {}) {
  const id = String(roomId || '').trim()
  if (!id) return
  const target = family ? `/room/${id}?family=1` : `/room/${id}`
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  const onRoom = path.startsWith('/room/')
  const fromRoot = isRootPath(path)
  // From lobby/family home → push once so Back = parent. From another room → replace.
  navigate(target, { replace: replace || onRoom || !fromRoot })
}

/** Leave current screen to its route-tree parent (replace — do not push another lobby entry). */
export function goAppBack(navigate, { pathname, search } = {}) {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/')
  const q = search ?? (typeof window !== 'undefined' ? window.location.search : '')
  const parent = parentPath(path, q)
  if (parent == null) return false
  navigate(parent, { replace: true })
  return true
}

/**
 * After a browser/Android POP: snap to the route-tree parent of the screen we left.
 * Never reopen an old sibling room from history.
 */
export function resolveTreeBack(prev, landed) {
  const fromParent = parentPath(prev.pathname, prev.search)
  if (fromParent != null) {
    if (!samePath(landed.pathname, fromParent)) {
      return fromParent
    }
    return null
  }
  // Left a root via Back — refuse to land on nested history entries.
  if (parentPath(landed.pathname, landed.search) != null) {
    return '/'
  }
  return null
}
