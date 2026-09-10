import type { NoteShape } from '../../api/types'

// The full set of node shapes offered project-wide (ShapePickerPanel) and per-note
// (NoteAppearanceMenu). Kept in its own constants-only file so shapePreview.tsx can stay a
// components-only module (react-refresh/only-export-components).
export const SHAPE_OPTIONS: { value: NoteShape; label: string }[] = [
  { value: 'Rounded', label: 'Abgerundet' },
  { value: 'Rectangle', label: 'Rechteck' },
  { value: 'Diamond', label: 'Raute' },
  { value: 'Underline', label: 'Unterstrichen' },
  { value: 'Ellipse', label: 'Oval' },
]
