import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createNote, deleteNote, updateNote } from '../api/notes'
import { ApiError } from '../api/client'
import type { Note } from '../api/types'
import NoteGraphView from './NoteGraphView'

interface Props {
  projectId: string
  notes: Note[]
  onNotesChange: (notes: Note[]) => void
}

interface OpenTab {
  noteId: string
  draftTitle: string
  draftContent: string
  dirty: boolean
}

type ViewMode = 'list' | 'graph'

const LINK_PATTERN = /\[\[([^[\]]+)]]/g

export default function NotesView({ projectId, notes, onNotesChange }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const notesByTitle = useMemo(() => {
    const map = new Map<string, Note>()
    for (const note of notes) map.set(note.title, note)
    return map
  }, [notes])

  const activeTab = tabs.find((t) => t.noteId === activeTabId) ?? null
  const activeNote = notes.find((n) => n.id === activeTabId) ?? null

  // Keep non-dirty open tabs in sync if their note changes via another path (e.g. a graph
  // "Notizen verbinden" edit while the target note is already open here) - tabs with
  // unsaved edits are left untouched so in-progress work is never silently overwritten.
  useEffect(() => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.dirty) return t
        const note = notes.find((n) => n.id === t.noteId)
        if (!note) return t
        return { ...t, draftTitle: note.title, draftContent: note.content }
      }),
    )
  }, [notes])

  function openNote(note: Note) {
    setTabs((prev) => (prev.some((t) => t.noteId === note.id) ? prev : [...prev, { noteId: note.id, draftTitle: note.title, draftContent: note.content, dirty: false }]))
    setActiveTabId(note.id)
    setError(null)
  }

  function closeTab(id: string) {
    const idx = tabs.findIndex((t) => t.noteId === id)
    if (idx === -1) return
    const next = [...tabs.slice(0, idx), ...tabs.slice(idx + 1)]
    setTabs(next)
    if (activeTabId === id) {
      const neighbor = next[idx] ?? next[idx - 1]
      setActiveTabId(neighbor ? neighbor.noteId : null)
    }
  }

  function updateActiveDraft(patch: Partial<Pick<OpenTab, 'draftTitle' | 'draftContent'>>) {
    if (!activeTabId) return
    setTabs((prev) => prev.map((t) => (t.noteId === activeTabId ? { ...t, ...patch, dirty: true } : t)))
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
      openNote(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notiz konnte nicht erstellt werden.')
    }
  }

  async function handleSave() {
    if (!activeTab) return
    setError(null)
    try {
      const updated = await updateNote(projectId, activeTab.noteId, activeTab.draftTitle.trim(), activeTab.draftContent)
      onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
      setTabs((prev) =>
        prev.map((t) => (t.noteId === updated.id ? { ...t, draftTitle: updated.title, draftContent: updated.content, dirty: false } : t)),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notiz konnte nicht gespeichert werden.')
    }
  }

  async function handleDelete() {
    if (!activeTabId) return
    const id = activeTabId
    await deleteNote(projectId, id)
    onNotesChange(notes.filter((n) => n.id !== id))
    closeTab(id)
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
            onClick={() => openNote(target)}
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
    openNote(note)
    setViewMode('list')
  }

  async function handleGraphCreateNote(title: string) {
    const created = await createNote(projectId, title, '')
    onNotesChange([...notes, created])
  }

  async function handleGraphConnect(sourceId: string, targetId: string) {
    const source = notes.find((n) => n.id === sourceId)
    const target = notes.find((n) => n.id === targetId)
    if (!source || !target) return
    if (source.outgoingLinks.some((l) => l.id === targetId)) return

    const separator = source.content.trim().length > 0 ? '\n\n' : ''
    const newContent = `${source.content}${separator}[[${target.title}]]`
    const updated = await updateNote(projectId, source.id, source.title, newContent)
    onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
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

      {error && <p className="text-sm text-red-400">{error}</p>}

      {viewMode === 'graph' ? (
        <NoteGraphView
          notes={notes}
          onSelectNote={handleGraphSelect}
          onCreateNote={handleGraphCreateNote}
          onConnectNotes={handleGraphConnect}
        />
      ) : (
        <div className="flex gap-6">
          <aside className="w-56 shrink-0 space-y-3">
            <ul className="space-y-1">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    onClick={() => openNote(note)}
                    className={`w-full truncate rounded px-2 py-1 text-left text-sm ${
                      note.id === activeTabId
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
            {tabs.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
                {tabs.map((tab) => {
                  const note = notes.find((n) => n.id === tab.noteId)
                  const isActive = tab.noteId === activeTabId
                  return (
                    <div
                      key={tab.noteId}
                      onClick={() => setActiveTabId(tab.noteId)}
                      role="button"
                      tabIndex={0}
                      className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs ${
                        isActive
                          ? 'border-indigo-500 text-slate-900 dark:text-slate-100'
                          : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                      }`}
                    >
                      {tab.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />}
                      <span className="max-w-[140px] truncate">{note?.title ?? tab.draftTitle}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          closeTab(tab.noteId)
                        }}
                        className="shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {!activeTab || !activeNote ? (
              <p className="text-sm text-slate-500">Notiz auswählen oder links eine neue anlegen.</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={activeTab.draftTitle}
                    onChange={(e) => updateActiveDraft({ draftTitle: e.target.value })}
                    className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-base font-medium dark:border-slate-700 dark:bg-slate-900"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!activeTab.dirty}
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
                  value={activeTab.draftContent}
                  onChange={(e) => updateActiveDraft({ draftContent: e.target.value })}
                  placeholder="Text… [[Andere Notiz]] verlinkt automatisch."
                  rows={12}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />

                <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Vorschau</h3>
                  <p className="whitespace-pre-wrap text-sm">{renderContent(activeTab.draftContent)}</p>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-500">Verlinkt von</h3>
                  {activeNote.incomingLinks.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine anderen Notizen verlinken hierher.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {activeNote.incomingLinks.map((link) => {
                        const source = notes.find((n) => n.id === link.id)
                        return (
                          <li key={link.id}>
                            <button
                              onClick={() => source && openNote(source)}
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
