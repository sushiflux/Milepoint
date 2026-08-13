import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Note } from '../api/types'

interface Props {
  notes: Note[]
  onSelectNote: (note: Note) => void
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

const REPULSION = 2000
const LINK_DISTANCE = 90
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

export default function NoteGraphView({ notes, onSelectNote }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 900, height: 600 })
  const sizeRef = useRef(size)
  sizeRef.current = size

  const positionsRef = useRef<Map<string, GraphNode>>(new Map())
  const alphaRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)

  const [, forceRender] = useReducer((c: number) => c + 1, 0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  transformRef.current = transform
  const autoFitRef = useRef(true)

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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
        known.set(note.id, {
          id: note.id,
          x: width / 2 + (Math.random() - 0.5) * 120,
          y: height / 2 + (Math.random() - 0.5) * 120,
          vx: 0,
          vy: 0,
        })
      }
    }

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
    return (event: React.PointerEvent<SVGCircleElement>) => {
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = { id, moved: false }
    }
  }

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
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
      const note = notes.find((n) => n.id === drag.id)
      if (note) onSelectNote(note)
      return
    }

    wake(0.4)
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault()
    autoFitRef.current = false
    const rect = event.currentTarget.getBoundingClientRect()
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

  return (
    <div
      ref={containerRef}
      className="relative h-[75vh] min-h-[480px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0a0a0c]"
    >
      <button
        onClick={() => {
          autoFitRef.current = true
          const fitted = computeFitTransform(Array.from(positionsRef.current.values()), sizeRef.current.width, sizeRef.current.height)
          transformRef.current = fitted
          setTransform(fitted)
        }}
        className="absolute right-3 top-3 z-10 rounded border border-slate-300 bg-white/80 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        Ansicht anpassen
      </button>

      {notes.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">Noch keine Notizen für die Graph-Ansicht.</p>
      ) : (
        <svg
          viewBox={`0 0 ${size.width} ${size.height}`}
          className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
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
              const strokeClass = highlighted ? 'stroke-indigo-500 dark:stroke-indigo-400' : 'stroke-slate-400 dark:stroke-slate-500'
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
              const dimmed = hoveredId !== null && !isHovered && !isNeighbor
              const radius = 4 + Math.min(degree.get(note.id) ?? 0, 10) * 1.3
              const fillClass = isHovered
                ? 'fill-indigo-600 dark:fill-indigo-400'
                : isNeighbor
                  ? 'fill-slate-700 dark:fill-slate-200'
                  : 'fill-slate-500 dark:fill-slate-400'

              return (
                <g key={note.id} opacity={dimmed ? 0.25 : 1}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={radius}
                    className={`cursor-pointer ${fillClass} ${isHovered ? 'stroke-slate-900 dark:stroke-white' : ''}`}
                    strokeWidth={isHovered ? 1.5 : 0}
                    onPointerDown={handleNodePointerDown(note.id)}
                    onPointerEnter={() => setHoveredId(note.id)}
                    onPointerLeave={() => setHoveredId((prev) => (prev === note.id ? null : prev))}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + radius + 12}
                    textAnchor="middle"
                    className={`pointer-events-none select-none text-[10px] ${
                      isHovered || isNeighbor ? 'fill-slate-700 dark:fill-slate-200' : 'fill-slate-500'
                    }`}
                  >
                    {note.title}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      )}
    </div>
  )
}
