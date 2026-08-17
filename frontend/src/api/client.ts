const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'
const TOKEN_STORAGE_KEY = 'pm.token'

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
    // Abgelaufenes/ungültiges Token (z.B. nach Ablauf von JWT_EXPIRY_MINUTES) - ohne diesen
    // Reset würde jede weitere Anfrage wieder 401 liefern und der Nutzer bliebe auf einer Seite
    // hängen, die dauerhaft "lädt", statt zum Login geschickt zu werden.
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem('pm.username')
    localStorage.removeItem('pm.displayName')
    localStorage.removeItem('pm.roles')
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
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
