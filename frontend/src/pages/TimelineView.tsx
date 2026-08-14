import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createMilestone, deleteMilestone } from '../api/milestones'
import { createWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, Milestone, WorkItem, WorkItemPriority } from '../api/types'
import AddButton from '../components/AddButton'

interface Props {
  projectId: string
  boards: Board[]
  workItems: WorkItem[]
  milestones: Milestone[]
  onWorkItemsChange: (items: WorkItem[]) => void
  onMilestonesChange: (milestones: Milestone[]) => void
}

const MIN_DAY_WIDTH = 28
const MIN_VISIBLE_DAYS = 2
const ZOOM_FACTOR = 1.25
const ROW_HEIGHT = 36
const MONTH_ROW_HEIGHT = 20
const WEEK_ROW_HEIGHT = 16
const DAY_ROW_HEIGHT = 22
const HEADER_HEIGHT = MONTH_ROW_HEIGHT + WEEK_ROW_HEIGHT + DAY_ROW_HEIGHT
const COL_ID = 56
const COL_TYPE = 68
const COL_STATUS = 96
const COL_PRIORITY = 72
const LABEL_WIDTH = 460

const MONTH_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'm1', label: '1 Monat', days: 30 },
  { key: 'm3', label: '3 Monate', days: 90 },
  { key: 'm6', label: '6 Monate', days: 180 },
  { key: 'm12', label: '12 Monate', days: 365 },
]

const WEEK_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'd3', label: '3 Tage', days: 3 },
  { key: 'w1', label: '1 Woche', days: 7 },
  { key: 'w2', label: '2 Wochen', days: 14 },
  { key: 'w3', label: '3 Wochen', days: 21 },
  { key: 'w4', label: '4 Wochen', days: 28 },
]

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

// ISO 8601: week 1 is the week containing the year's first Thursday, weeks start Monday.
function isoWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return { year: date.getUTCFullYear(), week }
}

interface HeaderGroup {
  key: string
  label: string
  startIndex: number
  span: number
}

function groupConsecutiveDays(days: Date[], keyOf: (d: Date) => string, labelOf: (d: Date) => string): HeaderGroup[] {
  const groups: HeaderGroup[] = []
  days.forEach((d, i) => {
    const key = keyOf(d)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.span++
    } else {
      groups.push({ key, label: labelOf(d), startIndex: i, span: 1 })
    }
  })
  return groups
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
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [visibleDayCount, setVisibleDayCount] = useState<number | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!filtersOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(event.target as Node)) setFiltersOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filtersOpen])

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

  // When a range is explicitly selected, it becomes the rendered window exactly - not padded
  // to the actual data span (dead space if data is shorter, e.g. 12 Monate) and not extended
  // by it either (endless scrolling if data is longer, e.g. 3 Tage on a long project).
  // Items outside that window are clipped instead of inflating the scrollable width.
  const renderedDayCount = visibleDayCount ?? dayCount
  const days = useMemo(
    () => Array.from({ length: renderedDayCount }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, renderedDayCount],
  )
  const monthGroups = useMemo(
    () =>
      groupConsecutiveDays(
        days,
        (d) => `${d.getFullYear()}-${d.getMonth()}`,
        (d) => d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      ),
    [days],
  )
  const weekGroups = useMemo(
    () =>
      groupConsecutiveDays(
        days,
        (d) => {
          const { year, week } = isoWeek(d)
          return `${year}-${week}`
        },
        (d) => `KW ${isoWeek(d).week}`,
      ),
    [days],
  )
  // Derived live from containerWidth (not stored as a fixed pixel value) so a selected
  // range keeps exactly filling the available width as the window is resized. The
  // MIN_DAY_WIDTH floor only applies to the auto (no explicit range) case - once a range is
  // explicitly selected it must fit the window exactly, even below that floor (e.g. 12 Monate).
  const dayWidth =
    containerWidth > 0
      ? visibleDayCount != null
        ? Math.max((containerWidth - LABEL_WIDTH) / visibleDayCount, 1)
        : Math.max((containerWidth - LABEL_WIDTH) / dayCount, MIN_DAY_WIDTH)
      : MIN_DAY_WIDTH
  const chartWidth = renderedDayCount * dayWidth
  const todayOffset = diffDays(startOfDay(new Date()), rangeStart)

  // scrollLeft is a raw pixel offset, so a day-width change (preset/zoom) alone would leave
  // the view scrolled to a completely different date - re-anchor it to whatever date was
  // actually visible before the change instead of letting the chart appear to "go empty".
  const prevDayWidthRef = useRef(dayWidth)
  useEffect(() => {
    const el = containerRef.current
    const prevDayWidth = prevDayWidthRef.current
    if (el && prevDayWidth !== dayWidth) {
      const ratio = dayWidth / prevDayWidth
      el.scrollLeft = el.scrollLeft > LABEL_WIDTH ? LABEL_WIDTH + (el.scrollLeft - LABEL_WIDTH) * ratio : el.scrollLeft * ratio
    }
    prevDayWidthRef.current = dayWidth
  }, [dayWidth])

  function applyPreset(days: number, key: string) {
    setActivePreset(key)
    setVisibleDayCount(days)
  }

  function zoomIn() {
    setActivePreset(null)
    setVisibleDayCount((prev) => Math.max(Math.round((prev ?? dayCount) / ZOOM_FACTOR), MIN_VISIBLE_DAYS))
  }

  function zoomOut() {
    setActivePreset(null)
    setVisibleDayCount((prev) => Math.round((prev ?? dayCount) * ZOOM_FACTOR))
  }

  function resetZoom() {
    setActivePreset(null)
    setVisibleDayCount(null)
  }

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
      const x2 = diffDays(depRange.start, rangeStart) * dayWidth
      const y2 = dependentIndex * ROW_HEIGHT + ROW_HEIGHT / 2

      for (const blockingId of row.item.blockingWorkItemIds) {
        const blockingIndex = rowIndexByTaskId.get(blockingId)
        if (blockingIndex === undefined) continue
        const blockingItem = workItemById.get(blockingId)
        if (!blockingItem) continue
        const blockRange = effectiveRange(blockingItem)
        if (!blockRange) continue

        const x1 = (diffDays(blockRange.finish, rangeStart) + 1) * dayWidth
        const y1 = blockingIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        const midX = x1 + 10
        paths.push({ key: `${blockingId}-${row.item.id}`, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` })
      }
    }
    return paths
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowIndexByTaskId, workItemById, rangeStart, dayWidth, drag])

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
    const deltaDays = Math.round((event.clientX - drag.startX) / dayWidth)
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
    setShowTaskForm(false)
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
    setShowMilestoneForm(false)
  }

  async function handleDeleteMilestone(milestone: Milestone) {
    await deleteMilestone(projectId, milestone.id)
    onMilestonesChange(milestones.filter((m) => m.id !== milestone.id))
  }

  const weekendBackground = `repeating-linear-gradient(to right, rgba(148,163,184,0.05) 0, rgba(148,163,184,0.05) ${dayWidth}px, transparent ${dayWidth}px, transparent ${dayWidth * 2}px)`

  function LabelCell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div
        className="sticky left-0 z-20 flex shrink-0 items-center bg-white dark:bg-slate-900"
        style={{ width: LABEL_WIDTH, ...style }}
      >
        {children}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!showTaskForm && <AddButton onClick={() => setShowTaskForm(true)} label="Neue Aufgabe" />}
          {!showMilestoneForm && <AddButton onClick={() => setShowMilestoneForm(true)} label="Neuer Meilenstein" />}
        </div>

        <div ref={filtersRef} className="relative">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            title="Zeitraum & Zoom"
            aria-label="Zeitraum & Zoom"
            className={`flex h-8 w-8 items-center justify-center rounded-full border hover:bg-slate-100 dark:hover:bg-slate-800 ${
              activePreset || visibleDayCount !== null
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="3" y="4.5" width="18" height="16" rx="2" />
              <path d="M3 9.5h18" />
              <path d="M8 2.5v4M16 2.5v4" />
            </svg>
          </button>

          {filtersOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Monate</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {MONTH_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.days, p.key)}
                    className={`rounded px-2 py-1 text-xs ${
                      activePreset === p.key
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Wochen</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {WEEK_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.days, p.key)}
                    className={`rounded px-2 py-1 text-xs ${
                      activePreset === p.key
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-800">
                {visibleDayCount !== null ? (
                  <button
                    type="button"
                    onClick={resetZoom}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Automatisch
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={zoomOut}
                    title="Rauszoomen"
                    aria-label="Rauszoomen"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-sm leading-none text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    title="Reinzoomen"
                    aria-label="Reinzoomen"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-sm leading-none text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <section
        ref={containerRef}
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="relative" style={{ width: LABEL_WIDTH + chartWidth }}>
          {todayOffset >= 0 && todayOffset < renderedDayCount && (
            <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500/70" style={{ left: LABEL_WIDTH + todayOffset * dayWidth }}>
              <div className="absolute -left-px h-2 w-2 -translate-x-1/2 rotate-45 bg-red-500" />
            </div>
          )}

          {/* header */}
          <div className="flex border-b border-slate-200 dark:border-slate-800" style={{ height: HEADER_HEIGHT }}>
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
            <div className="flex shrink-0 flex-col" style={{ width: chartWidth }}>
              <div className="relative border-b border-slate-100 dark:border-slate-800/60" style={{ height: MONTH_ROW_HEIGHT }}>
                {monthGroups.map((g) => (
                  <div
                    key={g.key}
                    className="absolute top-0 flex h-full items-center overflow-hidden border-l border-slate-200 px-1.5 text-[10px] font-medium text-slate-600 dark:border-slate-800/60 dark:text-slate-300"
                    style={{ left: g.startIndex * dayWidth, width: g.span * dayWidth }}
                  >
                    <span className="truncate">{g.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative border-b border-slate-100 dark:border-slate-800/60" style={{ height: WEEK_ROW_HEIGHT }}>
                {weekGroups.map((g) => (
                  <div
                    key={g.key}
                    className="absolute top-0 flex h-full items-center justify-center overflow-hidden border-l border-slate-200/70 text-[9px] text-slate-400 dark:border-slate-800/40 dark:text-slate-500"
                    style={{ left: g.startIndex * dayWidth, width: g.span * dayWidth }}
                  >
                    <span className="truncate">{g.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: DAY_ROW_HEIGHT, backgroundImage: weekendBackground }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    className="absolute top-0 flex h-full items-center justify-center border-l border-slate-200 text-[10px] text-slate-500 dark:border-slate-800/60"
                    style={{ left: i * dayWidth, width: dayWidth }}
                  >
                    {d.getDate()}
                  </div>
                ))}
              </div>
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
              const left = diffDays(startOfDay(new Date(m.date)), rangeStart) * dayWidth + dayWidth / 2
              return (
                <div key={row.key} className="flex border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20" style={{ height: ROW_HEIGHT }}>
                  <LabelCell>
                    <span style={{ width: COL_ID }} className="px-2 text-[10px] text-slate-500" />
                    <span className="flex flex-1 items-center gap-1 truncate px-2 text-xs">
                      {m.name}
                      <button
                        onClick={() => handleDeleteMilestone(m)}
                        className="text-slate-400 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                    <span style={{ width: COL_TYPE }} className="px-2 text-[11px] text-amber-600 dark:text-amber-400">
                      Meilenstein
                    </span>
                    <span style={{ width: COL_STATUS }} className="px-2" />
                    <span style={{ width: COL_PRIORITY }} className="px-2" />
                  </LabelCell>
                  <div className="relative shrink-0 overflow-hidden" style={{ width: chartWidth, height: ROW_HEIGHT }}>
                    <div
                      title={`${m.name} — ${formatDate(m.date)}`}
                      className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-amber-600 dark:text-amber-400"
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
              <div key={row.key} className="flex border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20" style={{ height: ROW_HEIGHT }}>
                <LabelCell>
                  <span style={{ width: COL_ID }} className="truncate px-2 font-mono text-[10px] text-slate-500">
                    {item.referenceCode}
                  </span>
                  <span className="flex flex-1 items-center gap-1 truncate px-2 text-xs" style={{ paddingLeft: depth * 16 }}>
                    {hasChildren && (
                      <button
                        onClick={() => toggleCollapse(item.id)}
                        className="w-3 shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                      >
                        {collapsed.has(item.id) ? '▸' : '▾'}
                      </button>
                    )}
                    <span className="truncate">{item.title}</span>
                  </span>
                  <span style={{ width: COL_TYPE }} className="truncate px-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {item.type}
                  </span>
                  <span style={{ width: COL_STATUS }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.columnType]}`} />
                    {item.columnName}
                  </span>
                  <span style={{ width: COL_PRIORITY }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} />
                    {item.priority}
                  </span>
                </LabelCell>
                <div className="relative shrink-0 overflow-hidden" style={{ width: chartWidth, height: ROW_HEIGHT }}>
                  {range && (
                    <div
                      onPointerDown={handlePointerDown(item)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp(item)}
                      className={`absolute flex cursor-grab items-center rounded ${barColor} ${blocked ? 'border-l-4 border-amber-400' : ''}`}
                      style={{
                        left: diffDays(range.start, rangeStart) * dayWidth,
                        width: Math.max((diffDays(range.finish, range.start) + 1) * dayWidth - 4, dayWidth - 4),
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
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">Ohne Termin</h2>
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

      {(showTaskForm || showMilestoneForm) && (
        <section className="flex flex-wrap gap-6">
          {showTaskForm && (
            <form onSubmit={handleCreateTask} className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowTaskForm(false)
                }}
                placeholder="Titel der Aufgabe"
                className="w-48 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                <option value="">Keine übergeordnete Aufgabe</option>
                {workItems.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.referenceCode} · {w.title}
                  </option>
                ))}
              </select>
              <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500">
                Anlegen
              </button>
              <button
                type="button"
                onClick={() => setShowTaskForm(false)}
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Abbrechen
              </button>
            </form>
          )}

          {showMilestoneForm && (
            <form onSubmit={handleCreateMilestone} className="flex items-center gap-2">
              <input
                autoFocus
                value={milestoneName}
                onChange={(e) => setMilestoneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setShowMilestoneForm(false)
                }}
                placeholder="Name des Meilensteins"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <input type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
              <button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500">
                Anlegen
              </button>
              <button
                type="button"
                onClick={() => setShowMilestoneForm(false)}
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Abbrechen
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  )
}

function UndatedRow({ item, onAssign }: { item: WorkItem; onAssign: (item: WorkItem, start: string, end: string) => void }) {
  const [start, setStart] = useState(toDateInputValue(item.startDate))
  const [end, setEnd] = useState(toDateInputValue(item.dueDate))

  return (
    <li className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="font-mono text-xs text-slate-500">{item.referenceCode}</span>
      <span className="flex-1 truncate">{item.title}</span>
      <input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
      />
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="rounded border border-slate-300 bg-slate-50 px-1 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-800"
      />
      <button
        onClick={() => onAssign(item, start, end)}
        disabled={!start && !end}
        className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Setzen
      </button>
    </li>
  )
}
