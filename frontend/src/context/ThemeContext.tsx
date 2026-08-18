import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePreferences } from './PreferencesContext'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const PREFERENCE_KEY = 'theme'
const STORAGE_KEY = 'pm.theme'

// Only a fast local mirror for the FOUC-prevention inline script in index.html, which runs
// before React (and therefore before any DB preference fetch) even starts - the DB preference
// below is the actual source of truth and is synced in as soon as it's loaded.
function readInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { loaded, getPreference, setPreference } = usePreferences()
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  // Once the DB preference has loaded, it's authoritative - e.g. the user switched theme on
  // another device since this browser last saw it.
  useEffect(() => {
    if (!loaded) return
    const dbTheme = getPreference(PREFERENCE_KEY, theme)
    if (dbTheme === 'dark' || dbTheme === 'light') {
      setTheme((prev) => (dbTheme !== prev ? dbTheme : prev))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light'
      setPreference(PREFERENCE_KEY, next)
      return next
    })
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden.')
  }
  return ctx
}
