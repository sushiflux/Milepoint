import type { NoteEdgeArrow, NoteEdgeStyle } from '../../api/types'

// Shared edge-style/arrowhead rendering for both graph views (TreeGraphView's four static tree
// layouts and NoteGraphView's free physics layout). An edge is styled by its SOURCE note's
// edgeStyle/edgeArrow (the parent, for tree edges; the outgoingLinks owner, for free cross-links)
// - never the target's, and never a per-connection setting - see Note.edgeStyle/edgeArrow's doc
// comments in api/types.ts.

// Extra gap (px, in world/SVG units) left between a box's actual edge and where the line/marker
// tip is drawn - a line ending exactly flush with the box border reads as touching/overlapping it
// rather than clearly pointing at it, especially once an arrowhead marker sits right at the tip.
const EDGE_GAP = 10

// Number of evenly-spaced anchor points placed along each side of a box (not counting the two
// corners, which are shared between adjacent sides) - 9 along the box's LONG axis sides, 3 along
// its SHORT axis sides (whichever of width/height is actually bigger for a given box - a wide,
// flat note title gets 9 along top/bottom and 3 along left/right; a narrow, tall one gets it the
// other way around). A fixed set of 8 compass directions (4 side midpoints + 4 corners) was tried
// first, but snapping purely by angle-to-direction badly favors whichever axis the box is
// narrower on: a wide, short box has almost no angular range pointing at its short left/right
// sides compared to its long top/bottom sides, so nearly every edge snapped to the top/bottom/
// corners and almost none to the sides - exactly the "3 on top, 1 on the side, 3 on the bottom"
// lopsidedness reported against a real box. Anchors are instead placed at fixed *positions* along
// each side (proportional to that side's own length, not to angle), then the one closest to the
// actual line direction is picked - this guarantees a side gets its fair, requested share of
// anchors regardless of the box's aspect ratio.
const ANCHORS_LONG_SIDE = 9
const ANCHORS_SHORT_SIDE = 3

/** Anchor points (as fractions of the box's half-width/half-height, i.e. -1..1) along all 4 sides
 *  plus the 4 corners - `perSide[axis]` anchors along the sides that run parallel to `axis`
 *  (`horizontalSide` = top/bottom, spaced along x; `verticalSide` = left/right, spaced along y). */
function buildAnchorFractions(horizontalSideCount: number, verticalSideCount: number): { x: number; y: number }[] {
  const anchors: { x: number; y: number }[] = []
  function stepsFor(count: number): number[] {
    const steps: number[] = []
    for (let i = 1; i <= count; i++) {
      steps.push(-1 + (2 * i) / (count + 1))
    }
    return steps
  }
  anchors.push({ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }) // 4 corners
  for (const s of stepsFor(horizontalSideCount)) {
    anchors.push({ x: s, y: -1 }) // top
    anchors.push({ x: s, y: 1 }) // bottom
  }
  for (const s of stepsFor(verticalSideCount)) {
    anchors.push({ x: -1, y: s }) // left
    anchors.push({ x: 1, y: s }) // right
  }
  return anchors
}

// The two possible layouts (wide box: 9 anchors top/bottom + 3 left/right, or tall box: the
// reverse) are precomputed once each rather than rebuilt on every clipPointToBoxEdge call - which
// one applies is decided per box by comparing its actual width/height at call time.
const ANCHOR_FRACTIONS_WIDE = buildAnchorFractions(ANCHORS_LONG_SIDE, ANCHORS_SHORT_SIDE)
const ANCHOR_FRACTIONS_TALL = buildAnchorFractions(ANCHORS_SHORT_SIDE, ANCHORS_LONG_SIDE)

/**
 * Point where a line from `from` toward `boxCenter` should visibly terminate at a box of the
 * given size centered on `boxCenter` - snapped to the nearest of the box's evenly-spaced anchor
 * points (corners + points along each side, see ANCHOR_FRACTIONS) rather than the exact,
 * angle-dependent crossing point a straight rectangle-clip would produce, plus a small fixed gap
 * so the line/arrowhead doesn't touch the box outline. Used to pull an edge's endpoint back from
 * a node's *center* coordinate to its visible *edge* - without this, a line (and any arrowhead
 * marker sitting at its tip) runs into the middle of the node box and gets hidden underneath it,
 * since nodes now render as text-sized boxes (see NoteNodeShape.tsx) rather than the small fixed
 * dots the edge math was originally written against. A rectangular clip is a good-enough
 * approximation for all five NoteShape values (Diamond/Ellipse included) since every shape is
 * still measured and laid out within its measureNodeBox() bounding box.
 */
// clipPointToBoxEdge/edgeStrokeDasharray/edgeMarkerRefs below are exported alongside
// EdgeMarkerDefs because they're all facets of the same shared edge-rendering logic this file
// owns (used identically by both NoteGraphView.tsx and TreeGraphView.tsx) - splitting these pure
// helpers into their own file would separate them from the marker/id constants and doc comments
// they're directly tied to, for no real benefit, so a targeted disable is more pragmatic than a
// structural split.
// eslint-disable-next-line react-refresh/only-export-components
export function clipPointToBoxEdge(from: { x: number; y: number }, boxCenter: { x: number; y: number }, boxWidth: number, boxHeight: number): { x: number; y: number } {
  const dx = boxCenter.x - from.x
  const dy = boxCenter.y - from.y
  if (dx === 0 && dy === 0) return boxCenter

  const halfW = boxWidth / 2 + EDGE_GAP
  const halfH = boxHeight / 2 + EDGE_GAP
  const len = Math.hypot(dx, dy)
  // Direction from the box's center back toward `from` (the incoming line's origin) - NOT
  // from->boxCenter. The anchor we want is where the line VISIBLY LEAVES the box on its way back
  // to `from`, i.e. the side of the box that faces `from` - which is the side whose own
  // center-to-anchor direction points *toward* from, not the side whose direction happens to
  // match the from->boxCenter direction (that's the far/opposite side instead). Using from->
  // boxCenter here was the actual bug: for an edge running e.g. bottom-left (from) to top-right
  // (boxCenter), that direction points up-right, so the dot-product below picked the box's
  // up-right (far) anchor instead of its bottom-left (near, from-facing) one - exactly the
  // "arrowhead sits on the side facing away from its source" bug the screenshot showed.
  const nx = -dx / len
  const ny = -dy / len

  // Wide box (width >= height): 9 anchors along top/bottom, 3 along left/right. Tall box: the
  // reverse - see ANCHORS_LONG_SIDE/ANCHORS_SHORT_SIDE's doc comment for why this needs to track
  // the box's actual proportions instead of a fixed direction set.
  const anchorFractions = boxWidth >= boxHeight ? ANCHOR_FRACTIONS_WIDE : ANCHOR_FRACTIONS_TALL

  // Pick whichever anchor's actual pixel position (fraction * half-size, gap included) is closest
  // in angle to `from`'s direction from the box center - comparing pixel positions (not raw
  // fractions) is what keeps the choice fair across a box's width vs. height regardless of aspect
  // ratio.
  let best = anchorFractions[0]
  let bestDot = -Infinity
  for (const a of anchorFractions) {
    const ax = a.x * halfW
    const ay = a.y * halfH
    const aLen = Math.hypot(ax, ay)
    const dot = (nx * ax + ny * ay) / aLen
    if (dot > bestDot) {
      bestDot = dot
      best = a
    }
  }

  return { x: boxCenter.x + best.x * halfW, y: boxCenter.y + best.y * halfH }
}

// Marker/gradient/glow color decision: SVG markers/gradients can reference the stroking element's
// live color via `context-stroke`/`context-fill`, but that's only supported in Chromium-based
// browsers today (not Firefox) - too unreliable for a shape that must render correctly in every
// browser Milepoint targets. Instead, each edge state (normal vs. hovered/highlighted) gets its
// own pre-defined fixed color, matching the two stroke colors edges already use (stroke-slate-400/
// 500 normal, stroke-brand-primary/-light highlighted - see the edges.map blocks in
// NoteGraphView.tsx/TreeGraphView.tsx). Edges never use an arbitrary per-note color, only ever one
// of these two fixed states, which is what keeps the Gradient/Glow defs below a small FIXED set
// (one pair per state) rather than something generated per note/edge.
const MARKER_FILL_NORMAL = '#94a3b8' // slate-400 - matches stroke-slate-400 used for non-highlighted edges
const MARKER_FILL_HIGHLIGHT = '#6366f1' // brand-primary - matches stroke-brand-primary used for highlighted edges

/** strokeDasharray for a given edge style - undefined (omit the attribute) for Solid/Gradient/
 *  Glow/null (Gradient and Glow are both otherwise-continuous lines - see edgeGradientStroke/
 *  EdgeGradientDefs/EdgeGlowFilterDefs below for what actually distinguishes them). */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeStrokeDasharray(edgeStyle: NoteEdgeStyle | null | undefined): string | undefined {
  switch (edgeStyle) {
    case 'Dashed':
      return '6,4'
    case 'Dotted':
      return '1.5,3'
    default:
      return undefined
  }
}

// Gradient/Glow edge styles ("edler machen" - two alternative ways to make a line read as more
// polished than a flat single-opacity/single-width stroke, offered as sibling options rather than
// picking one for the user): Gradient fades the line's own opacity toward transparent at both
// endpoints (full opacity at the midpoint) via an SVG linearGradient on the stroke; Glow keeps a
// flat-opacity core stroke but adds a soft blurred halo behind it via an SVG blur filter. Both
// leave the arrowhead marker itself untouched (fixed opaque fill, same as Solid/Dashed/Dotted) -
// only the line changes. Edges only ever use one of two fixed colors (MARKER_FILL_NORMAL/
// _HIGHLIGHT above, matching the stroke-slate-400/stroke-brand-primary classes every edge already
// picks between) rather than an arbitrary per-note color, so the color side of this only ever
// needs two fixed values, not one generated per note/edge - see edgeGradientId's doc comment for
// why the gradient GEOMETRY still has to be generated per edge despite that.
const EDGE_GLOW_FILTER_ID_NORMAL = 'note-edge-glow-normal'
const EDGE_GLOW_FILTER_ID_HIGHLIGHT = 'note-edge-glow-highlight'

/**
 * Id for a <linearGradient> that must be defined specifically for one edge's actual endpoints
 * (see the returned id's doc usage in edgeGradientDefFor below) - unlike the marker/glow-filter
 * ids above, this can't be one small fixed set shared by every edge. SVG's default
 * gradientUnits="objectBoundingBox" maps a gradient's x1/y1..x2/y2 onto the referencing element's
 * bounding box at a FIXED angle (0,0)->(1,0) here is always literally left-to-right across that
 * box, regardless of the actual line's angle - correct only for a perfectly horizontal line. Any
 * edge running at an angle (which is most of them, in both the free-form physics layout and the
 * curved tree layouts) would then have its fade-to-transparent points sitting at the bounding
 * box's left/right edges instead of at the line's own start/end points, visibly skewing the fade.
 * gradientUnits="userSpaceOnUse" with the edge's own real x1/y1/x2/y2 coordinates is the only way
 * to keep the fade aligned with the actual line at every angle - which means a distinct gradient
 * definition per edge (parameterized by its endpoints), not a small reusable set like the marker
 * defs. Deterministic (endpoints + state, not e.g. Math.random()) so the same edge geometry always
 * maps to the same id, letting multiple edges that happen to share exact endpoints share one def
 * too rather than each rendering its own duplicate.
 */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientId(x1: number, y1: number, x2: number, y2: number, highlighted: boolean): string {
  const key = `${x1.toFixed(1)}_${y1.toFixed(1)}_${x2.toFixed(1)}_${y2.toFixed(1)}_${highlighted ? 'h' : 'n'}`
  return `note-edge-gradient-${key.replace(/[.-]/g, (c) => (c === '-' ? 'm' : '_'))}`
}

/** stroke color/url() to apply for a given edge style + highlighted state - Gradient uses a
 *  gradient url() instead of the plain currentColor/class-based stroke every other style uses, so
 *  the caller must apply this as an inline `stroke` style (overriding the stroke-slate-400/
 *  stroke-brand-primary Tailwind class it'd otherwise use) whenever it's non-undefined. Requires
 *  the caller to also render the matching <linearGradient> from edgeGradientDefFor with the same
 *  x1/y1/x2/y2/highlighted arguments - see its doc comment. */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientStroke(edgeStyle: NoteEdgeStyle | null | undefined, x1: number, y1: number, x2: number, y2: number, highlighted: boolean): string | undefined {
  if (edgeStyle !== 'Gradient') return undefined
  return `url(#${edgeGradientId(x1, y1, x2, y2, highlighted)})`
}

/** The actual <linearGradient> element for one edge's Gradient style, or null when this edge
 *  isn't using Gradient - render this INLINE right next to the edge's own <path>/<line> (each
 *  edge renders its own, since the geometry is edge-specific - see edgeGradientId's doc comment),
 *  wrapped in a <defs> by the caller (SVG requires gradients to live in a <defs>, but each view
 *  already has its own map/loop over edges, so a single shared <defs> further up collecting one
 *  per edge is simpler than restructuring each view's loop to emit two sibling elements). */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientDefFor(edgeStyle: NoteEdgeStyle | null | undefined, x1: number, y1: number, x2: number, y2: number, highlighted: boolean) {
  if (edgeStyle !== 'Gradient') return null
  const color = highlighted ? MARKER_FILL_HIGHLIGHT : MARKER_FILL_NORMAL
  return (
    <linearGradient key={edgeGradientId(x1, y1, x2, y2, highlighted)} id={edgeGradientId(x1, y1, x2, y2, highlighted)} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={color} stopOpacity="0" />
      <stop offset="50%" stopColor={color} stopOpacity="1" />
      <stop offset="100%" stopColor={color} stopOpacity="0" />
    </linearGradient>
  )
}

/** filter url() to apply for a given edge style + highlighted state, or undefined for every other
 *  style - applied as the SVG `filter` attribute alongside the line's normal stroke/class. Unlike
 *  the gradient above, the blur filter has no directional geometry of its own (feGaussianBlur is
 *  isotropic - same blur radius in every direction), so it doesn't have the objectBoundingBox
 *  angle problem and a small fixed set of defs (one pair, see EdgeGlowFilterDefs) is enough. */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGlowFilter(edgeStyle: NoteEdgeStyle | null | undefined, highlighted: boolean): string | undefined {
  if (edgeStyle !== 'Glow') return undefined
  return `url(#${highlighted ? EDGE_GLOW_FILTER_ID_HIGHLIGHT : EDGE_GLOW_FILTER_ID_NORMAL})`
}

/** Shared <defs> for the Glow edge style's blur filter - render once per SVG alongside
 *  EdgeMarkerDefs. (Gradient's defs are NOT here - see edgeGradientDefFor's doc comment for why
 *  those have to be generated per edge instead of being a small fixed set like this one.) */
export function EdgeGlowFilterDefs() {
  return (
    <defs>
      {/* filterUnits="userSpaceOnUse" with a fixed padding, not the default objectBoundingBox -
          a short, steep edge has a tiny bounding box, and a percentage-based filter region would
          clip the blur right at the line's own bounds instead of letting it spread visibly beyond
          them. x/y/width/height give a generous fixed pixel margin around the filtered element
          instead. */}
      <filter id={EDGE_GLOW_FILTER_ID_NORMAL} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
      </filter>
      <filter id={EDGE_GLOW_FILTER_ID_HIGHLIGHT} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
      </filter>
    </defs>
  )
}

// Two <marker> ids cover both states; the marker doesn't need a separate light/dark pair because
// both fill colors above already have sufficient contrast against both a light and a dark canvas
// background (mid-tone slate / the brand accent).
export const EDGE_MARKER_ID_NORMAL_END = 'note-edge-arrow-normal-end'
export const EDGE_MARKER_ID_NORMAL_START = 'note-edge-arrow-normal-start'
export const EDGE_MARKER_ID_HIGHLIGHT_END = 'note-edge-arrow-highlight-end'
export const EDGE_MARKER_ID_HIGHLIGHT_START = 'note-edge-arrow-highlight-start'

/** marker-end / marker-start url() refs to apply for a given edge style + highlighted state. */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeMarkerRefs(edgeArrow: NoteEdgeArrow | null | undefined, highlighted: boolean): { markerStart?: string; markerEnd?: string } {
  const endId = highlighted ? EDGE_MARKER_ID_HIGHLIGHT_END : EDGE_MARKER_ID_NORMAL_END
  const startId = highlighted ? EDGE_MARKER_ID_HIGHLIGHT_START : EDGE_MARKER_ID_NORMAL_START
  switch (edgeArrow) {
    case 'End':
      return { markerEnd: `url(#${endId})` }
    case 'Start':
      return { markerStart: `url(#${startId})` }
    case 'Both':
      return { markerStart: `url(#${startId})`, markerEnd: `url(#${endId})` }
    default:
      return {}
  }
}

/**
 * Shared <defs> marker definitions - render once per SVG (not once per edge).
 *
 * All four markers use the exact same rightward-pointing arrow path (base at x=0, tip at x=10) -
 * SVG's `orient="auto-start-reverse"` already does the right thing for BOTH marker-start and
 * marker-end from a single such path: at marker-end it orients the tip along the path's forward
 * tangent (pointing at the child/target, since the path runs parent -> child); at marker-start it
 * additionally flips 180° so the tip points backward along the tangent (pointing at the
 * parent/source, i.e. back the way the line came from) - which is exactly what a "points at the
 * node it's attached to" arrowhead needs on both ends. The previous version gave marker-start its
 * own separately-authored *leftward*-pointing path, which combined with auto-start-reverse's own
 * 180° flip produced an arrowhead pointing forward (away from the source) instead of at it - the
 * two reversals canceled out instead of compounding, which is the bug the screenshot showed
 * (arrowheads pointing outward from PrimeSource instead of at each node they touch). All four
 * markers now share the same refX="8" (the path-local tip position) too - auto-start-reverse
 * rotates the whole marker viewport around its own center, so the anchor coordinate itself
 * doesn't need to differ between start/end variants once the underlying path is identical.
 */
export function EdgeMarkerDefs() {
  return (
    <defs>
      <marker id={EDGE_MARKER_ID_NORMAL_END} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_NORMAL_START} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_END} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_HIGHLIGHT} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_START} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_HIGHLIGHT} />
      </marker>
    </defs>
  )
}
