import type { NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import NoteAppearanceMenu from './NoteAppearanceMenu'
import { STYLE_PRESETS, type GraphLayoutId } from './stylePresets'

// The project-wide options block (layout picker + style presets + root-node appearance) that used
// to live only inside GraphSidePanel's "kind: 'root'" branch, reachable exclusively by clicking
// the TreeGraphView center node - extracted so the SAME content can also be reached from a
// standalone, always-visible button next to the List/Graph toggle in NotesView.tsx, working in
// BOTH the free and tree views (the free view's NoteGraphView has no root/center node concept at
// all, so clicking a note there could never reach this). The user asked for both entry points to
// exist side by side rather than picking one - see NotesView.tsx's layout-picker button.

const LAYOUT_OPTIONS: { value: GraphLayoutId; label: string }[] = [
  { value: 'free', label: 'Frei' },
  { value: 'mindmap', label: 'Mind Map' },
  { value: 'tree-horizontal', label: 'Baum (links → rechts)' },
  { value: 'tree-vertical', label: 'Organigramm (oben → unten)' },
  { value: 'fishbone', label: 'Fischgräten' },
]

export interface RootAppearanceValue {
  color: string | null
  shape: NoteShape | null
  edgeStyle: NoteEdgeStyle | null
  edgeArrow: NoteEdgeArrow | null
}

interface Props {
  currentLayout: GraphLayoutId
  onChangeLayout: (layout: GraphLayoutId) => void
  onApplyPreset: (presetId: string) => Promise<void>
  applyingPreset: boolean
  rootAppearance: RootAppearanceValue
  onChangeRootAppearance: (patch: Partial<RootAppearanceValue>) => void
  /** Root/center-node appearance only makes visual sense in the tree layouts (the free view has no
   *  center node to style) - hidden there rather than shown for a node that doesn't exist. */
  showRootAppearance: boolean
}

export default function GraphSettingsPanel({
  currentLayout,
  onChangeLayout,
  onApplyPreset,
  applyingPreset,
  rootAppearance,
  onChangeRootAppearance,
  showRootAppearance,
}: Props) {
  return (
    <div className="space-y-4 px-3 py-3">
      <div>
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Layout</span>
        <div className="space-y-1">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChangeLayout(opt.value)}
              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
                currentLayout === opt.value
                  ? 'bg-brand-primary/10 font-medium text-brand-primary dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200/60 pt-3 dark:border-slate-700/50">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vordefinierte Stile</span>
        <p className="mb-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          Überschreibt Layout sowie Farbe/Form/Linienstil aller Notizen in diesem Projekt.
        </p>
        <div className="space-y-1.5">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              disabled={applyingPreset}
              onClick={() => {
                if (window.confirm(`"${preset.label}" anwenden? Dies überschreibt Farbe, Form und Linienstil aller Notizen in diesem Projekt (inkl. Mittelpunkt).`)) {
                  void onApplyPreset(preset.id)
                }
              }}
              className="block w-full rounded-lg border border-slate-200/70 px-2.5 py-1.5 text-left transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700/50 dark:hover:bg-slate-800"
            >
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">{preset.label}</span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">{preset.description}</span>
            </button>
          ))}
        </div>
        {applyingPreset && <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Wird angewendet…</p>}
      </div>

      {showRootAppearance && (
        <div className="border-t border-slate-200/60 pt-3 dark:border-slate-700/50">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Mittelpunkt-Aussehen
          </span>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Farbe/Form/Linienstil für den Mittelpunkt und seine Verbindungen zu den Hauptnotizen.
          </p>
          <NoteAppearanceMenu
            color={rootAppearance.color}
            shape={rootAppearance.shape}
            edgeStyle={rootAppearance.edgeStyle}
            edgeArrow={rootAppearance.edgeArrow}
            onChangeColor={(color) => onChangeRootAppearance({ color })}
            onChangeShape={(shape) => onChangeRootAppearance({ shape })}
            onChangeEdgeStyle={(edgeStyle) => onChangeRootAppearance({ edgeStyle })}
            onChangeEdgeArrow={(edgeArrow) => onChangeRootAppearance({ edgeArrow })}
          />
        </div>
      )}
    </div>
  )
}
