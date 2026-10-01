import { apiFetch } from './client'

export type UserRole = 'User' | 'Projektleiter' | 'Admin'

export interface AdminUser {
  id: string
  username: string
  displayName: string
  email: string | null
  role: UserRole
  isSelf: boolean
  canModify: boolean
  ownedProjects: number
}

export interface CreateAdminUserRequest {
  username: string
  displayName?: string
  email?: string
  password: string
  role: UserRole
}

export const getAdminUsers = () => apiFetch<AdminUser[]>('/admin/users')

export const createAdminUser = (request: CreateAdminUserRequest) =>
  apiFetch<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(request) })

export const updateAdminUserRole = (id: string, role: UserRole) =>
  apiFetch<void>(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) })

export const resetAdminUserPassword = (id: string, password: string) =>
  apiFetch<void>(`/admin/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) })

export const deleteAdminUser = (id: string) => apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE' })
