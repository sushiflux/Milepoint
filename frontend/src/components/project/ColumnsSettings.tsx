import { useState } from 'react'
import { createColumn, deleteColumn, reorderColumns, updateColumn } from '../../api/projects'
import { ApiError } from '../../api/client'
import type { Board, BoardColumn, BoardColumnType } from '../../api/types'
import AddButton from '../AddButton'
import { ConfirmDialog } from '../ConfirmDialog'
import ToggleSwitch from '../ToggleSwitch'

const TYPE_OPTIONS: { value: BoardColumnType; label: string }[] = [
  { value: 'Todo', label: 'Offen (Todo)' },
  { value: 'InProgress', label: 'In Arbeit' },
  { value: 'Done', label: 'Fertig' },
]
const typeLabel = (type: BoardColumnType) => TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100'

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError && err.message ? err.message : fallback)

interface Props {
  projectId: string
  board: Board
  onBoardChange: (board: Board) => void
}

// Columns of the project's board: the four built-in ones can only be hidden/shown, custom ones can
// be added, renamed, retyped, reordered and deleted. The server enforces every rule (empty to hide,
// at least one visible Todo + Done column) and says why in its message, which is shown as-is.
export default function ColumnsSettings({ projectId, board, onBoardChange }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<BoardColumnType>('InProgress')
  const [editing, setEditing] = useState<{ id: string; name: string; type: BoardColumnType } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BoardColumn | null>(null)

  const columns = [...board.columns].sort((a, b) => a.order - b.order)

  function replaceColumns(next: BoardColumn[]) {
    onBoardChange({ ...board, columns: next })
  }

  async function run(action: () => Promise<void>, failure: string) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(`${failure}: ${errorText(err, 'unbekannter Fehler')}`)
    }
  }

  const handleAdd = () =>
    run(async () => {
      const created = await createColumn(projectId, board.id, name.trim(), type)
      replaceColumns([...board.columns, created])
      setName('')
      setShowAdd(false)
    }, 'Spalte konnte nicht angelegt werden')

  const handleVisibility = (column: BoardColumn, visible: boolean) =>
    run(async () => {
      const updated = await updateColumn(projectId, board.id, column.id, { isHidden: !visible })
      replaceColumns(board.columns.map((c) => (c.id === updated.id ? updated : c)))
    }, `Sichtbarkeit von '${column.name}' konnte nicht geändert werden`)

  const handleSaveEdit = () =>
    run(async () => {
      if (!editing) return
      const updated = await updateColumn(projectId, board.id, editing.id, { name: editing.name.trim(), type: editing.type })
      replaceColumns(board.columns.map((c) => (c.id === updated.id ? updated : c)))
      setEditing(null)
    }, 'Spalte konnte nicht geändert werden')

  const handleMove = (index: number, direction: -1 | 1) =>
    run(async () => {
      const ids = columns.map((c) => c.id)
      const target = index + direction
      if (target < 0 || target >= ids.length) return
      ;[ids[index], ids[target]] = [ids[target], ids[index]]
      replaceColumns(await reorderColumns(projectId, board.id, ids))
    }, 'Reihenfolge konnte nicht geändert werden')

  const handleDelete = () =>
    run(async () => {
      if (!deleteTarget) return
      const target = deleteTarget
      setDeleteTarget(null)
      await deleteColumn(projectId, board.id, target.id)
      replaceColumns(board.columns.filter((c) => c.id !== target.id))
    }, `Spalte '${deleteTarget?.name ?? ''}' konnte nicht gelöscht werden`)

  return (
    <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Spalten</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Die vier Standard-Spalten lassen sich nur aus- und einblenden. Eigene Spalten kannst du anlegen, umbenennen, verschieben und
            löschen. Ausblenden und Löschen geht nur bei leeren Spalten, und mindestens eine offene und eine fertige Spalte bleibt sichtbar.
          </p>
        </div>
        <AddButton label="Spalte hinzufügen" onClick={() => setShowAdd((v) => !v)} icon={showAdd ? '×' : '+'} />
      </div>

      {showAdd && (
        <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end dark:border-slate-700">
          <div>
            <label htmlFor="new-column-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Name</label>
            <input id="new-column-name" className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Zur Überprüfung" />
          </div>
          <div>
            <label htmlFor="new-column-type" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Typ</label>
            <select id="new-column-type" className={`${inputClass} mt-1`} value={type} onChange={(e) => setType(e.target.value as BoardColumnType)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={name.trim().length === 0}
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
          >
            Spalte anlegen
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}

      <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
        {columns.map((column, index) => (
          <li key={column.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" data-column-row={column.name}>
            <div className="flex flex-col">
              <button
                aria-label={`${column.name} nach oben`}
                disabled={index === 0}
                onClick={() => void handleMove(index, -1)}
                className="px-1 text-xs leading-none text-slate-500 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
              >
                ▲
              </button>
              <button
                aria-label={`${column.name} nach unten`}
                disabled={index === columns.length - 1}
                onClick={() => void handleMove(index, 1)}
                className="px-1 text-xs leading-none text-slate-500 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-slate-100"
              >
                ▼
              </button>
            </div>

            {editing?.id === column.id ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input aria-label="Spaltenname" className={`${inputClass} max-w-xs`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <select aria-label="Spaltentyp" className={`${inputClass} max-w-[10rem]`} value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as BoardColumnType })}>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button onClick={() => void handleSaveEdit()} disabled={editing.name.trim().length === 0} className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white hover:bg-brand-accent-light disabled:opacity-40">Speichern</button>
                <button onClick={() => setEditing(null)} className="text-sm text-slate-500 hover:underline dark:text-slate-400">Abbrechen</button>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${column.isHidden ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{column.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {typeLabel(column.type)} · {column.isDefault ? 'Standard' : 'Eigene Spalte'}
                  {column.isHidden ? ' · ausgeblendet' : ''}
                </p>
              </div>
            )}

            {editing?.id !== column.id && (
              <>
                {!column.isDefault && (
                  <>
                    <button
                      onClick={() => setEditing({ id: column.id, name: column.name, type: column.type })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => setDeleteTarget(column)}
                      className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Löschen
                    </button>
                  </>
                )}
                <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  Sichtbar
                  <ToggleSwitch checked={!column.isHidden} onChange={(visible) => void handleVisibility(column, visible)} label={`${column.name} sichtbar`} />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Spalte löschen?"
        message={`Die Spalte '${deleteTarget?.name ?? ''}' wird gelöscht. Das geht nur, wenn sie leer ist.`}
        confirmLabel="Löschen"
        isDanger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
