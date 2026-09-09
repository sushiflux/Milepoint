import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { updateNotePosition } from '../api/notes'
import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../api/types'
import { NoteNodeVisual, measureNodeBox } from './notesGraph/NoteNodeShape'
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
} from './notesGraph/edgeStyles'
import GraphSidePanel from './notesGraph/GraphSidePanel'
import EdgeOverridePanel from './notesGraph/EdgeOverridePanel'
import type { GraphLayoutId } from './notesGraph/stylePresets'

interface Props {
  projectId: string
  notes: Note[]
  onSelectNote: (note: Note) => void
  onCreateNote: (title: string) => Promise<void>
  onConnectNotes: (sourceId: string, targetId: string) => Promise<void>
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
  onChangeLayout: (layout: GraphLayoutId) => void
  onApplyPreset: (presetId: string) => Promise<void>
  applyingPreset: boolean
  onChangeEdgeOverride: (sourceNoteId: string, targetNoteId: string, width: number | null, color: string | null) => Promise<void>
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
// nodes with real text content don't settle overlapping each other. Still a good fit alongside the
// spiral spawn placement below (SPAWN_RADIUS_STEP): the spiral gives new nodes a reasonable
// starting spread, REPULSION only needs to fine-tune from there instead of untangling a stack.
const REPULSION = 5500
const LINK_DISTANCE = 160
const LINK_STRENGTH = 0.05
const CENTER_STRENGTH = 0.02
const VELOCITY_DECAY = 0.35
const ALPHA_DECAY = 0.02
const ALPHA_MIN = 0.001
const MIN_ZOOM = 0.15
const MAX_ZOOM = 5

// Golden-angle spiral placement (same idea as sunflower-seed/phyllotaxis layouts) for
// newly-appeared nodes with no known spawn point (no freeViewX/Y ever saved, and not the target of
// this view's own "create at click position" flow - see pendingSpawnRef). Spreads multiple
// simultaneously-new nodes around a much larger area than a single small random jitter would,
// so they don't spawn stacked on top of each other and force the physics simulation to slowly
// untangle a pile - each new node gets a deterministic point on the spiral based on its own index
// among "nodes needing a spawn position this pass", rather than a random point in a small radius.
// Pulled out to a module-level function (rather than inlined in the idKey effect below) so it sits
// in a plain, non-component function the react-hooks/purity rule doesn't need to reason about as
// "possibly called during render" - it's still only ever invoked from inside an effect.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const SPAWN_RADIUS_STEP = 70

function spiralSpawnPosition(width: number, height: number, index: number): Point {
  const angle = index * GOLDEN_ANGLE
  const radius = SPAWN_RADIUS_STEP * Math.sqrt(index + 1)
  return { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }
}

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

export default function NoteGraphView({
  projectId,
  notes,
  onSelectNote,
  onCreateNote,
  onConnectNotes,
  onChangeAppearance,
  onChangeLayout,
  onApplyPreset,
  applyingPreset,
  onChangeEdgeOverride,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 900, height: 600 })
  const sizeRef = useRef(size)
  // Mirrors `size` into a ref so the RAF physics loop (step(), which runs outside React's render
  // cycle) and pointer-event handlers can read the latest size synchronously without depending on
  // a fresh closure - written in an effect (runs after commit, never during render) rather than
  // directly in the component body, which react-hooks/refs disallows.
  useEffect(() => {
    sizeRef.current = size
  }, [size])

  const positionsRef = useRef<Map<string, GraphNode>>(new Map())
  const alphaRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef<{ id: string; moved: boolean } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const pendingSpawnRef = useRef<Point | null>(null)
  // Note IDs that were manually dragged and still need to be persisted. Saved as soon as possible
  // (see savePendingPositions() below, called from handleSvgPointerUp right on release AND as a
  // safety net on unmount) rather than waiting for the physics simulation to fully settle below
  // ALPHA_MIN - the previous settle-only approach lost saves entirely whenever the user tidied up
  // several notes in a row (each new drag's wake(0.4) keeps alpha above ALPHA_MIN, so the RAF loop
  // - and therefore the save - might not fire again for a long time) or navigated/reloaded before
  // the simulation ever settled, which is exactly the "I moved several notes and most of them
  // reset to a random spiral spot after reload" bug: only whichever note happened to be dragged
  // last before an accidental settle got saved, and even that used the position at settle time,
  // not at release time (the physics simulation was still moving a "released" node afterward via
  // its own repulsion/spring forces, which combined with a page reload mid-oscillation is also how
  // a node could end up saved at a wildly out-of-view coordinate - see FreeViewX/Y in the DB
  // reaching into the thousands for a note that visually never left the visible canvas area).
  // Still a Set, not a single ID, so multiple notes dragged in the same short window are all
  // tracked, even though each is now saved immediately rather than batched until settle:
  // "I moved several notes and now one is far away again" bug) now just adds another entry
  // instead of clobbering the previous one. Cleared entry-by-entry right after each save fires so
  // a settle-detection re-trigger (e.g. alpha dipping under ALPHA_MIN more than once before the
  // RAF loop fully stops) can't queue a duplicate request for the same drag.
  const pendingPositionSaveRef = useRef<Set<string>>(new Set())

  const [, forceRender] = useReducer((c: number) => c + 1, 0)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
  const transformRef = useRef(transform)
  // Same reasoning as sizeRef above - screenToWorld()/step() read this synchronously from pointer
  // handlers and the physics loop, both of which run outside React's render cycle.
  useEffect(() => {
    transformRef.current = transform
  }, [transform])
  const autoFitRef = useRef(true)

  const [contextMenu, setContextMenu] = useState<{ screen: Point; world: Point } | null>(null)
  // Rechtes Seitenpanel statt Popup-Kontextmenü - siehe TreeGraphView.tsx für dasselbe Muster.
  // Kein Root-Knoten in dieser freien Ansicht, daher ist selectedNoteId immer eine echte Notiz-ID
  // oder null (globale Einstellungen).
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  // A clicked EDGE (not node) opens EdgeOverridePanel instead of GraphSidePanel - mutually
  // exclusive with selectedNoteId, same pattern as TreeGraphView.tsx.
  const [selectedEdge, setSelectedEdge] = useState<{ sourceNoteId: string; targetNoteId: string } | null>(null)
  const [createNoteAt, setCreateNoteAt] = useState<{ screen: Point; world: Point } | null>(null)
  const [newNodeTitle, setNewNodeTitle] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [connectFirstId, setConnectFirstId] = useState<string | null>(null)

  const edges = useMemo(() => buildEdges(notes), [notes])
  const edgesRef = useRef(edges)
  // Same reasoning as sizeRef above - step() reads this synchronously from the physics loop,
  // which runs outside React's render cycle (requestAnimationFrame).
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])
  // Lookup for edge styling: each edge is styled by its SOURCE note (the first tuple element from
  // buildEdges, i.e. the note whose outgoingLinks produced it) - see edgeStyles.tsx's doc comment.
  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])

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

  // Persists every note ID currently marked pending, at its CURRENT positionsRef coordinate at
  // call time - called both right on pointerup (see handleSvgPointerUp) and as an unmount safety
  // net (see the cleanup effect below), not just from inside the RAF loop, so a save is never
  // dependent on the simulation actually reaching ALPHA_MIN (see pendingPositionSaveRef's doc
  // comment for why that dependency was the actual bug).
  function savePendingPositions() {
    if (pendingPositionSaveRef.current.size === 0) return
    const draggedIds = pendingPositionSaveRef.current
    pendingPositionSaveRef.current = new Set()
    for (const draggedId of draggedIds) {
      const node = positionsRef.current.get(draggedId)
      if (node) {
        updateNotePosition(projectId, draggedId, node.x, node.y).catch((err) => {
          setActionError(err instanceof ApiError ? err.message : 'Position konnte nicht gespeichert werden.')
        })
      }
    }
  }

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

    if (alphaRef.current > ALPHA_MIN) {
      rafRef.current = requestAnimationFrame(step)
      return
    }

    rafRef.current = null
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
      // Safety net, not the primary save path (handleSvgPointerUp saves immediately on release
      // now) - covers the edge case of navigating away/unmounting mid-drag before pointerup ever
      // fires (e.g. switching the List/Graph tab or graph layout while a node is still held down).
      savePendingPositions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const idKey = notes.map((n) => n.id).join(',')

  useEffect(() => {
    const known = positionsRef.current
    const { width, height } = sizeRef.current
    for (const id of Array.from(known.keys())) {
      if (!notes.some((n) => n.id === id)) known.delete(id)
    }
    // Nodes with no saved position and no explicit spawn click each get their own point on the
    // golden-angle spiral (see spiralSpawnPosition above) - indexed by how many such nodes have
    // been placed so far this pass, not by their position in `notes`, so a mix of already-placed
    // and newly-appearing notes doesn't leave gaps/collisions in the spiral sequence.
    let spiralIndex = 0
    for (const note of notes) {
      if (known.has(note.id)) continue
      if (pendingSpawnRef.current) {
        // Explicit "create at right-click position" spawn - always takes priority and is
        // consumed immediately after use (cleared below) so it never leaks into the next note.
        const spawn = pendingSpawnRef.current
        known.set(note.id, { id: note.id, x: spawn.x, y: spawn.y, vx: 0, vy: 0 })
      } else if (note.freeViewX !== null && note.freeViewY !== null) {
        // A position was manually dragged and saved before (possibly in an earlier session) -
        // use it exactly, never the random/spiral fallback.
        known.set(note.id, { id: note.id, x: note.freeViewX, y: note.freeViewY, vx: 0, vy: 0 })
      } else {
        const spawn = spiralSpawnPosition(width, height, spiralIndex)
        spiralIndex += 1
        known.set(note.id, { id: note.id, x: spawn.x, y: spawn.y, vx: 0, vy: 0 })
      }
    }
    pendingSpawnRef.current = null

    // A structural change (note added/removed) re-enables auto-fit even if the user had
    // previously zoomed/panned manually, and frames the new set of nodes immediately so
    // there's no flash at the stale zoom level before the physics loop's first tick - UNLESS a
    // drag is currently in progress. Re-fitting the camera mid-drag was the actual cause of notes
    // ending up saved at wildly out-of-view coordinates (FreeViewX/Y in the thousands): this
    // effect re-runs whenever `notes` changes identity (e.g. right after creating a new note via
    // the right-click menu), and previously called setTransform() here completely unconditionally
    // - if that happened to land between two handleSvgPointerMove calls of an in-progress drag,
    // `transformRef.current` (which the next move event divides screen coordinates by, see
    // handleSvgPointerMove's node.x = (screenX - t.x) / t.k) could suddenly jump to a very
    // different zoom level than the one the drag had been tracking, and a small mouse movement
    // divided by a much smaller k than before translates into a huge world-coordinate jump for
    // that one frame - exactly the kind of one-frame spike this dragged node's position would
    // then get saved at on release.
    if (!draggingRef.current) {
      autoFitRef.current = true
      const fitted = computeFitTransform(Array.from(known.values()), width, height)
      transformRef.current = fitted
      setTransform(fitted)
    }

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

  // Rechtsklick auf einen Knoten bleibt als Schnellzugriff bestehen: öffnet das Panel direkt mit
  // diesem Knoten ausgewählt, statt (wie zuvor) ein eigenes Popup an der Klickposition zu zeigen.
  function handleNodeContextMenu(noteId: string) {
    return (event: React.MouseEvent<SVGGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
      selectNote(noteId)
    }
  }

  function selectNote(noteId: string) {
    setSelectedEdge(null)
    setSelectedNoteId(noteId)
    setPanelOpen(true)
  }

  function selectEdge(sourceNoteId: string, targetNoteId: string) {
    setSelectedNoteId(null)
    setSelectedEdge({ sourceNoteId, targetNoteId })
    setPanelOpen(true)
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

  function handleBackgroundPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    // Klick auf leere Canvas-Fläche schließt das Panel komplett (siehe TreeGraphView.tsx für
    // dasselbe Muster) - es gibt keinen permanent sichtbaren "globalen" Panel-Zustand mehr.
    setPanelOpen(false)
    setSelectedNoteId(null)
    setSelectedEdge(null)
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
      // A plain click (no drag, not in connect mode) opens the right side panel with this node
      // selected - previously this jumped straight to opening the note, which made a quick
      // color/shape change require a right-click every time. "Notiz öffnen" is still one click
      // away as the panel's first entry.
      setContextMenu(null)
      selectNote(drag.id)
      return
    }

    // The node was actually dragged - save its current position right now, at release, rather
    // than waiting for the physics simulation to settle (see pendingPositionSaveRef's doc comment
    // above for why the settle-only approach silently lost most of a multi-note tidy-up). The
    // repulsion/spring forces wake(0.4) keeps running for a few more frames after release will
    // still nudge the node slightly further - that's a few pixels of drift the physics simulation
    // itself considers acceptable resting jitter, not a save worth blocking on.
    pendingPositionSaveRef.current.add(drag.id)
    savePendingPositions()
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

  return (
    <div className="flex h-[75vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-slate-200/50 glass-panel shadow-sm dark:border-slate-700/50">
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className="relative min-w-0 flex-1 overflow-hidden"
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
            <EdgeMarkerDefs />
            {/* Per-edge Gradient <linearGradient> defs, collected in one place - see
                edgeGradientDefFor's doc comment for why each Gradient-styled edge needs its own
                geometry+color-specific def rather than a small fixed set like EdgeMarkerDefs. Same
                ref-read exception as the edges.map() block below - see its comment. */}
            <defs>
              {/* eslint-disable-next-line react-hooks/refs */}
              {edges.map(([a, b]) => {
                const na = positionsRef.current.get(a)
                const nb = positionsRef.current.get(b)
                if (!na || !nb) return null
                const sourceNote = notesById.get(a)
                if (sourceNote?.edgeStyle !== 'Gradient') return null
                const boxA = measureNodeBox(notesById.get(a)?.title ?? '', notesById.get(a)?.shape ?? null)
                const boxB = measureNodeBox(notesById.get(b)?.title ?? '', notesById.get(b)?.shape ?? null)
                const p1 = clipPointToBoxEdge(nb, na, boxA.width, boxA.height)
                const p2 = clipPointToBoxEdge(na, nb, boxB.width, boxB.height)
                const highlighted = hoveredId !== null && (a === hoveredId || b === hoveredId)
                const override = sourceNote.edgeOverrides.find((o) => o.targetNoteId === b)
                const resolvedColor = resolveEdgeColor(sourceNote.edgeColor, override) ?? (highlighted ? EDGE_COLOR_HIGHLIGHT : EDGE_COLOR_NORMAL)
                return <g key={`${a}-${b}`}>{edgeGradientDefFor(sourceNote.edgeStyle, p1.x, p1.y, p2.x, p2.y, resolvedColor)}</g>
              })}
            </defs>
            {/* positionsRef intentionally holds the live physics-simulation state outside of
                useState - the RAF loop (step(), see above) mutates node coordinates up to 60x/s,
                and forceRender() alone (not a real state update per node) is what triggers React
                to re-read them here. Moving positions into useState would mean a real state
                update + reconciliation per simulation tick, which would noticeably hurt the
                drag/physics performance this view depends on - so these ref reads during render
                are a deliberate, understood exception, not an oversight the rule is correctly
                catching elsewhere. Each edge is also wrapped in an invisible wider hit-area line +
                click handler so a single connection can be clicked to open EdgeOverridePanel,
                independent of clicking either endpoint's node - see TreeGraphView.tsx's matching
                comment. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            {edges.map(([a, b]) => {
              const na = positionsRef.current.get(a)
              const nb = positionsRef.current.get(b)
              if (!na || !nb) return null
              const highlighted = hoveredId !== null && (a === hoveredId || b === hoveredId)
              const dimmed = hoveredId !== null && !highlighted
              const strokeClass = highlighted ? 'stroke-brand-primary dark:stroke-brand-primary-light' : 'stroke-slate-400 dark:stroke-slate-500'
              // Styled by the source note (a) - see the notesById comment above.
              const sourceNote = notesById.get(a)
              const { markerStart, markerEnd } = edgeMarkerRefs(sourceNote?.edgeArrow, highlighted)
              // Pull both endpoints back from the node centers to the actual box edges - nodes
              // render as text-sized boxes now (see NoteNodeShape.tsx), not small fixed dots, so a
              // line (and any arrowhead marker on it) drawn to the raw center coordinate would run
              // into the box and end up hidden underneath it instead of visible at its rim.
              const boxA = measureNodeBox(notesById.get(a)?.title ?? '', notesById.get(a)?.shape ?? null)
              const boxB = measureNodeBox(notesById.get(b)?.title ?? '', notesById.get(b)?.shape ?? null)
              const p1 = clipPointToBoxEdge(nb, na, boxA.width, boxA.height)
              const p2 = clipPointToBoxEdge(na, nb, boxB.width, boxB.height)
              const override = sourceNote?.edgeOverrides.find((o) => o.targetNoteId === b)
              const resolvedWidth = resolveEdgeWidth(sourceNote?.edgeWidth, override, highlighted)
              const resolvedColor = resolveEdgeColor(sourceNote?.edgeColor, override)
              // Gradient overrides the plain stroke-slate-400/stroke-brand-primary class (or a
              // resolved custom color) with an inline url() stroke (see edgeGradientStroke's doc
              // comment) - only the className/color is affected, width/dasharray/markers/opacity
              // stay the same either way.
              const gradientStroke = edgeGradientStroke(sourceNote?.edgeStyle, p1.x, p1.y, p2.x, p2.y, resolvedColor ?? (highlighted ? EDGE_COLOR_HIGHLIGHT : EDGE_COLOR_NORMAL))
              const opacity = dimmed ? 0.12 : highlighted ? 0.9 : 0.35
              const isSelected = selectedEdge?.sourceNoteId === a && selectedEdge.targetNoteId === b
              return (
                <g key={`${a}-${b}`}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    className={`${gradientStroke ? '' : strokeClass} ${isSelected ? 'drop-shadow-[0_0_2px_rgba(99,102,241,0.6)]' : ''}`}
                    style={gradientStroke ? { stroke: gradientStroke } : resolvedColor ? { stroke: resolvedColor } : undefined}
                    strokeWidth={resolvedWidth}
                    strokeDasharray={edgeStrokeDasharray(sourceNote?.edgeStyle)}
                    markerStart={markerStart}
                    markerEnd={markerEnd}
                    opacity={opacity}
                  />
                  {sourceNote && (
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="transparent"
                      strokeWidth={Math.max(resolvedWidth + 10, 14)}
                      className="cursor-pointer"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectEdge(a, b)
                      }}
                    />
                  )}
                </g>
              )
            })}

            {/* Same deliberate exception as the edges.map() block above - see its comment. */}
            {/* eslint-disable-next-line react-hooks/refs */}
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

      {/* Flex sibling with an animated width, not absolutely positioned over the canvas - see
          TreeGraphView's matching comment for why this is what makes the canvas visibly
          shrink/grow alongside the panel instead of the panel just appearing on top. */}
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
              selected={selectedNoteId ? { kind: 'note', note: notes.find((n) => n.id === selectedNoteId) } : null}
              onClose={() => {
                setPanelOpen(false)
                setSelectedNoteId(null)
              }}
              currentLayout="free"
              onChangeLayout={onChangeLayout}
              onApplyPreset={onApplyPreset}
              applyingPreset={applyingPreset}
              onOpenNote={onSelectNote}
              showDetachParent={false}
              onChangeNoteAppearance={changeNodeAppearance}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
