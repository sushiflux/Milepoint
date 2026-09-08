import { apiFetch } from './client'
import type { Note } from './types'

export const getNotes = (projectId: string) => apiFetch<Note[]>(`/projects/${projectId}/notes`)

export const createNote = (projectId: string, title: string, content: string, parentNoteId: string | null = null) =>
  apiFetch<Note>(`/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content, parentNoteId }),
  })

// setParentNoteId tells the backend whether this call should touch the parent/child hierarchy at
// all - omit it (default) for a plain title/content save, which leaves the note's existing parent
// assignment untouched. Pass true with the desired parentNoteId (or null, to clear it back to a
// root note) only when actually reassigning the hierarchy - e.g. from the radial tree view's
// drag-and-drop. Without this distinction, ParentNoteId alone can't tell "leave unchanged" apart
// from "clear it", since null is also its own valid value.
export const updateNote = (
  projectId: string,
  noteId: string,
  title: string,
  content: string,
  parentNoteId?: { setParentNoteId: true; parentNoteId: string | null },
) =>
  apiFetch<Note>(`/projects/${projectId}/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      content,
      parentNoteId: parentNoteId?.parentNoteId ?? null,
      setParentNoteId: parentNoteId?.setParentNoteId ?? false,
    }),
  })

export const deleteNote = (projectId: string, noteId: string) =>
  apiFetch<void>(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' })
