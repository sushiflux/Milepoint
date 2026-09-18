// Node rendering for NoteGraphView's free physics layout - a fixed-radius circle ("Punkt") with
// the title as a label underneath, the classic network-graph look. Notes used to have a
// choosable NoteShape (Rounded/Rectangle/Diamond/Underline/Ellipse, each sized to fit the title
// text as a box) plus a full per-note appearance side panel - both removed entirely per explicit
// user request ("Formen wieder nur als Punkt machen"). Color remains the only per-note visual
// (via the project-wide Farbschema buttons, see colorSchemes.ts/assignSchemeColors) - the
// backend's Note.Shape column and every NoteShape-typed field are gone (see CLAUDE.md "Notes").

const NODE_RADIUS = 9
const FONT_SIZE = 11
const LABEL_OFFSET_Y = NODE_RADIUS + FONT_SIZE + 4

// Fixed default fill (no note.color set) used identically in both themes, chosen so the paired
// white label text clears WCAG's 4.5:1 body-text contrast minimum - slate-500 only reaches ~2.6:1
// against white. slate-600 clears 7.5:1 against white in both themes.
const DEFAULT_FILL = '#475569' // slate-600

export interface NodeBoxSize {
  width: number
  height: number
}

/** Fixed circle diameter every node occupies - used for layout spacing decisions (e.g. edge hit
 *  areas) that need to know a node's rough footprint without duplicating NODE_RADIUS. */
// eslint-disable-next-line react-refresh/only-export-components
export function measureNodeBox(): NodeBoxSize {
  return { width: NODE_RADIUS * 2, height: NODE_RADIUS * 2 }
}

interface NodeVisualProps {
  x: number
  y: number
  title: string
  /** note.color, or null to use the theme-default neutral fill. */
  color: string | null
  /** True when this node is being hovered/highlighted/drag-target - draws an accent outline. */
  emphasized: boolean
  /** Outline color override while emphasized (e.g. amber for a drop target). Defaults to the
   *  brand/slate emphasis color used across the graph view. */
  emphasisClassName?: string
  dimmed?: boolean
}

/**
 * Renders a single note node as an SVG fragment (a <g> containing the circle + label underneath),
 * colored per note.color. NoteGraphView wraps this in its own <g> with pointer handlers.
 */
export function NoteNodeVisual({ x, y, title, color, emphasized, emphasisClassName, dimmed }: NodeVisualProps) {
  const opacity = dimmed ? 0.25 : 1
  const strokeClassName = emphasized ? emphasisClassName ?? 'stroke-slate-900 dark:stroke-white' : ''
  const strokeWidth = emphasized ? 2 : 0
  const fill = color ?? DEFAULT_FILL

  return (
    <g opacity={opacity}>
      <circle cx={x} cy={y} r={NODE_RADIUS} className={strokeClassName} style={{ fill }} strokeWidth={strokeWidth} />
      <text
        x={x}
        y={y + LABEL_OFFSET_Y}
        textAnchor="middle"
        dominantBaseline="middle"
        className={`pointer-events-none select-none text-[11px] font-medium ${
          emphasized ? 'fill-brand-primary dark:fill-brand-primary-light' : 'fill-slate-700 dark:fill-slate-300'
        }`}
      >
        {title}
      </text>
    </g>
  )
}
