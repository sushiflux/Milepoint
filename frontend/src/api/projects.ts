import { apiFetch } from './client'
import type { Board, BoardColumn, BoardColumnType, Project } from './types'

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

export const addFavoriteProject = (projectId: string) =>
  apiFetch<void>(`/projects/${projectId}/favorite`, { method: 'POST' })

export const removeFavoriteProject = (projectId: string) =>
  apiFetch<void>(`/projects/${projectId}/favorite`, { method: 'DELETE' })

export const getBoards = (projectId: string) => apiFetch<Board[]>(`/projects/${projectId}/boards`)

export const createColumn = (projectId: string, boardId: string, name: string, type: BoardColumnType) =>
  apiFetch<BoardColumn>(`/projects/${projectId}/boards/${boardId}/columns`, { method: 'POST', body: JSON.stringify({ name, type }) })

export const updateColumn = (projectId: string, boardId: string, columnId: string, patch: { name?: string; type?: BoardColumnType; isHidden?: boolean }) =>
  apiFetch<BoardColumn>(`/projects/${projectId}/boards/${boardId}/columns/${columnId}`, { method: 'PUT', body: JSON.stringify(patch) })

export const deleteColumn = (projectId: string, boardId: string, columnId: string) =>
  apiFetch<void>(`/projects/${projectId}/boards/${boardId}/columns/${columnId}`, { method: 'DELETE' })

export const reorderColumns = (projectId: string, boardId: string, columnIds: string[]) =>
  apiFetch<BoardColumn[]>(`/projects/${projectId}/boards/${boardId}/columns/order`, { method: 'PUT', body: JSON.stringify({ columnIds }) })

export const createBoard = (projectId: string, name: string, columnNames?: string[]) =>
  apiFetch<Board>(`/projects/${projectId}/boards`, {
    method: 'POST',
    body: JSON.stringify({ name, columnNames }),
  })
