import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SESSION_EXPIRED_EVENT } from '../api/client'

interface AuthState {
  token: string | null
  username: string | null
  displayName: string | null
  roles: string[]
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean
  isProjectLeader: boolean
  // True once any request has come back 401 - the app keeps rendering exactly what it was
  // showing (nothing unmounts), and a modal on top prompts to log back in without losing
  // whatever the user was in the middle of typing.
  sessionExpired: boolean
  // Increments on every successful signIn (including re-login via SessionExpiredModal). Pages
  // that load their own data in a useEffect keyed off e.g. projectId need this in their
  // dependency array too - otherwise a request that failed with 401 while the session was
  // expired never gets retried after the user logs back in, since projectId itself didn't
  // change and the effect has no other reason to re-run (the concrete symptom this fixes:
  // ProjectPage getting stuck on "Projekt wird geladen…" forever after a re-login).
  authVersion: number
  signIn: (token: string, username: string, displayName: string, roles: string[]) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_TOKEN = 'pm.token'
const STORAGE_USERNAME = 'pm.username'
const STORAGE_NAME = 'pm.displayName'
const STORAGE_ROLES = 'pm.roles'

function readRoles(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ROLES)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token: localStorage.getItem(STORAGE_TOKEN),
    username: localStorage.getItem(STORAGE_USERNAME),
    displayName: localStorage.getItem(STORAGE_NAME),
    roles: readRoles(),
  }))
  const [sessionExpired, setSessionExpired] = useState(false)
  const [authVersion, setAuthVersion] = useState(0)

  useEffect(() => {
    const handleExpired = () => setSessionExpired(true)
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired)
  }, [])

  const signIn = (token: string, username: string, displayName: string, roles: string[]) => {
    localStorage.setItem(STORAGE_TOKEN, token)
    localStorage.setItem(STORAGE_USERNAME, username)
    localStorage.setItem(STORAGE_NAME, displayName)
    localStorage.setItem(STORAGE_ROLES, JSON.stringify(roles))
    setState({ token, username, displayName, roles })
    setSessionExpired(false)
    setAuthVersion((v) => v + 1)
  }

  const signOut = () => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USERNAME)
    localStorage.removeItem(STORAGE_NAME)
    localStorage.removeItem(STORAGE_ROLES)
    setState({ token: null, username: null, displayName: null, roles: [] })
    setSessionExpired(false)
  }

  const isAdmin = state.roles.includes('Admin')
  const isProjectLeader = state.roles.includes('Projektleiter')

  return (
    <AuthContext.Provider value={{ ...state, isAdmin, isProjectLeader, sessionExpired, authVersion, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// Context-Provider und zugehöriger Hook werden bewusst zusammen in einer Datei gehalten, siehe
// Projektkonvention (AuthContext/PreferencesContext/ThemeContext folgen alle diesem Muster) -
// eine künstliche Aufspaltung nur für Fast Refresh würde dieser Konvention widersprechen.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.')
  }
  return ctx
}
