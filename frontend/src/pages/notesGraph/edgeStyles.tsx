import type { NoteEdgeArrow, NoteEdgeStyle } from '../../api/types'

// Shared edge-style/arrowhead rendering for both graph views (TreeGraphView's four static tree
// layouts and NoteGraphView's free physics layout). An edge is styled by its SOURCE note's
// edgeStyle/edgeArrow (the parent, for tree edges; the outgoingLinks owner, for free cross-links)
// - never the target's, and never a per-connection setting - see Note.edgeStyle/edgeArrow's doc
// comments in api/types.ts.

/** strokeDasharray for a given edge style - undefined (omit the attribute) for Solid/null. */
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

// Marker color decision: SVG markers can reference the stroking element's live color via
// `context-stroke`, but that's only supported in Chromium-based browsers today (not Firefox) -
// too unreliable for a shape that must render correctly in every browser Milepoint targets.
// Instead, each edge state (normal vs. hovered/highlighted) x theme gets its own pre-defined
// marker with a fixed fill, matching the two stroke colors edges already use
// (stroke-slate-400/500 normal, stroke-brand-primary/-light highlighted - see the edges.map blocks
// in NoteGraphView.tsx/TreeGraphView.tsx). Two <marker> ids cover both states; the marker doesn't
// need a separate light/dark pair because both fill colors below already have sufficient contrast
// against both a light and a dark canvas background (mid-tone slate / the brand accent).
const MARKER_FILL_NORMAL = '#94a3b8' // slate-400 - matches stroke-slate-400 used for non-highlighted edges
const MARKER_FILL_HIGHLIGHT = '#6366f1' // brand-primary - matches stroke-brand-primary used for highlighted edges

export const EDGE_MARKER_ID_NORMAL_END = 'note-edge-arrow-normal-end'
export const EDGE_MARKER_ID_NORMAL_START = 'note-edge-arrow-normal-start'
export const EDGE_MARKER_ID_HIGHLIGHT_END = 'note-edge-arrow-highlight-end'
export const EDGE_MARKER_ID_HIGHLIGHT_START = 'note-edge-arrow-highlight-start'

/** marker-end / marker-start url() refs to apply for a given edge style + highlighted state. */
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

/** Shared <defs> marker definitions - render once per SVG (not once per edge). */
export function EdgeMarkerDefs() {
  return (
    <defs>
      <marker id={EDGE_MARKER_ID_NORMAL_END} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_NORMAL_START} viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 10 0 L 0 5 L 10 10 z" fill={MARKER_FILL_NORMAL} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_END} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill={MARKER_FILL_HIGHLIGHT} />
      </marker>
      <marker id={EDGE_MARKER_ID_HIGHLIGHT_START} viewBox="0 0 10 10" refX="2" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 10 0 L 0 5 L 10 10 z" fill={MARKER_FILL_HIGHLIGHT} />
      </marker>
    </defs>
  )
}
