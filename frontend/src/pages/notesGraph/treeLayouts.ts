import type { Note } from '../../api/types'

export interface Point {
  x: number
  y: number
}

export interface TreeNode {
  id: string
  note: Note
  x: number
  y: number
  depth: number
}

export interface TreeEdge {
  /** Parent endpoint - always present for every non-root node, including depth-1 root notes
      (whose "parent" is the virtual center at depth 0), so no edge is ever silently dropped. */
  from: Point
  to: Point
  parentId: string | null
  childId: string
}

export interface TreeLayoutResult {
  nodes: Map<string, TreeNode>
  edges: TreeEdge[]
}

export type TreeLayoutId = 'mindmap' | 'tree-horizontal' | 'tree-vertical' | 'fishbone'

interface TreeShape {
  byId: Map<string, Note>
  childrenOf: Map<string, Note[]>
  roots: Note[]
}

// Shared structural pass every layout builds on: turn the flat parentNoteId/childNoteIds
// relationships into a roots list + parent->children lookup. Every layout below only differs
// in how it turns this shape into (x, y) coordinates - the hierarchy itself is computed once.
function buildTreeShape(notes: Note[]): TreeShape {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, Note[]>()
  const roots: Note[] = []

  for (const note of notes) {
    if (note.parentNoteId && byId.has(note.parentNoteId)) {
      const list = childrenOf.get(note.parentNoteId) ?? []
      list.push(note)
      childrenOf.set(note.parentNoteId, list)
    } else {
      roots.push(note)
    }
  }

  return { byId, childrenOf, roots }
}

function leafCount(note: Note, childrenOf: Map<string, Note[]>, seen: Set<string>): number {
  if (seen.has(note.id)) return 1 // Defensive: a data anomaly shouldn't cause infinite recursion.
  seen.add(note.id)
  const children = childrenOf.get(note.id) ?? []
  if (children.length === 0) return 1
  return children.reduce((sum, c) => sum + leafCount(c, childrenOf, seen), 0)
}

// Builds the parent->child edge list from a computed node map plus the tree shape. Every root
// note gets an edge from the virtual center (0,0), so the project->main-note connection is never
// silently dropped the way NoteRadialView's original edge-drawing block dropped it.
function buildEdges(shape: TreeShape, positions: Map<string, TreeNode>): TreeEdge[] {
  const edges: TreeEdge[] = []
  for (const node of positions.values()) {
    const parentId = node.note.parentNoteId && shape.byId.has(node.note.parentNoteId) ? node.note.parentNoteId : null
    const parent = parentId ? positions.get(parentId) : null
    edges.push({
      from: parent ? { x: parent.x, y: parent.y } : { x: 0, y: 0 },
      to: { x: node.x, y: node.y },
      parentId,
      childId: node.id,
    })
  }
  return edges
}

// Spacing constants below were tuned for the previous small fixed-radius circle nodes. Node
// boxes now grow to fit their title text (see NoteNodeShape.tsx's measureNodeBox, up to ~160px
// wide for a long title, vs. the previous ~9px circle diameter) - spacing is increased so
// same-depth/sibling nodes with long titles don't overlap.
const RING_SPACING = 190

// Classic sunburst/radial-tree layout: each note is placed at (depth * RING_SPACING) from the
// center, at an angle proportional to its position within the angular slice inherited from its
// parent. A parent's slice is split among its children weighted by each child's own leaf count.
export function layoutMindMap(notes: Note[]): TreeLayoutResult {
  const shape = buildTreeShape(notes)
  const positions = new Map<string, TreeNode>()

  function place(note: Note, depth: number, angleStart: number, angleEnd: number) {
    const angle = (angleStart + angleEnd) / 2
    const radius = depth * RING_SPACING
    positions.set(note.id, { id: note.id, note, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, depth })

    const children = shape.childrenOf.get(note.id) ?? []
    if (children.length === 0) return

    const weights = children.map((c) => leafCount(c, shape.childrenOf, new Set()))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let cursor = angleStart
    const span = angleEnd - angleStart
    children.forEach((child, i) => {
      const slice = (weights[i] / totalWeight) * span
      place(child, depth + 1, cursor, cursor + slice)
      cursor += slice
    })
  }

  const rootWeights = shape.roots.map((r) => leafCount(r, shape.childrenOf, new Set()))
  const totalRootWeight = rootWeights.reduce((a, b) => a + b, 0) || 1
  let cursor = -Math.PI / 2 // Start at the top, matching a clock-like reading direction.
  shape.roots.forEach((root, i) => {
    const slice = (rootWeights[i] / totalRootWeight) * (2 * Math.PI)
    place(root, 1, cursor, cursor + slice)
    cursor += slice
  })

  return { nodes: positions, edges: buildEdges(shape, positions) }
}

const DEPTH_SPACING = 260
const SIBLING_SPACING = 88

// Classic left-to-right (or, rotated, top-to-bottom) "logic chart" tree: depth grows along one
// axis in fixed steps, siblings are stacked along the other axis with even spacing, positioned so
// each parent sits centered on the vertical (cross-axis) span of its own children - the standard
// node-link tree drawing convention. A single `axis` parameter decides which screen axis depth
// maps to, so "Baum (links->rechts)" and "Organigramm (oben->unten)" share this one function
// instead of duplicating the traversal.
export function layoutTree(notes: Note[], axis: 'horizontal' | 'vertical'): TreeLayoutResult {
  const shape = buildTreeShape(notes)
  const positions = new Map<string, TreeNode>()

  // First pass: assign each node a cross-axis "slot" via a standard in-order leaf traversal,
  // then let every parent's slot be the average of its children's slots - this centers parents
  // over their subtree instead of at a fixed offset.
  let nextSlot = 0
  const slotOf = new Map<string, number>()
  const depthOf = new Map<string, number>()

  function assignSlots(note: Note, depth: number) {
    depthOf.set(note.id, depth)
    const children = shape.childrenOf.get(note.id) ?? []
    if (children.length === 0) {
      slotOf.set(note.id, nextSlot)
      nextSlot += 1
      return
    }
    for (const child of children) assignSlots(child, depth + 1)
    const childSlots = children.map((c) => slotOf.get(c.id) ?? 0)
    slotOf.set(note.id, (Math.min(...childSlots) + Math.max(...childSlots)) / 2)
  }

  for (const root of shape.roots) assignSlots(root, 1)

  for (const note of shape.byId.values()) {
    const depth = depthOf.get(note.id)
    if (depth === undefined) continue
    const slot = slotOf.get(note.id) ?? 0
    const depthCoord = depth * DEPTH_SPACING
    const crossCoord = slot * SIBLING_SPACING
    const point = axis === 'horizontal' ? { x: depthCoord, y: crossCoord } : { x: crossCoord, y: depthCoord }
    positions.set(note.id, { id: note.id, note, x: point.x, y: point.y, depth })
  }

  return { nodes: positions, edges: buildEdges(shape, positions) }
}

const FISHBONE_SPINE_STEP = 300
const FISHBONE_BRANCH_SPACING = 160
const FISHBONE_SUB_SPACING = 72
const FISHBONE_SUB_DEPTH_STEP = 130

// Fishbone/Ishikawa diagram: a central horizontal spine runs from the project (at the right end)
// leftward; root notes ("main bones") attach to the spine at alternating steps, tilted up/down
// alternately like a fish skeleton. Each root's own descendants fan out further along that same
// up/down diagonal direction, growing shallower the deeper the subtree goes (matching the
// classic Ishikawa look) rather than staying parallel to the main bone.
export function layoutFishbone(notes: Note[]): TreeLayoutResult {
  const shape = buildTreeShape(notes)
  const positions = new Map<string, TreeNode>()

  // Project sits at the right end of the spine at x = 0; the spine extends to negative x as
  // roots are placed left of it, matching a left-to-right reading flow toward the "head".
  shape.roots.forEach((root, i) => {
    const side = i % 2 === 0 ? -1 : 1 // Alternate above/below the spine.
    const spineX = -(i + 1) * FISHBONE_SPINE_STEP
    const rootX = spineX + FISHBONE_SPINE_STEP * 0.35
    const rootY = side * FISHBONE_BRANCH_SPACING
    positions.set(root.id, { id: root.id, note: root, x: rootX, y: rootY, depth: 1 })

    // Descendants of this root continue in the same up/down direction, spreading across the
    // cross axis (like a normal tree) while advancing further from the spine with each depth
    // level, so the sub-branches visually taper off the main bone.
    let nextCrossSlot = 0
    const crossSlotOf = new Map<string, number>()

    function assignCrossSlots(note: Note): number {
      const children = shape.childrenOf.get(note.id) ?? []
      if (children.length === 0) {
        const slot = nextCrossSlot
        nextCrossSlot += 1
        crossSlotOf.set(note.id, slot)
        return slot
      }
      const childSlots = children.map((c) => assignCrossSlots(c))
      const slot = (Math.min(...childSlots) + Math.max(...childSlots)) / 2
      crossSlotOf.set(note.id, slot)
      return slot
    }
    assignCrossSlots(root)

    function placeDescendants(note: Note, depth: number) {
      const children = shape.childrenOf.get(note.id) ?? []
      for (const child of children) {
        const slot = crossSlotOf.get(child.id) ?? 0
        const along = rootX + depth * FISHBONE_SUB_DEPTH_STEP // Distance from spine, growing outward.
        const across = rootY + side * (depth * 4) + (slot - (nextCrossSlot - 1) / 2) * FISHBONE_SUB_SPACING
        positions.set(child.id, { id: child.id, note: child, x: along, y: across, depth: depth + 1 })
        placeDescendants(child, depth + 1)
      }
    }
    placeDescendants(root, 1)
  })

  return { nodes: positions, edges: buildEdges(shape, positions) }
}

export function computeTreeLayout(id: TreeLayoutId, notes: Note[]): TreeLayoutResult {
  switch (id) {
    case 'mindmap':
      return layoutMindMap(notes)
    case 'tree-horizontal':
      return layoutTree(notes, 'horizontal')
    case 'tree-vertical':
      return layoutTree(notes, 'vertical')
    case 'fishbone':
      return layoutFishbone(notes)
  }
}
