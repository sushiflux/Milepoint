import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthState {
  token: string | null
  email: string | null
  displayName: string | null
}

interface AuthContextValue extends AuthState {
  signIn: (token: string, email: string, displayName: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_TOKEN = 'pm.token'
const STORAGE_EMAIL = 'pm.email'
const STORAGE_NAME = 'pm.displayName'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    token: localStorage.getItem(STORAGE_TOKEN),
    email: localStorage.getItem(STORAGE_EMAIL),
    displayName: localStorage.getItem(STORAGE_NAME),
  }))

  const signIn = (token: string, email: string, displayName: string) => {
    localStorage.setItem(STORAGE_TOKEN, token)
    localStorage.setItem(STORAGE_EMAIL, email)
    localStorage.setItem(STORAGE_NAME, displayName)
    setState({ token, email, displayName })
  }

  const signOut = () => {
    localStorage.removeItem(STORAGE_TOKEN)
    localStorage.removeItem(STORAGE_EMAIL)
    localStorage.removeItem(STORAGE_NAME)
    setState({ token: null, email: null, displayName: null })
  }

  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.')
  }
  return ctx
}
