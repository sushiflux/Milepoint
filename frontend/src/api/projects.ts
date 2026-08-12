import { apiFetch } from './client'
import type { Board, Project } from './types'

export const getProjects = () => apiFetch<Project[]>('/projects')

export const createProject = (key: string, name: string, description?: string) =>
  apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ key, name, description }),
  })

export const getBoards = (projectId: string) => apiFetch<Board[]>(`/projects/${projectId}/boards`)

export const createBoard = (projectId: string, name: string, columnNames?: string[]) =>
  apiFetch<Board>(`/projects/${projectId}/boards`, {
    method: 'POST',
    body: JSON.stringify({ name, columnNames }),
  })
