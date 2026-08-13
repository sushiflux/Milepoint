import { useEffect, useMemo, useReducer, useRef } from 'react'
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

const WIDTH = 900
const HEIGHT = 520
const REPULSION = 2600
const LINK_DISTANCE = 100
const LINK_STRENGTH = 0.02
const CENTER_STRENGTH = 0.008
const DAMPING = 0.82

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

function simulate(nodes: GraphNode[], edges: [string, string][], pinnedId: string | null, iterations: number) {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (let iter = 0; iter < iterations; iter++) {
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
        const force = REPULSION / distSq
        fx += (dx / dist) * force
        fy += (dy / dist) * force
      }
      fx += (WIDTH / 2 - n.x) * CENTER_STRENGTH
      fy += (HEIGHT / 2 - n.y) * CENTER_STRENGTH
      n.vx = (n.vx + fx) * DAMPING
      n.vy = (n.vy + fy) * DAMPING
    }

    for (const [a, b] of edges) {
      const na = byId.get(a)
      const nb = byId.get(b)
      if (!na || !nb) continue
      const dx = nb.x - na.x
      const dy = nb.y - na.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const diff = (dist - LINK_DISTANCE) * LINK_STRENGTH
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
      n.x = Math.max(20, Math.min(WIDTH - 20, n.x + n.vx))
      n.y = Math.max(20, Math.min(HEIGHT - 20, n.y + n.vy))
    }
  }
}

export default function NoteGraphView({ notes, onSelectNote }: Props) {
  const positionsRef = useRef<Map<string, GraphNode>>(new Map())
  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const [, forceRender] = useReducer((c: number) => c + 1, 0)

  const edges = useMemo(() => buildEdges(notes), [notes])
  const degree = useMemo(() => {
    const map = new Map<string, number>()
    for (const [a, b] of edges) {
      map.set(a, (map.get(a) ?? 0) + 1)
      map.set(b, (map.get(b) ?? 0) + 1)
    }
    return map
  }, [edges])

  const idKey = notes.map((n) => n.id).join(',')
  const edgeKey = edges.map((e) => e.join('-')).join(',')

  useEffect(() => {
    const known = positionsRef.current
    for (const id of Array.from(known.keys())) {
      if (!notes.some((n) => n.id === id)) known.delete(id)
    }
    for (const note of notes) {
      if (!known.has(note.id)) {
        known.set(note.id, {
          id: note.id,
          x: WIDTH / 2 + (Math.random() - 0.5) * 80,
          y: HEIGHT / 2 + (Math.random() - 0.5) * 80,
          vx: 0,
          vy: 0,
        })
      }
    }

    simulate(Array.from(known.values()), edges, null, 220)
    forceRender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, edgeKey])

  function handlePointerDown(id: string) {
    return (event: React.PointerEvent<SVGCircleElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      draggingRef.current = { id, moved: false }
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = draggingRef.current
    if (!drag) return
    const node = positionsRef.current.get(drag.id)
    if (!node) return

    const rect = event.currentTarget.getBoundingClientRect()
    const scaleX = WIDTH / rect.width
    const scaleY = HEIGHT / rect.height
    node.x = (event.clientX - rect.left) * scaleX
    node.y = (event.clientY - rect.top) * scaleY
    node.vx = 0
    node.vy = 0
    drag.moved = true

    simulate(Array.from(positionsRef.current.values()), edges, drag.id, 3)
    forceRender()
  }

  function handlePointerUp() {
    const drag = draggingRef.current
    draggingRef.current = null
    if (!drag) return

    if (!drag.moved) {
      const note = notes.find((n) => n.id === drag.id)
      if (note) onSelectNote(note)
      return
    }

    simulate(Array.from(positionsRef.current.values()), edges, null, 60)
    forceRender()
  }

  const nodes = notes
    .map((note) => ({ note, pos: positionsRef.current.get(note.id) }))
    .filter((n): n is { note: Note; pos: GraphNode } => Boolean(n.pos))

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      {notes.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">Noch keine Notizen für die Graph-Ansicht.</p>
      ) : (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[520px] w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {edges.map(([a, b]) => {
            const na = positionsRef.current.get(a)
            const nb = positionsRef.current.get(b)
            if (!na || !nb) return null
            return (
              <line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                stroke="rgb(71 85 105)"
                strokeWidth={1}
              />
            )
          })}

          {nodes.map(({ note, pos }) => {
            const radius = 5 + Math.min(degree.get(note.id) ?? 0, 8) * 1.5
            return (
              <g key={note.id}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  className="cursor-pointer fill-indigo-500 hover:fill-indigo-400"
                  onPointerDown={handlePointerDown(note.id)}
                />
                <text
                  x={pos.x}
                  y={pos.y + radius + 12}
                  textAnchor="middle"
                  className="pointer-events-none select-none fill-slate-400 text-[10px]"
                >
                  {note.title}
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
