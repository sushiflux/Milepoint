import { useState } from 'react'
import { changePassword } from '../api/auth'
import { ApiError } from '../api/client'

const MIN_LENGTH = 5

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100'

// Personal setting: the signed-in user changes their own password. The current password has to be
// typed again and the new one twice; the server re-checks all of it (AuthController.ChangePassword).
export default function ChangePasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mismatch = repeat.length > 0 && next !== repeat
  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const canSubmit = !saving && current.length > 0 && next.length >= MIN_LENGTH && next === repeat

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      setSuccess(true)
      window.setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : 'Passwort konnte nicht geändert werden.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Passwort</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ändere das Passwort deines Kontos. Dafür brauchst du das aktuelle Passwort.</p>

      <form onSubmit={handleSubmit} className="mt-4 max-w-sm space-y-3">
        <div>
          <label htmlFor="current-password" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Aktuelles Passwort</label>
          <input id="current-password" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="new-password" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Neues Passwort</label>
          <input id="new-password" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} />
          {tooShort && <p className="mt-1 text-xs text-red-500 dark:text-red-400">Mindestens {MIN_LENGTH} Zeichen.</p>}
        </div>
        <div>
          <label htmlFor="repeat-password" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Neues Passwort wiederholen</label>
          <input id="repeat-password" type="password" autoComplete="new-password" className={inputClass} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          {mismatch && <p className="mt-1 text-xs text-red-500 dark:text-red-400">Die beiden neuen Passwörter stimmen nicht überein.</p>}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
          >
            {saving ? 'Speichert…' : 'Passwort ändern'}
          </button>
          {success && <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Passwort geändert.</span>}
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      </form>
    </section>
  )
}
