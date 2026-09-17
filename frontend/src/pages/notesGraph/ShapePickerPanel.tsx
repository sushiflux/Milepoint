import type { NoteShape } from '../../api/types'
import { SHAPE_OPTIONS } from './shapeOptions'
import { ShapePreviewIcon } from './shapePreview'

// Projektweite Knotenform-Auswahl - eine von zwei getrennten Achsen im Farbschema/Form-Container
// neben dem Liste/Graph-Umschalter (siehe ColorSchemePanel für die andere). Ein Klick setzt die
// Form ALLER Notizen sofort, ohne Rückfrage. Farbe und Linienstil bleiben unangetastet.

interface Props {
  /** Form, die gerade auf allen Notizen liegt, oder null wenn (noch) keine bewusst projektweit
   *  gewählt wurde - nur für die visuelle Aktiv-Markierung. */
  currentShape: NoteShape | null
  onApplyShape: (shape: NoteShape) => Promise<void>
  applying: boolean
}

export default function ShapePickerPanel({ currentShape, onApplyShape, applying }: Props) {
  return (
    <div className="space-y-1 px-2 py-2">
      {SHAPE_OPTIONS.map((opt) => {
        const isActive = currentShape === opt.value
        return (
          <button
            key={opt.value}
            disabled={applying}
            onClick={() => void onApplyShape(opt.value)}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
              isActive
                ? 'border-brand-primary bg-brand-primary/10 font-medium text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span
              className={`shrink-0 rounded-md border ${
                isActive ? 'border-brand-primary/30 dark:border-brand-primary-light/30' : 'border-slate-200/70 dark:border-slate-700/50'
              } bg-white/50 p-1 text-slate-500 dark:bg-slate-900/40 dark:text-slate-400`}
            >
              <ShapePreviewIcon shape={opt.value} />
            </span>
            <span className="min-w-0 flex-1">{opt.label}</span>
          </button>
        )
      })}
      {applying && <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">Wird angewendet…</p>}
    </div>
  )
}
