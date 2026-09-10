import type { Note, NoteEdgeArrow, NoteEdgeStyle, NoteShape } from '../../api/types'
import NoteAppearanceMenu from './NoteAppearanceMenu'

// Rechtes Seitenpanel (XMind-artig) - ersetzt die bisherigen Popup-Kontextmenüs in
// TreeGraphView/NoteGraphView vollständig. Wird von beiden Graph-Ansichten gemeinsam genutzt,
// genau wie NoteAppearanceMenu bereits geteilt wird. Erscheint NUR, wenn ein Knoten ausgewählt
// ist (eine echte Notiz, oder - nur in TreeGraphView - der Projekt-Mittelpunkt). Beide Fälle
// zeigen ausschließlich das Aussehen des jeweiligen Knotens (Farbe/Form/Linienstil). Layout-Wahl
// und Stil-Vorlagen leben NICHT mehr hier - die sind nur noch über den eigenständigen
// "Layout & Stil"-Button neben dem Liste/Graph-Umschalter erreichbar (früher öffnete der Klick auf
// den Mittelpunkt auch die projektweiten Optionen; das wurde auf ausdrücklichen Nutzerwunsch
// entfernt, siehe GraphSettingsPanel).

export interface SelectedNodeInfo {
  /** Echte Notiz-ID, oder null für den virtuellen Projekt-Mittelpunkt (nur in TreeGraphView). */
  kind: 'note' | 'root'
  note?: Note
}

interface Props {
  /** null => Panel wird von der aufrufenden View gar nicht gerendert (siehe panelOpen dort). */
  selected: SelectedNodeInfo | null
  onClose: () => void

  // Individuelle Optionen für eine ausgewählte Notiz (kind === 'note')
  onOpenNote?: (note: Note) => void
  onDetachParent?: (noteId: string) => void
  showDetachParent?: boolean

  // Aussehen-Callbacks - gelten sowohl für eine echte Notiz als auch für den Root-Knoten
  // (getrennter Zustand, siehe onChangeRootAppearance in TreeGraphView).
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
  rootAppearance?: { color: string | null; shape: NoteShape | null; edgeStyle: NoteEdgeStyle | null; edgeArrow: NoteEdgeArrow | null }
  onChangeRootAppearance?: (patch: {
    color?: string | null
    shape?: NoteShape | null
    edgeStyle?: NoteEdgeStyle | null
    edgeArrow?: NoteEdgeArrow | null
  }) => void
}

export default function GraphSidePanel({
  selected,
  onClose,
  onOpenNote,
  onDetachParent,
  showDetachParent,
  onChangeNoteAppearance,
  rootAppearance,
  onChangeRootAppearance,
}: Props) {
  const isNoteSelected = selected?.kind === 'note' && selected.note
  const isRootSelected = selected?.kind === 'root'

  return (
    <div className="flex h-full w-72 flex-col overflow-hidden border-l border-slate-200/50 glass-panel shadow-xl dark:border-slate-700/50">
      <div className="flex items-center justify-between border-b border-slate-200/60 px-3 py-2.5 dark:border-slate-700/50">
        <h3 className="truncate text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {isNoteSelected && selected.note ? selected.note.title : isRootSelected ? 'Projekt-Mittelpunkt' : 'Notiz'}
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
        {isNoteSelected && selected.note ? (
          <div>
            <div className="space-y-1 px-3 py-2.5">
              {onOpenNote && (
                <button
                  onClick={() => onOpenNote(selected.note!)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Notiz öffnen
                </button>
              )}
              {showDetachParent && onDetachParent && (
                <button
                  onClick={() => onDetachParent(selected.note!.id)}
                  disabled={!selected.note.parentNoteId}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Elternzuordnung entfernen
                </button>
              )}
            </div>

            {onChangeNoteAppearance && (
              <NoteAppearanceMenu
                color={selected.note.color}
                shape={selected.note.shape}
                edgeStyle={selected.note.edgeStyle}
                edgeArrow={selected.note.edgeArrow}
                edgeWidth={selected.note.edgeWidth}
                edgeColor={selected.note.edgeColor}
                onChangeColor={(color) => onChangeNoteAppearance(selected.note!.id, { color })}
                onChangeShape={(shape) => onChangeNoteAppearance(selected.note!.id, { shape })}
                onChangeEdgeStyle={(edgeStyle) => onChangeNoteAppearance(selected.note!.id, { edgeStyle })}
                onChangeEdgeArrow={(edgeArrow) => onChangeNoteAppearance(selected.note!.id, { edgeArrow })}
                onChangeEdgeWidth={(edgeWidth) => onChangeNoteAppearance(selected.note!.id, { edgeWidth })}
                onChangeEdgeColor={(edgeColor) => onChangeNoteAppearance(selected.note!.id, { edgeColor })}
              />
            )}
          </div>
        ) : isRootSelected && rootAppearance && onChangeRootAppearance ? (
          <div>
            <p className="px-3 pb-1 pt-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Farbe/Form/Linienstil für den Mittelpunkt und seine Verbindungen zu den Hauptnotizen.
            </p>
            {/* Root has no backing Note (frontend-only RootAppearance preference), so no
                edgeWidth/edgeColor concept - those three NoteAppearanceMenu props are omitted, which
                hides the "Liniendicke"/"Linienfarbe" controls. */}
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
        ) : null}
      </div>
    </div>
  )
}
