import { apiFetch } from './client'
import type { Note } from './types'

export const getNotes = (projectId: string) => apiFetch<Note[]>(`/projects/${projectId}/notes`)

// `color` has NO tri-state flag on the backend (see UpdateNoteRequest's doc comment) - every PUT
// simply applies it as given, null clearing back to "use the default". That means EVERY call to
// updateNote (including plain title/content saves) must pass the note's current color explicitly,
// or it will be silently reset to null. Callers must always pass the note's current value
// through, not just when actually changing it.
export interface NoteAppearanceFields {
  color: string | null
}

export const createNote = (
  projectId: string,
  title: string,
  content: string,
  appearance: NoteAppearanceFields,
) =>
  apiFetch<Note>(`/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content, ...appearance }),
  })

export const updateNote = (
  projectId: string,
  noteId: string,
  title: string,
  content: string,
  appearance: NoteAppearanceFields,
) =>
  apiFetch<Note>(`/projects/${projectId}/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({ title, content, ...appearance }),
  })

export const deleteNote = (projectId: string, noteId: string) =>
  apiFetch<void>(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' })

// Lightweight, high-frequency position sync for the free (physics-simulated) graph view - see the
// backend's UpdateNotePositionRequest doc comment. Deliberately separate from updateNote() above:
// this is called once per settled drag, not on every structural note edit, and returns 204 No
// Content rather than the full updated Note (no client-side state needs to change besides the
// coordinates the caller already has in hand).
export const updateNotePosition = (projectId: string, noteId: string, x: number, y: number) =>
  apiFetch<void>(`/projects/${projectId}/notes/${noteId}/position`, {
    method: 'PUT',
    body: JSON.stringify({ x, y }),
  })
