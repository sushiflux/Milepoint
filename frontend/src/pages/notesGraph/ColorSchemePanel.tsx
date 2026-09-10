import { COLOR_SCHEMES } from './colorSchemes'

// Farbschema-Auswahl für die Notizen-Graph-Ansichten - reine FARBE, sonst nichts. Eine von drei
// getrennten Achsen im Layout/Farbschema/Form-Container neben dem Liste/Graph-Umschalter (siehe
// LayoutPickerPanel für das Layout, ShapePickerPanel für die Form). Ein Klick verteilt die Palette
// des gewählten Schemas reihum auf alle Notizen (der Mittelpunkt bekommt die erste Farbe) - ohne
// Rückfrage, sofort wirksam. Form und Linienstil bleiben unangetastet.

interface Props {
  /** Schema-ID, dessen Palette gerade auf die Notizen verteilt ist, oder null wenn (noch) keine
   *  bewusst gewählt wurde - nur für die visuelle Aktiv-Markierung. */
  currentSchemeId: string | null
  onApplyScheme: (schemeId: string) => Promise<void>
  applying: boolean
}

export default function ColorSchemePanel({ currentSchemeId, onApplyScheme, applying }: Props) {
  return (
    <div className="space-y-1 px-2 py-2">
      {COLOR_SCHEMES.map((scheme) => {
        const isActive = currentSchemeId === scheme.id
        return (
          <button
            key={scheme.id}
            disabled={applying}
            onClick={() => void onApplyScheme(scheme.id)}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-40 ${
              isActive
                ? 'border-brand-primary bg-brand-primary/10 font-medium text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span
              className={`shrink-0 rounded-md border ${
                isActive ? 'border-brand-primary/30 dark:border-brand-primary-light/30' : 'border-slate-200/70 dark:border-slate-700/50'
              } bg-white/50 p-0.5 dark:bg-slate-900/40`}
            >
              {/* First six palette colors as small dots - the whole point of "Farbschema" is the
                  palette, so the preview shows the actual colors, nothing else. */}
              <span className="flex gap-0.5">
                {scheme.colors.slice(0, 6).map((c) => (
                  <span key={c} className="block h-3 w-3 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </span>
            </span>
            <span className="min-w-0 flex-1">{scheme.label}</span>
          </button>
        )
      })}
      {applying && <p className="mt-1 px-1 text-[11px] text-slate-500 dark:text-slate-400">Wird angewendet…</p>}
    </div>
  )
}
