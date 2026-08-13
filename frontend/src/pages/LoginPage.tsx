import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkUsernameAvailable, login, register } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { validateEmail, validateMinLength, validateRequired } from '../lib/validation'
import ThemeToggle from '../components/ThemeToggle'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const debouncedUsername = useDebouncedValue(username, 400)

  const { signIn } = useAuth()
  const navigate = useNavigate()

  const usernameFormatError = validateRequired(username, 'Benutzername') ?? validateMinLength(username, 3, 'Benutzername')
  const displayNameError = mode === 'register' ? validateRequired(displayName, 'Anzeigename') : null
  const emailError = mode === 'register' ? (validateRequired(email, 'E-Mail') ?? validateEmail(email)) : null
  const passwordError = validateRequired(password, 'Passwort') ?? validateMinLength(password, 5, 'Passwort')

  // Username-Verfügbarkeit nur beim Registrieren live prüfen - beim Login wäre das
  // ein Sicherheitsleck (verrät, welche Accounts existieren, ohne das Passwort zu prüfen).
  useEffect(() => {
    if (mode !== 'register' || usernameFormatError || !debouncedUsername) {
      setUsernameAvailable(null)
      setCheckingUsername(false)
      return
    }

    let cancelled = false
    setCheckingUsername(true)
    checkUsernameAvailable(debouncedUsername)
      .then((result) => {
        if (!cancelled) setUsernameAvailable(result.available)
      })
      .catch(() => {
        if (!cancelled) setUsernameAvailable(null)
      })
      .finally(() => {
        if (!cancelled) setCheckingUsername(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedUsername, mode])

  const usernameError = useMemo(() => {
    if (usernameFormatError) return usernameFormatError
    if (mode === 'register' && usernameAvailable === false) return 'Dieser Benutzername ist bereits vergeben.'
    return null
  }, [usernameFormatError, mode, usernameAvailable])

  const hasBlockingErrors =
    Boolean(usernameError) || Boolean(passwordError) || (mode === 'register' && (Boolean(displayNameError) || Boolean(emailError)))

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function fieldMessage(field: string, error: string | null) {
    return touched[field] && error ? error : null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitError(null)

    setTouched({ username: true, password: true, displayName: true, email: true })
    if (hasBlockingErrors) return

    setBusy(true)
    try {
      const response =
        mode === 'login' ? await login(username, password) : await register(username, email, password, displayName)
      signIn(response.token, response.username, response.displayName, response.roles)
      navigate('/')
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message || 'Anmeldung fehlgeschlagen.' : 'Unbekannter Fehler.')
    } finally {
      setBusy(false)
    }
  }

  const usernameMsg = fieldMessage('username', usernameError)
  const displayNameMsg = fieldMessage('displayName', displayNameError)
  const emailMsg = fieldMessage('email', emailError)
  const passwordMsg = fieldMessage('password', passwordError)

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900"
      >
        <h1 className="text-xl font-semibold">Milepoint {mode === 'login' ? 'Anmeldung' : 'Registrierung'}</h1>

        <div>
          <input
            className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800 ${usernameMsg ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            placeholder="Benutzername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => markTouched('username')}
            autoComplete="username"
            required
          />
          {usernameMsg && <p className="mt-1 text-xs text-red-400">{usernameMsg}</p>}
          {!usernameMsg && mode === 'register' && checkingUsername && (
            <p className="mt-1 text-xs text-slate-500">Prüfe Verfügbarkeit…</p>
          )}
          {!usernameMsg && mode === 'register' && !checkingUsername && usernameAvailable === true && (
            <p className="mt-1 text-xs text-emerald-400">Benutzername ist verfügbar.</p>
          )}
        </div>

        {mode === 'register' && (
          <>
            <div>
              <input
                className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800 ${displayNameMsg ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
                placeholder="Anzeigename"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => markTouched('displayName')}
                required
              />
              {displayNameMsg && <p className="mt-1 text-xs text-red-400">{displayNameMsg}</p>}
            </div>

            <div>
              <input
                className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800 ${emailMsg ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
                type="email"
                placeholder="E-Mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => markTouched('email')}
                required
              />
              {emailMsg && <p className="mt-1 text-xs text-red-400">{emailMsg}</p>}
            </div>
          </>
        )}

        <div>
          <input
            className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800 ${passwordMsg ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => markTouched('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
          {passwordMsg && <p className="mt-1 text-xs text-red-400">{passwordMsg}</p>}
        </div>

        {submitError && <p className="text-sm text-red-400">{submitError}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {mode === 'login' ? 'Anmelden' : 'Registrieren'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setTouched({})
            setSubmitError(null)
          }}
          className="w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
        </button>
      </form>
    </div>
  )
}
