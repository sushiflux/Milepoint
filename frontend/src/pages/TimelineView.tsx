import { useMemo, useState, type FormEvent } from 'react'
import { createMilestone, deleteMilestone } from '../api/milestones'
import { createWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, Milestone, WorkItem } from '../api/types'

interface Props {
  projectId: string
  boards: Board[]
  workItems: WorkItem[]
  milestones: Milestone[]
  onWorkItemsChange: (items: WorkItem[]) => void
  onMilestonesChange: (milestones: Milestone[]) => void
}

const DAY_WIDTH = 32
const ROW_HEIGHT = 36
const LABEL_WIDTH = 260

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function diffDays(a: Date, b: Date) {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
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

function toDateInputValue(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  itemId: string
  mode: DragMode
  startX: number
  deltaDays: number
}

export default function TimelineView({ projectId, boards, workItems, milestones, onWorkItemsChange, onMilestonesChange }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

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

  const datedItems = workItems.filter((w) => w.startDate || w.dueDate)
  const undatedItems = workItems.filter((w) => !w.startDate && !w.dueDate)

  const { rangeStart, dayCount } = useMemo(() => {
    const dates = [
      ...datedItems.flatMap((w) => [w.startDate, w.dueDate].filter((d): d is string => Boolean(d))),
      ...milestones.map((m) => m.date),
    ].map((d) => startOfDay(new Date(d)))

    const today = startOfDay(new Date())
    const min = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
    const max = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addDays(today, 30)

    const start = addDays(min, -3)
    const end = addDays(max, 14)
    return { rangeStart: start, dayCount: Math.max(diffDays(end, start), 14) }
  }, [datedItems, milestones])

  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)), [rangeStart, dayCount])
  const chartWidth = dayCount * DAY_WIDTH
  const todayOffset = diffDays(startOfDay(new Date()), rangeStart)

  function effectiveRange(item: WorkItem) {
    const base = item.startDate
      ? startOfDay(new Date(item.startDate))
      : item.dueDate
        ? startOfDay(new Date(item.dueDate))
        : null
    const end = item.dueDate
      ? startOfDay(new Date(item.dueDate))
      : item.startDate
        ? startOfDay(new Date(item.startDate))
        : null

    if (!base || !end) return null

    let start = base
    let finish = end

    if (drag && drag.itemId === item.id) {
      if (drag.mode === 'move') {
        start = addDays(base, drag.deltaDays)
        finish = addDays(end, drag.deltaDays)
      } else if (drag.mode === 'resize-start') {
        start = addDays(base, drag.deltaDays)
        if (start > finish) start = finish
      } else {
        finish = addDays(end, drag.deltaDays)
        if (finish < start) finish = start
      }
    }

    return { start, finish }
  }

  async function commitDateChange(item: WorkItem, start: Date, finish: Date) {
    const updated = await updateWorkItem(item.boardId, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      assigneeId: item.assigneeId,
      parentWorkItemId: item.parentWorkItemId,
      startDate: start.toISOString(),
      dueDate: finish.toISOString(),
    })
    onWorkItemsChange(workItems.map((w) => (w.id === updated.id ? updated : w)))
  }

  function handlePointerDown(item: WorkItem) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement
      const mode: DragMode = target.dataset.handle === 'start' ? 'resize-start' : target.dataset.handle === 'end' ? 'resize-end' : 'move'
      event.currentTarget.setPointerCapture(event.pointerId)
      setDrag({ itemId: item.id, mode, startX: event.clientX, deltaDays: 0 })
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const deltaDays = Math.round((event.clientX - drag.startX) / DAY_WIDTH)
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays })
  }

  function handlePointerUp(item: WorkItem) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drag || drag.itemId !== item.id) return
      event.currentTarget.releasePointerCapture(event.pointerId)

      const range = effectiveRange(item)
      setDrag(null)
      if (!range || drag.deltaDays === 0) return
      commitDateChange(item, range.start, range.finish).catch(() => setError('Termin konnte nicht gespeichert werden.'))
    }
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const title = newTitle.trim()
    if (!title) return

    const target = firstTodoColumn(boards)
    if (!target?.column) {
      setError('Erst ein Board mit Spalten anlegen (Kanban-Tab), bevor Aufgaben angelegt werden können.')
      return
    }

    const created = await createWorkItem(target.board.id, target.column.id, title, 'Task', 'Medium', undefined, {
      parentWorkItemId: newParentId || undefined,
      startDate: newStart ? new Date(newStart).toISOString() : undefined,
      dueDate: newEnd ? new Date(newEnd).toISOString() : undefined,
    })
    onWorkItemsChange([...workItems, created])
    setNewTitle('')
    setNewParentId('')
    setNewStart('')
    setNewEnd('')
  }

  async function handleAssignDates(item: WorkItem, startValue: string, endValue: string) {
    if (!startValue && !endValue) return
    const start = startValue ? new Date(startValue) : new Date(endValue)
    const finish = endValue ? new Date(endValue) : new Date(startValue)
    await commitDateChange(item, start, finish)
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

  function rowsFor(parentId: string | null, depth: number): { item: WorkItem; depth: number }[] {
    const children = itemsByParent.get(parentId) ?? []
    return children.flatMap((item) => [{ item, depth }, ...rowsFor(item.id, depth + 1)])
  }

  const datedRows = rowsFor(null, 0).filter((r) => r.item.startDate || r.item.dueDate)

  const weekendBackground = `repeating-linear-gradient(to right, rgba(148,163,184,0.05) 0, rgba(148,163,184,0.05) ${DAY_WIDTH}px, transparent ${DAY_WIDTH}px, transparent ${DAY_WIDTH * 2}px)`

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

      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <div className="relative" style={{ width: LABEL_WIDTH + chartWidth }}>
          {/* today line, spans full height */}
          <div
            className="pointer-events-none absolute inset-y-0 z-0 w-px bg-indigo-500/60"
            style={{ left: LABEL_WIDTH + todayOffset * DAY_WIDTH }}
          />

          {/* header */}
          <div className="flex border-b border-slate-800" style={{ height: ROW_HEIGHT }}>
            <div className="sticky left-0 z-10 shrink-0 bg-slate-900" style={{ width: LABEL_WIDTH }} />
            <div className="relative shrink-0" style={{ width: chartWidth, backgroundImage: weekendBackground }}>
              {days.map((d, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full flex-col items-center justify-center border-l border-slate-800/60 text-[10px] text-slate-500"
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                >
                  {(d.getDate() === 1 || i === 0) && (
                    <span className="text-slate-300">{d.toLocaleDateString('de-DE', { month: 'short' })}</span>
                  )}
                  <span>{d.getDate()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* milestone track */}
          <div className="flex border-b border-slate-800" style={{ height: ROW_HEIGHT }}>
            <div
              className="sticky left-0 z-10 shrink-0 bg-slate-900 px-2 py-1.5 text-xs text-slate-500"
              style={{ width: LABEL_WIDTH }}
            >
              Meilensteine
            </div>
            <div className="relative shrink-0" style={{ width: chartWidth, height: ROW_HEIGHT }}>
              {milestones.map((m) => (
                <div
                  key={m.id}
                  title={`${m.name} — ${formatDate(m.date)}`}
                  className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-amber-400"
                  style={{ left: diffDays(startOfDay(new Date(m.date)), rangeStart) * DAY_WIDTH + DAY_WIDTH / 2 }}
                >
                  ◆
                </div>
              ))}
            </div>
          </div>

          {/* task rows */}
          {datedRows.length === 0 && (
            <div className="flex" style={{ height: ROW_HEIGHT }}>
              <div className="sticky left-0 z-10 shrink-0 bg-slate-900 px-2 py-1.5 text-xs text-slate-500" style={{ width: LABEL_WIDTH }}>
                Noch keine Aufgaben mit Termin.
              </div>
              <div style={{ width: chartWidth }} />
            </div>
          )}

          {datedRows.map(({ item, depth }) => {
            const range = effectiveRange(item)
            if (!range) return null

            const left = diffDays(range.start, rangeStart) * DAY_WIDTH
            const width = Math.max((diffDays(range.finish, range.start) + 1) * DAY_WIDTH - 4, DAY_WIDTH - 4)
            const colorClass =
              item.columnType === 'Done' ? 'bg-emerald-600' : item.columnType === 'InProgress' ? 'bg-indigo-500' : 'bg-slate-600'
            const blocked = item.blockingWorkItemIds.length > 0

            return (
              <div key={item.id} className="flex border-b border-slate-800/50 hover:bg-slate-800/20" style={{ height: ROW_HEIGHT }}>
                <div
                  className="sticky left-0 z-10 flex shrink-0 flex-col justify-center truncate bg-slate-900 px-2"
                  style={{ width: LABEL_WIDTH, paddingLeft: 8 + depth * 16 }}
                >
                  <span className="truncate font-mono text-[10px] text-slate-500">{item.referenceCode}</span>
                  <span className="truncate text-xs">{item.title}</span>
                </div>
                <div className="relative shrink-0" style={{ width: chartWidth, height: ROW_HEIGHT }}>
                  <div
                    onPointerDown={handlePointerDown(item)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp(item)}
                    className={`absolute flex cursor-grab items-center rounded ${colorClass} ${blocked ? 'border-l-4 border-amber-400' : ''}`}
                    style={{ left, width, top: 6, height: ROW_HEIGHT - 12 }}
                  >
                    <div data-handle="start" className="absolute left-0 h-full w-1.5 cursor-ew-resize" />
                    <span className="truncate px-2 text-[11px] text-white select-none">{item.title}</span>
                    <div data-handle="end" className="absolute right-0 h-full w-1.5 cursor-ew-resize" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-slate-300">Ohne Termin</h2>
        {undatedItems.length === 0 ? (
          <p className="text-sm text-slate-500">Alle Aufgaben haben einen Termin.</p>
        ) : (
          <ul className="space-y-1">
            {undatedItems.map((item) => (
              <UndatedRow key={item.id} item={item} onAssign={handleAssignDates} />
            ))}
          </ul>
        )}

        <form onSubmit={handleCreateTask} className="flex flex-wrap items-center gap-2 pt-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="+ Neue Aufgabe"
            className="w-48 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          >
            <option value="">Keine übergeordnete Aufgabe</option>
            {workItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.referenceCode} · {w.title}
              </option>
            ))}
          </select>
          <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500">
            Anlegen
          </button>
        </form>
      </section>
    </div>
  )
}

function UndatedRow({ item, onAssign }: { item: WorkItem; onAssign: (item: WorkItem, start: string, end: string) => void }) {
  const [start, setStart] = useState(toDateInputValue(item.startDate))
  const [end, setEnd] = useState(toDateInputValue(item.dueDate))

  return (
    <li className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm">
      <span className="font-mono text-xs text-slate-500">{item.referenceCode}</span>
      <span className="flex-1 truncate">{item.title}</span>
      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs" />
      <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-xs" />
      <button
        onClick={() => onAssign(item, start, end)}
        disabled={!start && !end}
        className="rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800 disabled:opacity-40"
      >
        Setzen
      </button>
    </li>
  )
}
