import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthState {
  token: string | null
  username: string | null
  displayName: string | null
  roles: string[]
}

interface AuthContextValue extends AuthState {
  isAdmin: boolean
  isProjectLeader: boolean
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

  const signIn = (token: string, username: string, displayName: string, roles: string[]) => {
    localStorage.setItem(STORAGE_TOKEN, token)
    localStorage.setItem(STORAGE_USERNAME, username)
    localStorage.setItem(STORAGE_NAME, displayName)
    localStorage.setItem(STORAGE_ROLES, JSON.stringify(roles))
    setState({ token, username, displayName, roles })
  }

  const signOut = () => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_USERNAME)
    localStorage.removeItem(STORAGE_NAME)
    localStorage.removeItem(STORAGE_ROLES)
    setState({ token: null, username: null, displayName: null, roles: [] })
  }

  const isAdmin = state.roles.includes('Admin')
  const isProjectLeader = state.roles.includes('Projektleiter')

  return (
    <AuthContext.Provider value={{ ...state, isAdmin, isProjectLeader, signIn, signOut }}>
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
