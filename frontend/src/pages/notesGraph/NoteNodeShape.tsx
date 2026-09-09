import type { ReactNode } from 'react'
import type { NoteShape } from '../../api/types'
import { getReadableTextColor } from './colorSchemes'

// Shared node-shape rendering for both graph views (TreeGraphView's four static tree layouts and
// NoteGraphView's free physics layout). Both previously drew every node as a plain fixed-radius
// <circle> regardless of note.shape/note.color - this replaces that with an actual rendering of
// the five NoteShape values, sized to fit the title text instead of a small fixed dot.

const FONT_SIZE = 11
const TEXT_PADDING_X = 14
const TEXT_PADDING_Y = 10
// MIN_WIDTH must leave enough room along a box's long side for the 9 evenly-spaced edge anchor
// points that side gets (see edgeStyles.tsx's ANCHORS_LONG_SIDE) to actually read as 9 distinct,
// clickable-looking spots rather than a cramped cluster - at the old 56px minimum, 9 anchors would
// sit only ~5.6px apart, tighter than a single arrowhead marker (7px wide). ~14px of spacing per
// anchor is a reasonable lower bound for them to stay visually distinguishable.
const MIN_WIDTH = 130
const MIN_HEIGHT = 30

// Fixed default fill (no note.color set) used identically in both themes, chosen so the paired
// white label text clears WCAG's 4.5:1 body-text contrast minimum - slate-500 (the previous
// dark-theme circle fill, #94a3b8 as fill-slate-400) only reaches ~2.6:1 against white and would
// fail here now that the label sits *inside* the shape instead of below it in the page's own
// slate-500/400 text color. slate-600 clears 7.5:1 against white in both themes.
const DEFAULT_FILL = '#475569' // slate-600

// Rough width estimate (no canvas measurement available at layout time in every call site) - good
// enough to size a node box so short/long titles both fit comfortably without measuring text via
// a hidden canvas per render.
function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.6
}

export interface NodeBoxSize {
  width: number
  height: number
}

/** Box size a node needs to comfortably fit its title, given its shape. Used both for rendering
 *  and (by callers that need it) for layout spacing decisions. */
// measureNodeBox is exported alongside NoteNodeVisual because it's the layout half of the same
// shape-rendering logic this file owns (used both internally by NoteNodeVisual below and by
// NoteGraphView.tsx/edgeStyles.tsx, which need to know a node's box size without duplicating the
// sizing rules) - splitting it into its own file would separate "how a shape is sized" from "how
// it's drawn" for no real benefit, so a targeted disable is more pragmatic than a structural split.
// eslint-disable-next-line react-refresh/only-export-components
export function measureNodeBox(title: string, shape: NoteShape | null): NodeBoxSize {
  const textWidth = estimateTextWidth(title, FONT_SIZE)
  const width = Math.max(MIN_WIDTH, textWidth + TEXT_PADDING_X * 2)
  const height = Math.max(MIN_HEIGHT, FONT_SIZE + TEXT_PADDING_Y * 2)
  if (shape === 'Diamond') {
    // A diamond needs extra room so the text doesn't clip the corners.
    return { width: width * 1.5, height: height * 1.5 }
  }
  if (shape === 'Ellipse') {
    return { width: width * 1.25, height: height * 1.15 }
  }
  return { width, height }
}

interface NodeVisualProps {
  x: number
  y: number
  title: string
  shape: NoteShape | null
  /** note.color, or null to use the theme-default neutral fill. */
  color: string | null
  /** True when this node is being hovered/highlighted/drag-target - draws an accent outline. */
  emphasized: boolean
  /** Outline color override while emphasized (e.g. amber for a drop target). Defaults to the
   *  brand/slate emphasis color used across both graph views. */
  emphasisClassName?: string
  dimmed?: boolean
}

/**
 * Renders a single note node as an SVG fragment (a <g> containing the shape + label), sized to
 * its title and colored per note.color/note.shape. Both graph views wrap this in their own <g>
 * with pointer handlers, since hover/drag/context-menu wiring differs slightly between the free
 * and tree layouts.
 */
export function NoteNodeVisual({ x, y, title, shape, color, emphasized, emphasisClassName, dimmed }: NodeVisualProps) {
  const box = measureNodeBox(title, shape)
  const halfW = box.width / 2
  const halfH = box.height / 2
  const opacity = dimmed ? 0.25 : 1
  const strokeClassName = emphasized ? emphasisClassName ?? 'stroke-slate-900 dark:stroke-white' : ''
  const strokeWidth = emphasized ? 1.5 : 0

  // Underline: no visible box, just text + a rule beneath it - the one shape that intentionally
  // uses note.color (if set) as the text/underline color instead of a fill, since a background
  // fill wouldn't make sense without a border either. Still needs an invisible hit-area rect the
  // size of the full measured box, though - without one, the only clickable pixels are the few
  // that happen to sit exactly on the thin rule/text glyphs, making the node nearly impossible to
  // click/select (and, for the root node specifically, silently locking the user out of the side
  // panel entirely once Underline is chosen for it, since that's the only way to reach it again).
  if (shape === 'Underline') {
    return (
      <g opacity={opacity}>
        <rect x={x - halfW} y={y - halfH} width={box.width} height={box.height} fill="transparent" />
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="middle"
          className={`pointer-events-none select-none text-[11px] font-medium ${
            color ? '' : emphasized ? 'fill-brand-primary dark:fill-brand-primary-light' : 'fill-slate-600 dark:fill-slate-300'
          }`}
          style={color ? { fill: color } : undefined}
        >
          {title}
        </text>
        <line
          x1={x - halfW}
          y1={y + FONT_SIZE / 2 + 3}
          x2={x + halfW}
          y2={y + FONT_SIZE / 2 + 3}
          className={`pointer-events-none ${color ? '' : emphasized ? 'stroke-brand-primary dark:stroke-brand-primary-light' : 'stroke-slate-400 dark:stroke-slate-500'}`}
          style={color ? { stroke: color } : undefined}
          strokeWidth={emphasized ? 1.5 : 1}
        />
      </g>
    )
  }

  const fill = color ?? DEFAULT_FILL
  const textColor = getReadableTextColor(fill)

  let shapeEl: ReactNode
  if (shape === 'Rectangle') {
    shapeEl = (
      <rect x={x - halfW} y={y - halfH} width={box.width} height={box.height} className={strokeClassName} style={{ fill }} strokeWidth={strokeWidth} />
    )
  } else if (shape === 'Diamond') {
    const points = `${x},${y - halfH} ${x + halfW},${y} ${x},${y + halfH} ${x - halfW},${y}`
    shapeEl = <polygon points={points} className={strokeClassName} style={{ fill }} strokeWidth={strokeWidth} />
  } else if (shape === 'Ellipse') {
    shapeEl = <ellipse cx={x} cy={y} rx={halfW} ry={halfH} className={strokeClassName} style={{ fill }} strokeWidth={strokeWidth} />
  } else {
    // 'Rounded' (default/null) - rounded rectangle, replacing the previous plain <circle>.
    shapeEl = (
      <rect
        x={x - halfW}
        y={y - halfH}
        width={box.width}
        height={box.height}
        rx={10}
        ry={10}
        className={strokeClassName}
        style={{ fill }}
        strokeWidth={strokeWidth}
      />
    )
  }

  return (
    <g opacity={opacity}>
      {shapeEl}
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="pointer-events-none select-none text-[11px] font-medium"
        style={{ fill: textColor }}
      >
        {title}
      </text>
    </g>
  )
}
