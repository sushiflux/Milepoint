import type { NoteShape } from '../../api/types'

// Shared shape preview icon, used by both NoteAppearanceMenu (per-note shape) and ShapePickerPanel
// (project-wide shape). Handwritten inline SVGs, no icon library - project-wide convention. The
// option list itself lives in shapeOptions.ts (constants-only) so this stays a components-only
// module for Fast Refresh.

export function ShapePreviewIcon({ shape }: { shape: NoteShape }) {
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
