import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import type { Note, NoteShape } from '../api/types'
import { NoteNodeVisual } from './notesGraph/NoteNodeShape'
import NoteAppearanceMenu from './notesGraph/NoteAppearanceMenu'

interface Props {
  notes: Note[]
  onSelectNote: (note: Note) => void
  onCreateNote: (title: string) => Promise<void>
  onConnectNotes: (sourceId: string, targetId: string) => Promise<void>
  onChangeAppearance: (noteId: string, patch: { color?: string | null; shape?: NoteShape | null }) => Promise<void>
}

interface Point {
  x: number
  y: number
}

interface GraphNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

interface Transform {
  x: number
  y: number
  k: number
}

// REPULSION/LINK_DISTANCE were tuned for the previous small fixed-radius circle nodes. Node boxes
// now grow to fit their title text (see notesGraph/NoteNodeShape.tsx's measureNodeBox, up to
// ~160px wide for a long title, vs. the previous ~9-26px circle diameter) - both are increased so
// nodes with real text content don't settle overlapping each other.
const REPULSION = 5500
const LINK_DISTANCE = 160
const LINK_STRENGTH = 0.05
const CENTER_STRENGTH = 0.02
const VELOCITY_DECAY = 0.35
const ALPHA_DECAY = 0.02
const ALPHA_MIN = 0.001
const MIN_ZOOM = 0.15
const MAX_ZOOM = 5

function buildEdges(notes: Note[]): [string, string][] {
  const seen = new Set<string>()
  const edges: [string, string][] = []
  for (const note of notes) {
    for (const link of note.outgoingLinks) {
      const key = [note.id, link.id].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([note.id, link.id])
    }
  }
  return edges
}

// One simulation step; forces scale with alpha so movement naturally settles (d3-force style).
function computeFitTransform(nodes: GraphNode[], width: number, height: number): Transform {
  if (nodes.length === 0) return { x: 0, y: 0, k: 1 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x)
    maxY = Math.max(maxY, n.y)
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

function tick(nodes: GraphNode[], edges: [string, string][], alpha: number, width: number, height: number, pinnedId: string | null) {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (const n of nodes) {
    if (n.id === pinnedId) continue
    let fx = 0
    let fy = 0
    for (const other of nodes) {
      if (other === n) continue
      const dx = n.x - other.x
      const dy = n.y - other.y
      const distSq = Math.max(dx * dx + dy * dy, 1)
      const dist = Math.sqrt(distSq)
      const force = (REPULSION * alpha) / distSq
      fx += (dx / dist) * force
      fy += (dy / dist) * force
    }
    fx += (width / 2 - n.x) * CENTER_STRENGTH * alpha
    fy += (height / 2 - n.y) * CENTER_STRENGTH * alpha
    n.vx = (n.vx + fx) * (1 - VELOCITY_DECAY)
    n.vy = (n.vy + fy) * (1 - VELOCITY_DECAY)
  }

  for (const [a, b] of edges) {
    const na = byId.get(a)
    const nb = byId.get(b)
    if (!na || !nb) continue
    const dx = nb.x - na.x
    const dy = nb.y - na.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const diff = (dist - LINK_DISTANCE) * LINK_STRENGTH * alpha
    const fx = (dx / dist) * diff
    const fy = (dy / dist) * diff
    if (na.id !== pinnedId) {
      na.vx += fx
      na.vy += fy
    }
    if (nb.id !== pinnedId) {
      nb.vx += fx
      nb.vy += fy
    }
  }

  for (const n of nodes) {
    if (n.id === pinnedId) continue
    n.x += n.vx
    n.y += n.vy
  }
}

export default function NoteGraphView({ notes, onSelectNote, onCreateNote, onConnectNotes, onChangeAppearance }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 900, height: 600 })
  const sizeRef = useRef(size)
  sizeRef.current = size

  const positionsRef = useRef<Map<string, GraphNode>>(new Map())
  const alphaRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const pendingSpawnRef = useRef<Point | null>(null)

  const [, forceRender] = useReducer((c: number) => c + 1, 0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  transformRef.current = transform
  const autoFitRef = useRef(true)

  const [contextMenu, setContextMenu] = useState<{ screen: Point; world: Point } | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ screen: Point; noteId: string } | null>(null)
  const [createNoteAt, setCreateNoteAt] = useState<{ screen: Point; world: Point } | null>(null)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [connectFirstId, setConnectFirstId] = useState<string | null>(null)

  const edges = useMemo(() => buildEdges(notes), [notes])
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  const degree = useMemo(() => {
    const map = new Map<string, number>()
    for (const [a, b] of edges) {
      map.set(a, (map.get(a) ?? 0) + 1)
      map.set(b, (map.get(b) ?? 0) + 1)
    }
    return map
  }, [edges])

  const neighborIds = useMemo(() => {
    if (!hoveredId) return null
    const set = new Set<string>()
    for (const [a, b] of edges) {
      if (a === hoveredId) set.add(b)
      if (b === hoveredId) set.add(a)
    }
    return set
  }, [edges, hoveredId])

  // Layout effect (not a regular effect) so the real container size is measured and
  // committed before the idKey effect below runs its first fit/center computation -
  // ResizeObserver's own callback fires asynchronously and would otherwise leave that
  // first computation working off the 900x600 placeholder, visibly off-center.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Safety net: re-fit whenever the measured size actually changes (covers the container
  // being resized, or any residual timing gap in the very first measurement above), as
  // long as the user hasn't taken manual control of the camera.
  useEffect(() => {
    if (!autoFitRef.current) return
    const fitted = computeFitTransform(Array.from(positionsRef.current.values()), size.width, size.height)
    transformRef.current = fitted
    setTransform(fitted)
  }, [size.width, size.height])

  function step() {
    const nodes = Array.from(positionsRef.current.values())
    const { width, height } = sizeRef.current
    tick(nodes, edgesRef.current, alphaRef.current, width, height, draggingRef.current?.id ?? null)
    alphaRef.current *= 1 - ALPHA_DECAY

    // Keep the camera fit to the current spread of nodes while the layout is still settling
    // (or permanently, for as long as the user hasn't manually panned/zoomed) - otherwise a
    // freshly created note can land far outside the default view, looking tiny/off-screen.
    if (autoFitRef.current && !draggingRef.current) {
      transformRef.current = computeFitTransform(nodes, width, height)
      setTransform(transformRef.current)
    }

    forceRender()
    rafRef.current = alphaRef.current > ALPHA_MIN ? requestAnimationFrame(step) : null
  }

  function wake(amount: number) {
    alphaRef.current = Math.max(alphaRef.current, amount)
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(step)
    }
  }

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const idKey = notes.map((n) => n.id).join(',')

  useEffect(() => {
    const known = positionsRef.current
    const { width, height } = sizeRef.current
    for (const id of Array.from(known.keys())) {
      if (!notes.some((n) => n.id === id)) known.delete(id)
    }
    for (const note of notes) {
      if (!known.has(note.id)) {
        const spawn = pendingSpawnRef.current
        known.set(note.id, {
          id: note.id,
          x: spawn ? spawn.x : width / 2 + (Math.random() - 0.5) * 120,
          y: spawn ? spawn.y : height / 2 + (Math.random() - 0.5) * 120,
          vx: 0,
          vy: 0,
        })
      }
    }
    pendingSpawnRef.current = null

    // A structural change (note added/removed) re-enables auto-fit even if the user had
    // previously zoomed/panned manually, and frames the new set of nodes immediately so
    // there's no flash at the stale zoom level before the physics loop's first tick.
    autoFitRef.current = true
    const fitted = computeFitTransform(Array.from(known.values()), width, height)
    transformRef.current = fitted
    setTransform(fitted)

    wake(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey])

  function handleNodePointerDown(id: string) {
    return (event: React.PointerEvent<SVGGElement>) => {
      // Only the primary (left) button drags/selects - a right-click must fall through
      // to the native contextmenu event instead of also registering as a select-click.
      if (event.button !== 0) return
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = { id, moved: false }
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

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    setNodeMenu(null)
    if (connectMode) {
      setConnectMode(false)
      setConnectFirstId(null)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    autoFitRef.current = false
    panRef.current = { startX: event.clientX, startY: event.clientY, originX: transform.x, originY: transform.y }
  }

  function screenToWorld(container: Element, clientX: number, clientY: number): { screen: Point; world: Point } {
    const rect = container.getBoundingClientRect()
    const screen = { x: clientX - rect.left, y: clientY - rect.top }
    const t = transformRef.current
    return { screen, world: { x: (screen.x - t.x) / t.k, y: (screen.y - t.y) / t.k } }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    setConnectMode(false)
    setConnectFirstId(null)
    setNodeMenu(null)
    setContextMenu(screenToWorld(event.currentTarget, event.clientX, event.clientY))
  }

  function openCreateNoteInput() {
    if (!contextMenu) return
    setCreateNoteAt(contextMenu)
    setContextMenu(null)
    setActionError(null)
  }

  function startConnectMode() {
    setConnectMode(true)
    setConnectFirstId(null)
    setContextMenu(null)
    setActionError(null)
  }

  async function submitCreateNote(event: React.FormEvent) {
    event.preventDefault()
    if (!createNoteAt) return
    const title = newNodeTitle.trim()
    if (!title) return

    pendingSpawnRef.current = createNoteAt.world
    try {
      await onCreateNote(title)
      setCreateNoteAt(null)
      setNewNodeTitle('')
      setActionError(null)
    } catch (err) {
      pendingSpawnRef.current = null
      setActionError(err instanceof ApiError ? err.message : 'Notiz konnte nicht erstellt werden.')
    }
  }

  function handleConnectClick(id: string) {
    if (!connectFirstId) {
      setConnectFirstId(id)
      return
    }
    if (connectFirstId === id) {
      setConnectFirstId(null)
      return
    }

    const sourceId = connectFirstId
    setConnectMode(false)
    setConnectFirstId(null)
    onConnectNotes(sourceId, id).catch((err) => {
      setActionError(err instanceof ApiError ? err.message : 'Verbindung konnte nicht gespeichert werden.')
    })
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setContextMenu(null)
      setNodeMenu(null)
      setCreateNoteAt(null)
      setConnectMode(false)
      setConnectFirstId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
    const node = positionsRef.current.get(drag.id)
    if (!node) return

    const rect = event.currentTarget.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const t = transformRef.current
    node.x = (screenX - t.x) / t.k
    node.y = (screenY - t.y) / t.k
    node.vx = 0
    node.vy = 0
    drag.moved = true

    // Render this move immediately instead of waiting for the physics loop's next tick -
    // if the simulation had already settled (alpha decayed to ~0), wake() alone wouldn't
    // produce a visible frame until the loop actually ran, making the node lag behind the
    // cursor and only "catch up" once the loop resumed (e.g. on release).
    forceRender()
    wake(0.3)
  }

  function handleSvgPointerUp() {
    if (panRef.current) {
      panRef.current = null
      return
    }

    const drag = draggingRef.current
    draggingRef.current = null
    if (!drag) return

    if (!drag.moved) {
      if (connectMode) {
        handleConnectClick(drag.id)
        return
      }
      const note = notes.find((n) => n.id === drag.id)
      if (note) onSelectNote(note)
      return
    }

    wake(0.4)
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
        onClick={() => {
          autoFitRef.current = true
          const fitted = computeFitTransform(Array.from(positionsRef.current.values()), sizeRef.current.width, sizeRef.current.height)
          transformRef.current = fitted
          setTransform(fitted)
        }}
        className="absolute right-4 top-4 z-10 rounded-lg border border-slate-200/50 glass px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100/50 dark:border-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        Ansicht anpassen
      </button>

      {connectMode && (
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded border border-amber-500/50 bg-white/90 px-3 py-1.5 text-xs text-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
          {connectFirstId ? 'Ziel-Notiz anklicken, um zu verbinden…' : 'Erste Notiz anklicken…'}
          <button
            onClick={() => {
              setConnectMode(false)
              setConnectFirstId(null)
            }}
            className="text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
          >
            Abbrechen
          </button>
        </div>
      )}

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
              Neue Notiz erstellen
            </button>
            <button
              onClick={startConnectMode}
              disabled={notes.length < 2}
              className="block w-full px-4 py-2 text-left font-medium text-slate-700 transition-colors hover:bg-slate-100/50 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              Notizen verbinden
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
          style={{ left: createNoteAt.screen.x, top: createNoteAt.screen.y }}
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
        <p className="p-6 text-sm text-slate-500">Noch keine Notizen. Rechtsklick, um eine anzulegen.</p>
      ) : (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size.width} ${size.height}`}
          preserveAspectRatio="none"
          className={`h-full w-full touch-none ${connectMode ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            {edges.map(([a, b]) => {
              const na = positionsRef.current.get(a)
              const nb = positionsRef.current.get(b)
              if (!na || !nb) return null
              const highlighted = hoveredId !== null && (a === hoveredId || b === hoveredId)
              const dimmed = hoveredId !== null && !highlighted
              const strokeClass = highlighted ? 'stroke-brand-primary dark:stroke-brand-primary-light' : 'stroke-slate-400 dark:stroke-slate-500'
              return (
                <line
                  key={`${a}-${b}`}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  className={strokeClass}
                  strokeWidth={highlighted ? 1.5 : 1}
                  opacity={dimmed ? 0.12 : highlighted ? 0.9 : 0.35}
                />
              )
            })}

            {notes.map((note) => {
              const pos = positionsRef.current.get(note.id)
              if (!pos) return null
              const isHovered = note.id === hoveredId
              const isNeighbor = neighborIds?.has(note.id) ?? false
              const isConnectSource = note.id === connectFirstId
              const dimmed = hoveredId !== null && !isHovered && !isNeighbor
              const emphasized = isHovered || isConnectSource || isNeighbor
              const emphasisClassName = isConnectSource
                ? 'stroke-amber-500'
                : isHovered
                  ? 'stroke-brand-primary dark:stroke-brand-primary-light'
                  : 'stroke-slate-700 dark:stroke-slate-200'
              // Well-connected notes get a slightly larger box, mirroring the previous
              // degree-scaled circle radius (up to +30% at 10+ connections) instead of a fixed size.
              const scale = 1 + Math.min(degree.get(note.id) ?? 0, 10) * 0.03

              return (
                <g
                  key={note.id}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.25 : 1}
                  transform={scale !== 1 ? `translate(${pos.x} ${pos.y}) scale(${scale}) translate(${-pos.x} ${-pos.y})` : undefined}
                  onPointerDown={handleNodePointerDown(note.id)}
                  onPointerEnter={() => setHoveredId(note.id)}
                  onPointerLeave={() => setHoveredId((prev) => (prev === note.id ? null : prev))}
                  onContextMenu={handleNodeContextMenu(note.id)}
                >
                  <NoteNodeVisual
                    x={pos.x}
                    y={pos.y}
                    title={note.title}
                    shape={note.shape}
                    color={note.color}
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
