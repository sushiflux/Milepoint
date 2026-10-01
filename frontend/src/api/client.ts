const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_STORAGE_KEY = 'pm.token'

// AuthContext listens for this (a protected request came back 401 = the session expired), clears the
// login and lets RequireAuth send the user to the login page with a return path.
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

async function performFetch(path: string, options: RequestInit, headers: Headers): Promise<Response> {
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })

  // Sliding session: while the user is working the server hands out a fresh token before the old
  // one runs out (X-Refreshed-Token, see Program.cs) - swap it in, so only an idle session expires.
  const refreshedToken = response.headers.get('X-Refreshed-Token')
  if (refreshedToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, refreshedToken)
  }

  // A 401 on a protected endpoint means the session ran out (JWT_EXPIRY_MINUTES of inactivity). A
  // wrong password at login / register is a 401 too, but that is just a failed login, not an
  // expired session. AuthContext reacts by clearing the login and sending the user to the normal
  // login page (and back to this page after logging in). Everything the user did is already saved
  // - every action is persisted on its own (Notes autosave), nothing waits for a Save button.
  if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new ApiError(response.status, text || response.statusText)
  }

  return response
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')

  const response = await performFetch(path, options, headers)

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

// For multipart/form-data uploads (e.g. audio blobs for /api/transcribe) - deliberately does NOT
// set Content-Type itself, since the browser must generate the multipart boundary from the
// FormData body; setting it manually would produce a malformed request the server can't parse.
export async function apiFetchMultipart<T>(path: string, formData: FormData): Promise<T> {
  const headers = new Headers()
  const response = await performFetch(path, { method: 'POST', body: formData }, headers)
  return (await response.json()) as T
}
