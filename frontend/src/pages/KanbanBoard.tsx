import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import * as signalR from '@microsoft/signalr'
import { createWorkItem, moveWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, BoardColumn, BoardColumnType, WorkItem } from '../api/types'
import type { UserSummary } from '../api/users'
import { createKanbanConnection } from '../realtime/signalr'
import { useAuth } from '../context/AuthContext'

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
    // A Phase is a Timeline grouping construct, not a piece of work someone moves through
    // Todo/In Arbeit/Fertig - it never shows up as a Kanban card.
    for (const item of items) {
      if (item.type === 'Phase') continue
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
  function getInitials(name?: string) {
    if (!name) return '?'
    const parts = name.split(' ').filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const PRIORITY_COLORS: Record<string, string> = {
    Low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    Medium: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    High: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    Critical: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
  }

  const COLUMN_BORDER_COLORS: Record<string, string> = {
    Todo: 'bg-slate-400 dark:bg-slate-500',
    InProgress: 'bg-sky-400 dark:bg-sky-500',
    Done: 'bg-emerald-400 dark:bg-emerald-500',
  }

  const KNOWN_BORDER_COLORS: Record<string, string> = {
    'pausiert': 'bg-amber-400 dark:bg-amber-500',
    'blockiert': 'bg-red-400 dark:bg-red-500',
    'review': 'bg-purple-400 dark:bg-purple-500',
    'neu': 'bg-slate-400 dark:bg-slate-500',
  }

  function getColumnBorderColor(columnName: string, columnType: BoardColumnType) {
    const lowerName = columnName.toLowerCase();
    for (const [key, color] of Object.entries(KNOWN_BORDER_COLORS)) {
      if (lowerName.includes(key)) return color;
    }
    return COLUMN_BORDER_COLORS[columnType] || 'bg-slate-400';
  }

  return (
    <div className="flex h-full gap-5 overflow-x-auto pb-8 pt-2 pl-2">
      {board.columns.map((column) => (
        <section
          key={column.id}
          className="glass-panel flex flex-col w-[340px] shrink-0 rounded-xl relative overflow-hidden"
        >
          {/* Status Color Line */}
          <div className={`absolute top-0 left-0 w-full h-1.5 ${getColumnBorderColor(column.name, column.type)}`} />

          {/* Column Header */}
          <div className="flex items-center justify-between border-b border-slate-200/50 bg-white/40 px-5 py-4 dark:border-slate-700/50 dark:bg-slate-800/40">
            <h2 className="flex items-center gap-3 text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
              {column.name}
              <span className="flex h-5 items-center justify-center rounded-full bg-slate-200 px-2 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {itemsByColumn.get(column.id)?.length ?? 0}
              </span>
            </h2>
            {!openAddColumns.has(column.id) && (
              <button
                onClick={() => toggleAddColumn(column.id, true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Neue Aufgabe in dieser Spalte"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600">
            {openAddColumns.has(column.id) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleCreate(column)
                }}
                className="glass rounded-xl p-4"
              >
                <input
                  autoFocus
                  value={newTitleByColumn[column.id] ?? ''}
                  onChange={(e) => setNewTitleByColumn((prev) => ({ ...prev, [column.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') toggleAddColumn(column.id, false)
                  }}
                  placeholder="Titel eingeben..."
                  className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAddColumn(column.id, false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    Abbrechen
                  </button>
                  <button type="submit" disabled={!(newTitleByColumn[column.id] ?? '').trim()} className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-brand-accent-light hover:shadow-brand-accent/30 disabled:opacity-50 disabled:shadow-none">
                    Speichern
                  </button>
                </div>
              </form>
            )}

            {(itemsByColumn.get(column.id) ?? []).map((item) => (
              <li
                key={item.id}
                className="group relative flex flex-col gap-3 rounded-xl border border-slate-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-brand-primary/10 dark:border-slate-700/50 dark:bg-slate-800/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-slate-800 dark:text-slate-100 leading-snug">{item.title}</h3>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
                    {item.referenceCode}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${item.type === 'Phase' ? 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {item.type}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium}`}>
                    {item.priority}
                  </span>
                </div>
                
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/50">
                  {/* Assignee Avatar Dropdown */}
                  <div className="relative" title="Zuständigen ändern">
                    <select
                      value={item.assigneeId ?? ''}
                      onChange={(e) => handleAssign(item, e.target.value)}
                      className="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
                    >
                      <option value="">Nicht zugewiesen</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.displayName}</option>
                      ))}
                    </select>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 ring-2 ring-white transition-all group-hover:ring-brand-primary/30 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-800 dark:group-hover:ring-brand-primary/30">
                      {item.assigneeId ? getInitials(users.find(u => u.id === item.assigneeId)?.displayName) : (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-50"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                      )}
                    </div>
                  </div>
                  
                  {/* Column Move Pill */}
                  <div className="relative flex items-center" title="Spalte wechseln">
                    <select
                      value={column.id}
                      onChange={(e) => {
                        const target = board.columns.find((c) => c.id === e.target.value)
                        if (target) handleMove(item, target)
                      }}
                      className="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
                    >
                      {board.columns.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors group-hover:bg-brand-primary/10 group-hover:text-brand-primary dark:bg-slate-800/50 dark:text-slate-400 dark:group-hover:bg-brand-primary/20 dark:group-hover:text-brand-primary-light">
                      {column.name}
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
