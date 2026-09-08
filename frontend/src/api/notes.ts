import { apiFetch } from './client'
import type { Note, NoteShape } from './types'

export const getNotes = (projectId: string) => apiFetch<Note[]>(`/projects/${projectId}/notes`)

export const createNote = (
  projectId: string,
  title: string,
  content: string,
  parentNoteId: string | null = null,
  color: string | null = null,
  shape: NoteShape | null = null,
) =>
  apiFetch<Note>(`/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content, parentNoteId, color, shape }),
  })

// setParentNoteId tells the backend whether this call should touch the parent/child hierarchy at
// all - omit it (default) for a plain title/content save, which leaves the note's existing parent
// assignment untouched. Pass true with the desired parentNoteId (or null, to clear it back to a
// root note) only when actually reassigning the hierarchy - e.g. from the radial tree view's
// drag-and-drop. Without this distinction, ParentNoteId alone can't tell "leave unchanged" apart
// from "clear it", since null is also its own valid value.
//
// color/shape have NO such tri-state flag on the backend (see UpdateNoteRequest's doc comment) -
// every PUT simply applies them as given, null clearing back to "use the default". That means
// EVERY call to updateNote (including plain title/content saves) must pass the note's current
// color/shape explicitly, or they will be silently reset to null/default - exactly the same trap
// parentNoteId has, just without a flag to opt out of it. Callers must always pass the note's
// current values through, not just when actually changing them.
export const updateNote = (
  projectId: string,
  noteId: string,
  title: string,
  content: string,
  color: string | null,
  shape: NoteShape | null,
  parentNoteId?: { setParentNoteId: true; parentNoteId: string | null },
) =>
  apiFetch<Note>(`/projects/${projectId}/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      content,
      color,
      shape,
      parentNoteId: parentNoteId?.parentNoteId ?? null,
      setParentNoteId: parentNoteId?.setParentNoteId ?? false,
    }),
  })

export const deleteNote = (projectId: string, noteId: string) =>
  apiFetch<void>(`/projects/${projectId}/notes/${noteId}`, { method: 'DELETE' })
