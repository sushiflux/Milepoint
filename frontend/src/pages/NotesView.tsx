import { useCallback, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createNote, deleteNote, updateNote, setNoteEdgeOverride, getNotes, type NoteAppearanceFields } from '../api/notes'
import { ApiError } from '../api/client'
import type { Note, NoteShape } from '../api/types'
import NoteGraphView from './NoteGraphView'
import ColorSchemePanel from './notesGraph/ColorSchemePanel'
import ShapePickerPanel from './notesGraph/ShapePickerPanel'
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
// The last project-wide color scheme / node shape applied via the standalone "Farbschema"/"Form"
// buttons. Purely for the active-item highlight in those menus - the actual per-note colors/shapes
// live on each Note and can't be reverse-derived (different notes hold different values), so this
// is just a remembered "what did I last apply to everything" marker. Frontend-only preference, no
// backend field.
const GRAPH_SCHEME_PREFERENCE_KEY = 'notesGraphScheme'
const GRAPH_SHAPE_PREFERENCE_KEY = 'notesGraphShape'
// Kein modul-globales RegExp mit 'g'-Flag (dessen lastIndex müsste zwischen Aufrufen mutiert
// werden, was react-hooks/immutability zurecht als Render-unsichere Mutation eines außerhalb der
// Komponente definierten Werts ablehnt) - stattdessen die reine Pattern-Quelle halten und in
// renderContent() pro Aufruf ein frisches RegExp-Objekt erzeugen.
const LINK_PATTERN_SOURCE = '\\[\\[([^[\\]]+)]]'

function isViewMode(value: string): value is ViewMode {
  return value === 'list' || value === 'graph'
}

function isNoteShape(value: string): value is NoteShape {
  return value === 'Rounded' || value === 'Rectangle' || value === 'Diamond' || value === 'Underline' || value === 'Ellipse'
}

// Pulls the appearance fields updateNote()/createNote() always need re-sent (see
// NoteAppearanceFields' doc comment on why there's no tri-state flag for these) out of an existing
// Note - avoids repeating all six field names at every call site that just wants "this note's
// current appearance, unchanged".
function appearanceOf(note: Note): NoteAppearanceFields {
  return {
    color: note.color,
    shape: note.shape,
    edgeStyle: note.edgeStyle,
    edgeArrow: note.edgeArrow,
    edgeWidth: note.edgeWidth,
    edgeColor: note.edgeColor,
  }
}

const DEFAULT_APPEARANCE: NoteAppearanceFields = { color: null, shape: null, edgeStyle: null, edgeArrow: null, edgeWidth: null, edgeColor: null }

export default function NotesView({ projectId, notes, onNotesChange }: Props) {
  const { loaded: preferencesLoaded, getPreference, setPreference } = usePreferences()
  const storedViewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, 'list')
  const [viewMode, setViewModeState] = useState<ViewMode>(isViewMode(storedViewMode) ? storedViewMode : 'list')
  const storedScheme = getPreference(GRAPH_SCHEME_PREFERENCE_KEY, '')
  const [appliedSchemeId, setAppliedSchemeIdState] = useState<string | null>(storedScheme || null)
  const storedShape = getPreference(GRAPH_SHAPE_PREFERENCE_KEY, '')
  const [appliedShape, setAppliedShapeState] = useState<NoteShape | null>(isNoteShape(storedShape) ? storedShape : null)
  const [applyingPreset, setApplyingPreset] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)

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
      const dbShape = getPreference(GRAPH_SHAPE_PREFERENCE_KEY, '')
      const dbShapeValue = isNoteShape(dbShape) ? dbShape : null
      if (dbShapeValue !== appliedShape) setAppliedShapeState(dbShapeValue)
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

  function setAppliedShape(shape: NoteShape) {
    setAppliedShapeState(shape)
    setPreference(GRAPH_SHAPE_PREFERENCE_KEY, shape)
  }

  // Two standalone popovers in one segmented container next to the List/Graph toggle -
  // "Farbschema" (ColorSchemePanel, pure palette) and "Form" (ShapePickerPanel, node shape), each
  // applied immediately without a confirm dialog. useClickOutside on the whole group closes
  // whichever popover is open when a pointerdown/Escape lands anywhere outside it. Only one
  // popover open at a time.
  const [openMenu, setOpenMenu] = useState<'scheme' | 'shape' | null>(null)
  const graphMenuRef = useRef<HTMLDivElement>(null)
  const closeGraphMenu = useCallback(() => setOpenMenu(null), [])
  useClickOutside(graphMenuRef, openMenu !== null, closeGraphMenu)

  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const notesByTitle = useMemo(() => {
    const map = new Map<string, Note>()
    for (const note of notes) map.set(note.title, note)
    return map
  }, [notes])

  const activeTab = tabs.find((t) => t.noteId === activeTabId) ?? null
  const activeNote = notes.find((n) => n.id === activeTabId) ?? null
  const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  async function handleSave() {
    if (!activeTab || !activeNote) return
    setError(null)
    try {
      const updated = await updateNote(
        projectId,
        activeTab.noteId,
        activeTab.draftTitle.trim(),
        activeTab.draftContent,
        appearanceOf(activeNote),
      )
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
    // Frisches RegExp pro Aufruf statt ein geteiltes lastIndex zu mutieren (siehe LINK_PATTERN_SOURCE).
    const linkPattern = new RegExp(LINK_PATTERN_SOURCE, 'g')

    while ((match = linkPattern.exec(content))) {
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
            className="text-brand-primary underline hover:text-brand-primary-light transition-colors font-medium"
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

  // Changes only the note's own appearance fields, always re-sending the note's current
  // title/content so neither is accidentally touched (updateNote always applies title/content as
  // given, same as the appearance fields themselves).
  async function handleNoteAppearanceChange(
    noteId: string,
    patch: {
      color?: string | null
      shape?: Note['shape']
      edgeStyle?: Note['edgeStyle']
      edgeArrow?: Note['edgeArrow']
      edgeWidth?: number | null
      edgeColor?: string | null
    },
  ) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    const nextAppearance: NoteAppearanceFields = {
      color: 'color' in patch ? patch.color ?? null : note.color,
      shape: 'shape' in patch ? patch.shape ?? null : note.shape,
      edgeStyle: 'edgeStyle' in patch ? patch.edgeStyle ?? null : note.edgeStyle,
      edgeArrow: 'edgeArrow' in patch ? patch.edgeArrow ?? null : note.edgeArrow,
      edgeWidth: 'edgeWidth' in patch ? patch.edgeWidth ?? null : note.edgeWidth,
      edgeColor: 'edgeColor' in patch ? patch.edgeColor ?? null : note.edgeColor,
    }
    const updated = await updateNote(projectId, note.id, note.title, note.content, nextAppearance)
    onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
  }

  // Sets or clears (width/color both null) the style override for ONE connection FROM sourceNoteId
  // TO targetNoteId - distinct from handleNoteAppearanceChange above, which restyles every
  // connection a note draws outward. See setNoteEdgeOverride's/NoteEdgeOverride's doc comments.
  // Refetches the source note afterward (rather than optimistically patching edgeOverrides
  // client-side) since the endpoint returns 204 No Content, not the updated note - simplest way to
  // stay in sync with the server's actual state (delete-vs-upsert decision, existing-row update).
  async function handleEdgeOverrideChange(sourceNoteId: string, targetNoteId: string, width: number | null, color: string | null) {
    await setNoteEdgeOverride(projectId, sourceNoteId, targetNoteId, width, color)
    const refreshed = await getNotes(projectId)
    onNotesChange(refreshed)
  }

  // Verteilt die Palette eines Farbschemas (colorSchemes.ts) reihum auf ALLE Notizen im Projekt -
  // nur die FARBE, sonst nichts. Ohne Rückfrage, sofort. Form und Linienstil bleiben unangetastet.
  // Läuft sequenziell statt Promise.all, damit ein einzelner Fehlschlag mitten im Durchlauf nicht
  // dutzende parallele Requests im unbestimmten Zustand hinterlässt und der Nutzer eine konkrete
  // Fehlermeldung sieht.
  async function handleApplyScheme(schemeId: string) {
    setApplyingPreset(true)
    setPresetError(null)
    try {
      const colorByNoteId = assignSchemeColors(notes.map((n) => n.id), schemeId)
      const updatedNotes: Note[] = []
      for (const note of notes) {
        // Only `color` changes; everything else is re-sent unchanged via appearanceOf (updateNote
        // has no tri-state flag - see NoteAppearanceFields).
        const updated = await updateNote(projectId, note.id, note.title, note.content, {
          ...appearanceOf(note),
          color: colorByNoteId.get(note.id) ?? null,
        })
        updatedNotes.push(updated)
      }
      onNotesChange(notes.map((n) => updatedNotes.find((u) => u.id === n.id) ?? n))
      setAppliedSchemeId(schemeId)
    } catch (err) {
      setPresetError(err instanceof ApiError ? err.message : 'Farbschema konnte nicht vollständig angewendet werden.')
    } finally {
      setApplyingPreset(false)
    }
  }

  // Setzt eine Knotenform auf ALLE Notizen im Projekt - nur die FORM, sonst nichts. Ohne
  // Rückfrage, sofort. Farbe und Linienstil bleiben unangetastet.
  async function handleApplyShape(shape: NoteShape) {
    setApplyingPreset(true)
    setPresetError(null)
    try {
      const updatedNotes: Note[] = []
      for (const note of notes) {
        const updated = await updateNote(projectId, note.id, note.title, note.content, {
          ...appearanceOf(note),
          shape,
        })
        updatedNotes.push(updated)
      }
      onNotesChange(notes.map((n) => updatedNotes.find((u) => u.id === n.id) ?? n))
      setAppliedShape(shape)
    } catch (err) {
      setPresetError(err instanceof ApiError ? err.message : 'Form konnte nicht vollständig angewendet werden.')
    } finally {
      setApplyingPreset(false)
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
          // Farbschema / Form as one segmented control, same glass-panel/rounded-lg treatment as
          // the List/Graph toggle above so they read as one related group. Each button toggles its
          // own popover (openMenu, only one open at a time); useClickOutside on the whole group
          // closes whichever popover is open when a pointerdown/Escape lands anywhere outside it.
          <div className="relative z-30 flex w-fit rounded-lg p-1 glass-panel" ref={graphMenuRef}>
            {(
              [
                // Each panel's apply callback also closes the popover - picking a scheme/shape is
                // a one-shot action, and leaving the menu open over the graph just hides the
                // result the user wants to see.
                { key: 'scheme', label: 'Farbschema', panel: <ColorSchemePanel currentSchemeId={appliedSchemeId} onApplyScheme={async (id) => { await handleApplyScheme(id); setOpenMenu(null) }} applying={applyingPreset} /> },
                { key: 'shape', label: 'Form', panel: <ShapePickerPanel currentShape={appliedShape} onApplyShape={async (s) => { await handleApplyShape(s); setOpenMenu(null) }} applying={applyingPreset} /> },
              ] as const
            ).map((item) => (
              <div key={item.key} className="relative">
                <button
                  onClick={() => setOpenMenu((prev) => (prev === item.key ? null : item.key))}
                  className={`relative z-30 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    openMenu === item.key
                      ? 'bg-white text-brand-primary shadow-sm dark:bg-slate-700 dark:text-brand-primary-light'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
                {openMenu === item.key && (
                  <div className="absolute left-0 top-full z-30 mt-1.5 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
                    {item.panel}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {presetError && <p className="text-sm text-red-400">{presetError}</p>}

      {viewMode === 'graph' ? (
        <NoteGraphView
          projectId={projectId}
          notes={notes}
          onSelectNote={handleGraphSelect}
          onCreateNote={handleGraphCreateNote}
          onConnectNotes={handleGraphConnect}
          onChangeAppearance={handleNoteAppearanceChange}
          onChangeEdgeOverride={handleEdgeOverrideChange}
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
                  <button
                    onClick={handleSave}
                    disabled={!activeTab.dirty}
                    className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
                  >
                    Speichern
                  </button>
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

                <div className="glass-panel rounded-xl p-5">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-brand-primary-light">Vorschau</h3>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{renderContent(activeTab.draftContent)}</p>
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
