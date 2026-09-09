import { useId } from 'react'
import type { NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import { COLOR_SCHEMES } from './colorSchemes'

// Shared "Aussehen anpassen" panel used by both graph views' node context menus - lets the user
// pick this single note's color (from every defined palette, not just one), shape, and the style/
// arrowheads of every line drawn FROM this note (to its children and along its outgoing cross-
// links - see Note.edgeStyle/edgeArrow's doc comments in api/types.ts), plus a "Zurücksetzen auf
// Standard" action per property. Rendered as a section appended to the existing glass context-menu
// panel rather than a separate nested hover-submenu, matching the app's existing (flat,
// click-to-open) menu/popover convention - see TreeGraphView/NoteGraphView's existing context
// menus and the create-note inline form for the same glass/rounded-xl treatment.

const SHAPE_OPTIONS: { value: NoteShape; label: string }[] = [
  { value: 'Rounded', label: 'Abgerundet' },
  { value: 'Rectangle', label: 'Rechteck' },
  { value: 'Diamond', label: 'Raute' },
  { value: 'Underline', label: 'Unterstrichen' },
  { value: 'Ellipse', label: 'Oval' },
]

const EDGE_STYLE_OPTIONS: { value: NoteEdgeStyle; label: string }[] = [
  { value: 'Solid', label: 'Durchgezogen' },
  { value: 'Dashed', label: 'Gestrichelt' },
  { value: 'Dotted', label: 'Gepunktet' },
  { value: 'Gradient', label: 'Verlauf' },
  { value: 'Glow', label: 'Leuchten' },
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
}

function ShapePreviewIcon({ shape }: { shape: NoteShape }) {
  // Small 20x14 inline SVG preview per shape - handwritten, no icon library, matching the
  // project-wide convention of inline SVGs over external icon sets.
  switch (shape) {
    case 'Rectangle':
      return (
        <svg viewBox="0 0 20 14" className="h-3.5 w-5">
          <rect x="1" y="1" width="18" height="12" className="fill-none stroke-current" strokeWidth="1.5" />
        </svg>
      )
    case 'Diamond':
      return (
        <svg viewBox="0 0 20 14" className="h-3.5 w-5">
          <polygon points="10,1 19,7 10,13 1,7" className="fill-none stroke-current" strokeWidth="1.5" />
        </svg>
      )
    case 'Underline':
      return (
        <svg viewBox="0 0 20 14" className="h-3.5 w-5">
          <line x1="2" y1="6" x2="18" y2="6" className="stroke-current" strokeWidth="1.5" />
          <line x1="1" y1="11" x2="19" y2="11" className="stroke-current" strokeWidth="1.5" />
        </svg>
      )
    case 'Ellipse':
      return (
        <svg viewBox="0 0 20 14" className="h-3.5 w-5">
          <ellipse cx="10" cy="7" rx="9" ry="6" className="fill-none stroke-current" strokeWidth="1.5" />
        </svg>
      )
    case 'Rounded':
    default:
      return (
        <svg viewBox="0 0 20 14" className="h-3.5 w-5">
          <rect x="1" y="1" width="18" height="12" rx="4" ry="4" className="fill-none stroke-current" strokeWidth="1.5" />
        </svg>
      )
  }
}

// Stable per-icon-instance gradient/filter ids - unlike the real edge rendering (edgeStyles.tsx),
// which only ever needs a small fixed set since every edge uses one of two fixed colors, each
// preview icon renders in the menu's own text color (currentColor, so it matches light/dark theme
// and the active/inactive button state) and needs its own gradient/filter def referencing that
// instance specifically. useId gives a stable, unique-per-mount id so multiple menus open at once
// (or duplicate NoteAppearanceMenu instances) never collide on the same <linearGradient>/<filter> id.
function EdgeStylePreviewIcon({ edgeStyle }: { edgeStyle: NoteEdgeStyle }) {
  // Same handwritten-SVG convention as ShapePreviewIcon above - a short horizontal line rendered
  // with the actual strokeDasharray/gradient/glow each style maps to in the real edge rendering
  // (see TreeGraphView.tsx/NoteGraphView.tsx's edgeStrokeDasharray/edgeGradientStroke/
  // edgeGlowFilter), so the preview matches reality.
  const gradientId = useId()
  const filterId = useId()
  const dasharray = edgeStyle === 'Dashed' ? '4,2.5' : edgeStyle === 'Dotted' ? '1,2' : undefined

  if (edgeStyle === 'Gradient') {
    return (
      <svg viewBox="0 0 20 14" className="h-3.5 w-5">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="50%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="1" y1="7" x2="19" y2="7" stroke={`url(#${gradientId})`} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  if (edgeStyle === 'Glow') {
    return (
      <svg viewBox="0 0 20 14" className="h-3.5 w-5">
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
          </filter>
        </defs>
        <line x1="1" y1="7" x2="19" y2="7" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" filter={`url(#${filterId})`} />
        <line x1="1" y1="7" x2="19" y2="7" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" />
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
  onChangeColor,
  onChangeShape,
  onChangeEdgeStyle,
  onChangeEdgeArrow,
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
        <div className="grid grid-cols-5 gap-1">
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
    </div>
  )
}
