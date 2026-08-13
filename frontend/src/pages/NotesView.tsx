import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createNote, deleteNote, updateNote } from '../api/notes'
import { ApiError } from '../api/client'
import type { Note } from '../api/types'
import NoteGraphView from './NoteGraphView'

interface Props {
  projectId: string
  notes: Note[]
  onNotesChange: (notes: Note[]) => void
}

type ViewMode = 'list' | 'graph'

const LINK_PATTERN = /\[\[([^[\]]+)]]/g

export default function NotesView({ projectId, notes, onNotesChange }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null)
  const [newTitle, setNewTitle] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const notesByTitle = useMemo(() => {
    const map = new Map<string, Note>()
    for (const note of notes) map.set(note.title, note)
    return map
  }, [notes])

  const selected = notes.find((n) => n.id === selectedId) ?? null

  function selectNote(note: Note) {
    setSelectedId(note.id)
    setDraftTitle(note.title)
    setDraftContent(note.content)
    setDirty(false)
    setError(null)
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const title = newTitle.trim()
    if (!title) return

    try {
      const created = await createNote(projectId, title, '')
      onNotesChange([...notes, created])
      setNewTitle('')
      selectNote(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notiz konnte nicht erstellt werden.')
    }
  }

  async function handleSave() {
    if (!selected) return
    setError(null)
    try {
      const updated = await updateNote(projectId, selected.id, draftTitle.trim(), draftContent)
      onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
      setDirty(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notiz konnte nicht gespeichert werden.')
    }
  }

  async function handleDelete() {
    if (!selected) return
    await deleteNote(projectId, selected.id)
    const remaining = notes.filter((n) => n.id !== selected.id)
    onNotesChange(remaining)
    setSelectedId(remaining[0]?.id ?? null)
  }

  function renderContent(content: string): ReactNode[] {
    const parts: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    LINK_PATTERN.lastIndex = 0

    while ((match = LINK_PATTERN.exec(content))) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index))
      }

      const title = match[1].trim()
      const target = notesByTitle.get(title)
      if (target) {
        parts.push(
          <button
            key={match.index}
            onClick={() => selectNote(target)}
            className="text-indigo-600 underline hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {title}
          </button>,
        )
      } else {
        parts.push(
          <span key={match.index} className="text-slate-500">
            [[{title}]]
          </span>,
        )
      }

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex))
    }

    return parts
  }

  function handleGraphSelect(note: Note) {
    selectNote(note)
    setViewMode('list')
  }

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded border border-slate-300 text-xs dark:border-slate-700">
        <button
          onClick={() => setViewMode('list')}
          className={`px-3 py-1.5 ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'}`}
        >
          Liste
        </button>
        <button
          onClick={() => setViewMode('graph')}
          className={`border-l border-slate-300 px-3 py-1.5 dark:border-slate-700 ${viewMode === 'graph' ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'}`}
        >
          Graph
        </button>
      </div>

      {viewMode === 'graph' ? (
        <NoteGraphView notes={notes} onSelectNote={handleGraphSelect} />
      ) : (
        <div className="flex gap-6">
          <aside className="w-56 shrink-0 space-y-3">
            <ul className="space-y-1">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    onClick={() => selectNote(note)}
                    className={`w-full truncate rounded px-2 py-1 text-left text-sm ${
                      note.id === selectedId
                        ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                        : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
                    }`}
                  >
                    {note.title}
                  </button>
                </li>
              ))}
              {notes.length === 0 && <li className="text-sm text-slate-500">Noch keine Notizen.</li>}
            </ul>

            <form onSubmit={handleCreate}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="+ Neue Notiz"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </form>
          </aside>

          <section className="min-w-0 flex-1 space-y-4">
            {error && <p className="text-sm text-red-400">{error}</p>}

            {!selected ? (
              <p className="text-sm text-slate-500">Notiz auswählen oder links eine neue anlegen.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value)
                      setDirty(true)
                    }}
                    className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-base font-medium dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!dirty}
                    className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={handleDelete}
                    className="rounded border border-slate-300 px-3 py-2 text-sm text-red-500 hover:bg-slate-100 dark:border-slate-700 dark:text-red-400 dark:hover:bg-slate-800"
                  >
                    Löschen
                  </button>
                </div>

                <textarea
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value)
                    setDirty(true)
                  }}
                  placeholder="Text… [[Andere Notiz]] verlinkt automatisch."
                  rows={12}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Vorschau</h3>
                  <p className="whitespace-pre-wrap text-sm">{renderContent(draftContent)}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Verlinkt von</h3>
                  {selected.incomingLinks.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine anderen Notizen verlinken hierher.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {selected.incomingLinks.map((link) => {
                        const source = notes.find((n) => n.id === link.id)
                        return (
                          <li key={link.id}>
                            <button
                              onClick={() => source && selectNote(source)}
                              className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
                            >
                              {link.title}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
