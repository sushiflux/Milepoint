import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createMilestone, deleteMilestone } from '../api/milestones'
import { createWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, BoardColumnType, Milestone, WorkItem, WorkItemPriority, WorkItemType } from '../api/types'
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
// Roughly 4 months - beyond this, squeezing every remaining day into the window makes the
// day columns unreadably thin, so a wider range fits this many days to the window and the
// rest becomes horizontally scrollable instead of compressing further.
const MAX_FIT_DAYS = 120
const ZOOM_FACTOR = 1.25
const ROW_HEIGHT = 36
const MONTH_ROW_HEIGHT = 20
const WEEK_ROW_HEIGHT = 16
const DAY_ROW_HEIGHT = 22
const HEADER_HEIGHT = MONTH_ROW_HEIGHT + WEEK_ROW_HEIGHT + DAY_ROW_HEIGHT
// Height of the scrollbar-only strip placed above the month/year row so the one visible
// horizontal scrollbar is anchored there instead of at the bottom of the day rows.
const SCROLLBAR_ROW_HEIGHT = 14
const COL_ID = 56
const COL_TYPE = 68
const COL_STATUS = 96
const COL_PRIORITY = 72
const LABEL_WIDTH = 460

const RANGE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: 'd3', label: '3 Tage', days: 3 },
  { key: 'w1', label: '1 Woche', days: 7 },
  { key: 'w2', label: '2 Wochen', days: 14 },
  { key: 'w3', label: '3 Wochen', days: 21 },
  { key: 'w4', label: '4 Wochen', days: 28 },
  { key: 'm1', label: '1 Monat', days: 30 },
  { key: 'm3', label: '3 Monate', days: 90 },
  { key: 'm6', label: '6 Monate', days: 180 },
  { key: 'm12', label: '12 Monate', days: 365 },
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

const STATUS_LABELS: Record<BoardColumnType, string> = {
  Todo: 'Offen',
  InProgress: 'In Arbeit',
  Done: 'Erledigt',
}

const PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  Low: 'Niedrig',
  Medium: 'Mittel',
  High: 'Hoch',
  Urgent: 'Dringend',
}

const TYPE_LABELS: Record<WorkItemType, string> = {
  Task: 'Aufgabe',
  Phase: 'Phase',
}

const TYPE_TEXT_COLOR: Record<WorkItemType, string> = {
  Task: 'text-sky-600 dark:text-sky-400',
  Phase: 'text-orange-600 dark:text-orange-400',
}

const STATUS_BAR_COLOR: Record<BoardColumnType, string> = {
  Todo: 'bg-gradient-to-b from-slate-400 to-slate-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-slate-700/50',
  InProgress: 'bg-gradient-to-b from-sky-400 to-sky-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-sky-700/50',
  Done: 'bg-gradient-to-b from-emerald-400 to-emerald-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-emerald-700/50',
}

const KNOWN_BAR_COLORS: Record<string, string> = {
  'pausiert': 'bg-gradient-to-b from-amber-400 to-amber-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-amber-700/50',
  'blockiert': 'bg-gradient-to-b from-red-400 to-red-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-red-700/50',
  'review': 'bg-gradient-to-b from-purple-400 to-purple-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-purple-700/50',
  'neu': 'bg-gradient-to-b from-slate-400 to-slate-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-slate-700/50',
}

function getBarColor(columnName: string, columnType: BoardColumnType) {
  const lowerName = columnName.toLowerCase();
  for (const [key, color] of Object.entries(KNOWN_BAR_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return STATUS_BAR_COLOR[columnType] || STATUS_BAR_COLOR.Todo;
}

const TYPE_BAR_COLOR: Record<WorkItemType, string> = {
  Task: 'bg-gradient-to-b from-sky-400 to-sky-600 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-sky-700/50',
  Phase: 'bg-gradient-to-b from-orange-400 to-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-orange-700/50',
}

const STATUS_OPTIONS: BoardColumnType[] = ['Todo', 'InProgress', 'Done']
const PRIORITY_OPTIONS: WorkItemPriority[] = ['Low', 'Medium', 'High', 'Urgent']
const UNASSIGNED = '__unassigned__'

function toggleInSet<T>(set: Set<T>, value: T) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
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
  const [newType, setNewType] = useState<WorkItemType>('Task')
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
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)
  const scrollbarRef = useRef<HTMLDivElement>(null)
  const monthScrollRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [visibleDayCount, setVisibleDayCount] = useState<number | null>(null)
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)
  const rangeMenuRef = useRef<HTMLDivElement>(null)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)
  const [filterStatuses, setFilterStatuses] = useState<Set<BoardColumnType>>(new Set())
  const [filterPriorities, setFilterPriorities] = useState<Set<WorkItemPriority>>(new Set())
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!rangeMenuOpen && !filterMenuOpen) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(target)) setRangeMenuOpen(false)
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) setFilterMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [rangeMenuOpen, filterMenuOpen])

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

  const milestonesByParent = useMemo(() => {
    const map = new Map<string | null, Milestone[]>()
    for (const m of milestones) {
      const key = m.parentWorkItemId ?? null
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [milestones])

  const workItemById = useMemo(() => new Map(workItems.map((w) => [w.id, w])), [workItems])
  const milestoneById = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones])

  const groupIds = useMemo(
    () => new Set([...itemsByParent.keys()].filter((k): k is string => k !== null && (itemsByParent.get(k)?.length ?? 0) > 0)),
    [itemsByParent],
  )
  const allCollapsed = groupIds.size > 0 && [...groupIds].every((id) => collapsed.has(id))

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const w of workItems) {
      const key = w.assigneeId ?? UNASSIGNED
      if (!map.has(key)) map.set(key, w.assigneeDisplayName ?? 'Nicht zugewiesen')
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [workItems])

  const filtersActive = filterStatuses.size > 0 || filterPriorities.size > 0 || filterAssignees.size > 0

  function matchesFilters(item: WorkItem) {
    if (filterStatuses.size > 0 && !filterStatuses.has(item.columnType)) return false
    if (filterPriorities.size > 0 && !filterPriorities.has(item.priority)) return false
    if (filterAssignees.size > 0 && !filterAssignees.has(item.assigneeId ?? UNASSIGNED)) return false
    return true
  }

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
  const dayWidth =
    containerWidth > 0
      ? visibleDayCount != null
        ? Math.max(containerWidth / Math.min(visibleDayCount, MAX_FIT_DAYS), MIN_DAY_WIDTH)
        : Math.max(containerWidth / dayCount, MIN_DAY_WIDTH)
      : MIN_DAY_WIDTH
  const chartWidth = renderedDayCount * dayWidth
  const todayOffset = diffDays(startOfDay(new Date()), rangeStart)

  const prevDayWidthRef = useRef(dayWidth)
  useEffect(() => {
    const el = containerRef.current
    const prevDayWidth = prevDayWidthRef.current
    if (el && prevDayWidth !== dayWidth) {
      el.scrollLeft = el.scrollLeft * (dayWidth / prevDayWidth)
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

  function openChildForm(parentId: string) {
    setNewParentId(parentId)
    setShowTaskForm(true)
  }

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCollapseAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(groupIds))
  }

  function scrollToToday() {
    const el = containerRef.current
    if (!el || todayOffset < 0 || todayOffset >= renderedDayCount) return
    const target = todayOffset * dayWidth - el.clientWidth / 2
    el.scrollLeft = Math.max(target, 0)
  }

  function syncScrollLeft(source: HTMLDivElement | null, targets: (HTMLDivElement | null)[]) {
    if (!source) return
    for (const target of targets) {
      if (target && target.scrollLeft !== source.scrollLeft) target.scrollLeft = source.scrollLeft
    }
  }

  function handleScrollbarScroll() {
    syncScrollLeft(scrollbarRef.current, [monthScrollRef.current, containerRef.current, bodyScrollRef.current])
  }

  function handleMonthScroll() {
    syncScrollLeft(monthScrollRef.current, [scrollbarRef.current, containerRef.current, bodyScrollRef.current])
  }

  function handleHeaderScroll() {
    syncScrollLeft(containerRef.current, [scrollbarRef.current, monthScrollRef.current, bodyScrollRef.current])
  }

  function handleBodyScroll() {
    syncScrollLeft(bodyScrollRef.current, [scrollbarRef.current, monthScrollRef.current, containerRef.current])
  }

  const chartWheelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = chartWheelRef.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      const target = containerRef.current
      if (!target) return
      event.preventDefault()
      target.scrollLeft += event.deltaX + event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

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

    const topLevelKeys = new Set(topTasks.filter((r) => r.depth === 0).map((r) => r.key))
    const remaining = [...topTasks]
    const sortedTop: Row[] = [
      ...topTasks.filter((r) => topLevelKeys.has(r.key)),
      ...milestoneRows,
    ].sort((a, b) => sortKey(a) - sortKey(b))

    const merged: Row[] = []
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
    return merged.filter((r) => r.kind === 'milestone' || matchesFilters(r.item))
  }, [workItems, milestones, collapsed, filterStatuses, filterPriorities, filterAssignees])

  const rowIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.kind === 'task') map.set(r.item.id, i)
    })
    return map
  }, [rows])

  const rowIndexByMilestoneId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.kind === 'milestone') map.set(r.milestone.id, i)
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

  function phaseRange(item: WorkItem): { start: Date; finish: Date } | null {
    let start: Date | null = null
    let finish: Date | null = null
    for (const child of itemsByParent.get(item.id) ?? []) {
      const childRange = child.type === 'Phase' ? phaseRange(child) : effectiveRange(child)
      if (!childRange) continue
      if (!start || childRange.start < start) start = childRange.start
      if (!finish || childRange.finish > finish) finish = childRange.finish
    }
    return start && finish ? { start, finish } : null
  }

  function rangeOf(item: WorkItem) {
    return item.type === 'Phase' ? phaseRange(item) : effectiveRange(item)
  }

  const connectors = useMemo(() => {
    const paths: { key: string; d: string; blockingId: string; dependentId: string; isParentChild?: boolean }[] = []

    function orthogonal(x1: number, y1: number, x2: number, y2: number) {
      const offset = 12
      if (x2 >= x1 + offset) {
        const midX = x1 + offset
        return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
      } else {
        const midY = (y1 + y2) / 2
        const dropX = x1 + offset
        const backX = x2 - offset
        return `M ${x1} ${y1} L ${dropX} ${y1} L ${dropX} ${midY} L ${backX} ${midY} L ${backX} ${y2} L ${x2} ${y2}`
      }
    }

    for (const row of rows) {
      if (row.kind !== 'task') continue
      const myIndex = rowIndexByTaskId.get(row.item.id)
      if (myIndex === undefined) continue
      const myRange = rangeOf(row.item)
      if (!myRange) continue

      const x1Blocker = (diffDays(myRange.finish, rangeStart) + 1) * dayWidth
      const y1Blocker = myIndex * ROW_HEIGHT + ROW_HEIGHT / 2

      for (const dependentId of row.item.blockingWorkItemIds) {
        const dependentIndex = rowIndexByTaskId.get(dependentId)
        if (dependentIndex === undefined) continue
        const dependentItem = workItemById.get(dependentId)
        if (!dependentItem) continue
        const depRange = rangeOf(dependentItem)
        if (!depRange) continue

        const x2Dep = diffDays(depRange.start, rangeStart) * dayWidth
        const y2Dep = dependentIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        paths.push({ key: `${row.item.id}-${dependentId}`, d: orthogonal(x1Blocker, y1Blocker, x2Dep, y2Dep), blockingId: row.item.id, dependentId })
      }

      if (row.item.parentWorkItemId) {
        const taskSiblings = itemsByParent.get(row.item.parentWorkItemId) || []
        const milestoneSiblings = milestonesByParent.get(row.item.parentWorkItemId) || []
        const siblings = [...taskSiblings, ...milestoneSiblings]
        
        const sortedSiblings = siblings.filter(s => !('type' in s) || s.type !== 'Phase').sort((a, b) => {
          const startA = ('date' in a) ? new Date(a.date).getTime() : (rangeOf(a)?.start?.getTime() || 0);
          const startB = ('date' in b) ? new Date(b.date).getTime() : (rangeOf(b)?.start?.getTime() || 0);
          return startA - startB;
        });
        
        const myIndexInSiblings = sortedSiblings.findIndex(s => s.id === row.item.id);
        if (myIndexInSiblings > 0) {
          const prevSibling = sortedSiblings[myIndexInSiblings - 1];
          const prevIndex = rowIndexByTaskId.get(prevSibling.id) ?? rowIndexByMilestoneId.get(prevSibling.id);
          const prevRange = ('date' in prevSibling) ? { start: startOfDay(new Date(prevSibling.date)), finish: startOfDay(new Date(prevSibling.date)) } : rangeOf(prevSibling);
          if (prevIndex !== undefined && prevRange) {
             const x1 = ('date' in prevSibling) ? diffDays(prevRange.finish, rangeStart) * dayWidth + dayWidth / 2 : (diffDays(prevRange.finish, rangeStart) + 1) * dayWidth;
             const y1 = prevIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
             const x2Dep = diffDays(myRange.start, rangeStart) * dayWidth;
             const y2Dep = myIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
             paths.push({ key: `sibling-${prevSibling.id}-${row.item.id}`, d: orthogonal(x1, y1, x2Dep, y2Dep), blockingId: prevSibling.id, dependentId: row.item.id, isParentChild: true })
          }
        }
      }

      for (const milestoneId of row.item.blockedByMilestoneIds) {
        const milestoneIndex = rowIndexByMilestoneId.get(milestoneId)
        const milestone = milestoneById.get(milestoneId)
        if (milestoneIndex === undefined || !milestone) continue

        const x1 = diffDays(startOfDay(new Date(milestone.date)), rangeStart) * dayWidth + dayWidth / 2
        const y1 = milestoneIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        const dependentId = `milestone-${milestoneId}`
        const x2Dep = diffDays(myRange.start, rangeStart) * dayWidth
        const y2Dep = myIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        paths.push({ key: `${dependentId}-${row.item.id}`, d: orthogonal(x1, y1, x2Dep, y2Dep), blockingId: dependentId, dependentId: row.item.id })
      }
    }

    for (const m of milestones) {
      const milestoneIndex = rowIndexByMilestoneId.get(m.id)
      if (milestoneIndex === undefined) continue
      const x2Dep = diffDays(startOfDay(new Date(m.date)), rangeStart) * dayWidth + dayWidth / 2
      const y2Dep = milestoneIndex * ROW_HEIGHT + ROW_HEIGHT / 2
      const dependentId = `milestone-${m.id}`

      if (m.parentWorkItemId) {
        const taskSiblings = itemsByParent.get(m.parentWorkItemId) || []
        const milestoneSiblings = milestonesByParent.get(m.parentWorkItemId) || []
        const siblings = [...taskSiblings, ...milestoneSiblings]
        
        const sortedSiblings = siblings.filter(s => !('type' in s) || s.type !== 'Phase').sort((a, b) => {
          const startA = ('date' in a) ? new Date(a.date).getTime() : (rangeOf(a)?.start?.getTime() || 0);
          const startB = ('date' in b) ? new Date(b.date).getTime() : (rangeOf(b)?.start?.getTime() || 0);
          return startA - startB;
        });
        
        const myIndexInSiblings = sortedSiblings.findIndex(s => s.id === m.id);
        if (myIndexInSiblings > 0) {
          const prevSibling = sortedSiblings[myIndexInSiblings - 1];
          const prevIndex = rowIndexByTaskId.get(prevSibling.id) ?? rowIndexByMilestoneId.get(prevSibling.id);
          const prevRange = ('date' in prevSibling) ? { start: startOfDay(new Date(prevSibling.date)), finish: startOfDay(new Date(prevSibling.date)) } : rangeOf(prevSibling);
          if (prevIndex !== undefined && prevRange) {
             const x1 = ('date' in prevSibling) ? diffDays(prevRange.finish, rangeStart) * dayWidth + dayWidth / 2 : (diffDays(prevRange.finish, rangeStart) + 1) * dayWidth;
             const y1 = prevIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
             paths.push({ key: `sibling-${prevSibling.id}-${dependentId}`, d: orthogonal(x1, y1, x2Dep, y2Dep), blockingId: prevSibling.id, dependentId, isParentChild: true })
          }
        }
      }

      for (const blockingId of m.blockedByWorkItemIds) {
        const blockingIndex = rowIndexByTaskId.get(blockingId)
        const blockingItem = workItemById.get(blockingId)
        if (blockingIndex === undefined || !blockingItem) continue
        const blockRange = rangeOf(blockingItem)
        if (!blockRange) continue

        const x1 = (diffDays(blockRange.finish, rangeStart) + 1) * dayWidth
        const y1 = blockingIndex * ROW_HEIGHT + ROW_HEIGHT / 2
        paths.push({ key: `${blockingId}-${dependentId}`, d: orthogonal(x1, y1, x2Dep, y2Dep), blockingId, dependentId })
      }
    }
    return paths
  }, [rows, rowIndexByTaskId, rowIndexByMilestoneId, workItemById, milestoneById, milestones, itemsByParent, milestonesByParent, rangeStart, dayWidth])

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
    if (newType === 'Task' && !newStart) return

    const target = firstTodoColumn(boards)
    if (!target?.column) {
      setError('Board hat keine Spalten - im Kanban-Tab prüfen.')
      return
    }

    const created = await createWorkItem(target.board.id, target.column.id, title, newType, 'Medium', undefined, {
      parentWorkItemId: newParentId || undefined,
      startDate: newType === 'Phase' ? undefined : new Date(newStart).toISOString(),
      dueDate: newType === 'Phase' ? undefined : newEnd ? new Date(newEnd).toISOString() : undefined,
    })
    onWorkItemsChange([...workItems, created])
    setNewTitle('')
    setNewType('Task')
    setNewParentId('')
    setNewStart('')
    setNewEnd('')
    setShowTaskForm(false)
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

  function LabelRow({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div
        className="flex items-center border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
        style={{ height: ROW_HEIGHT, ...style }}
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
          {!showTaskForm && (
            <AddButton
              onClick={() => {
                setNewParentId('')
                setShowTaskForm(true)
              }}
              label="Neue Aufgabe"
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M4 5.5h11M4 10h11M4 14.5h7" />
                </svg>
              }
            />
          )}
          {!showMilestoneForm && (
            <AddButton
              onClick={() => setShowMilestoneForm(true)}
              label="Neuer Meilenstein"
              icon={
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-2.5 w-2.5">
                  <path d="M10 3 17 10 10 17 3 10Z" />
                </svg>
              }
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div ref={filterMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterMenuOpen((o) => !o)}
              title="Filter"
              aria-label="Filter"
              className={`flex h-8 w-8 items-center justify-center rounded-full border hover:bg-slate-100 dark:hover:bg-slate-800 ${
                filtersActive
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M4 5h16l-6.5 7.5V18l-3 1.5v-7z" />
              </svg>
            </button>

            {filterMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Status</p>
                <div className="mb-3 flex flex-wrap gap-1">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFilterStatuses((prev) => toggleInSet(prev, s))}
                      className={`rounded px-2 py-1 text-xs ${
                        filterStatuses.has(s)
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Priorität</p>
                <div className="mb-3 flex flex-wrap gap-1">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFilterPriorities((prev) => toggleInSet(prev, p))}
                      className={`rounded px-2 py-1 text-xs ${
                        filterPriorities.has(p)
                          ? 'bg-indigo-600 text-white'
                          : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>

                {assigneeOptions.length > 0 && (
                  <>
                    <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Zuständige</p>
                    <div className="mb-3 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                      {assigneeOptions.map(([id, name]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFilterAssignees((prev) => toggleInSet(prev, id))}
                          className={`rounded px-2 py-1 text-xs ${
                            filterAssignees.has(id)
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                          }`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStatuses(new Set())
                      setFilterPriorities(new Set())
                      setFilterAssignees(new Set())
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Zurücksetzen
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapseAll}
            disabled={groupIds.size === 0}
            title={allCollapsed ? 'Alle ausklappen' : 'Alle einklappen'}
            aria-label={allCollapsed ? 'Alle ausklappen' : 'Alle einklappen'}
            className={`flex h-8 w-8 items-center justify-center rounded-full border hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800 ${
              allCollapsed
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400'
            }`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              {allCollapsed ? (
                <>
                  <path d="M4 8l6-5 6 5" />
                  <path d="M4 13l6 5 6-5" />
                </>
              ) : (
                <>
                  <path d="M4 7l6 5 6-5" />
                  <path d="M4 12l6-5 6 5" />
                </>
              )}
            </svg>
          </button>

          <button
            type="button"
            onClick={scrollToToday}
            disabled={todayOffset < 0 || todayOffset >= renderedDayCount}
            title="Zu heute springen"
            aria-label="Zu heute springen"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
              <circle cx="10" cy="10" r="6.5" />
              <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <div ref={rangeMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setRangeMenuOpen((o) => !o)}
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

          {rangeMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Zeitraum</p>
              <div className="mb-3 flex flex-wrap gap-1">
                {RANGE_PRESETS.map((p) => (
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
      </div>

      <section className="flex overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="shrink-0" style={{ width: LABEL_WIDTH }}>
          <div style={{ height: SCROLLBAR_ROW_HEIGHT }} />
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800" style={{ height: HEADER_HEIGHT }}>
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
          </div>

          {rows.length === 0 && (
            <LabelRow style={{ paddingLeft: 8 }}>
              <span className="text-xs text-slate-500">Noch keine Aufgaben oder Meilensteine mit Termin.</span>
            </LabelRow>
          )}

          {rows.map((row) => {
            if (row.kind === 'milestone') {
              const m = row.milestone
              return (
                <LabelRow key={row.key}>
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
                  <span style={{ width: COL_TYPE }} className="px-2 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Meilenstein
                  </span>
                  <span style={{ width: COL_STATUS }} className="px-2" />
                  <span style={{ width: COL_PRIORITY }} className="px-2" />
                </LabelRow>
              )
            }

            const { item, depth, hasChildren } = row
            return (
              <LabelRow key={row.key}>
                <span style={{ width: COL_ID }} className="truncate px-2 font-mono text-[10px] text-slate-500">
                  {item.referenceCode}
                </span>
                <span 
                  className="flex flex-1 items-center gap-1 truncate px-2 text-xs" 
                  style={{ paddingLeft: depth * 16 }}
                  onMouseEnter={() => setHoveredTaskId(item.id)}
                  onMouseLeave={() => setHoveredTaskId(null)}
                >
                  {hasChildren && (
                    <button
                      onClick={() => toggleCollapse(item.id)}
                      className="w-3 shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                    >
                      {collapsed.has(item.id) ? '▸' : '▾'}
                    </button>
                  )}
                  <span className="truncate">{item.title}</span>
                  <button
                    onClick={() => openChildForm(item.id)}
                    title="Unteraufgabe hinzufügen"
                    aria-label="Unteraufgabe hinzufügen"
                    className="shrink-0 px-0.5 text-slate-400 hover:text-indigo-500 dark:text-slate-600 dark:hover:text-indigo-400"
                  >
                    +
                  </button>
                </span>
                <span style={{ width: COL_TYPE }} className={`truncate px-2 text-[11px] ${TYPE_TEXT_COLOR[item.type]}`}>
                  {TYPE_LABELS[item.type]}
                </span>
                <span style={{ width: COL_STATUS }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[item.columnType]}`} />
                  {item.columnName}
                </span>
                <span style={{ width: COL_PRIORITY }} className="flex items-center gap-1.5 truncate px-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} />
                  {item.priority}
                </span>
              </LabelRow>
            )
          })}
        </div>

        <div ref={chartWheelRef} className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollbarRef} className="overflow-x-auto" onScroll={handleScrollbarScroll} style={{ height: SCROLLBAR_ROW_HEIGHT }}>
            <div style={{ width: chartWidth, height: 1 }} />
          </div>

          <div
            ref={monthScrollRef}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onScroll={handleMonthScroll}
          >
            <div
              className="relative border-b border-slate-100 dark:border-slate-800/60"
              style={{ width: chartWidth, height: MONTH_ROW_HEIGHT }}
            >
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500/70" style={{ left: todayOffset * dayWidth }}>
                  <div className="absolute -left-px h-2 w-2 -translate-x-1/2 rotate-45 bg-red-500" />
                </div>
              )}
              {monthGroups.map((g, i) => (
                <div
                  key={g.key}
                  className={`absolute top-0 flex h-full items-center justify-center overflow-hidden border-l border-slate-200 px-1.5 text-[10px] font-medium text-slate-600 dark:border-slate-800/60 dark:text-slate-300 ${
                    i % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'
                  }`}
                  style={{ left: g.startIndex * dayWidth, width: g.span * dayWidth }}
                >
                  <span className="truncate">{g.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={containerRef}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onScroll={handleHeaderScroll}
          >
            <div className="relative" style={{ width: chartWidth }}>
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500/70" style={{ left: todayOffset * dayWidth }} />
              )}

              <div className="flex flex-col border-b border-slate-200 dark:border-slate-800" style={{ height: WEEK_ROW_HEIGHT + DAY_ROW_HEIGHT }}>
                <div className="relative border-b border-slate-100 dark:border-slate-800/60" style={{ height: WEEK_ROW_HEIGHT }}>
                  {weekGroups.map((g, i) => (
                    <div
                      key={g.key}
                      className={`absolute top-0 flex h-full items-center justify-center overflow-hidden border-l border-slate-200/70 text-[9px] text-slate-400 dark:border-slate-800/40 dark:text-slate-500 ${
                        i % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/40' : 'bg-white dark:bg-slate-900'
                      }`}
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
          </div>

          <div
            ref={bodyScrollRef}
            onScroll={handleBodyScroll}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="relative" style={{ width: chartWidth }}>
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-red-500/70" style={{ left: todayOffset * dayWidth }} />
              )}

              <svg
                className="pointer-events-none absolute z-20 overflow-visible"
                style={{ left: 0, top: 0, width: chartWidth, height: rows.length * ROW_HEIGHT }}
              >
                <defs>
                  <marker id="arrow-normal" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-slate-500 dark:text-slate-400" />
                  </marker>
                  <marker id="arrow-hovered" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-indigo-500" />
                  </marker>
                </defs>
                {connectors.map((c) => {
                  const isHovered = hoveredTaskId === c.blockingId || hoveredTaskId === c.dependentId;
                  if (c.isParentChild) {
                    return (
                      <path 
                        key={c.key} 
                        d={c.d} 
                        stroke="currentColor"
                        strokeWidth={1.5} 
                        strokeDasharray="5 5"
                        className={`transition-all duration-300 ${isHovered ? 'text-indigo-400 drop-shadow-md' : 'text-slate-400 dark:text-slate-500 opacity-80'}`}
                        fill="none" 
                      />
                    )
                  }
                  return (
                    <path 
                      key={c.key} 
                      d={c.d} 
                      stroke="currentColor"
                      strokeWidth={isHovered ? 2.5 : 1.5} 
                      className={`transition-all duration-300 ${isHovered ? 'text-indigo-500 drop-shadow-md' : 'text-slate-500 dark:text-slate-400'}`}
                      fill="none" 
                      markerEnd={isHovered ? "url(#arrow-hovered)" : "url(#arrow-normal)"}
                    />
                  )
                })}
              </svg>

              {rows.length === 0 && <div style={{ height: ROW_HEIGHT }} />}

              {rows.map((row) => {
                if (row.kind === 'milestone') {
                  const m = row.milestone
                  const left = diffDays(startOfDay(new Date(m.date)), rangeStart) * dayWidth + dayWidth / 2
                  return (
                    <div
                      key={row.key}
                      className="relative overflow-hidden border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div
                        title={`${m.name} — ${formatDate(m.date)}`}
                        className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400"
                        style={{ left }}
                      >
                        ◆
                      </div>
                    </div>
                  )
                }

                const { item, hasChildren } = row
                const isPhase = item.type === 'Phase'
                const range = rangeOf(item)
                const barColor = isPhase ? TYPE_BAR_COLOR.Phase : hasChildren ? 'bg-slate-600' : getBarColor(item.columnName, item.columnType)
                const blocked = item.blockingWorkItemIds.length > 0

                return (
                  <div
                    key={row.key}
                    className="relative overflow-hidden border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {range && (
                      <div
                        // A Phase's bar is rolled up live from its subtasks (see phaseRange) - it
                        // isn't its own thing to drag/resize, so no pointer handlers or handles.
                        onPointerDown={isPhase ? undefined : handlePointerDown(item)}
                        onPointerMove={isPhase ? undefined : handlePointerMove}
                        onPointerUp={isPhase ? undefined : handlePointerUp(item)}
                        title={isPhase ? `${item.title} — ${formatDate(range.start.toISOString())} bis ${formatDate(range.finish.toISOString())}` : undefined}
                        className={`absolute flex items-center rounded ${barColor} ${isPhase ? '' : 'cursor-grab'} ${blocked ? 'border-l-4 border-amber-400' : ''}`}
                        style={{
                          left: diffDays(range.start, rangeStart) * dayWidth,
                          width: Math.max((diffDays(range.finish, range.start) + 1) * dayWidth - 4, dayWidth - 4),
                          top: 6,
                          height: ROW_HEIGHT - 12,
                        }}
                      >
                        {!isPhase && <div data-handle="start" className="absolute left-0 h-full w-1.5 cursor-ew-resize" />}
                        <span className="truncate px-2 text-[11px] text-white select-none">{item.title}</span>
                        {!isPhase && <div data-handle="end" className="absolute right-0 h-full w-1.5 cursor-ew-resize" />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
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
              <select value={newType} onChange={(e) => setNewType(e.target.value as WorkItemType)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                <option value="Task">{TYPE_LABELS.Task}</option>
                <option value="Phase">{TYPE_LABELS.Phase}</option>
              </select>
              <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                <option value="">Keine übergeordnete Aufgabe</option>
                {workItems.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.referenceCode} · {w.title}
                  </option>
                ))}
              </select>
              {newType === 'Task' ? (
                <>
                  <input required type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} title="Anfangsdatum" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                  <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} title="Enddatum (optional)" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900" />
                </>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">Zeitraum ergibt sich automatisch aus den Unteraufgaben</span>
              )}
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
