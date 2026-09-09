import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getPreferences, setPreference as setPreferenceApi } from '../api/preferences'
import { useAuth } from './AuthContext'

interface PreferencesContextValue {
  // False until the initial fetch resolves - callers that need to avoid a flash of the wrong
  // value (nothing meaningful to show until we know what the DB actually has) can wait on this.
  loaded: boolean
  getPreference: (key: string, fallback: string) => string
  setPreference: (key: string, value: string) => void
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined)

// Actual state/fetch logic, split out so it can be remounted (via `key={token}` below) on every
// token change - this is what resets `preferences`/`loaded` back to their initial values on
// login/logout without a synchronous setState in an effect: a fresh mount starts fresh state by
// construction, no explicit reset call needed for the "token disappeared" case.
function PreferencesStateProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  // Synchronizes with an external system (the preferences API) - setState only ever happens
  // inside the .then()/.catch() callbacks, never synchronously in the effect body itself.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    getPreferences()
      .then((prefs) => {
        if (!cancelled) {
          setPreferences(prefs)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  function getPreference(key: string, fallback: string) {
    return preferences[key] ?? fallback
  }

  function setPreference(key: string, value: string) {
    setPreferences((prev) => ({ ...prev, [key]: value }))
    setPreferenceApi(key, value).catch(() => {
      // Bestes Bemühen - bei einem Fehler bleibt der lokale (optimistische) Wert bis zum nächsten
      // Neuladen bestehen, die App bleibt aber ansonsten nutzbar.
    })
  }

  return (
    <PreferencesContext.Provider value={{ loaded, getPreference, setPreference }}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  return (
    <PreferencesStateProvider key={token ?? 'anonymous'} token={token}>
      {children}
    </PreferencesStateProvider>
  )
}

// Context-Provider und zugehöriger Hook werden bewusst zusammen in einer Datei gehalten, siehe
// Projektkonvention (AuthContext/PreferencesContext/ThemeContext folgen alle diesem Muster).
// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error('usePreferences muss innerhalb von PreferencesProvider verwendet werden.')
  }
  return ctx
}
