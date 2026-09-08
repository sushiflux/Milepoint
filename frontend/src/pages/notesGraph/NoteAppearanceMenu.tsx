import type { NoteShape } from '../../api/types'
import { COLOR_SCHEMES } from './colorSchemes'

// Shared "Aussehen anpassen" panel used by both graph views' node context menus - lets the user
// pick this single note's color (from every defined palette, not just one) or shape, plus a
// "Zurücksetzen auf Standard" action per property. Rendered as a section appended to the existing
// glass context-menu panel rather than a separate nested hover-submenu, matching the app's
// existing (flat, click-to-open) menu/popover convention - see TreeGraphView/NoteGraphView's
// existing context menus and the create-note inline form for the same glass/rounded-xl treatment.

const SHAPE_OPTIONS: { value: NoteShape; label: string }[] = [
  { value: 'Rounded', label: 'Abgerundet' },
  { value: 'Rectangle', label: 'Rechteck' },
  { value: 'Diamond', label: 'Raute' },
  { value: 'Underline', label: 'Unterstrichen' },
  { value: 'Ellipse', label: 'Oval' },
]

interface Props {
  color: string | null
  shape: NoteShape | null
  onChangeColor: (color: string | null) => void
  onChangeShape: (shape: NoteShape | null) => void
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

export default function NoteAppearanceMenu({ color, shape, onChangeColor, onChangeShape }: Props) {
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
    </div>
  )
}
