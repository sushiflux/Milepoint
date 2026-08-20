import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'

// Shown on top of whatever page is open when a request comes back 401 (session expired while
// idle) - deliberately doesn't navigate or unmount anything underneath, so an in-progress,
// not-yet-saved change (e.g. a half-typed Kanban card) survives logging back in.
export default function SessionExpiredModal() {
  const { sessionExpired, username, signIn, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  if (!sessionExpired) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!username) return
    setError(null)
    setBusy(true)
    try {
      const response = await login(username, password)
      signIn(response.token, response.username, response.displayName, response.roles)
      setPassword('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Anmeldung fehlgeschlagen.' : 'Unbekannter Fehler.')
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    signOut()
    navigate('/login')
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="glass w-full max-w-sm space-y-4 rounded-2xl p-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Sitzung abgelaufen</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bitte melde dich erneut an, um weiterzuarbeiten. Was du gerade eingegeben hast, bleibt dabei erhalten.
          </p>
        </div>

        <div className="space-y-1">
          <input
            className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 text-sm text-slate-500 outline-none dark:border-slate-600 dark:text-slate-400"
            value={username ?? ''}
            disabled
          />
        </div>

        <div className="space-y-1">
          <input
            autoFocus
            type="password"
            className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-xl bg-brand-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-accent/30 transition-all hover:-translate-y-0.5 hover:shadow-brand-accent/50 hover:bg-brand-accent-light active:translate-y-0 disabled:opacity-50 disabled:transform-none"
        >
          Weiter arbeiten
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="w-full text-center text-sm text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light transition-colors"
        >
          Als anderer Benutzer anmelden
        </button>
      </form>
    </div>
  )
}
