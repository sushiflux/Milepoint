import { apiFetch } from './client'
import type { ProjectCategory } from './types'

export const getCategories = (projectId: string) => apiFetch<ProjectCategory[]>(`/projects/${projectId}/categories`)

export const createCategory = (projectId: string, name: string, color: string) =>
  apiFetch<ProjectCategory>(`/projects/${projectId}/categories`, { method: 'POST', body: JSON.stringify({ name, color }) })

export const updateCategory = (projectId: string, id: string, patch: { name?: string; color?: string; isHidden?: boolean }) =>
  apiFetch<ProjectCategory>(`/projects/${projectId}/categories/${id}`, { method: 'PUT', body: JSON.stringify(patch) })

export const deleteCategory = (projectId: string, id: string) =>
  apiFetch<void>(`/projects/${projectId}/categories/${id}`, { method: 'DELETE' })
