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
    <AuthContext.Provider value={{ ...state, isAdmin, isProjectLeader, sessionExpired, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.')
  }
  return ctx
}
