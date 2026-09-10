import { useId } from 'react'
import type { NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import { COLOR_SCHEMES } from './colorSchemes'
import { SHAPE_OPTIONS } from './shapeOptions'
import { ShapePreviewIcon } from './shapePreview'

// Shared "Aussehen anpassen" panel used by both graph views' node context menus - lets the user
// pick this single note's color (from every defined palette, not just one), shape, and the style/
// arrowheads of every line drawn FROM this note (to its children and along its outgoing cross-
// links - see Note.edgeStyle/edgeArrow's doc comments in api/types.ts), plus a "Zurücksetzen auf
// Standard" action per property. Rendered as a section appended to the existing glass context-menu
// panel rather than a separate nested hover-submenu, matching the app's existing (flat,
// click-to-open) menu/popover convention - see TreeGraphView/NoteGraphView's existing context
// menus and the create-note inline form for the same glass/rounded-xl treatment.

const EDGE_STYLE_OPTIONS: { value: NoteEdgeStyle; label: string }[] = [
  { value: 'Solid', label: 'Durchgezogen' },
  { value: 'Dashed', label: 'Gestrichelt' },
  { value: 'Dotted', label: 'Gepunktet' },
  { value: 'Gradient', label: 'Verlauf' },
]

const EDGE_ARROW_OPTIONS: { value: NoteEdgeArrow; label: string }[] = [
  { value: 'None', label: 'Keine' },
  { value: 'End', label: 'Ende' },
  { value: 'Start', label: 'Anfang' },
  { value: 'Both', label: 'Beide' },
]

interface Props {
  color: string | null
  shape: NoteShape | null
  edgeStyle: NoteEdgeStyle | null
  edgeArrow: NoteEdgeArrow | null
  onChangeColor: (color: string | null) => void
  onChangeShape: (shape: NoteShape | null) => void
  onChangeEdgeStyle: (edgeStyle: NoteEdgeStyle | null) => void
  onChangeEdgeArrow: (edgeArrow: NoteEdgeArrow | null) => void
  // Line thickness (px) and color for every edge drawn FROM this note - independent of the
  // node's own `color` above, since the user asked for the line color to be separately
  // choosable from the node it originates at. Optional: the virtual project-center "note" (see
  // TreeGraphView's RootAppearance) has no backing Note row and therefore no edgeWidth/edgeColor
  // concept at all - omitting these three props there hides the two controls entirely rather
  // than showing them against a value that doesn't really exist.
  edgeWidth?: number | null
  edgeColor?: string | null
  onChangeEdgeWidth?: (edgeWidth: number | null) => void
  onChangeEdgeColor?: (edgeColor: string | null) => void
}

// Slider bounds match the backend's MinEdgeWidth/MaxEdgeWidth clamp (NotesController.cs) - keep
// both in sync if either changes.
const MIN_EDGE_WIDTH = 0.5
const MAX_EDGE_WIDTH = 12
const DEFAULT_EDGE_WIDTH_FOR_SLIDER = 1

// Stable per-icon-instance gradient id - unlike the real edge rendering (edgeStyles.tsx), which
// only ever needs a small fixed set since every edge uses one of two fixed colors, this preview
// icon renders in the menu's own text color (currentColor, so it matches light/dark theme and the
// active/inactive button state) and needs its own gradient def referencing that instance
// specifically. useId gives a stable, unique-per-mount id so multiple menus open at once (or
// duplicate NoteAppearanceMenu instances) never collide on the same <linearGradient> id.
function EdgeStylePreviewIcon({ edgeStyle }: { edgeStyle: NoteEdgeStyle }) {
  // Same handwritten-SVG convention as ShapePreviewIcon above - a short horizontal line rendered
  // with the actual strokeDasharray/gradient each style maps to in the real edge rendering (see
  // TreeGraphView.tsx/NoteGraphView.tsx's edgeStrokeDasharray/edgeGradientStroke), so the preview
  // matches reality.
  const gradientId = useId()
  const dasharray = edgeStyle === 'Dashed' ? '4,2.5' : edgeStyle === 'Dotted' ? '1,2' : undefined

  if (edgeStyle === 'Gradient') {
    return (
      <svg viewBox="0 0 20 14" className="h-3.5 w-5">
        <defs>
          {/* stopColor="currentColor" resolves against the <stop>'s OWN computed color, not the
              enclosing button/icon's - <stop> is not painted itself, so it never inherits `color`
              from an ancestor the way a stroked/filled shape does, which left every stop fully
              transparent (0% and 100% explicit, 50% opacity="1" but color-less) - the icon
              rendered as an invisible line, exactly the "there's nothing in it" bug. Wrapping the
              gradient defs in a <g className="text-current-icon-color"> child doesn't help either
              for the same reason. Fixed by setting stroke on the <line> to `currentColor` via a
              wrapping technique instead: paint a solid currentColor line and mask its opacity with
              the gradient.
              stopColor must be "white" here, NOT "black" (the second attempt at this fix, also
              broken on its own) - an SVG <mask> defaults to luminance masking (mask-type:
              luminance), where WHITE = fully visible and BLACK = fully invisible, and stopOpacity
              only modulates that luminance-derived alpha on top - a black stop always contributes
              ~0 luminance regardless of its own stopOpacity, hiding the line everywhere.
              A THIRD bug remained even after switching to white: <mask>'s own x/y/width/height
              default to maskUnits="objectBoundingBox" with a default region of -10% -10% 120%
              120% relative to the masked element's bounding box - and a perfectly horizontal
              <line y1="7" y2="7"> has a bounding box with zero HEIGHT, so that region collapses
              to zero-height too and clips the line out entirely regardless of the mask content.
              maskUnits="userSpaceOnUse" with an explicit x/y/width/height covering the icon's own
              viewBox sidesteps the degenerate-bounding-box case entirely. Confirmed live at each
              step (both previous attempts still rendered a blank/invisible line - the "there's
              nothing in it" bug reported - only fixed once all three issues were addressed). */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={`${gradientId}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="20" height="14">
            <rect x="0" y="0" width="20" height="14" fill={`url(#${gradientId})`} />
          </mask>
        </defs>
        <line x1="1" y1="7" x2="19" y2="7" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" mask={`url(#${gradientId}-mask)`} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5">
      <line x1="1" y1="7" x2="19" y2="7" className="stroke-current" strokeWidth="1.5" strokeDasharray={dasharray} strokeLinecap="round" />
    </svg>
  )
}

function EdgeArrowPreviewIcon({ edgeArrow }: { edgeArrow: NoteEdgeArrow }) {
  // A short line with a small handdrawn arrowhead (open chevron, matching the actual marker shape
  // used in the graph views) at the start/end/both sides depending on the option.
  const showStart = edgeArrow === 'Start' || edgeArrow === 'Both'
  const showEnd = edgeArrow === 'End' || edgeArrow === 'Both'
  return (
    <svg viewBox="0 0 20 14" className="h-3.5 w-5">
      <line x1="3" y1="7" x2="17" y2="7" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" />
      {showStart && <polyline points="6.5,3.5 2,7 6.5,10.5" className="fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {showEnd && <polyline points="13.5,3.5 18,7 13.5,10.5" className="fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

export default function NoteAppearanceMenu({
  color,
  shape,
  edgeStyle,
  edgeArrow,
  edgeWidth,
  edgeColor,
  onChangeColor,
  onChangeShape,
  onChangeEdgeStyle,
  onChangeEdgeArrow,
  onChangeEdgeWidth,
  onChangeEdgeColor,
}: Props) {
  return (
    <div className="space-y-3 border-t border-slate-200/60 px-3 py-2.5 dark:border-slate-700/50">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Farbe</span>
          {color && (
            <button
              onClick={() => onChangeColor(null)}
              className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          {COLOR_SCHEMES.map((scheme) => (
            <div key={scheme.id} className="flex flex-wrap items-center gap-1.5">
              {scheme.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={`${scheme.label}: ${c}`}
                  aria-label={`Farbe ${c} (${scheme.label})`}
                  onClick={() => onChangeColor(c)}
                  className={`h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-offset-1 ring-brand-primary dark:ring-offset-slate-900' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Form</span>
          {shape && (
            <button
              onClick={() => onChangeShape(null)}
              className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {SHAPE_OPTIONS.map((opt) => {
            const isActive = shape === opt.value || (!shape && opt.value === 'Rounded')
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                onClick={() => onChangeShape(opt.value)}
                className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                  isActive
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                    : 'border-slate-200/70 text-slate-500 hover:bg-slate-100 dark:border-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <ShapePreviewIcon shape={opt.value} />
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Linienstil</span>
          {edgeStyle && (
            <button
              onClick={() => onChangeEdgeStyle(null)}
              className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {EDGE_STYLE_OPTIONS.map((opt) => {
            const isActive = edgeStyle === opt.value || (!edgeStyle && opt.value === 'Solid')
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                onClick={() => onChangeEdgeStyle(opt.value)}
                className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                  isActive
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                    : 'border-slate-200/70 text-slate-500 hover:bg-slate-100 dark:border-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <EdgeStylePreviewIcon edgeStyle={opt.value} />
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pfeilspitzen</span>
          {edgeArrow && (
            <button
              onClick={() => onChangeEdgeArrow(null)}
              className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
            >
              Zurücksetzen
            </button>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {EDGE_ARROW_OPTIONS.map((opt) => {
            const isActive = edgeArrow === opt.value || (!edgeArrow && opt.value === 'None')
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.label}
                aria-label={opt.label}
                onClick={() => onChangeEdgeArrow(opt.value)}
                className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                  isActive
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                    : 'border-slate-200/70 text-slate-500 hover:bg-slate-100 dark:border-slate-700/50 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <EdgeArrowPreviewIcon edgeArrow={opt.value} />
              </button>
            )
          })}
        </div>
      </div>

      {onChangeEdgeWidth && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Liniendicke</span>
            {edgeWidth != null && (
              <button
                onClick={() => onChangeEdgeWidth(null)}
                className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
              >
                Zurücksetzen
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={MIN_EDGE_WIDTH}
              max={MAX_EDGE_WIDTH}
              step={0.5}
              value={edgeWidth ?? DEFAULT_EDGE_WIDTH_FOR_SLIDER}
              onChange={(e) => onChangeEdgeWidth(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-brand-primary"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {(edgeWidth ?? DEFAULT_EDGE_WIDTH_FOR_SLIDER).toString().replace('.', ',')}px
            </span>
          </div>
        </div>
      )}

      {onChangeEdgeColor && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Linienfarbe</span>
            {edgeColor && (
              <button
                onClick={() => onChangeEdgeColor(null)}
                className="text-[10px] font-medium text-slate-500 hover:text-brand-primary dark:text-slate-400 dark:hover:text-brand-primary-light"
              >
                Zurücksetzen
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            {COLOR_SCHEMES.map((scheme) => (
              <div key={scheme.id} className="flex flex-wrap items-center gap-1.5">
                {scheme.colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={`${scheme.label}: ${c}`}
                    aria-label={`Linienfarbe ${c} (${scheme.label})`}
                    onClick={() => onChangeEdgeColor(c)}
                    className={`h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110 ${
                      edgeColor === c ? 'ring-2 ring-offset-1 ring-brand-primary dark:ring-offset-slate-900' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
