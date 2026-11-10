import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createNote, deleteNote, updateNote, type NoteAppearanceFields } from '../api/notes'
import { ApiError } from '../api/client'
import type { Note } from '../api/types'
import NoteGraphView from './NoteGraphView'
import ColorSchemePanel from './notesGraph/ColorSchemePanel'
import { assignSchemeColors } from './notesGraph/colorSchemes'
import AddButton from '../components/AddButton'
import DictationButton from '../components/DictationButton'
import { usePreferences } from '../context/PreferencesContext'
import { useClickOutside } from '../hooks/useClickOutside'

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

const VIEW_MODE_PREFERENCE_KEY = 'notesViewMode'
// The last project-wide color scheme applied via the standalone "Farbschema" button. Purely for
// the active-item highlight in that menu - the actual per-note colors live on each Note and can't
// be reverse-derived (different notes hold different values), so this is just a remembered "what
// did I last apply to everything" marker. Frontend-only preference, no backend field.
const GRAPH_SCHEME_PREFERENCE_KEY = 'notesGraphScheme'

function isViewMode(value: string): value is ViewMode {
  return value === 'list' || value === 'graph'
}

// Pulls the appearance field updateNote()/createNote() always need re-sent (see
// NoteAppearanceFields' doc comment on why there's no tri-state flag for it) out of an existing
// Note - avoids repeating the field name at every call site that just wants "this note's current
// color, unchanged".
function appearanceOf(note: Note): NoteAppearanceFields {
  return { color: note.color }
}

const DEFAULT_APPEARANCE: NoteAppearanceFields = { color: null }

export default function NotesView({ projectId, notes, onNotesChange }: Props) {
  const { loaded: preferencesLoaded, getPreference, setPreference } = usePreferences()
  const storedViewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, 'list')
  const [viewMode, setViewModeState] = useState<ViewMode>(isViewMode(storedViewMode) ? storedViewMode : 'list')
  const storedScheme = getPreference(GRAPH_SCHEME_PREFERENCE_KEY, '')
  const [appliedSchemeId, setAppliedSchemeIdState] = useState<string | null>(storedScheme || null)
  const [applyingScheme, setApplyingScheme] = useState(false)
  const [schemeError, setSchemeError] = useState<string | null>(null)

  // useState's initializer above only ever runs once, on this component's very first mount - but
  // PreferencesContext loads the real DB values asynchronously (see PreferencesContext.tsx), so if
  // NotesView happens to mount before that fetch resolves, `storedViewMode` above reads as its
  // hardcoded fallback ('list') at that first render and then stays frozen at that wrong value
  // forever, since useState never re-runs its initializer on its own. This is exactly the "view
  // mode randomly flips between list/graph on repeated reloads" bug: which value gets frozen in
  // depends on a race between this mount and the preferences fetch, not on anything the user did.
  // Once `loaded` flips true, the DB values are authoritative and get synced in here - same
  // prevLoaded-comparison-during-render pattern as ThemeContext.tsx (a ref-based comparison would
  // hit the same react-hooks/refs restriction that react-hooks/set-state-in-effect exists to avoid
  // in the first place), so this only reacts to the one loaded: false -> true transition, never
  // re-fires on every render.
  const [prevPreferencesLoaded, setPrevPreferencesLoaded] = useState(preferencesLoaded)
  if (preferencesLoaded !== prevPreferencesLoaded) {
    setPrevPreferencesLoaded(preferencesLoaded)
    if (preferencesLoaded) {
      const dbViewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, viewMode)
      if (isViewMode(dbViewMode) && dbViewMode !== viewMode) setViewModeState(dbViewMode)
      const dbScheme = getPreference(GRAPH_SCHEME_PREFERENCE_KEY, '')
      if ((dbScheme || null) !== appliedSchemeId) setAppliedSchemeIdState(dbScheme || null)
    }
  }

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode)
    setPreference(VIEW_MODE_PREFERENCE_KEY, mode)
  }

  function setAppliedSchemeId(schemeId: string) {
    setAppliedSchemeIdState(schemeId)
    setPreference(GRAPH_SCHEME_PREFERENCE_KEY, schemeId)
  }

  // Standalone "Farbschema"-Popover neben dem List/Graph-Umschalter, angewendet sofort ohne
  // Rückfrage. useClickOutside schließt es, wenn ein pointerdown/Escape außerhalb landet.
  const [schemeMenuOpen, setSchemeMenuOpen] = useState(false)
  const schemeMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(schemeMenuRef, schemeMenuOpen, () => setSchemeMenuOpen(false))

  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.noteId === activeTabId) ?? null
  const activeNote = notes.find((n) => n.id === activeTabId) ?? null
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const tabsRef = useRef(tabs)
  const notesRef = useRef(notes)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // Keep non-dirty open tabs in sync if their note changes via another path (e.g. a graph
  // "Notizen verbinden" edit while the target note is already open here) - tabs with
  // unsaved edits are left untouched so in-progress work is never silently overwritten.
  // Applied directly during render (comparing the `notes` prop against its own value from the
  // previous render, React's documented "adjusting state when a prop changes" pattern) rather
  // than a synchronous setState inside an effect - a ref-based comparison would hit the same
  // react-hooks/refs restriction that set-state-in-effect exists to avoid in the first place.
  const [prevNotes, setPrevNotes] = useState(notes)
  if (notes !== prevNotes) {
    setPrevNotes(notes)
    setTabs((prev) =>
      prev.map((t) => {
        if (t.dirty) return t
        const note = notes.find((n) => n.id === t.noteId)
        if (!note) return t
        return { ...t, draftTitle: note.title, draftContent: note.content }
      }),
    )
  }

  function openNote(note: Note) {
    setTabs((prev) => (prev.some((t) => t.noteId === note.id) ? prev : [...prev, { noteId: note.id, draftTitle: note.title, draftContent: note.content, dirty: false }]))
    setActiveTabId(note.id)
    setError(null)
  }

  // Closing a tab with pending edits saves them first - nothing typed is ever dropped.
  async function closeTab(id: string) {
    if (tabs.find((t) => t.noteId === id)?.dirty) await saveDirtyTabs()
    removeTab(id)
  }

  function removeTab(id: string) {
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

  // Inserts dictated text at the current cursor position of the content textarea (or appends with
  // a separating space/newline if the textarea isn't focused/no selection is known).
  function insertDictatedText(text: string) {
    if (!activeTabId) return
    const el = contentTextareaRef.current
    setTabs((prev) =>
      prev.map((t) => {
        if (t.noteId !== activeTabId) return t
        const current = t.draftContent
        if (!el) {
          const separator = current.length > 0 && !current.endsWith('\n') ? ' ' : ''
          return { ...t, draftContent: current + separator + text, dirty: true }
        }
        const start = el.selectionStart ?? current.length
        const end = el.selectionEnd ?? current.length
        const next = current.slice(0, start) + text + current.slice(end)
        // Restore the cursor right after the inserted text on the next tick, once React has
        // applied the new value to the controlled textarea.
        requestAnimationFrame(() => {
          const pos = start + text.length
          el.focus()
          el.setSelectionRange(pos, pos)
        })
        return { ...t, draftContent: next, dirty: true }
      }),
    )
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const title = newTitle.trim()
    if (!title) return

    try {
      const created = await createNote(projectId, title, '', DEFAULT_APPEARANCE)
      onNotesChange([...notes, created])
      setNewTitle('')
      setShowCreateForm(false)
      openNote(created)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notiz konnte nicht erstellt werden.')
    }
  }

  // Autosave (like Word): every edit is saved on its own shortly after the user stops typing, there
  // is no Save button. Saves are serialized through one promise chain so two never overlap, and the
  // newest draft is always read at run time (tabsRef/notesRef), never from a stale closure.
  const doSave = useCallback(
    async (keepalive: boolean) => {
      try {
        for (const tab of tabsRef.current.filter((t) => t.dirty)) {
          const note = notesRef.current.find((n) => n.id === tab.noteId)
          const title = tab.draftTitle.trim()
          // An empty title can't be saved - wait until the user has typed one.
          if (!note || !title) continue
          setSaveState('saving')
          const updated = await updateNote(projectId, tab.noteId, title, tab.draftContent, appearanceOf(note), { keepalive })
          onNotesChange(notesRef.current.map((n) => (n.id === updated.id ? updated : n)))
          // Only mark the tab clean if the user hasn't typed further while this request was running.
          setTabs((prev) =>
            prev.map((t) =>
              t.noteId === updated.id && t.draftTitle === tab.draftTitle && t.draftContent === tab.draftContent
                ? { ...t, draftTitle: updated.title, draftContent: updated.content, dirty: false }
                : t,
            ),
          )
        }
        setSaveState('saved')
        setError(null)
      } catch (err) {
        setSaveState('error')
        setError(err instanceof ApiError ? `Automatisches Speichern fehlgeschlagen: ${err.message || 'unbekannter Fehler'}` : 'Automatisches Speichern fehlgeschlagen.')
      }
    },
    [projectId, onNotesChange],
  )

  const saveDirtyTabs = useCallback(
    (keepalive = false) => {
      saveQueueRef.current = saveQueueRef.current.then(() => doSave(keepalive))
      return saveQueueRef.current
    },
    [doSave],
  )

  // Debounce: save once the user paused typing. A failed save isn't retried in a loop - the next
  // edit (or closing the tab / leaving the page) triggers the next attempt.
  useEffect(() => {
    if (!tabs.some((t) => t.dirty)) return
    const timer = window.setTimeout(() => void saveDirtyTabs(), 900)
    return () => window.clearTimeout(timer)
  }, [tabs, saveDirtyTabs])

  // Flush immediately when the tab is hidden, the page is closed, or this view unmounts (navigating
  // to another project/page) - this is what makes "close the browser right after typing" safe.
  useEffect(() => {
    const flush = () => {
      if (tabsRef.current.some((t) => t.dirty)) void saveDirtyTabs(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [saveDirtyTabs])

  async function handleDelete() {
    if (!activeTabId) return
    const id = activeTabId
    await deleteNote(projectId, id)
    onNotesChange(notes.filter((n) => n.id !== id))
    removeTab(id)
  }

  // Ein Klick auf eine Notiz im Graph öffnet sie direkt im Listen-Editor - genau wie ein Klick in
  // der Liste selbst, kein Seitenpanel/Zwischenschritt mehr.
  function handleGraphSelect(note: Note) {
    openNote(note)
    setViewMode('list')
  }

  async function handleGraphCreateNote(title: string) {
    const created = await createNote(projectId, title, '', DEFAULT_APPEARANCE)
    onNotesChange([...notes, created])
  }

  async function handleGraphConnect(sourceId: string, targetId: string) {
    const source = notes.find((n) => n.id === sourceId)
    const target = notes.find((n) => n.id === targetId)
    if (!source || !target) return
    if (source.outgoingLinks.some((l) => l.id === targetId)) return

    const separator = source.content.trim().length > 0 ? '\n\n' : ''
    const newContent = `${source.content}${separator}[[${target.title}]]`
    const updated = await updateNote(projectId, source.id, source.title, newContent, appearanceOf(source))
    onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
  }

  // Verteilt die Palette eines Farbschemas (colorSchemes.ts) reihum auf ALLE Notizen im Projekt -
  // ohne Rückfrage, sofort. Läuft sequenziell statt Promise.all, damit ein einzelner Fehlschlag
  // mitten im Durchlauf nicht dutzende parallele Requests im unbestimmten Zustand hinterlässt und
  // der Nutzer eine konkrete Fehlermeldung sieht.
  async function handleApplyScheme(schemeId: string) {
    setApplyingScheme(true)
    setSchemeError(null)
    try {
      const colorByNoteId = assignSchemeColors(notes.map((n) => n.id), schemeId)
      const updatedNotes: Note[] = []
      for (const note of notes) {
        const updated = await updateNote(projectId, note.id, note.title, note.content, {
          color: colorByNoteId.get(note.id) ?? null,
        })
        updatedNotes.push(updated)
      }
      onNotesChange(notes.map((n) => updatedNotes.find((u) => u.id === n.id) ?? n))
      setAppliedSchemeId(schemeId)
    } catch (err) {
      setSchemeError(err instanceof ApiError ? err.message : 'Farbschema konnte nicht vollständig angewendet werden.')
    } finally {
      setApplyingScheme(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit rounded-lg p-1 glass-panel">
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white text-brand-primary shadow-sm dark:bg-slate-700 dark:text-brand-primary-light' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Liste
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'graph' ? 'bg-white text-brand-primary shadow-sm dark:bg-slate-700 dark:text-brand-primary-light' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
          >
            Graph
          </button>
        </div>

        {viewMode === 'graph' && (
          // Standalone "Farbschema"-Button neben dem List/Graph-Umschalter, gleiches
          // glass-panel/rounded-lg Aussehen. Angewendet sofort ohne Rückfrage; useClickOutside
          // schließt das Popover bei Klick/Escape außerhalb.
          <div className="relative" ref={schemeMenuRef}>
            <button
              onClick={() => setSchemeMenuOpen((prev) => !prev)}
              className={`rounded-lg p-1 px-3 py-1.5 text-xs font-medium transition-colors glass-panel ${
                schemeMenuOpen
                  ? 'bg-white text-brand-primary shadow-sm dark:bg-slate-700 dark:text-brand-primary-light'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Farbschema
            </button>
            {schemeMenuOpen && (
              <div className="absolute left-0 top-full z-30 mt-1.5 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
                <ColorSchemePanel
                  currentSchemeId={appliedSchemeId}
                  onApplyScheme={async (id) => {
                    await handleApplyScheme(id)
                    setSchemeMenuOpen(false)
                  }}
                  applying={applyingScheme}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {schemeError && <p className="text-sm text-red-400">{schemeError}</p>}

      {viewMode === 'graph' ? (
        <NoteGraphView
          projectId={projectId}
          notes={notes}
          onSelectNote={handleGraphSelect}
          onCreateNote={handleGraphCreateNote}
          onConnectNotes={handleGraphConnect}
        />
      ) : (
        <div className="flex gap-6">
          <aside className="w-56 shrink-0 space-y-3">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold">Notizen</h1>
              {!showCreateForm && <AddButton onClick={() => setShowCreateForm(true)} label="Neue Notiz" />}
            </div>

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
              {showCreateForm && (
                <li>
                  <form onSubmit={handleCreate} className="space-y-1">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setShowCreateForm(false)
                      }}
                      placeholder="Titel der Notiz"
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-xs outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                    />
                    <div className="flex gap-2 mt-2">
                      <button type="submit" className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light">
                        Anlegen
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCreateForm(false)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                </li>
              )}
            </ul>
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
                      className={`group flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? 'border-brand-primary text-brand-primary dark:text-brand-primary-light'
                          : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {tab.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent animate-pulse" />}
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
                    className="flex-1 rounded-lg border border-slate-300 bg-transparent px-4 py-2.5 text-base font-semibold outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100"
                  />
                  <span
                    role="status"
                    aria-live="polite"
                    className={`w-28 shrink-0 text-xs font-medium ${
                      saveState === 'error' && activeTab.dirty
                        ? 'text-red-600 dark:text-red-400'
                        : activeTab.dirty
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {saveState === 'error' && activeTab.dirty ? 'Nicht gespeichert' : activeTab.dirty ? 'Speichert…' : 'Gespeichert'}
                  </span>
                  <button
                    onClick={handleDelete}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-red-400 dark:hover:bg-slate-800"
                  >
                    Löschen
                  </button>
                </div>

                <div className="relative">
                  <textarea
                    ref={contentTextareaRef}
                    value={activeTab.draftContent}
                    onChange={(e) => updateActiveDraft({ draftContent: e.target.value })}
                    placeholder="Text… [[Andere Notiz]] verlinkt automatisch."
                    rows={12}
                    className="w-full rounded-xl border border-slate-300 bg-white/50 px-4 py-3 pr-14 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 backdrop-blur-sm"
                  />
                  <div className="absolute right-3 top-3">
                    <DictationButton onTranscribed={insertDictatedText} />
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Verlinkt von</h3>
                  {activeNote.incomingLinks.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-400">Noch keine anderen Notizen verlinken hierher.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {activeNote.incomingLinks.map((link) => {
                        const source = notes.find((n) => n.id === link.id)
                        return (
                          <li key={link.id}>
                            <button
                              onClick={() => source && openNote(source)}
                              className="rounded-lg bg-slate-200/80 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
