import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import NoteAppearanceMenu from './NoteAppearanceMenu'

// Rechtes Seitenpanel (XMind-artig) für die freie Notizen-Graph-Ansicht (NoteGraphView) -
// erscheint NUR, wenn ein Notiz-Knoten ausgewählt ist, und zeigt ausschließlich dessen Aussehen
// (Farbe/Form/Linienstil).

export interface SelectedNodeInfo {
  note: Note
}

interface Props {
  /** null => Panel wird von der aufrufenden View gar nicht gerendert (siehe panelOpen dort). */
  selected: SelectedNodeInfo | null
  onClose: () => void
  onOpenNote?: (note: Note) => void
  onChangeNoteAppearance?: (
    noteId: string,
    patch: {
      color?: string | null
      shape?: NoteShape | null
      edgeStyle?: NoteEdgeStyle | null
      edgeArrow?: NoteEdgeArrow | null
      edgeWidth?: number | null
      edgeColor?: string | null
    },
  ) => void
}

export default function GraphSidePanel({ selected, onClose, onOpenNote, onChangeNoteAppearance }: Props) {
  return (
    <div className="flex h-full w-72 flex-col overflow-hidden border-l border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-2.5 dark:border-slate-700/50">
        <h3 className="truncate text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {selected?.note.title ?? 'Notiz'}
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

      <div className="flex-1 overflow-y-auto">
        {selected && (
          <div>
            {onOpenNote && (
              <div className="space-y-1 px-3 py-2.5">
                <button
                  onClick={() => onOpenNote(selected.note)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Notiz öffnen
                </button>
              </div>
            )}

            {onChangeNoteAppearance && (
              <NoteAppearanceMenu
                color={selected.note.color}
                shape={selected.note.shape}
                edgeStyle={selected.note.edgeStyle}
                edgeArrow={selected.note.edgeArrow}
                edgeWidth={selected.note.edgeWidth}
                edgeColor={selected.note.edgeColor}
                onChangeColor={(color) => onChangeNoteAppearance(selected.note.id, { color })}
                onChangeShape={(shape) => onChangeNoteAppearance(selected.note.id, { shape })}
                onChangeEdgeStyle={(edgeStyle) => onChangeNoteAppearance(selected.note.id, { edgeStyle })}
                onChangeEdgeArrow={(edgeArrow) => onChangeNoteAppearance(selected.note.id, { edgeArrow })}
                onChangeEdgeWidth={(edgeWidth) => onChangeNoteAppearance(selected.note.id, { edgeWidth })}
                onChangeEdgeColor={(edgeColor) => onChangeNoteAppearance(selected.note.id, { edgeColor })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
