import { apiFetch } from './client'
import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from './types'

export const getNotes = (projectId: string) => apiFetch<Note[]>(`/projects/${projectId}/notes`)

// Every field below (except title/content/parentNoteId) has NO tri-state flag on the backend (see
// UpdateNoteRequest's doc comment) - every PUT simply applies them as given, null clearing back to
// "use the default". That means EVERY call to updateNote (including plain title/content saves)
// must pass the note's current appearance fields explicitly, or they will be silently reset to
// null/default - exactly the same trap parentNoteId has, just without a flag to opt out of it.
// Callers must always pass the note's current values through, not just when actually changing them.
export interface NoteAppearanceFields {
  color: string | null
  shape: NoteShape | null
  edgeStyle: NoteEdgeStyle | null
  edgeArrow: NoteEdgeArrow | null
  edgeWidth: number | null
  edgeColor: string | null
}

export const createNote = (
  projectId: string,
  title: string,
  content: string,
  parentNoteId: string | null,
  appearance: NoteAppearanceFields,
) =>
  apiFetch<Note>(`/projects/${projectId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content, parentNoteId, ...appearance }),
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
  appearance: NoteAppearanceFields,
  parentNoteId?: { setParentNoteId: true; parentNoteId: string | null },
) =>
  apiFetch<Note>(`/projects/${projectId}/notes/${noteId}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      content,
      ...appearance,
      parentNoteId: parentNoteId?.parentNoteId ?? null,
      setParentNoteId: parentNoteId?.setParentNoteId ?? false,
    }),
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

// Creates/replaces (width and color both non-null) or deletes (both null) the style override for
// one specific connection FROM sourceNoteId TO targetNoteId - see the backend's NoteEdgeOverride
// doc comment for why this is a separate concept from the source note's own edgeWidth/edgeColor.
// Works identically for a tree edge (targetNoteId = a ChildNote) and a free-view cross-link
// (targetNoteId = an OutgoingLink target) - the connection is identified purely by the note pair,
// not by which kind of connection it is.
export const setNoteEdgeOverride = (projectId: string, sourceNoteId: string, targetNoteId: string, width: number | null, color: string | null) =>
  apiFetch<void>(`/projects/${projectId}/notes/${sourceNoteId}/edge-overrides/${targetNoteId}`, {
    method: 'PUT',
    body: JSON.stringify({ width, color }),
  })
