import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as signalR from '@microsoft/signalr'
import { getBoards } from '../api/projects'
import { createWorkItem, getWorkItems, moveWorkItem } from '../api/workItems'
import type { Board, BoardColumn, WorkItem } from '../api/types'
import { createKanbanConnection } from '../realtime/signalr'
import { useAuth } from '../context/AuthContext'

export default function BoardPage() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>()
  const { token } = useAuth()

  const [board, setBoard] = useState<Board | null>(null)
  const [items, setItems] = useState<WorkItem[]>([])
  const [newTitleByColumn, setNewTitleByColumn] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!projectId || !boardId) return

    getBoards(projectId).then((boards) => {
      setBoard(boards.find((b) => b.id === boardId) ?? null)
    })

    getWorkItems(boardId).then(setItems)
  }, [projectId, boardId])

  useEffect(() => {
    if (!boardId || !token) return

    const connection = createKanbanConnection(token)

    connection.on('workItemCreated', (item: WorkItem) => {
      setItems((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, item]))
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

  async function handleMove(item: WorkItem, targetColumn: BoardColumn) {
    if (!boardId) return
    const position = (itemsByColumn.get(targetColumn.id)?.length ?? 0)
    await moveWorkItem(boardId, item.id, targetColumn.id, position)
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, columnId: targetColumn.id, position } : i)))
  }

  if (!board) {
    return <div className="p-6 text-slate-400">Board wird geladen…</div>
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">{board.name}</h1>
      </header>

      <main className="flex gap-4 overflow-x-auto p-6">
        {board.columns.map((column) => (
          <section key={column.id} className="w-72 shrink-0 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <h2 className="mb-3 text-sm font-medium text-slate-300">
              {column.name}
              <span className="ml-2 text-xs text-slate-500">{itemsByColumn.get(column.id)?.length ?? 0}</span>
            </h2>

            <ul className="space-y-2">
              {(itemsByColumn.get(column.id) ?? []).map((item) => (
                <li key={item.id} className="rounded border border-slate-800 bg-slate-800/60 p-3 text-sm">
                  <p className="font-mono text-xs text-slate-500">{item.referenceCode}</p>
                  <p className="font-medium">{item.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>{item.type}</span>
                    <select
                      value={column.id}
                      onChange={(e) => {
                        const target = board.columns.find((c) => c.id === e.target.value)
                        if (target) handleMove(item, target)
                      }}
                      className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
                    >
                      {board.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleCreate(column)
              }}
              className="mt-3"
            >
              <input
                value={newTitleByColumn[column.id] ?? ''}
                onChange={(e) => setNewTitleByColumn((prev) => ({ ...prev, [column.id]: e.target.value }))}
                placeholder="+ Neues Item"
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
              />
            </form>
          </section>
        ))}
      </main>
    </div>
  )
}
