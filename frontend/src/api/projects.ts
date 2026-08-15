import { apiFetch } from './client'
import type { Board, Project } from './types'

export const getProjects = () => apiFetch<Project[]>('/projects')

export const createProject = (name: string, description?: string) =>
  apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })

export const renameProject = (projectId: string, name: string) =>
  apiFetch<Project>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })

export const deleteProject = (projectId: string) =>
  apiFetch<void>(`/projects/${projectId}`, { method: 'DELETE' })

export const getBoards = (projectId: string) => apiFetch<Board[]>(`/projects/${projectId}/boards`)

export const createBoard = (projectId: string, name: string, columnNames?: string[]) =>
  apiFetch<Board>(`/projects/${projectId}/boards`, {
    method: 'POST',
    body: JSON.stringify({ name, columnNames }),
  })
