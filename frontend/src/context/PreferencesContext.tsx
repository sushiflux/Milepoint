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

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const [preferences, setPreferences] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!token) {
      setPreferences({})
      setLoaded(false)
      return
    }
    getPreferences()
      .then((prefs) => {
        setPreferences(prefs)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
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

export function usePreferences() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) {
    throw new Error('usePreferences muss innerhalb von PreferencesProvider verwendet werden.')
  }
  return ctx
}
