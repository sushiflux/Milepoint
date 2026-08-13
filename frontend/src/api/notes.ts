import { apiFetch } from './client'
import type { Note } from './types'

export const getNotes = (projectId: string) => apiFetch<Note[]>(`/projects/${projectId}/notes`)

export const createNote = (projectId: string, title: string, content: string) =>
  apiFetch<Note>(`/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  })

export const updateNote = (projectId: string, noteId: string, title: string, content: string) =>
  apiFetch<Note>(`/projects/${projectId}/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ title, content }),
  })

export const deleteNote = (projectId: string, noteId: string) =>
  apiFetch<void>(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' })
