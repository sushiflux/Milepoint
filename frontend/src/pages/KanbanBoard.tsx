import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import * as signalR from '@microsoft/signalr'
import { createWorkItem, moveWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, BoardColumn, WorkItem } from '../api/types'
import type { UserSummary } from '../api/users'
import { createKanbanConnection } from '../realtime/signalr'
import { useAuth } from '../context/AuthContext'
import AddButton from '../components/AddButton'

interface Props {
  board: Board
  items: WorkItem[]
  users: UserSummary[]
  onItemsChange: Dispatch<SetStateAction<WorkItem[]>>
}

export default function KanbanBoard({ board, items, users, onItemsChange }: Props) {
  const { token } = useAuth()
  const [newTitleByColumn, setNewTitleByColumn] = useState<Record<string, string>>({})
  const [openAddColumns, setOpenAddColumns] = useState<Set<string>>(new Set())

  // One project = one board, so joining/leaving the realtime group only needs to track board.id.
  // Functional updates throughout (not the closed-over `items`), since this effect doesn't
  // re-subscribe every time items changes - a stale closure would silently drop concurrent events.
  useEffect(() => {
    if (!token) return

    const connection = createKanbanConnection(token)

    connection.on('workItemCreated', (item: WorkItem) => {
      onItemsChange((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]))
    })

    connection.on('workItemUpdated', (item: WorkItem) => {
      onItemsChange((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    })

    connection.on('workItemMoved', (payload: { workItemId: string; targetColumnId: string; position: number }) => {
      onItemsChange((prev) =>
        prev.map((i) => (i.id === payload.workItemId ? { ...i, columnId: payload.targetColumnId, position: payload.position } : i)),
      )
    })

    connection
      .start()
      .then(() => connection.invoke('JoinBoard', board.id))
      .catch(() => {
        // Realtime ist ein Komfortfeature — bei Verbindungsfehlern bleibt die App über REST nutzbar.
      })

    return () => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke('LeaveBoard', board.id).catch(() => undefined)
      }
      connection.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, token])

  const itemsByColumn = useMemo(() => {
    const map = new Map<string, WorkItem[]>()
    for (const item of items) {
      const list = map.get(item.columnId) ?? []
      list.push(item)
      map.set(item.columnId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position)
    }
    return map
  }, [items])

  async function handleCreate(column: BoardColumn) {
    const title = (newTitleByColumn[column.id] ?? '').trim()
    if (!title) return

    const created = await createWorkItem(board.id, column.id, title, 'Task', 'Medium')
    onItemsChange((prev) => [...prev, created])
    setNewTitleByColumn((prev) => ({ ...prev, [column.id]: '' }))
  }

  function toggleAddColumn(columnId: string, open: boolean) {
    setOpenAddColumns((prev) => {
      const next = new Set(prev)
      if (open) next.add(columnId)
      else next.delete(columnId)
      return next
    })
  }

  async function handleMove(item: WorkItem, targetColumn: BoardColumn) {
    const position = itemsByColumn.get(targetColumn.id)?.length ?? 0
    await moveWorkItem(board.id, item.id, targetColumn.id, position)
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? { ...i, columnId: targetColumn.id, position } : i)))
  }

  async function handleAssign(item: WorkItem, assigneeId: string) {
    const updated = await updateWorkItem(board.id, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      assigneeId: assigneeId || null,
      parentWorkItemId: item.parentWorkItemId,
      startDate: item.startDate,
      dueDate: item.dueDate,
    })
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  return (
    <div className="flex gap-4 overflow-x-auto">
      {board.columns.map((column) => (
        <section
          key={column.id}
          className="w-72 shrink-0 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
            {column.name}
            <span className="text-xs text-slate-500">{itemsByColumn.get(column.id)?.length ?? 0}</span>
            {!openAddColumns.has(column.id) && (
              <span className="ml-auto">
                <AddButton onClick={() => toggleAddColumn(column.id, true)} label="Neues Item" />
              </span>
            )}
          </h2>

          <ul className="space-y-2">
            {(itemsByColumn.get(column.id) ?? []).map((item) => (
              <li
                key={item.id}
                className="rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/60"
              >
                <p className="font-mono text-xs text-slate-500">{item.referenceCode}</p>
                <p className="font-medium">{item.title}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.type}</span>
                  <select
                    value={column.id}
                    onChange={(e) => {
                      const target = board.columns.find((c) => c.id === e.target.value)
                      if (target) handleMove(item, target)
                    }}
                    className="rounded border border-slate-300 bg-white px-1 py-0.5 dark:border-slate-700 dark:bg-slate-900"
                  >
                    {board.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={item.assigneeId ?? ''}
                  onChange={(e) => handleAssign(item, e.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <option value="">Nicht zugewiesen</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          {openAddColumns.has(column.id) && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCreate(column)
              }}
              className="mt-3 space-y-1"
            >
              <input
                autoFocus
                value={newTitleByColumn[column.id] ?? ''}
                onChange={(e) => setNewTitleByColumn((prev) => ({ ...prev, [column.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') toggleAddColumn(column.id, false)
                }}
                placeholder="Titel der Aufgabe"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500">
                  Anlegen
                </button>
                <button
                  type="button"
                  onClick={() => toggleAddColumn(column.id, false)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </section>
      ))}
    </div>
  )
}
