import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import { computeTreeLayout, type Point, type TreeEdge, type TreeLayoutId } from './treeLayouts'
import { NoteNodeVisual, measureNodeBox } from './NoteNodeShape'
import {
  EdgeMarkerDefs,
  edgeMarkerRefs,
  edgeStrokeDasharray,
  edgeGradientStroke,
  edgeGradientDefFor,
  clipPointToBoxEdge,
  resolveEdgeWidth,
  resolveEdgeColor,
  EDGE_COLOR_NORMAL,
  EDGE_COLOR_HIGHLIGHT,
  DEFAULT_EDGE_WIDTH,
} from './edgeStyles'
import GraphSidePanel from './GraphSidePanel'
import EdgeOverridePanel from './EdgeOverridePanel'
import { useClickOutside } from '../../hooks/useClickOutside'

export interface RootAppearance {
  color: string | null
  shape: NoteShape | null
  edgeStyle: NoteEdgeStyle | null
  edgeArrow: NoteEdgeArrow | null
}

interface Props {
  projectName: string
  notes: Note[]
  layout: TreeLayoutId
  onSelectNote: (note: Note) => void
  onCreateRootNote: (title: string) => Promise<void>
  onSetParent: (noteId: string, parentNoteId: string | null) => Promise<void>
  onChangeAppearance: (
    noteId: string,
    patch: {
      color?: string | null
      shape?: NoteShape | null
      edgeStyle?: NoteEdgeStyle | null
      edgeArrow?: NoteEdgeArrow | null
      edgeWidth?: number | null
      edgeColor?: string | null
    },
  ) => Promise<void>
  rootAppearance: RootAppearance
  onChangeRootAppearance: (patch: Partial<RootAppearance>) => void
  // Per-connection style override (see NoteEdgeOverride's backend doc comment) - width/color of
  // ONE specific line, restyled independently of its source note's own edgeWidth/edgeColor.
  onChangeEdgeOverride: (sourceNoteId: string, targetNoteId: string, width: number | null, color: string | null) => Promise<void>
}

interface Transform {
  x: number
  y: number
  k: number
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 5
const CENTER_RADIUS = 34

// Same fit-to-view approach used by NoteGraphView's free layout, reused here so every graph
// layout feels identical when zooming/panning even though the underlying geometry differs.
function computeFitTransform(points: Point[], width: number, height: number): Transform {
  if (points.length === 0) return { x: width / 2, y: height / 2, k: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  const PADDING = 80
  const bboxWidth = Math.max(maxX - minX, 40)
  const bboxHeight = Math.max(maxY - minY, 40)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const k = Math.min((width - PADDING * 2) / bboxWidth, (height - PADDING * 2) / bboxHeight, MAX_ZOOM)
  const clampedK = Math.max(k, MIN_ZOOM)

  return { k: clampedK, x: width / 2 - centerX * clampedK, y: height / 2 - centerY * clampedK }
}

/**
 * Shared canvas for every static (non-physics) tree layout - mind map, left-to-right tree,
 * top-to-bottom org chart, and fishbone. All four only differ in how `computeTreeLayout` places
 * nodes/edges; zoom/pan, node dragging (reparenting), click-to-open, and the create/context menus
 * are implemented once here instead of once per layout.
 */
export default function TreeGraphView({
  projectName,
  notes,
  layout: layoutId,
  onSelectNote,
  onCreateRootNote,
  onSetParent,
  onChangeAppearance,
  rootAppearance,
  onChangeRootAppearance,
  onChangeEdgeOverride,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 900, height: 600 })

  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  useEffect(() => {
    transformRef.current = transform
  }, [transform])
  const autoFitRef = useRef(true)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ screen: Point; world: Point } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  useClickOutside(contextMenuRef, contextMenu !== null, closeContextMenu)
  // Rechtes Seitenpanel: panelOpen steuert Sichtbarkeit, selectedNodeId die kontextabhängige
  // Auswahl innerhalb des offenen Panels ('__root__' = virtueller Projekt-Mittelpunkt, sonst eine
  // Notiz-ID). Ein Klick auf einen Knoten öffnet das Panel UND wählt ihn aus; ein Klick auf leere
  // Canvas-Fläche schließt das Panel komplett (siehe handleBackgroundPointerDown) - es gibt keinen
  // permanent sichtbaren "globalen" Panel-Zustand.
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  // A clicked EDGE (not node) opens EdgeOverridePanel instead of GraphSidePanel - mutually
  // exclusive with selectedNodeId (selecting an edge clears the node selection and vice versa,
  // see selectEdge/selectNode below), sharing the same panelOpen/animated-width slot.
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNoteId: string; targetNoteId: string } | null>(null)
  const [createNoteAt, setCreateNoteAt] = useState<Point | null>(null)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const result = useMemo(() => computeTreeLayout(layoutId, notes), [layoutId, notes])
  const { nodes: layout, edges } = result
  const nodes = useMemo(() => Array.from(layout.values()), [layout])
  // Lookup for edge styling: each edge is styled by its SOURCE (parent) note's edgeStyle/edgeArrow
  // - see edgeStyles.tsx's doc comment. Root-level edges (edge.parentId === null, from the virtual
  // project center) have no source note, so they're styled from the rootAppearance prop instead
  // (see the edges.map block below).
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
      if (autoFitRef.current) {
        const fitted = computeFitTransform([{ x: 0, y: 0 }, ...nodes.map((n) => ({ x: n.x, y: n.y }))], width, height)
        transformRef.current = fitted
        setTransform(fitted)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const idKey = notes.map((n) => `${n.id}:${n.parentNoteId ?? ''}`).join(',')

  useLayoutEffect(() => {
    if (!autoFitRef.current) return
    const points = [{ x: 0, y: 0 }, ...nodes.map((n) => ({ x: n.x, y: n.y }))]
    const fitted = computeFitTransform(points, size.width, size.height)
    transformRef.current = fitted
    setTransform(fitted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, layoutId, size.width, size.height])

  function resetFit() {
    autoFitRef.current = true
    const points = [{ x: 0, y: 0 }, ...nodes.map((n) => ({ x: n.x, y: n.y }))]
    const fitted = computeFitTransform(points, size.width, size.height)
    transformRef.current = fitted
    setTransform(fitted)
  }

  function screenToWorld(container: Element, clientX: number, clientY: number): { screen: Point; world: Point } {
    const rect = container.getBoundingClientRect()
    const screen = { x: clientX - rect.left, y: clientY - rect.top }
    const t = transformRef.current
    return { screen, world: { x: (screen.x - t.x) / t.k, y: (screen.y - t.y) / t.k } }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    const { screen, world } = screenToWorld(event.currentTarget, event.clientX, event.clientY)
    setContextMenu({ screen, world })
  }

  function openCreateNoteInput() {
    if (!contextMenu) return
    setCreateNoteAt(contextMenu.screen)
    setContextMenu(null)
    setActionError(null)
  }

  async function submitCreateNote(event: React.FormEvent) {
    event.preventDefault()
    const title = newNodeTitle.trim()
    if (!title) return
    try {
      await onCreateRootNote(title)
      setCreateNoteAt(null)
      setNewNodeTitle('')
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Notiz konnte nicht erstellt werden.')
    }
  }

  // Rechtsklick auf einen Knoten bleibt als Schnellzugriff bestehen: öffnet das Panel direkt mit
  // diesem Knoten ausgewählt, statt (wie zuvor) ein eigenes Popup an der Klickposition zu zeigen.
  function handleNodeContextMenu(noteId: string) {
    return (event: React.MouseEvent<SVGGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
      selectNode(noteId)
    }
  }

  // Also used for the virtual project center via drag.id === '__root__' (see its onPointerDown
  // below) - setSelectedNodeId('__root__') is exactly what a dedicated selectRoot() used to do.
  function selectNode(noteId: string) {
    setSelectedEdge(null)
    setSelectedNodeId(noteId)
    setPanelOpen(true)
  }

  function selectEdge(sourceNoteId: string, targetNoteId: string) {
    setSelectedNodeId(null)
    setSelectedEdge({ sourceNoteId, targetNoteId })
    setPanelOpen(true)
  }

  async function detachFromParent(noteId: string) {
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    try {
      await onSetParent(noteId, null)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Zuordnung konnte nicht geändert werden.')
    }
  }

  async function changeNodeAppearance(
    noteId: string,
    patch: {
      color?: string | null
      shape?: NoteShape | null
      edgeStyle?: NoteEdgeStyle | null
      edgeArrow?: NoteEdgeArrow | null
      edgeWidth?: number | null
      edgeColor?: string | null
    },
  ) {
    try {
      await onChangeAppearance(noteId, patch)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Aussehen konnte nicht geändert werden.')
    }
  }

  function handleNodePointerDown(id: string) {
    return (event: React.PointerEvent<SVGGElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = { id, moved: false }
      setDraggedId(id)
    }
  }

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    // Klick auf leere Canvas-Fläche schließt das Panel komplett - es gibt keinen permanent
    // sichtbaren "globalen" Panel-Zustand mehr, das Panel erscheint nur bei einer echten Auswahl
    // (ein Knoten, eine Kante oder der Mittelpunkt).
    setPanelOpen(false)
    setSelectedNodeId(null)
    setSelectedEdge(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    autoFitRef.current = false
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y }
  }

  function handleSvgPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (panRef.current) {
      const pan = panRef.current
      const dx = event.clientX - pan.startX
      const dy = event.clientY - pan.startY
      setTransform((prev) => ({ ...prev, x: pan.originX + dx, y: pan.originY + dy }))
      return
    }

    const drag = draggingRef.current
    if (!drag) return
    drag.moved = true

    // Hit-test against every other node's screen position to highlight a drop target while
    // dragging - the dragged node itself doesn't move visually (the tree layout is computed,
    // not free-form), only the drop target highlight follows the pointer.
    const rect = event.currentTarget.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const t = transformRef.current
    const worldX = (screenX - t.x) / t.k
    const worldY = (screenY - t.y) / t.k

    let closestId: string | null = null
    // Hit radius in world units, scaled so zoom doesn't change hit feel. Widened from the previous
    // small-circle-node value (28) since nodes now render as text-sized boxes (see
    // notesGraph/NoteNodeShape.tsx) rather than small fixed dots.
    let closestDist = 55 / t.k
    for (const n of nodes) {
      if (n.id === drag.id) continue
      const dist = Math.hypot(n.x - worldX, n.y - worldY)
      if (dist < closestDist) {
        closestDist = dist
        closestId = n.id
      }
    }
    // Also allow dropping on the center (project) node to detach a note back to root level.
    const centerDist = Math.hypot(worldX, worldY)
    setDragOverId(centerDist < CENTER_RADIUS / t.k ? '__center__' : closestId)
  }

  async function handleSvgPointerUp() {
    if (panRef.current) {
      panRef.current = null
      return
    }

    const drag = draggingRef.current
    draggingRef.current = null
    const dropTarget = dragOverId
    setDragOverId(null)
    setDraggedId(null)
    if (!drag) return

    if (!drag.moved) {
      // A plain click (no drag) opens the right side panel with this node selected - previously
      // this jumped straight to opening the note, which made a quick color/shape change require a
      // right-click every time. "Notiz öffnen" is still one click away as the panel's first entry.
      // '__root__' (the virtual project center, see its onPointerDown above) is handled by the
      // same selectNode() call - it just sets selectedNodeId to '__root__', identical to what the
      // old dedicated selectRoot() did, so GraphSidePanel's kind: 'root' branch below still picks
      // it up correctly.
      setContextMenu(null)
      selectNode(drag.id)
      return
    }

    // The root has no backing Note to reparent - dragging it onto another node (or it being the
    // drop target for another drag, already excluded by CENTER_RADIUS's own '__center__' id) is a
    // no-op, not a reparent call.
    if (drag.id === '__root__') return
    if (!dropTarget) return

    const newParentId = dropTarget === '__center__' ? null : dropTarget
    const note = notes.find((n) => n.id === drag.id)
    if (!note || note.parentNoteId === newParentId) return

    try {
      await onSetParent(drag.id, newParentId)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Zuordnung konnte nicht geändert werden.')
    }
  }

  // Attached manually with { passive: false } instead of React's onWheel prop - React registers
  // wheel listeners as passive by default (for scroll-performance reasons that don't apply to an
  // SVG canvas that isn't a scroll container), and a passive listener silently ignores
  // preventDefault(), logging "Unable to preventDefault inside passive event listener
  // invocation." on every scroll tick without actually stopping the page from scrolling.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      autoFitRef.current = false
      const rect = el!.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const mouseY = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12

      setTransform((prev) => {
        const newK = Math.min(Math.max(prev.k * factor, MIN_ZOOM), MAX_ZOOM)
        const worldX = (mouseX - prev.x) / prev.k
        const worldY = (mouseY - prev.y) / prev.k
        return { x: mouseX - worldX * newK, y: mouseY - worldY * newK, k: newK }
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Shared by both the per-edge Gradient <defs> loop and the main edges.map() render loop below,
  // so the exact same start/end anchor points feed both - a Gradient def computed from slightly
  // different geometry than the line it's supposed to color would visibly misalign.
  function computeEdgeAnchors(edge: TreeEdge) {
    const childNote = notesById.get(edge.childId)
    const parentNote = edge.parentId ? notesById.get(edge.parentId) : null
    const endBox = measureNodeBox(childNote?.title ?? '', childNote?.shape ?? null)
    const startBox = edge.parentId
      ? measureNodeBox(parentNote?.title ?? '', parentNote?.shape ?? null)
      : rootAppearance.color || rootAppearance.shape
        ? measureNodeBox(projectName, rootAppearance.shape)
        : { width: CENTER_RADIUS * 2, height: CENTER_RADIUS * 2 }
    const start = clipPointToBoxEdge(edge.to, edge.from, startBox.width, startBox.height)
    const end = clipPointToBoxEdge(edge.from, edge.to, endBox.width, endBox.height)
    const sourceEdgeStyle = edge.parentId ? parentNote?.edgeStyle : rootAppearance.edgeStyle
    const sourceEdgeArrow = edge.parentId ? parentNote?.edgeArrow : rootAppearance.edgeArrow
    // Root-level edges (edge.parentId === null, from the virtual project center) have no source
    // Note to carry a width/color/override - the center has no backing Note row at all (it's a
    // frontend-only preference, see RootAppearance), so per-connection overrides (which are keyed
    // by two real Note ids) can't apply there either. Those edges always render at the plain
    // default width/color.
    const sourceEdgeWidth = edge.parentId ? parentNote?.edgeWidth : null
    const sourceEdgeColor = edge.parentId ? parentNote?.edgeColor : null
    const override = edge.parentId ? parentNote?.edgeOverrides.find((o) => o.targetNoteId === edge.childId) : undefined
    return { start, end, sourceEdgeStyle, sourceEdgeArrow, sourceEdgeWidth, sourceEdgeColor, override }
  }

  return (
    <div className="flex h-[75vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-slate-200/50 glass-panel shadow-sm dark:border-slate-700/50">
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className="relative min-w-0 flex-1 overflow-hidden"
      >
        <button
          onClick={resetFit}
          className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200/50 glass px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100/50 dark:border-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
        >
          Ansicht anpassen
        </button>

        <div className="absolute left-3 top-3 z-10 rounded border border-slate-200/50 bg-white/90 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-700/50 dark:bg-slate-900/90 dark:text-slate-300">
          Knoten ziehen &amp; auf Ziel ablegen, um zuzuordnen
        </div>

        {actionError && (
          <div className="absolute bottom-3 left-3 z-10 rounded border border-red-500/50 bg-white/90 px-3 py-1.5 text-xs text-red-500 dark:bg-slate-900/90 dark:text-red-400">
            {actionError}
          </div>
        )}

        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="absolute z-30 w-48 overflow-hidden rounded-xl border border-slate-200/50 glass shadow-xl dark:border-slate-700/50"
            style={{ left: contextMenu.screen.x, top: contextMenu.screen.y }}
          >
            <button
              onClick={openCreateNoteInput}
              className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Neue Hauptnotiz erstellen
            </button>
          </div>
        )}

        {createNoteAt && (
          <form
            onSubmit={submitCreateNote}
            className="absolute z-30 flex items-center gap-2 rounded-xl border border-slate-200/50 glass p-2 shadow-xl dark:border-slate-700/50"
            style={{ left: createNoteAt.x, top: createNoteAt.y }}
          >
            <input
              autoFocus
              value={newNodeTitle}
              onChange={(e) => setNewNodeTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setCreateNoteAt(null)
                  setNewNodeTitle('')
                }
              }}
              placeholder="Titel der Notiz"
              className="w-48 rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
            />
            <button type="submit" className="rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-accent-light">
              Anlegen
            </button>
          </form>
        )}

        {notes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Noch keine Notizen. Rechtsklick, um eine Hauptnotiz anzulegen.</p>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="none"
            className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
          >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            <EdgeMarkerDefs />
            {/* Per-edge Gradient <linearGradient> defs, collected in one place - see
                edgeGradientDefFor's doc comment for why each Gradient-styled edge needs its own
                geometry+color-specific def rather than a small fixed set like EdgeMarkerDefs. */}
            <defs>
              {edges.map((edge) => {
                const { start, end, sourceEdgeStyle, sourceEdgeColor, override } = computeEdgeAnchors(edge)
                if (sourceEdgeStyle !== 'Gradient') return null
                const highlighted = hoveredId !== null && (edge.childId === hoveredId || edge.parentId === hoveredId)
                const resolvedColor = resolveEdgeColor(sourceEdgeColor, override) ?? (highlighted ? EDGE_COLOR_HIGHLIGHT : EDGE_COLOR_NORMAL)
                return <g key={edge.childId}>{edgeGradientDefFor(sourceEdgeStyle, start.x, start.y, end.x, end.y, resolvedColor)}</g>
              })}
            </defs>
            {/* Edges: a straight line is misleading for the mind-map layout since both endpoints
                move along different rings - a slight quadratic curve through the midpoint reads
                as "flowing outward from parent to child". The other (tree-shaped) layouts read
                fine with the same curve, so one rendering path covers all four. Root notes get an
                edge from the virtual center (0,0) just like every other node - computeTreeLayout's
                buildEdges never skips depth-1 nodes, which is what fixes the original bug where
                the project-to-main-note connection was missing entirely.
                Style/arrowheads come from the edge's SOURCE (parent) note - edge.parentId is null
                for a root-level edge from the virtual center, which has no note to style from, so
                those use the frontend-only rootAppearance preference (see TreeGraphView's Props
                doc / NotesView's notesGraphRootAppearance preference) instead. The curve runs
                parent -> child, so marker-start sits at the parent end, marker-end at the child
                end. Each edge is wrapped in an invisible wider hit-area path + a click handler
                (root-level edges excluded - no source Note to attach an override to, see
                computeEdgeAnchors' doc comment) so a single line can be clicked to open
                EdgeOverridePanel, independent of clicking either endpoint's node. */}
            {edges.map((edge) => {
              // Anchor computation (box sizing including the root's own box - see
              // computeEdgeAnchors' doc comment - and the independent-clip-against-the-other-
              // end's-raw-center approach that fixed the "arrives at the wrong edge"/"no gap on
              // the root's side" bugs) is shared with the Gradient <defs> loop above, so both use
              // identical geometry.
              const { start, end, sourceEdgeStyle, sourceEdgeArrow, sourceEdgeWidth, sourceEdgeColor, override } = computeEdgeAnchors(edge)
              const midX = (start.x + end.x) / 2
              const midY = (start.y + end.y) / 2
              const highlighted = hoveredId !== null && (edge.childId === hoveredId || edge.parentId === hoveredId)
              const dimmed = hoveredId !== null && !highlighted
              const strokeClass = highlighted ? 'stroke-brand-primary dark:stroke-brand-primary-light' : 'stroke-slate-400 dark:stroke-slate-500'
              const { markerStart, markerEnd } = edgeMarkerRefs(sourceEdgeArrow, highlighted)
              const resolvedWidth = resolveEdgeWidth(sourceEdgeWidth, override, highlighted)
              const resolvedColor = resolveEdgeColor(sourceEdgeColor, override)
              // Gradient overrides the plain stroke-slate-400/stroke-brand-primary class (or a
              // resolved custom color) with an inline url() stroke (see edgeGradientStroke's doc
              // comment) - only the className/color is affected, width/dasharray/markers/opacity
              // stay the same either way.
              const gradientStroke = edgeGradientStroke(sourceEdgeStyle, start.x, start.y, end.x, end.y, resolvedColor ?? (highlighted ? EDGE_COLOR_HIGHLIGHT : EDGE_COLOR_NORMAL))
              const d = `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
              const opacity = dimmed ? 0.12 : highlighted ? 0.9 : 0.35
              const isSelected = selectedEdge?.sourceNoteId === edge.parentId && selectedEdge.targetNoteId === edge.childId
              return (
                <g key={edge.childId}>
                  <path
                    d={d}
                    fill="none"
                    className={`${gradientStroke ? '' : strokeClass} ${isSelected ? 'drop-shadow-[0_0_2px_rgba(99,102,241,0.6)]' : ''}`}
                    style={gradientStroke ? { stroke: gradientStroke } : resolvedColor ? { stroke: resolvedColor } : undefined}
                    strokeWidth={resolvedWidth}
                    strokeDasharray={edgeStrokeDasharray(sourceEdgeStyle)}
                    markerStart={markerStart}
                    markerEnd={markerEnd}
                    opacity={opacity}
                  />
                  {edge.parentId && (
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(resolvedWidth + 10, 14)}
                      className="cursor-pointer"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectEdge(edge.parentId!, edge.childId)
                      }}
                    />
                  )}
                </g>
              )
            })}

            {/* Center node: the project itself - now clickable to open the side panel with its own
                (frontend-only) appearance settings, see rootAppearance/onChangeRootAppearance.
                Rendered via the same NoteNodeVisual every note node uses (rather than a fixed
                <circle>) so a chosen root shape actually has a visible effect, matching how a
                real note's shape choice behaves. When no explicit shape/color is set, it falls
                back to the previous plain accent-colored circle look via the two overrides below. */}
            <g
              className="cursor-pointer"
              // Capture phase, not bubble (onPointerDownCapture, not onPointerDown) - React fires
              // capture handlers on inner elements BEFORE the outer <svg>'s onPointerDown
              // (handleBackgroundPointerDown) runs at all, which is what actually guarantees this
              // wins the race, not stopPropagation() alone. The previous bubble-phase version
              // (event.stopPropagation() in a regular onPointerDown) relied on React not having
              // already invoked handleBackgroundPointerDown by the time this ran - but React
              // resolves ALL bubble-phase handlers for a given phase together, so there was no
              // hard guarantee this inner handler's stopPropagation() would be seen before the
              // outer one's own pointerdown logic (setPointerCapture + panRef.current = {...})
              // already executed; once panRef.current is set, handleSvgPointerUp's very first
              // check (`if (panRef.current) { panRef.current = null; return }`) bails out before
              // ever looking at draggingRef, silently swallowing the click on PrimeSource. Capture
              // phase removes the ambiguity entirely: this always runs first.
              onPointerDownCapture={(event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                event.currentTarget.setPointerCapture(event.pointerId)
                draggingRef.current = { id: '__root__', moved: false }
              }}
              onPointerEnter={() => setHoveredId('__root__')}
              onPointerLeave={() => setHoveredId((prev) => (prev === '__root__' ? null : prev))}
            >
              {rootAppearance.color || rootAppearance.shape ? (
                <NoteNodeVisual
                  x={0}
                  y={0}
                  title={projectName.length > 16 ? `${projectName.slice(0, 15)}…` : projectName}
                  shape={rootAppearance.shape}
                  color={rootAppearance.color}
                  emphasized={dragOverId === '__center__'}
                  emphasisClassName="stroke-amber-500"
                />
              ) : (
                <>
                  <circle
                    cx={0}
                    cy={0}
                    r={CENTER_RADIUS}
                    className={`fill-brand-accent ${dragOverId === '__center__' ? 'stroke-amber-500' : 'stroke-white dark:stroke-slate-900'}`}
                    strokeWidth={dragOverId === '__center__' ? 3 : 2}
                  />
                  <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none select-none fill-white text-[11px] font-semibold">
                    {projectName.length > 16 ? `${projectName.slice(0, 15)}…` : projectName}
                  </text>
                </>
              )}
            </g>

            {nodes.map((n) => {
              const isHovered = n.id === hoveredId
              const isDragOver = n.id === dragOverId
              const isDragged = n.id === draggedId
              const emphasized = isHovered || isDragOver
              const emphasisClassName = isDragOver ? 'stroke-amber-500' : 'stroke-brand-primary dark:stroke-brand-primary-light'

              return (
                <g
                  key={n.id}
                  className="cursor-pointer"
                  opacity={isDragged ? 0.5 : 1}
                  onPointerDown={handleNodePointerDown(n.id)}
                  onPointerEnter={() => setHoveredId(n.id)}
                  onPointerLeave={() => setHoveredId((prev) => (prev === n.id ? null : prev))}
                  onContextMenu={handleNodeContextMenu(n.id)}
                >
                  <NoteNodeVisual
                    x={n.x}
                    y={n.y}
                    title={n.note.title}
                    shape={n.note.shape}
                    color={n.note.color}
                    emphasized={emphasized}
                    emphasisClassName={emphasisClassName}
                  />
                </g>
              )
            })}
          </g>
          </svg>
        )}
      </div>

      {/* The panel is a flex sibling with an animated width (not absolutely positioned over the
          canvas) so opening/closing it actually shrinks/grows the canvas area next to it - the
          ResizeObserver on containerRef above picks up the resulting size change and recomputes
          the SVG viewBox, which is what makes the graph itself visibly slide/resize alongside the
          panel instead of the panel just appearing on top of a static canvas. w-0 with
          overflow-hidden keeps the closed panel from taking any layout space or being focusable. */}
      <div className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${panelOpen ? 'w-72' : 'w-0'}`}>
        <div className="h-full w-72">
          {panelOpen && selectedEdge ? (
            (() => {
              const sourceNote = notesById.get(selectedEdge.sourceNoteId)
              const targetNote = notesById.get(selectedEdge.targetNoteId)
              const override = sourceNote?.edgeOverrides.find((o) => o.targetNoteId === selectedEdge.targetNoteId) ?? null
              if (!sourceNote || !targetNote) return null
              return (
                <EdgeOverridePanel
                  sourceTitle={sourceNote.title}
                  targetTitle={targetNote.title}
                  width={override?.width ?? null}
                  color={override?.color ?? null}
                  fallbackWidth={sourceNote.edgeWidth ?? DEFAULT_EDGE_WIDTH}
                  fallbackColor={sourceNote.edgeColor ?? EDGE_COLOR_NORMAL}
                  onChangeWidth={(width) => onChangeEdgeOverride(selectedEdge.sourceNoteId, selectedEdge.targetNoteId, width, override?.color ?? null)}
                  onChangeColor={(color) => onChangeEdgeOverride(selectedEdge.sourceNoteId, selectedEdge.targetNoteId, override?.width ?? null, color)}
                  onClose={() => {
                    setPanelOpen(false)
                    setSelectedEdge(null)
                  }}
                />
              )
            })()
          ) : panelOpen ? (
            <GraphSidePanel
              selected={
                selectedNodeId === '__root__'
                  ? { kind: 'root' }
                  : selectedNodeId
                    ? { kind: 'note', note: notes.find((n) => n.id === selectedNodeId) }
                    : null
              }
              onClose={() => {
                setPanelOpen(false)
                setSelectedNodeId(null)
              }}
              onOpenNote={onSelectNote}
              onDetachParent={detachFromParent}
              showDetachParent
              onChangeNoteAppearance={changeNodeAppearance}
              rootAppearance={rootAppearance}
              onChangeRootAppearance={onChangeRootAppearance}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
