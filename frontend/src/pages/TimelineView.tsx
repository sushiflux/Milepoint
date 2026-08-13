import { useMemo, useState, type FormEvent } from 'react'
import { createMilestone, deleteMilestone } from '../api/milestones'
import { createWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, Milestone, WorkItem, WorkItemPriority } from '../api/types'

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
const HEADER_HEIGHT = 40
const COL_ID = 56
const COL_TYPE = 68
const COL_STATUS = 96
const COL_PRIORITY = 72
const LABEL_WIDTH = 460

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

const STATUS_DOT: Record<string, string> = {
  Todo: 'bg-slate-500',
  InProgress: 'bg-amber-400',
  Done: 'bg-emerald-500',
}

const PRIORITY_DOT: Record<WorkItemPriority, string> = {
  Low: 'bg-slate-500',
  Medium: 'bg-sky-500',
  High: 'bg-amber-500',
  Urgent: 'bg-red-500',
}

type DragMode = 'move' | 'resize-start' | 'resize-end'

interface DragState {
  itemId: string
  mode: DragMode
  startX: number
  deltaDays: number
}

interface TaskRow {
  kind: 'task'
  key: string
  depth: number
  item: WorkItem
  hasChildren: boolean
}

interface MilestoneRow {
  kind: 'milestone'
  key: string
  depth: number
  milestone: Milestone
}

type Row = TaskRow | MilestoneRow

export default function TimelineView({ projectId, boards, workItems, milestones, onWorkItemsChange, onMilestonesChange }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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

  const workItemById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems])
  const undatedItems = workItems.filter((w) => !w.startDate && !w.dueDate)

  const { rangeStart, dayCount } = useMemo(() => {
    const dates = [
      ...workItems.flatMap((w) => [w.startDate, w.dueDate].filter((d): d is string => Boolean(d))),
      ...milestones.map((m) => m.date),
    ].map((d) => startOfDay(new Date(d)))

    const today = startOfDay(new Date())
    const min = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : today
    const max = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addDays(today, 30)

    const start = addDays(min, -3)
    const end = addDays(max, 14)
    return { rangeStart: start, dayCount: Math.max(diffDays(end, start), 14) }
  }, [workItems, milestones])

  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)), [rangeStart, dayCount])
  const chartWidth = dayCount * DAY_WIDTH
  const todayOffset = diffDays(startOfDay(new Date()), rangeStart)

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function taskRows(parentId: string | null, depth: number): TaskRow[] {
    const children = (itemsByParent.get(parentId) ?? []).filter((w) => w.startDate || w.dueDate)
    return children.flatMap((item) => {
      const allChildren = itemsByParent.get(item.id) ?? []
      const row: TaskRow = { kind: 'task', key: item.id, depth, item, hasChildren: allChildren.length > 0 }
      const nested = collapsed.has(item.id) ? [] : taskRows(item.id, depth + 1)
      return [row, ...nested]
    })
  }

  const rows: Row[] = useMemo(() => {
    const topTasks = taskRows(null, 0)
    const milestoneRows: MilestoneRow[] = milestones.map((m) => ({ kind: 'milestone', key: `m-${m.id}`, depth: 0, milestone: m }))

    const sortKey = (r: Row) => (r.kind === 'milestone' ? new Date(r.milestone.date).getTime() : new Date((r.item.startDate ?? r.item.dueDate)!).getTime())

    // Only top-level entries get interleaved by date; nested task rows stay attached right after their parent.
    const topLevelKeys = new Set(topTasks.filter((r) => r.depth === 0).map((r) => r.key))
    const merged: Row[] = []
    const remaining = [...topTasks]
    const sortedTop: Row[] = [
      ...topTasks.filter((r) => topLevelKeys.has(r.key)),
      ...milestoneRows,
    ].sort((a, b) => sortKey(a) - sortKey(b))

    for (const top of sortedTop) {
      if (top.kind === 'milestone') {
        merged.push(top)
        continue
      }
      const idx = remaining.findIndex((r) => r.key === top.key)
      if (idx === -1) continue
      merged.push(remaining[idx])
      let j = idx + 1
      while (j < remaining.length && remaining[j].depth > 0) {
        merged.push(remaining[j])
        j++
      }
    }
    return merged
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workItems, milestones, collapsed])

  const rowIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.kind === 'task') map.set(r.item.id, i)
    })
    return map
  }, [rows])

  function effectiveRange(item: WorkItem) {
    const base = item.startDate ? startOfDay(new Date(item.startDate)) : item.dueDate ? startOfDay(new Date(item.dueDate)) : null
    const end = item.dueDate ? startOfDay(new Date(item.dueDate)) : item.startDate ? startOfDay(new Date(item.startDate)) : null
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

  const connectors = useMemo(() => {
    const paths: { key: string; d: string }[] = []
    for (const row of rows) {
      if (row.kind !== 'task') continue
      const dependentIndex = rowIndexByTaskId.get(row.item.id)
      if (dependentIndex === undefined) continue
      const depRange = effectiveRange(row.item)
      if (!depRange) continue
      const x2 = diffDays(depRange.start, rangeStart) * DAY_WIDTH
      const y2 = dependentIndex * ROW_HEIGHT + ROW_HEIGHT / 2

      for (const blockingId of row.item.blockingWorkItemIds) {
        const blockingIndex = rowIndexByTaskId.get(blockingId)
        if (blockingIndex === undefined) continue
        const blockingItem = workItemById.get(blockingId)
        if (!blockingItem) continue
        const blockRange = effectiveRange(blockingItem)
        if (!blockRange) continue

        const x1 = (diffDays(blockRange.finish, rangeStart) + 1) * DAY_WIDTH
        const y1 = blockingIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        const midX = x1 + 10
        paths.push({ key: `${blockingId}-${row.item.id}`, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` })
      }
    }
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowIndexByTaskId, workItemById, rangeStart, drag])

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
    onMilestonesChange([...milestones, created])
    setMilestoneName('')
    setMilestoneDate('')
  }

  async function handleDeleteMilestone(milestone: Milestone) {
    await deleteMilestone(projectId, milestone.id)
    onMilestonesChange(milestones.filter((m) => m.id !== milestone.id))
  }

  const weekendBackground = `repeating-linear-gradient(to right, rgba(148,163,184,0.05) 0, rgba(148,163,184,0.05) ${DAY_WIDTH}px, transparent ${DAY_WIDTH}px, transparent ${DAY_WIDTH * 2}px)`

  function LabelCell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div className="sticky left-0 z-20 flex shrink-0 items-center bg-slate-900" style={{ width: LABEL_WIDTH, ...style }}>
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
        <div className="relative" style={{ width: LABEL_WIDTH + chartWidth }}>
          <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500/70" style={{ left: LABEL_WIDTH + todayOffset * DAY_WIDTH }}>
            <div className="absolute -left-px h-2 w-2 -translate-x-1/2 rotate-45 bg-red-500" />
          </div>

          {/* header */}
          <div className="flex border-b border-slate-800" style={{ height: HEADER_HEIGHT }}>
            <LabelCell>
              <span style={{ width: COL_ID }} className="px-2 text-[10px] font-medium uppercase text-slate-500">
                ID
              </span>
              <span className="flex-1 px-2 text-[10px] font-medium uppercase text-slate-500">Betreff</span>
              <span style={{ width: COL_TYPE }} className="px-2 text-[10px] font-medium uppercase text-slate-500">
                Typ
              </span>
              <span style={{ width: COL_STATUS }} className="px-2 text-[10px] font-medium uppercase text-slate-500">
                Status
              </span>
              <span style={{ width: COL_PRIORITY }} className="px-2 text-[10px] font-medium uppercase text-slate-500">
                Priorität
              </span>
            </LabelCell>
            <div className="relative shrink-0" style={{ width: chartWidth, backgroundImage: weekendBackground }}>
              {days.map((d, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full flex-col items-center justify-center border-l border-slate-800/60 text-[10px] text-slate-500"
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                >
                  {(d.getDate() === 1 || i === 0) && <span className="text-slate-300">{d.toLocaleDateString('de-DE', { month: 'short' })}</span>}
                  <span>{d.getDate()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* connector overlay, spans all rows */}
          <svg
            className="pointer-events-none absolute z-10"
            style={{ left: LABEL_WIDTH, top: HEADER_HEIGHT, width: chartWidth, height: rows.length * ROW_HEIGHT }}
          >
            {connectors.map((c) => (
              <path key={c.key} d={c.d} stroke="rgb(129 140 248)" strokeWidth={1.5} fill="none" />
            ))}
          </svg>

          {rows.length === 0 && (
            <div className="flex" style={{ height: ROW_HEIGHT }}>
              <LabelCell style={{ paddingLeft: 8 }}>
                <span className="text-xs text-slate-500">Noch keine Aufgaben oder Meilensteine mit Termin.</span>
              </LabelCell>
              <div style={{ width: chartWidth }} />
            </div>
          )}

          {rows.map((row) => {
            if (row.kind === 'milestone') {
              const m = row.milestone
              const left = diffDays(startOfDay(new Date(m.date)), rangeStart) * DAY_WIDTH + DAY_WIDTH / 2
              return (
                <div key={row.key} className="flex border-b border-slate-800/50 hover:bg-slate-800/20" style={{ height: ROW_HEIGHT }}>
                  <LabelCell>
                    <span style={{ width: COL_ID }} className="px-2 text-[10px] text-slate-500" />
                    <span className="flex flex-1 items-center gap-1 truncate px-2 text-xs">
                      {m.name}
                      <button onClick={() => handleDeleteMilestone(m)} className="text-slate-600 hover:text-red-400">
                        ✕
                      </button>
                    </span>
                    <span style={{ width: COL_TYPE }} className="px-2 text-[11px] text-amber-400">
                      Meilenstein
                    </span>
                    <span style={{ width: COL_STATUS }} className="px-2" />
                    <span style={{ width: COL_PRIORITY }} className="px-2" />
                  </LabelCell>
                  <div className="relative shrink-0" style={{ width: chartWidth, height: ROW_HEIGHT }}>
                    <div
                      title={`${m.name} — ${formatDate(m.date)}`}
                      className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-amber-400"
                      style={{ left }}
                    >
                      ◆
                    </div>
                  </div>
                </div>
              )
            }

            const { item, depth, hasChildren } = row
            const range = effectiveRange(item)
            const isGroup = hasChildren
            const barColor = isGroup ? 'bg-slate-600' : 'bg-sky-600'
            const blocked = item.blockingWorkItemIds.length > 0

            return (
              <div key={row.key} className="flex border-b border-slate-800/50 hover:bg-slate-800/20" style={{ height: ROW_HEIGHT }}>
                <LabelCell>
                  <span style={{ width: COL_ID }} className="truncate px-2 font-mono text-[10px] text-slate-500">
                    {item.referenceCode}
                  </span>
                  <span className="flex flex-1 items-center gap-1 truncate px-2 text-xs" style={{ paddingLeft: depth * 16 }}>
                    {hasChildren && (
                      <button onClick={() => toggleCollapse(item.id)} className="w-3 shrink-0 text-slate-500 hover:text-slate-300">
                        {collapsed.has(item.id) ? '▸' : '▾'}
                      </button>
                    )}
                    <span className="truncate">{item.title}</span>
                  </span>
                  <span style={{ width: COL_TYPE }} className="truncate px-2 text-[11px] text-slate-400">
                    {item.type}
                  </span>
                  <span style={{ width: COL_STATUS }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.columnType]}`} />
                    {item.columnName}
                  </span>
                  <span style={{ width: COL_PRIORITY }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} />
                    {item.priority}
                  </span>
                </LabelCell>
                <div className="relative shrink-0" style={{ width: chartWidth, height: ROW_HEIGHT }}>
                  {range && (
                    <div
                      onPointerDown={handlePointerDown(item)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp(item)}
                      className={`absolute flex cursor-grab items-center rounded ${barColor} ${blocked ? 'border-l-4 border-amber-400' : ''}`}
                      style={{
                        left: diffDays(range.start, rangeStart) * DAY_WIDTH,
                        width: Math.max((diffDays(range.finish, range.start) + 1) * DAY_WIDTH - 4, DAY_WIDTH - 4),
                        top: 6,
                        height: ROW_HEIGHT - 12,
                      }}
                    >
                      <div data-handle="start" className="absolute left-0 h-full w-1.5 cursor-ew-resize" />
                      <span className="truncate px-2 text-[11px] text-white select-none">{item.title}</span>
                      <div data-handle="end" className="absolute right-0 h-full w-1.5 cursor-ew-resize" />
                    </div>
                  )}
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
      </section>

      <section className="flex flex-wrap gap-6">
        <form onSubmit={handleCreateTask} className="flex flex-wrap items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="+ Neue Aufgabe"
            className="w-48 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
          <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
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
            Aufgabe anlegen
          </button>
        </form>

        <form onSubmit={handleCreateMilestone} className="flex items-center gap-2">
          <input
            value={milestoneName}
            onChange={(e) => setMilestoneName(e.target.value)}
            placeholder="Neuer Meilenstein"
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
          />
          <input type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
          <button type="submit" className="rounded bg-amber-700 px-3 py-1 text-xs font-medium hover:bg-amber-600">
            Meilenstein anlegen
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
