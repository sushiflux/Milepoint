import { COLOR_SCHEMES } from './colorSchemes'

// Panel for restyling ONE specific connection's width/color, distinct from NoteAppearanceMenu
// (which restyles every connection a note draws outward at once). Reached by clicking a line
// directly in either graph view - see TreeGraphView.tsx/NoteGraphView.tsx's edge click handlers.
// Deliberately does NOT offer edgeStyle/edgeArrow here (those stay note-wide only, no
// per-connection override - see NoteEdgeOverride's backend doc comment for why width/color are
// the two fields that got this treatment).

const MIN_EDGE_WIDTH = 0.5
const MAX_EDGE_WIDTH = 12
const DEFAULT_EDGE_WIDTH_FOR_SLIDER = 1

interface Props {
  sourceTitle: string
  targetTitle: string
  width: number | null
  color: string | null
  /** The value that would apply if no override existed (the source note's own edgeWidth/
   *  edgeColor, or the view's built-in default) - shown so the user can see what "Zurücksetzen"
   *  falls back to. */
  fallbackWidth: number
  fallbackColor: string
  onChangeWidth: (width: number | null) => void
  onChangeColor: (color: string | null) => void
  onClose: () => void
}

export default function EdgeOverridePanel({ sourceTitle, targetTitle, width, color, fallbackWidth, fallbackColor, onChangeWidth, onChangeColor, onClose }: Props) {
  return (
    <div className="flex h-full w-72 flex-col overflow-hidden border-l border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-2.5 dark:border-slate-700/50">
        <h3 className="truncate text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {sourceTitle} → {targetTitle}
        </h3>
        <button
          onClick={onClose}
          aria-label="Panel schließen"
          className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/50 hover:text-slate-700 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
            <path d="M5 5l10 10M15 5L5 15" className="stroke-current" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Überschreibt nur diese eine Linie - unabhängig von der allgemeinen Linieneinstellung von „{sourceTitle}".
        </p>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Liniendicke</span>
            {width !== null && (
              <button
                onClick={() => onChangeWidth(null)}
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
              value={width ?? fallbackWidth ?? DEFAULT_EDGE_WIDTH_FOR_SLIDER}
              onChange={(e) => onChangeWidth(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer accent-brand-primary"
            />
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {(width ?? fallbackWidth ?? DEFAULT_EDGE_WIDTH_FOR_SLIDER).toString().replace('.', ',')}px
            </span>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Linienfarbe</span>
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
                    aria-label={`Linienfarbe ${c} (${scheme.label})`}
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
          {!color && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Aktuell: <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: fallbackColor }} /> (von „{sourceTitle}" übernommen)
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
