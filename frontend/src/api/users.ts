import { apiFetch } from './client'

export interface UserSummary {
  id: string
  username: string
  displayName: string
}

export const getUsers = () => apiFetch<UserSummary[]>('/users')
