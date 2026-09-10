import type { ReactElement } from 'react'
import type { GraphLayoutId } from './treeLayouts'

// Layout-Auswahl für die Notizen-Graph-Ansichten - eine von zwei getrennten Achsen (die andere ist
// das Farbschema, siehe ColorSchemePanel). Reached from the standalone "Layout" button next to the
// List/Graph toggle in NotesView.tsx. Each option carries a small hand-drawn SVG preview sketching
// the arrangement, so the shape of each layout is recognizable before applying it - handwritten
// SVGs, no icon library, matching the project-wide convention (see NoteAppearanceMenu's shape/edge
// preview icons).

interface LayoutOption {
  value: GraphLayoutId
  label: string
  Preview: () => ReactElement
}

// Every preview draws on a 40x28 viewBox. Nodes are small rounded rects, edges thin lines - just
// enough to read the topology (radial vs. left-right vs. top-down vs. herringbone vs. loose).
const node = (x: number, y: number, w = 9, h = 5) => (
  <rect x={x} y={y} width={w} height={h} rx={1.5} className="fill-current" />
)
const edge = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-current" strokeWidth={0.75} strokeOpacity={0.6} />
)

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    value: 'free',
    label: 'Frei',
    // Loosely scattered nodes with a couple of cross-links - no central hierarchy.
    Preview: () => (
      <svg viewBox="0 0 40 28" className="h-7 w-10 text-slate-400 dark:text-slate-500">
        {edge(8, 7, 24, 11)}
        {edge(24, 11, 15, 21)}
        {edge(24, 11, 33, 20)}
        {node(4, 4)}
        {node(20, 8)}
        {node(11, 18)}
        {node(29, 17)}
      </svg>
    ),
  },
  {
    value: 'mindmap',
    label: 'Mind Map',
    // Central node with children radiating outward on both sides.
    Preview: () => (
      <svg viewBox="0 0 40 28" className="h-7 w-10 text-slate-400 dark:text-slate-500">
        {edge(20, 14, 6, 6)}
        {edge(20, 14, 6, 22)}
        {edge(20, 14, 34, 7)}
        {edge(20, 14, 34, 21)}
        {node(2, 3.5)}
        {node(2, 19.5)}
        {node(30, 4.5)}
        {node(30, 18.5)}
        {node(15.5, 11.5)}
      </svg>
    ),
  },
  {
    value: 'tree-horizontal',
    label: 'Baum (links → rechts)',
    // Root on the left, children stacked to its right.
    Preview: () => (
      <svg viewBox="0 0 40 28" className="h-7 w-10 text-slate-400 dark:text-slate-500">
        {edge(11, 14, 25, 6)}
        {edge(11, 14, 25, 14)}
        {edge(11, 14, 25, 22)}
        {node(2, 11.5)}
        {node(25, 3.5)}
        {node(25, 11.5)}
        {node(25, 19.5)}
      </svg>
    ),
  },
  {
    value: 'tree-vertical',
    label: 'Organigramm (oben → unten)',
    // Root on top, children in a row below - classic org chart.
    Preview: () => (
      <svg viewBox="0 0 40 28" className="h-7 w-10 text-slate-400 dark:text-slate-500">
        {edge(20, 8, 8, 20)}
        {edge(20, 8, 20, 20)}
        {edge(20, 8, 32, 20)}
        {node(15.5, 3)}
        {node(3.5, 18.5)}
        {node(15.5, 18.5)}
        {node(27.5, 18.5)}
      </svg>
    ),
  },
  {
    value: 'fishbone',
    label: 'Fischgräten',
    // A horizontal spine with branches angling off it alternately.
    Preview: () => (
      <svg viewBox="0 0 40 28" className="h-7 w-10 text-slate-400 dark:text-slate-500">
        {edge(4, 14, 36, 14)}
        {edge(13, 14, 9, 5)}
        {edge(21, 14, 17, 23)}
        {edge(29, 14, 25, 5)}
        {node(2, 11.5)}
        {node(5, 2)}
        {node(13, 20)}
        {node(21, 2)}
      </svg>
    ),
  },
]

interface Props {
  currentLayout: GraphLayoutId
  onChangeLayout: (layout: GraphLayoutId) => void
}

export default function LayoutPickerPanel({ currentLayout, onChangeLayout }: Props) {
  return (
    <div className="space-y-1 px-2 py-2">
      {LAYOUT_OPTIONS.map((opt) => {
        const isActive = currentLayout === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChangeLayout(opt.value)}
            className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${
              isActive
                ? 'border-brand-primary bg-brand-primary/10 font-medium text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light/10 dark:text-brand-primary-light'
                : 'border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className={`shrink-0 rounded-md border ${isActive ? 'border-brand-primary/30 dark:border-brand-primary-light/30' : 'border-slate-200/70 dark:border-slate-700/50'} bg-white/50 p-0.5 dark:bg-slate-900/40`}>
              <opt.Preview />
            </span>
            <span className="min-w-0 flex-1">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
