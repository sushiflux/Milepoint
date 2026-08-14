import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as signalR from '@microsoft/signalr'
import { getBoards, getProjects } from '../api/projects'
import { createWorkItem, getWorkItems, moveWorkItem, updateWorkItem } from '../api/workItems'
import { getUsers, type UserSummary } from '../api/users'
import type { Board, BoardColumn, Project, WorkItem } from '../api/types'
import { createKanbanConnection } from '../realtime/signalr'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import AddButton from '../components/AddButton'

export default function BoardPage() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>()
  const { token } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [items, setItems] = useState<WorkItem[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [newTitleByColumn, setNewTitleByColumn] = useState<Record<string, string>>({})
  const [openAddColumns, setOpenAddColumns] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!projectId || !boardId) return

    getProjects().then((projects) => {
      setProject(projects.find((p) => p.id === projectId) ?? null)
    })

    getBoards(projectId).then((boards) => {
      setBoard(boards.find((b) => b.id === boardId) ?? null)
    })

    getWorkItems(boardId).then(setItems)
    getUsers().then(setUsers)
  }, [projectId, boardId])

  useEffect(() => {
    if (!boardId || !token) return

    const connection = createKanbanConnection(token)

    connection.on('workItemCreated', (item: WorkItem) => {
      setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]))
    })

    connection.on('workItemUpdated', (item: WorkItem) => {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    })

    connection.on('workItemMoved', (payload: { workItemId: string; targetColumnId: string; position: number }) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === payload.workItemId ? { ...i, columnId: payload.targetColumnId, position: payload.position } : i,
        ),
      )
    })

    connection
      .start()
      .then(() => connection.invoke('JoinBoard', boardId))
      .catch(() => {
        // Realtime ist ein Komfortfeature — bei Verbindungsfehlern bleibt die App über REST nutzbar.
      })

    return () => {
      if (connection.state === signalR.HubConnectionState.Connected) {
        connection.invoke('LeaveBoard', boardId).catch(() => undefined)
      }
      connection.stop()
    }
  }, [boardId, token])

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
    if (!boardId) return
    const title = (newTitleByColumn[column.id] ?? '').trim()
    if (!title) return

    const created = await createWorkItem(boardId, column.id, title, 'Task', 'Medium')
    setItems((prev) => [...prev, created])
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
    if (!boardId) return
    const position = (itemsByColumn.get(targetColumn.id)?.length ?? 0)
    await moveWorkItem(boardId, item.id, targetColumn.id, position)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, columnId: targetColumn.id, position } : i)))
  }

  async function handleAssign(item: WorkItem, assigneeId: string) {
    if (!boardId) return
    const updated = await updateWorkItem(boardId, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      assigneeId: assigneeId || null,
      parentWorkItemId: item.parentWorkItemId,
      startDate: item.startDate,
      dueDate: item.dueDate,
    })
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  if (!board) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Board wird geladen…</div>
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {project && <Sidebar project={{ id: project.id, name: project.name }} activeTab="kanban" />}

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h1 className="text-lg font-semibold">{board.name}</h1>
        </header>

        <main className="flex gap-4 overflow-x-auto p-6">
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
        </main>
      </div>
    </div>
  )
}
