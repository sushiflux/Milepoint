import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createNote, deleteNote, updateNote, setNoteEdgeOverride, getNotes, type NoteAppearanceFields } from '../api/notes'
import { ApiError } from '../api/client'
import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../api/types'
import NoteGraphView from './NoteGraphView'
import TreeGraphView, { type RootAppearance } from './notesGraph/TreeGraphView'
import GraphSettingsPanel from './notesGraph/GraphSettingsPanel'
import { STYLE_PRESETS, type GraphLayoutId } from './notesGraph/stylePresets'
import { assignSchemeColors, colorForIndex } from './notesGraph/colorSchemes'
import AddButton from '../components/AddButton'
import DictationButton from '../components/DictationButton'
import { usePreferences } from '../context/PreferencesContext'

interface Props {
  projectId: string
  projectName: string
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
// 'free' is the physics-simulated force graph (NoteGraphView, based on the free cross-links);
// the other four are static tree layouts sharing TreeGraphView, based on the parent/child
// hierarchy - see notesGraph/treeLayouts.ts for how each one computes node positions.
type GraphLayout = GraphLayoutId

const VIEW_MODE_PREFERENCE_KEY = 'notesViewMode'
const GRAPH_LAYOUT_PREFERENCE_KEY = 'notesGraphLayout'
// Frontend-only appearance for the virtual project-center node in TreeGraphView (no backing Note
// object exists for it - see TreeGraphView's RootAppearance type / GraphSidePanel's "kind: 'root'"
// case). Persisted the same way as notesGraphLayout, JSON-serialized since it's a small object,
// not a single scalar.
const ROOT_APPEARANCE_PREFERENCE_KEY = 'notesGraphRootAppearance'
// Kein modul-globales RegExp mit 'g'-Flag (dessen lastIndex müsste zwischen Aufrufen mutiert
// werden, was react-hooks/immutability zurecht als Render-unsichere Mutation eines außerhalb der
// Komponente definierten Werts ablehnt) - stattdessen die reine Pattern-Quelle halten und in
// renderContent() pro Aufruf ein frisches RegExp-Objekt erzeugen.
const LINK_PATTERN_SOURCE = '\\[\\[([^[\\]]+)]]'

const DEFAULT_ROOT_APPEARANCE: RootAppearance = { color: null, shape: null, edgeStyle: null, edgeArrow: null }

function isViewMode(value: string): value is ViewMode {
  return value === 'list' || value === 'graph'
}

function isGraphLayout(value: string): value is GraphLayout {
  return value === 'free' || value === 'mindmap' || value === 'tree-horizontal' || value === 'tree-vertical' || value === 'fishbone'
}

// Der Root-Knoten (virtueller Projekt-Mittelpunkt) hat keine eigene Notiz-ID und wird daher nicht
// von assignSchemeColors' reihum-Verteilung erfasst - er erhält stattdessen die erste Farbe des
// gewählten Schemas, damit er farblich sichtbar zur selben Vorlage gehört, ohne mit der ersten
// echten Notiz zu kollidieren wäre (unterschiedliche Knotenform/-größe macht das ohnehin klar).
function colorForRootPreset(schemeId: string): string {
  return colorForIndex(schemeId, 0)
}

function parseRootAppearance(raw: string): RootAppearance {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        color: typeof parsed.color === 'string' ? parsed.color : null,
        shape: typeof parsed.shape === 'string' ? (parsed.shape as NoteShape) : null,
        edgeStyle: typeof parsed.edgeStyle === 'string' ? (parsed.edgeStyle as NoteEdgeStyle) : null,
        edgeArrow: typeof parsed.edgeArrow === 'string' ? (parsed.edgeArrow as NoteEdgeArrow) : null,
      }
    }
  } catch {
    // Kein gültiges JSON (z.B. noch nie gesetzt) - Standardwert verwenden.
  }
  return DEFAULT_ROOT_APPEARANCE
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

export default function NotesView({ projectId, projectName, notes, onNotesChange }: Props) {
  const { loaded: preferencesLoaded, getPreference, setPreference } = usePreferences()
  const storedViewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, 'list')
  const [viewMode, setViewModeState] = useState<ViewMode>(isViewMode(storedViewMode) ? storedViewMode : 'list')
  const storedGraphLayout = getPreference(GRAPH_LAYOUT_PREFERENCE_KEY, 'free')
  const [graphLayout, setGraphLayoutState] = useState<GraphLayout>(isGraphLayout(storedGraphLayout) ? storedGraphLayout : 'free')
  const storedRootAppearance = getPreference(ROOT_APPEARANCE_PREFERENCE_KEY, '')
  const [rootAppearance, setRootAppearanceState] = useState<RootAppearance>(
    storedRootAppearance ? parseRootAppearance(storedRootAppearance) : DEFAULT_ROOT_APPEARANCE,
  )
  const [applyingPreset, setApplyingPreset] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)

  // useState's initializer above only ever runs once, on this component's very first mount - but
  // PreferencesContext loads the real DB values asynchronously (see PreferencesContext.tsx), so if
  // NotesView happens to mount before that fetch resolves, `storedViewMode`/`storedGraphLayout`/
  // `storedRootAppearance` above all read as their hardcoded fallback ('list'/'free'/default) at
  // that first render and then stay frozen at that wrong value forever, since useState never
  // re-runs its initializer on its own. This is exactly the "view mode randomly flips between
  // list/graph on repeated reloads" bug: which value gets frozen in depends on a race between this
  // mount and the preferences fetch, not on anything the user did. Once `loaded` flips true, the
  // DB values are authoritative and get synced in here - same prevLoaded-comparison-during-render
  // pattern as ThemeContext.tsx (a ref-based comparison would hit the same react-hooks/refs
  // restriction that react-hooks/set-state-in-effect exists to avoid in the first place), so this
  // only reacts to the one loaded: false -> true transition, never re-fires on every render.
  const [prevPreferencesLoaded, setPrevPreferencesLoaded] = useState(preferencesLoaded)
  if (preferencesLoaded !== prevPreferencesLoaded) {
    setPrevPreferencesLoaded(preferencesLoaded)
    if (preferencesLoaded) {
      const dbViewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, viewMode)
      if (isViewMode(dbViewMode) && dbViewMode !== viewMode) setViewModeState(dbViewMode)
      const dbGraphLayout = getPreference(GRAPH_LAYOUT_PREFERENCE_KEY, graphLayout)
      if (isGraphLayout(dbGraphLayout) && dbGraphLayout !== graphLayout) setGraphLayoutState(dbGraphLayout)
      const dbRootAppearanceRaw = getPreference(ROOT_APPEARANCE_PREFERENCE_KEY, '')
      if (dbRootAppearanceRaw) {
        const dbRootAppearance = parseRootAppearance(dbRootAppearanceRaw)
        setRootAppearanceState((prev) =>
          dbRootAppearance.color !== prev.color ||
          dbRootAppearance.shape !== prev.shape ||
          dbRootAppearance.edgeStyle !== prev.edgeStyle ||
          dbRootAppearance.edgeArrow !== prev.edgeArrow
            ? dbRootAppearance
            : prev,
        )
      }
    }
  }

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode)
    setPreference(VIEW_MODE_PREFERENCE_KEY, mode)
  }

  function setGraphLayout(layout: GraphLayout) {
    setGraphLayoutState(layout)
    setPreference(GRAPH_LAYOUT_PREFERENCE_KEY, layout)
  }

  function setRootAppearance(patch: Partial<RootAppearance>) {
    // setPreference() (which updates PreferencesStateProvider's own state - a DIFFERENT component)
    // must not run inside the setRootAppearanceState updater callback below - React logs "Cannot
    // update a component while rendering a different component" when an updater function (which
    // must be a pure computation of prev -> next) has a side effect like that, since React can
    // invoke updater functions during a render pass (e.g. replaying them to reconcile a batch),
    // not only after commit. `rootAppearance` is already the current value here (this function
    // closes over the same render's state, no stale-closure risk since it's only ever called from
    // an event handler, never from inside another updater), so the merge can happen directly
    // instead of needing the updater form at all.
    const next = { ...rootAppearance, ...patch }
    setRootAppearanceState(next)
    setPreference(ROOT_APPEARANCE_PREFERENCE_KEY, JSON.stringify(next))
  }

  // Standalone layout-picker popover, next to the List/Graph toggle - reaches the exact same
  // GraphSettingsPanel content (layout + style presets + root appearance) that TreeGraphView's
  // center-node click already opens, but from a fixed spot that works in BOTH the free and tree
  // views. The free view (NoteGraphView) has no root/center-node concept at all, so a note click
  // there could never reach this menu - and even in the tree views, a user might not think to
  // click the center node specifically to find layout options. Kept alongside the existing
  // center-node entry point rather than replacing it (the user asked for both to coexist).
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)

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
      const created = await createNote(projectId, title, '', null, DEFAULT_APPEARANCE)
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
    const created = await createNote(projectId, title, '', null, DEFAULT_APPEARANCE)
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

  // Shared by all four tree layouts (Mind Map, Baum, Organigramm, Fischgräten) - they only differ
  // in node placement (see notesGraph/treeLayouts.ts), the hierarchy interactions are identical.
  function handleTreeSelect(note: Note) {
    openNote(note)
    setViewMode('list')
  }

  async function handleTreeCreateRootNote(title: string) {
    const created = await createNote(projectId, title, '', null, DEFAULT_APPEARANCE)
    onNotesChange([...notes, created])
  }

  async function handleTreeSetParent(noteId: string, parentNoteId: string | null) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    const updated = await updateNote(projectId, note.id, note.title, note.content, appearanceOf(note), {
      setParentNoteId: true,
      parentNoteId,
    })
    onNotesChange(notes.map((n) => (n.id === updated.id ? updated : n)))
  }

  // Shared by both graph views (free + all four tree layouts) - changes only the note's own
  // appearance fields, always re-sending the note's current title/content so neither is
  // accidentally touched (updateNote always applies title/content as given, same as the
  // appearance fields themselves).
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

  // Wendet eine vordefinierte Stil-Vorlage (stylePresets.ts) auf ALLE Notizen im Projekt an: wechselt
  // das Layout und aktualisiert Farbe (via assignSchemeColors reihum aus dem Schema)/Form/Linienstil/
  // Pfeilspitzen jeder einzelnen Notiz sowie des Root-Knotens. Läuft sequenziell statt Promise.all,
  // damit ein einzelner Fehlschlag mitten im Durchlauf nicht dutzende parallele Requests im
  // unbestimmten Zustand hinterlässt und der Nutzer eine konkrete Fehlermeldung sieht.
  async function handleApplyPreset(presetId: string) {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setApplyingPreset(true)
    setPresetError(null)
    try {
      const colorByNoteId = assignSchemeColors(notes.map((n) => n.id), preset.colorSchemeId)
      const updatedNotes: Note[] = []
      for (const note of notes) {
        const color = colorByNoteId.get(note.id) ?? null
        // edgeWidth/edgeColor deliberately carried over from the note's current value, not reset
        // by the preset - a preset controls layout/palette/shape/line-style/arrowheads, but a
        // line's thickness/explicit color is a finer per-note choice the user makes separately
        // (see NoteAppearanceMenu's "Liniendicke"/"Linienfarbe" controls) and shouldn't be
        // silently wiped out just because a different overall preset was applied.
        const updated = await updateNote(projectId, note.id, note.title, note.content, {
          color,
          shape: preset.shape,
          edgeStyle: preset.edgeStyle,
          edgeArrow: preset.edgeArrow,
          edgeWidth: note.edgeWidth,
          edgeColor: note.edgeColor,
        })
        updatedNotes.push(updated)
      }
      onNotesChange(notes.map((n) => updatedNotes.find((u) => u.id === n.id) ?? n))
      setRootAppearance({
        color: colorForRootPreset(preset.colorSchemeId),
        shape: preset.shape,
        edgeStyle: preset.edgeStyle,
        edgeArrow: preset.edgeArrow,
      })
      setGraphLayout(preset.layout)
    } catch (err) {
      setPresetError(err instanceof ApiError ? err.message : 'Stil-Vorlage konnte nicht vollständig angewendet werden.')
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
          <div className="relative">
            <button
              onClick={() => setLayoutMenuOpen((prev) => !prev)}
              // relative + z-30, matching (and beating) the fixed inset-0 z-20 overlay below - a
              // CSS z-index only has any effect on a positioned element (position !== static), so
              // giving only the *container* div a z-index did nothing for this static <button>: a
              // position:fixed sibling with an explicit z-index always paints above a position:
              // static sibling regardless of DOM order or the container's own z-index, since that
              // internal comparison is unrelated to how the container stacks against elements
              // OUTSIDE it. Without this, the overlay - needed to cover the full viewport for the
              // click-outside-closes behavior - visually sat on top of the button itself once the
              // menu was open, silently swallowing every click on it (including the one meant to
              // close the menu again). Confirmed live via Playwright: a second click on "Layout &
              // Stil" hit the overlay div instead and timed out retrying.
              className={`relative z-30 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                layoutMenuOpen
                  ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light'
                  : 'border-slate-200/50 glass text-slate-600 hover:bg-slate-100/50 dark:border-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-800/50'
              }`}
            >
              Layout &amp; Stil
            </button>
            {layoutMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setLayoutMenuOpen(false)} />
                <div className="absolute left-0 top-full z-30 mt-1.5 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
                  <GraphSettingsPanel
                    currentLayout={graphLayout}
                    onChangeLayout={setGraphLayout}
                    onApplyPreset={handleApplyPreset}
                    applyingPreset={applyingPreset}
                    rootAppearance={rootAppearance}
                    onChangeRootAppearance={setRootAppearance}
                    // The root/center node only exists visually in the tree layouts - in the free
                    // view (graphLayout === 'free') there is nothing on screen for these settings
                    // to style, so they're hidden here rather than shown for a node that isn't
                    // rendered anywhere.
                    showRootAppearance={graphLayout !== 'free'}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {presetError && <p className="text-sm text-red-400">{presetError}</p>}

      {viewMode === 'graph' ? (
        graphLayout === 'free' ? (
          <NoteGraphView
            projectId={projectId}
            notes={notes}
            onSelectNote={handleGraphSelect}
            onCreateNote={handleGraphCreateNote}
            onConnectNotes={handleGraphConnect}
            onChangeAppearance={handleNoteAppearanceChange}
            onChangeLayout={setGraphLayout}
            onApplyPreset={handleApplyPreset}
            applyingPreset={applyingPreset}
            onChangeEdgeOverride={handleEdgeOverrideChange}
          />
        ) : (
          <TreeGraphView
            projectName={projectName}
            notes={notes}
            layout={graphLayout}
            onSelectNote={handleTreeSelect}
            onChangeAppearance={handleNoteAppearanceChange}
            onCreateRootNote={handleTreeCreateRootNote}
            onSetParent={handleTreeSetParent}
            onChangeLayout={setGraphLayout}
            onApplyPreset={handleApplyPreset}
            applyingPreset={applyingPreset}
            rootAppearance={rootAppearance}
            onChangeRootAppearance={setRootAppearance}
            onChangeEdgeOverride={handleEdgeOverrideChange}
          />
        )
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
