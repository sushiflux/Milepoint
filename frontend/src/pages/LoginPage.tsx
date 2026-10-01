import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { checkUsernameAvailable, login, register } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { validateEmail, validateMinLength, validateRequired } from '../lib/validation'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import wordmarkDark from '../assets/wordmark-dark.svg'
import wordmarkLight from '../assets/wordmark-light.svg'
import logoDark from '../assets/logo-dark.svg'
import logoLight from '../assets/logo-light.svg'

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
  // Which debounced username value usernameAvailable's current result actually belongs to - lets
  // "still checking" be derived (checkingUsername below) instead of tracked as its own state that
  // would otherwise need a synchronous setState(true) at the top of the effect below.
  const [checkedUsername, setCheckedUsername] = useState<string | null>(null)
  const debouncedUsername = useDebouncedValue(username, 400)

  const { signIn } = useAuth()
  const navigate = useNavigate()
  // Set by RequireAuth when the user was sent here: the page to return to and whether the cause was
  // an expired session (captured once - signIn clears the flag in the context).
  const location = useLocation()
  const [redirect] = useState(() => (location.state ?? {}) as { from?: string; expired?: boolean })
  const { theme } = useTheme()

  const usernameFormatError = validateRequired(username, 'Benutzername') ?? validateMinLength(username, 3, 'Benutzername')
  const displayNameError = mode === 'register' ? validateRequired(displayName, 'Anzeigename') : null
  const emailError = mode === 'register' ? (validateRequired(email, 'E-Mail') ?? validateEmail(email)) : null
  const passwordError = validateRequired(password, 'Passwort') ?? validateMinLength(password, 5, 'Passwort')

  // Username-Verfügbarkeit nur beim Registrieren live prüfen - beim Login wäre das
  // ein Sicherheitsleck (verrät, welche Accounts existieren, ohne das Passwort zu prüfen).
  // Whether a check even applies right now is purely derived from mode/format/debounced value -
  // computed during render instead of synced into state via an early-return setState in the
  // effect below, so the "nothing to check" case never needs its own setState call at all; the
  // effect itself only ever runs its real async work (and its setState calls stay confined to
  // the .then()/.catch()/.finally() callbacks, not the effect body).
  const shouldCheckUsername = mode === 'register' && !usernameFormatError && Boolean(debouncedUsername)
  // True exactly while a check for the *current* debouncedUsername is in flight - derived from
  // whether checkedUsername (set once the request settles) already matches it, rather than a
  // separate piece of state that would need setting to true synchronously at the top of the
  // effect below.
  const checkingUsername = shouldCheckUsername && checkedUsername !== debouncedUsername

  useEffect(() => {
    if (!shouldCheckUsername) return

    let cancelled = false
    checkUsernameAvailable(debouncedUsername)
      .then((result) => {
        if (!cancelled) {
          setUsernameAvailable(result.available)
          setCheckedUsername(debouncedUsername)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsernameAvailable(null)
          setCheckedUsername(debouncedUsername)
        }
      })

    return () => {
      cancelled = true
    }
  }, [shouldCheckUsername, debouncedUsername])

  const usernameError = useMemo(() => {
    if (usernameFormatError) return usernameFormatError
    if (mode === 'register' && shouldCheckUsername && usernameAvailable === false) return 'Dieser Benutzername ist bereits vergeben.'
    return null
  }, [usernameFormatError, mode, shouldCheckUsername, usernameAvailable])

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
      navigate(redirect.from && redirect.from !== '/login' ? redirect.from : '/', { replace: true })
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
    <div className="flex min-h-screen font-sans">
      <div className="hidden w-2/3 flex-col items-center justify-center gap-6 bg-gradient-to-br from-brand-primary to-slate-900 p-12 lg:flex relative overflow-hidden">
        {/* Decorative background blur elements */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-brand-accent/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-brand-primary-light/30 rounded-full blur-[100px]" />
        
        <img src={logoDark} alt="" className="h-20 w-auto z-10 drop-shadow-lg" />
        <img src={wordmarkDark} alt="Milepoint" className="w-full max-w-md z-10 drop-shadow-md" />
        <p className="max-w-sm text-center text-slate-200 font-medium z-10 text-lg leading-relaxed">
          Projekte, Aufgaben, Timeline, Notizen — an einem Ort, für Entwickler-Teams gebaut.
        </p>
      </div>

      <div className="relative flex w-full items-center justify-center p-8 lg:w-1/3">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <form onSubmit={handleSubmit} className="glass w-full max-w-md space-y-6 p-8 rounded-2xl">
          <div className="flex items-center gap-3 lg:hidden justify-center mb-4">
            <img src={theme === 'dark' ? logoDark : logoLight} alt="" className="h-7 w-auto" />
            <img src={theme === 'dark' ? wordmarkDark : wordmarkLight} alt="Milepoint" className="h-5 w-auto" />
          </div>
          <h1 className="hidden text-2xl font-bold lg:block text-slate-800 dark:text-slate-100">{mode === 'login' ? 'Willkommen zurück' : 'Account erstellen'}</h1>

          <div className="space-y-1">
          <input
            className={`w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 ${usernameMsg ? 'border-brand-accent/70' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}`}
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
            <div className="space-y-1">
              <input
                className={`w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 ${displayNameMsg ? 'border-brand-accent/70' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}`}
                placeholder="Anzeigename"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => markTouched('displayName')}
                required
              />
              {displayNameMsg && <p className="mt-1 text-xs text-red-400">{displayNameMsg}</p>}
            </div>

            <div className="space-y-1">
              <input
                className={`w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 ${emailMsg ? 'border-brand-accent/70' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}`}
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

        <div className="space-y-1">
          <input
            className={`w-full rounded-xl border bg-transparent px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 ${passwordMsg ? 'border-brand-accent/70' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}`}
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

        {redirect.expired && !submitError && (
          <p role="status" className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            Deine Sitzung ist abgelaufen. Bitte melde dich erneut an - du kommst danach direkt zurück auf deine Seite. Was du gemacht hast, ist gespeichert.
          </p>
        )}
        {submitError && <p className="text-sm text-red-400">{submitError}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-accent/30 transition-all hover:-translate-y-0.5 hover:shadow-brand-accent/50 hover:bg-brand-accent-light active:translate-y-0 disabled:opacity-50 disabled:transform-none"
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
          className="w-full text-center text-sm text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light transition-colors"
        >
          {mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon ein Konto? Anmelden'}
        </button>
        </form>
      </div>
    </div>
  )
}
