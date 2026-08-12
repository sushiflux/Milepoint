import { apiFetch } from './client'
import type { AuthResponse } from './types'

export const login = (email: string, password: string) =>
  apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

export const register = (email: string, password: string, displayName: string) =>
  apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  })
