import type { NoteEdgeArrow, NoteEdgeOverride, NoteEdgeStyle } from '../../api/types'

// Shared edge-style/arrowhead rendering for both graph views (TreeGraphView's four static tree
// layouts and NoteGraphView's free physics layout). An edge is styled by its SOURCE note's
// edgeStyle/edgeArrow/edgeWidth/edgeColor (the parent, for tree edges; the outgoingLinks owner,
// for free cross-links) - never the target's - UNLESS the specific connection has its own
// NoteEdgeOverride, which wins for width/color on that one connection only (edgeStyle/edgeArrow
// stay note-wide only, no per-connection override for those - see resolveEdgeWidth/
// resolveEdgeColor below). See Note.edgeStyle/edgeArrow/edgeWidth/edgeColor's doc comments in
// api/types.ts.

/** The default stroke width (px) an edge renders at when neither the source note's own edgeWidth
 *  nor a per-connection override specifies one. */
export const DEFAULT_EDGE_WIDTH = 1

/**
 * Effective stroke width for one connection: a per-connection NoteEdgeOverride's width wins if
 * present, else the source note's own edgeWidth, else DEFAULT_EDGE_WIDTH - then bumped for the
 * hover/highlight state the same way every edge already was before per-note/per-connection width
 * existed (+0.5px), so a highlighted edge still reads as "thicker/emphasized" relative to its own
 * base width rather than always jumping to a fixed 1.5px regardless of how thick it already was.
 */
// Same reasoning as clipPointToBoxEdge below.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveEdgeWidth(sourceEdgeWidth: number | null | undefined, override: NoteEdgeOverride | null | undefined, highlighted: boolean): number {
  const base = override?.width ?? sourceEdgeWidth ?? DEFAULT_EDGE_WIDTH
  return highlighted ? base + 0.5 : base
}

/** Effective stroke color for one connection, or undefined to fall back to the normal/highlighted
 *  class-based color (stroke-slate-400/stroke-brand-primary) - a per-connection override's color
 *  wins if present, else the source note's own edgeColor, else undefined (class-based default).
 *  Gradient (see edgeGradientStroke below) still takes priority over this when active, since a
 *  gradient IS a color choice in its own right (a resolved base color, faded via opacity) - the
 *  caller should only apply this as a `stroke` style when edgeGradientStroke returned undefined. */
// Same reasoning as clipPointToBoxEdge below.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveEdgeColor(sourceEdgeColor: string | null | undefined, override: NoteEdgeOverride | null | undefined): string | undefined {
  return override?.color ?? sourceEdgeColor ?? undefined
}

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

// Marker color decision: SVG markers can reference the stroking element's live color via
// `context-stroke`, but that's only supported in Chromium-based browsers today (not Firefox) -
// too unreliable for a marker that must render correctly in every browser Milepoint targets.
// Instead, each edge state (normal vs. hovered/highlighted) gets its own pre-defined fixed marker
// fill, matching the two default stroke colors edges use when neither a note's own edgeColor nor
// a per-connection override specifies one (stroke-slate-400/500 normal, stroke-brand-primary/
// -light highlighted - see the edges.map blocks in NoteGraphView.tsx/TreeGraphView.tsx). Exported
// so callers can pass these as the fallback color into resolveEdgeColor/edgeGradientStroke - a
// custom edgeColor/override only changes the LINE's color, never the arrowhead marker's (the
// marker stays this small fixed pair regardless), so a Gradient edge still needs one of these two
// as its own fallback when no custom color is set.
export const EDGE_COLOR_NORMAL = '#94a3b8' // slate-400
export const EDGE_COLOR_HIGHLIGHT = '#6366f1' // brand-primary

/** strokeDasharray for a given edge style - undefined (omit the attribute) for Solid/Gradient/null
 *  (Gradient is also an otherwise-continuous line - see edgeGradientStroke/edgeGradientDefFor
 *  below for what actually distinguishes it). */
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

// Gradient edge style ("edler machen" as an alternative to a flat single-opacity stroke): fades
// the line's own opacity toward transparent at both endpoints, full opacity at the midpoint, via
// an SVG linearGradient on the stroke. Leaves the arrowhead marker itself untouched (fixed opaque
// fill, same as Solid/Dashed/Dotted) - only the line changes. A "Glow" option (blurred halo behind
// the line) was tried and removed again per explicit user feedback rejecting the visual - see
// NoteEdgeStyle.cs's doc comment.

/**
 * Id for a <linearGradient> that must be defined specifically for one edge's actual endpoints AND
 * resolved color (see the returned id's doc usage in edgeGradientDefFor below) - unlike the
 * marker/glow-filter ids previously used here, this can't be one small fixed set shared by every
 * edge. SVG's default gradientUnits="objectBoundingBox" maps a gradient's x1/y1..x2/y2 onto the
 * referencing element's bounding box at a FIXED angle (0,0)->(1,0) here is always literally
 * left-to-right across that box, regardless of the actual line's angle - correct only for a
 * perfectly horizontal line. Any edge running at an angle (which is most of them, in both the
 * free-form physics layout and the curved tree layouts) would then have its fade-to-transparent
 * points sitting at the bounding box's left/right edges instead of at the line's own start/end
 * points, visibly skewing the fade. gradientUnits="userSpaceOnUse" with the edge's own real
 * x1/y1/x2/y2 coordinates is the only way to keep the fade aligned with the actual line at every
 * angle - which means a distinct gradient definition per edge (parameterized by its endpoints),
 * not a small reusable set like the marker defs. The resolved color is now also part of the key
 * (not just a highlighted boolean) since Note.edgeColor/NoteEdgeOverride.color let two edges with
 * identical geometry end up wanting different gradient colors. Deterministic (endpoints + color,
 * not e.g. Math.random()) so the same edge geometry+color always maps to the same id, letting
 * multiple edges that happen to share exact endpoints and color share one def too rather than
 * each rendering its own duplicate.
 */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientId(x1: number, y1: number, x2: number, y2: number, color: string): string {
  const key = `${x1.toFixed(1)}_${y1.toFixed(1)}_${x2.toFixed(1)}_${y2.toFixed(1)}_${color}`
  return `note-edge-gradient-${key.replace(/[^a-zA-Z0-9]/g, (c) => `_${c.charCodeAt(0)}_`)}`
}

/** stroke color/url() to apply for a given edge style - Gradient uses a gradient url() instead of
 *  the plain currentColor/class-based stroke every other style uses, so the caller must apply
 *  this as an inline `stroke` style (overriding the stroke-slate-400/stroke-brand-primary
 *  Tailwind class it'd otherwise use) whenever it's non-undefined. `resolvedColor` is this edge's
 *  actual color (from resolveEdgeColor, or one of the normal/highlighted class-based fallbacks if
 *  that returned undefined) - the gradient always needs a concrete color to fade, it can't fall
 *  back to a CSS class the way a flat stroke can. Requires the caller to also render the matching
 *  <linearGradient> from edgeGradientDefFor with the same x1/y1/x2/y2/resolvedColor arguments -
 *  see its doc comment. */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientStroke(edgeStyle: NoteEdgeStyle | null | undefined, x1: number, y1: number, x2: number, y2: number, resolvedColor: string): string | undefined {
  if (edgeStyle !== 'Gradient') return undefined
  return `url(#${edgeGradientId(x1, y1, x2, y2, resolvedColor)})`
}

/** The actual <linearGradient> element for one edge's Gradient style, or null when this edge
 *  isn't using Gradient - render this INLINE right next to the edge's own <path>/<line> (each
 *  edge renders its own, since the geometry+color is edge-specific - see edgeGradientId's doc
 *  comment), wrapped in a <defs> by the caller (SVG requires gradients to live in a <defs>, but
 *  each view already has its own map/loop over edges, so a single shared <defs> further up
 *  collecting one per edge is simpler than restructuring each view's loop to emit two sibling
 *  elements). */
// Same reasoning as clipPointToBoxEdge above.
// eslint-disable-next-line react-refresh/only-export-components
export function edgeGradientDefFor(edgeStyle: NoteEdgeStyle | null | undefined, x1: number, y1: number, x2: number, y2: number, resolvedColor: string) {
  if (edgeStyle !== 'Gradient') return null
  return (
    <linearGradient key={edgeGradientId(x1, y1, x2, y2, resolvedColor)} id={edgeGradientId(x1, y1, x2, y2, resolvedColor)} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
      <stop offset="0%" stopColor={resolvedColor} stopOpacity="0" />
      <stop offset="50%" stopColor={resolvedColor} stopOpacity="1" />
      <stop offset="100%" stopColor={resolvedColor} stopOpacity="0" />
    </linearGradient>
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
        <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_NORMAL_START} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_END} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR_HIGHLIGHT} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_START} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR_HIGHLIGHT} />
      </marker>
    </defs>
  )
}
