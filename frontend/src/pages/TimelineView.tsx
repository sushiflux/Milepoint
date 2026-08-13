import { useMemo, useState, type FormEvent } from 'react'
import { createMilestone, deleteMilestone } from '../api/milestones'
import { createWorkItem } from '../api/workItems'
import type { Board, Milestone, WorkItem } from '../api/types'

interface Props {
  projectId: string
  boards: Board[]
  workItems: WorkItem[]
  milestones: Milestone[]
  onWorkItemsChange: (items: WorkItem[]) => void
  onMilestonesChange: (milestones: Milestone[]) => void
}

function firstTodoColumn(boards: Board[]) {
  const board = boards[0]
  if (!board) return null
  return { board, column: board.columns.find((c) => c.type === 'Todo') ?? board.columns[0] ?? null }
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('de-DE')
}

export default function TimelineView({ projectId, boards, workItems, milestones, onWorkItemsChange, onMilestonesChange }: Props) {
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<Record<string, string>>({})
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const itemsByParent = useMemo(() => {
    const map = new Map<string | null, WorkItem[]>()
    for (const item of workItems) {
      const key = item.parentWorkItemId
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [workItems])

  const dateBounds = useMemo(() => {
    const dates = [
      ...workItems.flatMap((w) => [w.startDate, w.dueDate].filter((d): d is string => Boolean(d))),
      ...milestones.map((m) => m.date),
    ].map((d) => new Date(d).getTime())

    if (dates.length === 0) return null
    return { min: Math.min(...dates), max: Math.max(...dates) }
  }, [workItems, milestones])

  function barStyle(startDate: string | null, dueDate: string | null) {
    if (!dateBounds || (!startDate && !dueDate)) return null
    const { min, max } = dateBounds
    const span = Math.max(max - min, 1)
    const start = startDate ? new Date(startDate).getTime() : new Date(dueDate!).getTime()
    const end = dueDate ? new Date(dueDate).getTime() : start
    const left = ((start - min) / span) * 100
    const width = Math.max(((end - start) / span) * 100, 1.5)
    return { left: `${left}%`, width: `${width}%` }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const title = newTaskTitle.trim()
    if (!title) return

    const target = firstTodoColumn(boards)
    if (!target?.column) {
      setError('Erst ein Board mit Spalten anlegen (Kanban-Tab), bevor Aufgaben angelegt werden können.')
      return
    }

    const created = await createWorkItem(target.board.id, target.column.id, title, 'Task', 'Medium')
    onWorkItemsChange([...workItems, created])
    setNewTaskTitle('')
  }

  async function handleCreateSubtask(parent: WorkItem, event: FormEvent) {
    event.preventDefault()
    const title = (newSubtaskTitle[parent.id] ?? '').trim()
    if (!title) return

    const target = firstTodoColumn(boards)
    if (!target?.column) return

    const created = await createWorkItem(target.board.id, target.column.id, title, 'Task', 'Medium', undefined, {
      parentWorkItemId: parent.id,
    })
    onWorkItemsChange([...workItems, created])
    setNewSubtaskTitle((prev) => ({ ...prev, [parent.id]: '' }))
  }

  async function handleCreateMilestone(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!milestoneName.trim() || !milestoneDate) return

    const created = await createMilestone(projectId, milestoneName.trim(), new Date(milestoneDate).toISOString())
    onMilestonesChange([...milestones, created].sort((a, b) => a.date.localeCompare(b.date)))
    setMilestoneName('')
    setMilestoneDate('')
  }

  async function handleDeleteMilestone(milestone: Milestone) {
    await deleteMilestone(projectId, milestone.id)
    onMilestonesChange(milestones.filter((m) => m.id !== milestone.id))
  }

  function renderItem(item: WorkItem, depth: number): React.ReactNode {
    const children = itemsByParent.get(item.id) ?? []
    const bar = barStyle(item.startDate, item.dueDate)
    const blockers = item.blockingWorkItemIds
      .map((id) => workItems.find((w) => w.id === id))
      .filter((w): w is WorkItem => Boolean(w))

    return (
      <div key={item.id}>
        <div className="flex items-center gap-3 border-b border-slate-800 py-2" style={{ paddingLeft: depth * 20 }}>
          <div className="w-64 shrink-0">
            <p className="font-mono text-xs text-slate-500">{item.referenceCode}</p>
            <p className="text-sm">{item.title}</p>
            {blockers.length > 0 && (
              <p className="text-xs text-amber-400">
                blockiert durch: {blockers.map((b) => b.referenceCode).join(', ')}
              </p>
            )}
          </div>
          <div className="w-28 shrink-0 text-xs text-slate-400">{item.columnName}</div>
          <div className="w-32 shrink-0 text-xs text-slate-500">
            {formatDate(item.startDate)} {item.startDate && item.dueDate && '→'} {formatDate(item.dueDate)}
          </div>
          <div className="relative h-4 flex-1 rounded bg-slate-900">
            {bar && (
              <div
                className={`absolute h-4 rounded ${item.columnType === 'Done' ? 'bg-emerald-600' : item.columnType === 'InProgress' ? 'bg-indigo-500' : 'bg-slate-600'}`}
                style={bar}
              />
            )}
          </div>
        </div>

        {children.map((child) => renderItem(child, depth + 1))}

        <form
          onSubmit={(e) => handleCreateSubtask(item, e)}
          style={{ paddingLeft: (depth + 1) * 20 }}
          className="border-b border-slate-800 py-1"
        >
          <input
            value={newSubtaskTitle[item.id] ?? ''}
            onChange={(e) => setNewSubtaskTitle((prev) => ({ ...prev, [item.id]: e.target.value }))}
            placeholder="+ Unteraufgabe"
            className="w-64 rounded border border-slate-800 bg-transparent px-2 py-1 text-xs text-slate-400 placeholder:text-slate-600"
          />
        </form>
      </div>
    )
  }

  const topLevelItems = itemsByParent.get(null) ?? []

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium text-slate-300">Meilensteine</h2>
        <ul className="mb-3 flex flex-wrap gap-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded border border-amber-800/60 bg-amber-950/20 px-3 py-1 text-xs">
              <span className="text-amber-400">◆</span>
              <span>{m.name}</span>
              <span className="text-slate-500">{formatDate(m.date)}</span>
              <button onClick={() => handleDeleteMilestone(m)} className="text-slate-500 hover:text-red-400">
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleCreateMilestone} className="flex gap-2">
          <input
            value={milestoneName}
            onChange={(e) => setMilestoneName(e.target.value)}
            placeholder="Neuer Meilenstein"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
          <input
            type="date"
            value={milestoneDate}
            onChange={(e) => setMilestoneDate(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
          <button type="submit" className="rounded bg-amber-700 px-3 py-1 text-xs hover:bg-amber-600">
            Anlegen
          </button>
        </form>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        {topLevelItems.length === 0 && <p className="text-sm text-slate-500">Noch keine Aufgaben.</p>}
        {topLevelItems.map((item) => renderItem(item, 0))}

        <form onSubmit={handleCreateTask} className="mt-3">
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="+ Neue Aufgabe"
            className="w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
        </form>
      </section>
    </div>
  )
}
