import { apiFetch } from './client'
import type { AuthResponse } from './types'

export const login = (username: string, password: string) =>
  apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const register = (username: string, email: string, password: string, displayName: string) =>
  apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, displayName }),
  })
