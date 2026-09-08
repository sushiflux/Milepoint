import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import type { Note, NoteShape } from '../../api/types'
import { computeTreeLayout, type Point, type TreeLayoutId } from './treeLayouts'
import { NoteNodeVisual } from './NoteNodeShape'
import NoteAppearanceMenu from './NoteAppearanceMenu'

interface Props {
  projectName: string
  notes: Note[]
  layout: TreeLayoutId
  onSelectNote: (note: Note) => void
  onCreateRootNote: (title: string) => Promise<void>
  onSetParent: (noteId: string, parentNoteId: string | null) => Promise<void>
  onChangeAppearance: (noteId: string, patch: { color?: string | null; shape?: NoteShape | null }) => Promise<void>
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
  const [nodeMenu, setNodeMenu] = useState<{ screen: Point; noteId: string } | null>(null)
  const [createNoteAt, setCreateNoteAt] = useState<Point | null>(null)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  const result = useMemo(() => computeTreeLayout(layoutId, notes), [layoutId, notes])
  const { nodes: layout, edges } = result
  const nodes = useMemo(() => Array.from(layout.values()), [layout])

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
    setNodeMenu(null)
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

  function handleNodeContextMenu(noteId: string) {
    return (event: React.MouseEvent<SVGGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return
      setNodeMenu({ screen: { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top }, noteId })
    }
  }

  async function detachFromParent(noteId: string) {
    setNodeMenu(null)
    const note = notes.find((n) => n.id === noteId)
    if (!note) return
    try {
      await onSetParent(noteId, null)
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Zuordnung konnte nicht geändert werden.')
    }
  }

  async function changeNodeColor(noteId: string, color: string | null) {
    try {
      await onChangeAppearance(noteId, { color })
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Farbe konnte nicht geändert werden.')
    }
  }

  async function changeNodeShape(noteId: string, shape: NoteShape | null) {
    try {
      await onChangeAppearance(noteId, { shape })
      setActionError(null)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Form konnte nicht geändert werden.')
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
    setNodeMenu(null)
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
      const note = notes.find((n) => n.id === drag.id)
      if (note) onSelectNote(note)
      return
    }

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

  const nodeMenuNote = nodeMenu ? notes.find((n) => n.id === nodeMenu.noteId) ?? null : null

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      className="relative h-[75vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-slate-200/50 glass-panel shadow-sm dark:border-slate-700/50"
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
        <>
          <div className="fixed inset-0 z-20" onClick={() => setContextMenu(null)} />
          <div
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
        </>
      )}

      {nodeMenu && nodeMenuNote && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setNodeMenu(null)} />
          <div
            className="absolute z-30 w-56 overflow-hidden rounded-xl border border-slate-200/50 glass shadow-xl dark:border-slate-700/50"
            style={{ left: nodeMenu.screen.x, top: nodeMenu.screen.y }}
          >
            <button
              onClick={() => {
                onSelectNote(nodeMenuNote)
                setNodeMenu(null)
              }}
              className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Notiz öffnen
            </button>
            <button
              onClick={() => detachFromParent(nodeMenuNote.id)}
              disabled={!nodeMenuNote.parentNoteId}
              className="block w-full px-3 py-1.5 text-left text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Elternzuordnung entfernen
            </button>
            <NoteAppearanceMenu
              color={nodeMenuNote.color}
              shape={nodeMenuNote.shape}
              onChangeColor={(color) => changeNodeColor(nodeMenuNote.id, color)}
              onChangeShape={(shape) => changeNodeShape(nodeMenuNote.id, shape)}
            />
          </div>
        </>
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
            {/* Edges: a straight line is misleading for the mind-map layout since both endpoints
                move along different rings - a slight quadratic curve through the midpoint reads
                as "flowing outward from parent to child". The other (tree-shaped) layouts read
                fine with the same curve, so one rendering path covers all four. Root notes get an
                edge from the virtual center (0,0) just like every other node - computeTreeLayout's
                buildEdges never skips depth-1 nodes, which is what fixes the original bug where
                the project-to-main-note connection was missing entirely. */}
            {edges.map((edge) => {
              const { from: start, to: end } = edge
              const midX = (start.x + end.x) / 2
              const midY = (start.y + end.y) / 2
              const highlighted = hoveredId !== null && (edge.childId === hoveredId || edge.parentId === hoveredId)
              const dimmed = hoveredId !== null && !highlighted
              const strokeClass = highlighted ? 'stroke-brand-primary dark:stroke-brand-primary-light' : 'stroke-slate-400 dark:stroke-slate-500'
              return (
                <path
                  key={edge.childId}
                  d={`M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`}
                  fill="none"
                  className={strokeClass}
                  strokeWidth={highlighted ? 1.5 : 1}
                  opacity={dimmed ? 0.12 : highlighted ? 0.9 : 0.35}
                />
              )
            })}

            {/* Center node: the project itself. */}
            <g>
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
  )
}
