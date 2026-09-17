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
  // another device since this browser last saw it. `loaded` flips false -> true exactly once per
  // mount (PreferencesProvider remounts wholesale on login/logout - see PreferencesContext.tsx),
  // so this only needs to react to that one transition, not run on every render. Applied directly
  // during render (comparing against the previous render's `loaded` value via its own bit of
  // state, React's documented "storing information from previous renders" pattern) rather than a
  // synchronous setState inside an effect - a ref-based comparison would hit the same
  // react-hooks/refs restriction that set-state-in-effect exists to avoid in the first place.
  const [prevLoaded, setPrevLoaded] = useState(loaded)
  if (loaded !== prevLoaded) {
    setPrevLoaded(loaded)
    if (loaded) {
      const dbTheme = getPreference(PREFERENCE_KEY, theme)
      if ((dbTheme === 'dark' || dbTheme === 'light') && dbTheme !== theme) {
        setTheme(dbTheme)
      }
    }
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // setPreference() (which updates PreferencesStateProvider's own state - a DIFFERENT component)
  // must not run inside the setTheme updater callback - React logs "Cannot update a component
  // while rendering a different component" when an updater function (which must be a pure
  // computation of prev -> next) has a side effect like that, since React can invoke updater
  // functions during a render pass (e.g. replaying them to reconcile a batch), not only after
  // commit. `theme` is already the current value here (this function closes over the same
  // render's state, no stale-closure risk since it's only ever called from an event handler,
  // never from inside another updater), so the next value can be computed directly instead of
  // needing the updater form at all - same fix as NotesView.tsx's setRootAppearance.
  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    setPreference(PREFERENCE_KEY, next)
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

// Context-Provider und zugehöriger Hook werden bewusst zusammen in einer Datei gehalten, siehe
// Projektkonvention (AuthContext/PreferencesContext/ThemeContext folgen alle diesem Muster).
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden.')
  }
  return ctx
}
