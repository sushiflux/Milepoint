const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_STORAGE_KEY = 'pm.token'

// AuthContext listens for this to show a non-destructive "please log back in" prompt on top of
// whatever page is open, instead of this module hard-navigating to /login itself (which used to
// instantly unmount the whole app - losing any in-progress unsaved work, like a half-typed
// Kanban card, the moment a background request happened to 401).
export const SESSION_EXPIRED_EVENT = 'milepoint:session-expired'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })

  if (response.status === 401) {
    // Abgelaufenes/ungültiges Token (z.B. nach Ablauf von JWT_EXPIRY_MINUTES). The token/roles
    // are deliberately left in storage here - AuthContext's modal overwrites them with a fresh
    // token on successful re-login, or clears them on explicit logout. Removing them here (and
    // hard-navigating) previously wiped the whole page's in-memory state, including anything the
    // user hadn't saved yet.
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(response.status, text || response.statusText)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
