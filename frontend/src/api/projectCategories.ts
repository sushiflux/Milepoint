import { apiFetch } from './client'
import type { ProjectCategory } from './types'

export const getProjectCategories = () => apiFetch<ProjectCategory[]>('/project-categories')

export const createProjectCategory = (code: string, name: string) =>
  apiFetch<ProjectCategory>('/admin/project-categories', {
    method: 'POST',
    body: JSON.stringify({ code, name }),
  })

export const updateProjectCategory = (id: string, code: string, name: string) =>
  apiFetch<void>(`/admin/project-categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ code, name }),
  })

export const deleteProjectCategory = (id: string) =>
  apiFetch<void>(`/admin/project-categories/${id}`, {
    method: 'DELETE',
  })
