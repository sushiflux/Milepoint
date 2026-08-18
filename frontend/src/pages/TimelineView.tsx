import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addMilestoneDependency, createMilestone, deleteMilestone, removeMilestoneDependency, updateMilestone } from '../api/milestones'
import { getTimeline } from '../api/timeline'
import { addDependency, createWorkItem, deleteWorkItem, removeDependency, updateWorkItem } from '../api/workItems'
import type { Board, BoardColumnType, Milestone, WorkItem, WorkItemPriority, WorkItemType } from '../api/types'
import ContextMenu, { type ContextMenuEntry } from '../components/ContextMenu'
import { usePreferences } from '../context/PreferencesContext'
import { BAR_COLOR_MODE_PREFERENCE_KEY, resolveBarColorMode } from '../lib/timelinePreferences'

interface Props {
  projectId: string
  boards: Board[]
  workItems: WorkItem[]
  milestones: Milestone[]
  onWorkItemsChange: (items: WorkItem[]) => void
  onMilestonesChange: (milestones: Milestone[]) => void
}

const MIN_DAY_WIDTH = 3
const MIN_VISIBLE_DAYS = 2
// Roughly 4 months - beyond this, squeezing every remaining day into the window makes the
// day columns unreadably thin, so a wider range fits this many days to the window and the
// rest becomes horizontally scrollable instead of compressing further.
const MAX_FIT_DAYS = 1000
const ZOOM_FACTOR = 1.25
type Density = 'small' | 'medium' | 'large'
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'small', label: 'Klein' },
  { value: 'medium', label: 'Mittel' },
  { value: 'large', label: 'Groß' },
]
// "Klein" is the original, previously-fixed size (32/20) - "Mittel" and "Groß" only add extra
// breathing room on top of that, they don't shrink below what the Timeline always looked like.
const ROW_HEIGHT_BY_DENSITY: Record<Density, number> = { small: 32, medium: 42, large: 54 }
const BAR_HEIGHT_BY_DENSITY: Record<Density, number> = { small: 20, medium: 26, large: 34 }
const DEFAULT_DENSITY: Density = 'small'
const MONTH_ROW_HEIGHT = 28
const WEEK_ROW_HEIGHT = 24
const DAY_ROW_HEIGHT = 28
const HEADER_HEIGHT = MONTH_ROW_HEIGHT + WEEK_ROW_HEIGHT + DAY_ROW_HEIGHT
// Height of the scrollbar-only strip placed above the month/year row so the one visible
// horizontal scrollbar is anchored there instead of at the bottom of the day rows.
const SCROLLBAR_ROW_HEIGHT = 12
const COL_NUMBER = 56
// Wide enough for the full "TSK#00042" reference code without truncating.
const COL_ID = 88
const COL_TYPE = 76
// Compact - just wide enough for a centered dot (the name/label lives in the header + tooltip,
// not the cell) rather than the old, wider dot+text columns.
const COL_STATUS = 44
const COL_PRIORITY = 44
const LABEL_WIDTH = 488
const CONNECTOR_DOT_RADIUS = 6
// Small blank gap left between a subtask's bar and the line continuing on to the next subtask,
// so the connector doesn't look glued directly to the bar it just passed through.
const CONNECTOR_ROW_GAP = 3
// A short solid vertical lead-in after that gap, so the turn into "heading over to the next
// subtask" reads as an actual right-angle corner instead of the horizontal run just starting out
// of nowhere with no vertical stroke to bend away from.
const CONNECTOR_ELBOW_STUB = 6
// One color per Phase, cycled through when there are more phases than colors. Deliberately
// avoids yellow/blue/green/red (status) and slate/violet/orange/rose (priority) so a connector
// line is never mistaken for a status or priority indicator.
const CONNECTOR_COLOR_CLASSES = [
  'text-fuchsia-500 dark:text-fuchsia-400',
  'text-cyan-500 dark:text-cyan-400',
  'text-teal-500 dark:text-teal-400',
  'text-indigo-500 dark:text-indigo-400',
  'text-pink-500 dark:text-pink-400',
  'text-stone-500 dark:text-stone-400',
]
const DEFAULT_CONNECTOR_COLOR_CLASS = 'text-slate-400 dark:text-slate-500'

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

// Local YYYY-MM-DD for an <input type="date"> value - not toISOString (that's UTC and can land
// on the wrong day depending on the browser's timezone).
function toDateInputValue(d: Date) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Finish-to-start auto-scheduling (same as MS Project/OpenProject's automatic mode): when a task's
// finish date moves, anything it blocks that would now overlap gets pushed to start the day after,
// preserving its own duration - and that cascades transitively to whatever THAT task blocks in turn.
// A visited-set guards against cycles (which the backend doesn't otherwise prevent).
function computeCascadeShifts(rootId: string, newFinish: Date, items: WorkItem[]) {
  const byId = new Map(items.map((w) => [w.id, w]))
  const dependentsOf = new Map<string, string[]>()
  for (const w of items) {
    for (const blockingId of w.blockingWorkItemIds) {
      const list = dependentsOf.get(blockingId) ?? []
      list.push(w.id)
      dependentsOf.set(blockingId, list)
    }
  }

  const shifts = new Map<string, { start: Date; finish: Date }>()
  const finishOf = new Map<string, Date>([[rootId, newFinish]])
  const visited = new Set([rootId])
  const queue = [rootId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentFinish = finishOf.get(currentId)!
    const earliestAllowedStart = addDays(startOfDay(currentFinish), 1)

    for (const depId of dependentsOf.get(currentId) ?? []) {
      if (visited.has(depId)) continue
      const dep = byId.get(depId)
      if (!dep?.startDate || !dep.dueDate) continue

      const depStart = startOfDay(new Date(dep.startDate))
      const depFinish = startOfDay(new Date(dep.dueDate))
      if (depStart >= earliestAllowedStart) continue

      const shiftDays = diffDays(earliestAllowedStart, depStart)
      const newStart = addDays(depStart, shiftDays)
      const newDepFinish = addDays(depFinish, shiftDays)
      shifts.set(depId, { start: newStart, finish: newDepFinish })
      finishOf.set(depId, newDepFinish)
      visited.add(depId)
      queue.push(depId)
    }
  }

  return shifts
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
  Todo: 'bg-yellow-500',
  InProgress: 'bg-blue-500',
  Done: 'bg-green-500',
}

// Kept clear of the status colors above (yellow/blue/green/red) so a priority dot is never
// mistaken for a status one when both show up next to each other.
const PRIORITY_DOT: Record<WorkItemPriority, string> = {
  Low: 'bg-slate-500',
  Medium: 'bg-violet-500',
  High: 'bg-orange-500',
  Urgent: 'bg-rose-600',
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
  Todo: 'bg-gradient-to-b from-yellow-400 to-yellow-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-yellow-700/50',
  InProgress: 'bg-gradient-to-b from-blue-400 to-blue-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-blue-700/50',
  Done: 'bg-gradient-to-b from-green-400 to-green-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-green-700/50',
}

const KNOWN_BAR_COLORS: Record<string, string> = {
  'pausiert': 'bg-gradient-to-b from-red-400 to-red-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-red-700/50',
  'blockiert': 'bg-gradient-to-b from-red-400 to-red-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-red-700/50',
  'review': 'bg-gradient-to-b from-purple-400 to-purple-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-purple-700/50',
  'neu': 'bg-gradient-to-b from-yellow-400 to-yellow-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-yellow-700/50',
}

function getBarColor(columnName: string, columnType: BoardColumnType) {
  const lowerName = columnName.toLowerCase();
  for (const [key, color] of Object.entries(KNOWN_BAR_COLORS)) {
    if (lowerName.includes(key)) return color;
  }
  return STATUS_BAR_COLOR[columnType] || STATUS_BAR_COLOR.Todo;
}

// Same gradient bar style as STATUS_BAR_COLOR, keyed by priority instead - used when the "Nach
// Priorität" bar color mode is active. Colors match PRIORITY_DOT so the bar and its dot agree.
const PRIORITY_BAR_COLOR: Record<WorkItemPriority, string> = {
  Low: 'bg-gradient-to-b from-slate-400 to-slate-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-slate-700/50',
  Medium: 'bg-gradient-to-b from-violet-400 to-violet-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-violet-700/50',
  High: 'bg-gradient-to-b from-orange-400 to-orange-500 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-orange-700/50',
  Urgent: 'bg-gradient-to-b from-rose-500 to-rose-600 shadow-[inset_0_1px_rgba(255,255,255,0.3)] ring-1 ring-rose-700/50',
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
  // WBS-style outline number derived purely from tree position/order (1, 1.1, 1.2, 1.1.1, ...) -
  // not persisted, recomputed every render from the same sibling order the rows are drawn in.
  number: string
}

interface MilestoneRow {
  kind: 'milestone'
  key: string
  depth: number
  milestone: Milestone
}

type Row = TaskRow | MilestoneRow

export default function TimelineView({ projectId, boards, workItems, milestones, onWorkItemsChange, onMilestonesChange }: Props) {
  const { getPreference, setPreference } = usePreferences()
  const storedDensity = getPreference('timelineDensity', DEFAULT_DENSITY)
  const density: Density = storedDensity === 'medium' || storedDensity === 'large' ? storedDensity : DEFAULT_DENSITY
  const rowHeight = ROW_HEIGHT_BY_DENSITY[density]
  const barHeight = BAR_HEIGHT_BY_DENSITY[density]
  // Configured in Settings ("Einstellungen" in the user menu), not here - Timeline only reads it.
  const barColorMode = resolveBarColorMode(getPreference(BAR_COLOR_MODE_PREFERENCE_KEY, ''))

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newType, setNewType] = useState<WorkItemType>('Task')
  const [newPriority, setNewPriority] = useState<WorkItemPriority>('Medium')
  const [newParentId, setNewParentId] = useState('')
  // True when the parent was already implied by how the dialog was opened (e.g. the "+" on a
  // specific phase) - the dropdown is redundant/confusing there, so it's hidden in favor of a
  // plain confirmation line. Only the generic "Aufgabe anlegen" toolbar button (no such context)
  // leaves it false and shows the picker.
  const [parentLocked, setParentLocked] = useState(false)
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [milestoneName, setMilestoneName] = useState('')
  const [milestoneDate, setMilestoneDate] = useState('')
  const [milestoneParentId, setMilestoneParentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showMilestoneForm, setShowMilestoneForm] = useState(false)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [depMenuRow, setDepMenuRow] = useState<string | null>(null)
  const [depMenuSelection, setDepMenuSelection] = useState('')
  const depMenuRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<
    | { kind: 'empty'; date: Date | null; endDate?: Date; x: number; y: number }
    | { kind: 'phase' | 'task'; row: TaskRow; x: number; y: number }
    | { kind: 'milestone'; milestone: Milestone; x: number; y: number }
    | null
  >(null)
  // Set right before opening the create form from a task's context menu ("...als Abhängigkeit")
  // - once that form successfully creates its item, this links the new item as blocked by the
  // task instead of the usual "add as subtask"/"add as top-level" behavior.
  const [pendingBlockerLink, setPendingBlockerLink] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ kind: 'workItem'; item: WorkItem } | { kind: 'milestone'; milestone: Milestone } | null>(null)
  const [editName, setEditName] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editPriority, setEditPriority] = useState<WorkItemPriority>('Medium')
  const [editDate, setEditDate] = useState('')
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
    if (!rangeMenuOpen && !filterMenuOpen && !depMenuRow) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (rangeMenuRef.current && !rangeMenuRef.current.contains(target)) setRangeMenuOpen(false)
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) setFilterMenuOpen(false)
      if (depMenuRef.current && !depMenuRef.current.contains(target)) setDepMenuRow(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [rangeMenuOpen, filterMenuOpen, depMenuRow])

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

  // Candidates for "übergeordnete Aufgabe"/"übergeordnetes Element" pickers: items that are
  // actually shown in the Timeline (a Kanban-only card with no dates never gets a row here, so
  // picking it as a parent would be picking something invisible) and, for Tasks, not already
  // Done - a long-finished task isn't a meaningful thing to nest new work under. Phases are
  // exempt from the Done check since their own column status isn't a meaningful completion
  // signal (their bar/progress is rolled up from children, not moved between columns directly).
  const eligibleParentItems = useMemo(
    () =>
      workItems.filter(
        (w) => (w.type === 'Phase' || w.startDate || w.dueDate) && (w.type === 'Phase' || w.columnType !== 'Done'),
      ),
    [workItems],
  )

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

  const [searchQuery, setSearchQuery] = useState('')

  const filtersActive = filterStatuses.size > 0 || filterPriorities.size > 0 || filterAssignees.size > 0 || searchQuery.trim().length > 0

  function matchesFilters(item: WorkItem) {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const titleMatch = item.title.toLowerCase().includes(q)
      const codeMatch = item.referenceCode.toLowerCase().includes(q)
      if (!titleMatch && !codeMatch) return false
    }
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

  const renderedDayCount = Math.max(dayCount, visibleDayCount ?? dayCount)
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
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])
  
  const chartWidth = renderedDayCount * dayWidth
  const todayOffset = diffDays(startOfDay(now), rangeStart)
  const todayFraction = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400
  const exactTodayOffset = todayOffset + todayFraction

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

  // A subtask may never start before its parent is done - the parent's due date (falling back
  // to its start date if it has no due date, and to nothing if it has neither) is the earliest
  // allowed start for anything nested under it.
  function minStartForParent(parentId: string): string {
    const parent = workItems.find((w) => w.id === parentId)
    const bound = parent?.dueDate ?? parent?.startDate
    // Strictly the day after the parent finishes, not the same day - a subtask starts once its
    // parent is actually done, not still on its last day.
    return bound ? toDateInputValue(addDays(new Date(bound), 1)) : ''
  }

  function openChildForm(parentId: string) {
    setNewType('Task')
    setNewParentId(parentId)
    setParentLocked(true)
    setNewStart(minStartForParent(parentId))
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

  // Phases have no dates of their own - sort by their rolled-up range (rangeOf), and put ones
  // with no dated descendants yet (nothing to roll up) last instead of defaulting to epoch 0.
  function rowSortKey(r: Row) {
    if (r.kind === 'milestone') return new Date(r.milestone.date).getTime()
    const range = rangeOf(r.item)
    return range ? range.start.getTime() : Number.POSITIVE_INFINITY
  }

  // Builds the row tree for one level (top-level for parentId=null, or one item's subtree) -
  // task/phase children and milestone children of the same parent are interleaved by date, and
  // each task/phase child's own subtree (which may itself mix tasks and milestones) follows
  // immediately after it, recursively. This is how a milestone ends up nested inside its phase
  // instead of always sitting flat at the top level.
  function buildRows(parentId: string | null, depth: number, numberPrefix: string): Row[] {
    const taskChildren = (itemsByParent.get(parentId) ?? []).filter((w) => w.type === 'Phase' || w.startDate || w.dueDate)
    const milestoneChildren = milestonesByParent.get(parentId) ?? []

    const taskRowsHere: TaskRow[] = taskChildren.map((item) => ({
      kind: 'task',
      key: item.id,
      depth,
      item,
      hasChildren: (itemsByParent.get(item.id)?.length ?? 0) > 0 || (milestonesByParent.get(item.id)?.length ?? 0) > 0,
      number: '',
    }))
    const milestoneRowsHere: MilestoneRow[] = milestoneChildren.map((m) => ({ kind: 'milestone', key: `m-${m.id}`, depth, milestone: m }))

    const sorted = [...taskRowsHere, ...milestoneRowsHere].sort((a, b) => rowSortKey(a) - rowSortKey(b))

    // Only task/phase rows consume a number slot - a milestone interleaved between them doesn't
    // shift the count, so siblings stay 1.1, 1.2, 1.3 regardless of milestones in between.
    let taskCounter = 0
    return sorted.flatMap((row) => {
      if (row.kind === 'milestone') return [row]
      taskCounter += 1
      const number = numberPrefix ? `${numberPrefix}.${taskCounter}` : `${taskCounter}`
      const numberedRow: TaskRow = { ...row, number }
      const nested = collapsed.has(row.item.id) ? [] : buildRows(row.item.id, depth + 1, number)
      return [numberedRow, ...nested]
    })
  }

  const rows: Row[] = useMemo(() => {
    return buildRows(null, 0, '').filter((r) => r.kind === 'milestone' || matchesFilters(r.item))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workItems, milestones, collapsed, filterStatuses, filterPriorities, filterAssignees, searchQuery])

  // Only needed for the parent/child connector lines below - maps a Task/Phase's id to its
  // current row index so a connector can be positioned without re-scanning rows for every parent.
  const rowIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r, i) => {
      if (r.kind === 'task') map.set(r.item.id, i)
    })
    return map
  }, [rows])

  // How many days the currently-dragged item's own finish date has moved so far, live - 0 while
  // idle, while a resize-start is in progress (it doesn't touch the finish date), or for anything
  // outside the drag's own subtree. Recurses up the parent chain so a grandchild inherits the
  // same live delta its parent would get from the drag.
  function liveFinishDelta(item: WorkItem): number {
    if (!drag) return 0
    if (item.id === drag.itemId) {
      if (drag.mode === 'resize-start' || !item.startDate || !item.dueDate) return 0
      const base = startOfDay(new Date(item.startDate))
      const end = startOfDay(new Date(item.dueDate))
      let finish = addDays(end, drag.deltaDays)
      if (finish < base) finish = base
      return diffDays(finish, end)
    }
    if (!item.parentWorkItemId) return 0
    const parent = workItemById.get(item.parentWorkItemId)
    return parent ? liveFinishDelta(parent) : 0
  }

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

      // Invisible wall: a subtask can't be dragged (moved or start-resized) to begin before its
      // parent has finished - the same +1-day rule minStartForParent enforces at creation time,
      // just applied live while dragging instead of only checked afterward.
      if (item.parentWorkItemId && drag.mode !== 'resize-end') {
        const parent = workItemById.get(item.parentWorkItemId)
        const parentRange = parent ? effectiveRange(parent) : null
        const minStart = parentRange ? addDays(parentRange.finish, 1) : null
        if (minStart && start < minStart) {
          if (drag.mode === 'move') {
            const shiftDays = diffDays(minStart, start)
            start = addDays(start, shiftDays)
            finish = addDays(finish, shiftDays)
          } else {
            start = minStart
            if (start > finish) finish = start
          }
        }
      }
    } else if (drag && item.parentWorkItemId) {
      // Live preview for subtasks while a parent is being dragged - keeps the same day-gap they
      // already have, moving with the parent's bar in real time instead of only jumping into
      // place after the drop (see commitDateChange for the equivalent post-drop persistence).
      const delta = liveFinishDelta(item)
      if (delta !== 0) {
        start = addDays(base, delta)
        finish = addDays(end, delta)
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

  // Every Phase gets its own connector color (cycling through the palette for more phases than
  // colors), assigned in top-to-bottom row order so it lines up with the "Phase 1, Phase 2, ..."
  // numbering the user sees in the # column.
  const phaseColorClassById = useMemo(() => {
    const map = new Map<string, string>()
    let idx = 0
    for (const row of rows) {
      if (row.kind === 'task' && row.item.type === 'Phase') {
        map.set(row.item.id, CONNECTOR_COLOR_CLASSES[idx % CONNECTOR_COLOR_CLASSES.length])
        idx++
      }
    }
    return map
  }, [rows])

  function ancestorPhaseId(item: WorkItem): string | null {
    let current: WorkItem | undefined = item
    while (current?.parentWorkItemId) {
      const parent = workItemById.get(current.parentWorkItemId)
      if (!parent) return null
      if (parent.type === 'Phase') return parent.id
      current = parent
    }
    return null
  }

  // One connector per Task that has Task children: a single polyline from the parent bar's
  // top-right corner (its end date) down through a small "half dot" marker on each child's bar
  // in row order, ending at the last child - not the parent's own bar's left edge (a Phase's
  // rolled-up range isn't a real bar to connect from, hence Task-only parents). All connectors
  // whose parent task lives under the same Phase share that Phase's color.
  const parentChildConnectors = useMemo(() => {
    const barTopOffset = (rowHeight - barHeight) / 2
    const dotOffset = 14
    const result: {
      key: string
      colorClass: string
      segments: { key: string; d: string; dashed: boolean }[]
      dots: { key: string; cx: number; cy: number }[]
    }[] = []

    for (const row of rows) {
      if (row.kind !== 'task' || row.item.type !== 'Task') continue

      const parentIndex = rowIndexByTaskId.get(row.item.id)
      if (parentIndex === undefined) continue
      const parentRange = effectiveRange(row.item)
      if (!parentRange) continue

      const phaseId = ancestorPhaseId(row.item)
      const colorClass = (phaseId && phaseColorClassById.get(phaseId)) || DEFAULT_CONNECTOR_COLOR_CLASS

      const children = (itemsByParent.get(row.item.id) ?? [])
        .filter((w) => w.type === 'Task')
        .map((w) => ({ item: w, rowIndex: rowIndexByTaskId.get(w.id) }))
        .filter((c): c is { item: WorkItem; rowIndex: number } => c.rowIndex !== undefined)
        .sort((a, b) => a.rowIndex - b.rowIndex)

      if (children.length === 0) continue

      const parentRight = (diffDays(parentRange.finish, rangeStart) + 1) * dayWidth - 1
      // Vertically centered on the bar (bar spans barTopOffset..barTopOffset+barHeight), not the top edge.
      const parentTopY = parentIndex * rowHeight + barTopOffset + barHeight / 2

      const points = children
        .map(({ item: child, rowIndex }) => {
          const childRange = effectiveRange(child)
          if (!childRange) return null
          const dotX = diffDays(childRange.start, rangeStart) * dayWidth + 1 + dotOffset
          const dotY = rowIndex * rowHeight + barTopOffset
          return { key: child.id, dotX, dotY }
        })
        .filter((p): p is { key: string; dotX: number; dotY: number } => p !== null)

      const segments: { key: string; d: string; dashed: boolean }[] = []
      const dots: { key: string; cx: number; cy: number }[] = []
      let cursorX = parentRight
      let cursorY = parentTopY
      let segIdx = 0

      points.forEach((p, idx) => {
        // Right-angled instead of a direct diagonal, with the kink kept late: run horizontal
        // first, at whatever height the line is already at, all the way over to the child's own
        // column, and only then drop straight down into the dot - so the bend sits right next to
        // the subtask, not right after leaving the parent. From the second subtask onward, this
        // leg starts right after the gap below the previous one's bar - add a short vertical
        // lead-in first so that turn reads as an actual right-angle corner, not a horizontal run
        // that just starts out of nowhere.
        const elbowY = idx > 0 ? cursorY + CONNECTOR_ELBOW_STUB : cursorY
        const d =
          idx > 0
            ? `M ${cursorX} ${cursorY} L ${cursorX} ${elbowY} L ${p.dotX} ${elbowY} L ${p.dotX} ${p.dotY}`
            : `M ${cursorX} ${cursorY} L ${p.dotX} ${cursorY} L ${p.dotX} ${p.dotY}`
        segments.push({ key: `s${segIdx++}`, d, dashed: false })
        dots.push({ key: p.key, cx: p.dotX, cy: p.dotY })
        cursorX = p.dotX
        cursorY = p.dotY

        if (idx < points.length - 1) {
          // Before heading to the next subtask, the line always runs on through the rest of THIS
          // subtask's own bar first - dashed, since it's crossing a bar rather than connecting to
          // it at that point (the connection is the dot up at the top edge, already placed above).
          const barBottom = p.dotY + barHeight
          segments.push({ key: `s${segIdx++}`, d: `M ${p.dotX} ${p.dotY} L ${p.dotX} ${barBottom}`, dashed: true })
          // Leave a small blank gap here rather than continuing the path all the way to
          // barBottom, so the line clearly detaches from this bar before moving to the next one.
          cursorY = barBottom + CONNECTOR_ROW_GAP
        }
      })

      if (dots.length > 0) {
        result.push({ key: `pc-${row.item.id}`, colorClass, segments, dots })
      }
    }

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowIndexByTaskId, itemsByParent, workItemById, phaseColorClassById, rangeStart, dayWidth, drag, rowHeight, barHeight])

  async function commitDateChange(item: WorkItem, start: Date, finish: Date) {
    const shifts = computeCascadeShifts(item.id, finish, workItems)

    // Subtasks keep whatever day-gap they currently have after their parent's end date - not
    // just a 1-day minimum - in both directions: stretching the parent pushes them out by the
    // same number of days, shortening it pulls them back in by the same amount. The whole
    // subtree moves together since a shifted child's own finish date moves by the same delta,
    // which then carries on to its own children on the next level down.
    const previousFinish = item.dueDate ? startOfDay(new Date(item.dueDate)) : null
    const deltaFinish = previousFinish ? diffDays(finish, previousFinish) : 0
    if (deltaFinish !== 0) {
      const stack = [item.id]
      while (stack.length > 0) {
        const parentId = stack.pop()!
        for (const child of itemsByParent.get(parentId) ?? []) {
          if (child.type !== 'Task' || !child.startDate || !child.dueDate || shifts.has(child.id)) continue
          const childStart = startOfDay(new Date(child.startDate))
          const childFinish = startOfDay(new Date(child.dueDate))
          shifts.set(child.id, { start: addDays(childStart, deltaFinish), finish: addDays(childFinish, deltaFinish) })
          stack.push(child.id)
        }
      }
    }

    const updated = await updateWorkItem(item.boardId, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      category: item.category,
      assigneeId: item.assigneeId,
      parentWorkItemId: item.parentWorkItemId,
      startDate: start.toISOString(),
      dueDate: finish.toISOString(),
    })

    const cascaded = await Promise.all(
      [...shifts.entries()].map(([id, range]) => {
        const dep = workItemById.get(id)!
        return updateWorkItem(dep.boardId, dep.id, {
          title: dep.title,
          description: dep.description,
          type: dep.type,
          priority: dep.priority,
          category: dep.category,
          assigneeId: dep.assigneeId,
          parentWorkItemId: dep.parentWorkItemId,
          startDate: range.start.toISOString(),
          dueDate: range.finish.toISOString(),
        })
      }),
    )

    const updatedById = new Map([updated, ...cascaded].map((w) => [w.id, w]))
    onWorkItemsChange(workItems.map((w) => updatedById.get(w.id) ?? w))
  }

  function handlePointerDown(item: WorkItem) {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      // Only the primary (left) button starts a drag - otherwise a right-click on the bar
      // captures the pointer, which suppresses the native contextmenu event that would
      // normally follow and open the task's context menu.
      if (event.button !== 0) return
      // Clicking the visible white grab-indicator line (a child of the actual handle div) landed
      // on an element with no data-handle of its own, so it silently fell back to "move" even
      // when the user was clearly grabbing the start/end handle - closest() finds the handle
      // regardless of which nested element the click actually hit.
      const target = event.target as HTMLElement
      const handleEl = target.closest<HTMLElement>('[data-handle]')
      const mode: DragMode = handleEl?.dataset.handle === 'start' ? 'resize-start' : handleEl?.dataset.handle === 'end' ? 'resize-end' : 'move'
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

    if (newType === 'Task' && newParentId) {
      const min = minStartForParent(newParentId)
      if (min && newStart < min) {
        setError('Das Startdatum einer Unteraufgabe darf nicht vor dem Fälligkeitsdatum der übergeordneten Aufgabe liegen.')
        return
      }
    }

    if (newType === 'Task' && newEnd && newEnd < newStart) {
      setError('Das Enddatum darf nicht vor dem Startdatum liegen.')
      return
    }

    // A Phase has no dates of its own - its bar is rolled up live from its subtasks (see phaseRange).
    const created = await createWorkItem(target.board.id, target.column.id, title, newType, newPriority, newDescription.trim() || undefined, {
      parentWorkItemId: newParentId || undefined,
      startDate: newType === 'Phase' ? undefined : new Date(newStart).toISOString(),
      dueDate: newType === 'Phase' ? undefined : newEnd ? new Date(newEnd).toISOString() : undefined,
    })

    if (pendingBlockerLink) {
      // Quick-created from a task's context menu ("...als Abhängigkeit") - a standalone item
      // blocked by that task, not a subtask, so refetch rather than just appending `created`.
      await addDependency(created.boardId, created.id, pendingBlockerLink)
      setPendingBlockerLink(null)
      await refreshTimelineData()
    } else {
      onWorkItemsChange([...workItems, created])
    }

    setNewTitle('')
    setNewDescription('')
    setNewType('Task')
    setNewPriority('Medium')
    setNewParentId('')
    setParentLocked(false)
    setNewStart('')
    setNewEnd('')
    setShowTaskForm(false)
  }

  async function handleCreateMilestone(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!milestoneName.trim() || !milestoneDate) return

    const created = await createMilestone(projectId, milestoneName.trim(), new Date(milestoneDate).toISOString(), undefined, milestoneParentId || null)

    if (pendingBlockerLink) {
      await addMilestoneDependency(projectId, created.id, pendingBlockerLink, 'WorkItemBlocksMilestone')
      setPendingBlockerLink(null)
      await refreshTimelineData()
    } else {
      onMilestonesChange([...milestones, created])
    }

    setMilestoneName('')
    setMilestoneDate('')
    setMilestoneParentId('')
    setShowMilestoneForm(false)
  }

  async function handleDeleteMilestone(milestone: Milestone) {
    if (!window.confirm(`Meilenstein "${milestone.name}" wirklich löschen?`)) return
    await deleteMilestone(projectId, milestone.id)
    onMilestonesChange(milestones.filter((m) => m.id !== milestone.id))
  }

  async function handleDeleteWorkItem(row: TaskRow) {
    const message = row.hasChildren
      ? `"${row.item.title}" wirklich löschen? Alle Unteraufgaben und zugehörigen Meilensteine werden mit gelöscht.`
      : `"${row.item.title}" wirklich löschen?`
    if (!window.confirm(message)) return
    await deleteWorkItem(row.item.boardId, row.item.id)
    await refreshTimelineData()
  }

  // Dependency/delete calls don't return the full updated picture themselves (204 No Content, or
  // a cascading delete whose exact scope is computed server-side) - simplest to just refetch both
  // lists from the one source of truth after any change that could touch either of them.
  async function refreshTimelineData() {
    const timeline = await getTimeline(projectId)
    onWorkItemsChange(timeline.workItems)
    onMilestonesChange(timeline.milestones)
  }

  function toggleDepMenu(rowKey: string) {
    setDepMenuRow((prev) => (prev === rowKey ? null : rowKey))
    setDepMenuSelection('')
  }

  // What currently blocks this row, resolved to a display label - a task row can be blocked by
  // other tasks/phases and by milestones; a milestone row can only be blocked by tasks/phases.
  function currentBlockers(row: Row): { kind: 'task' | 'milestone'; id: string; label: string }[] {
    if (row.kind === 'milestone') {
      return row.milestone.blockedByWorkItemIds
        .map((id) => workItemById.get(id))
        .filter((w): w is WorkItem => Boolean(w))
        .map((w) => ({ kind: 'task', id: w.id, label: `${w.referenceCode} · ${w.title}` }))
    }
    const taskBlockers = row.item.blockingWorkItemIds
      .map((id) => workItemById.get(id))
      .filter((w): w is WorkItem => Boolean(w))
      .map((w) => ({ kind: 'task' as const, id: w.id, label: `${w.referenceCode} · ${w.title}` }))
    const milestoneBlockers = row.item.blockedByMilestoneIds
      .map((id) => milestoneById.get(id))
      .filter((m): m is Milestone => Boolean(m))
      .map((m) => ({ kind: 'milestone' as const, id: m.id, label: `◆ ${m.name}` }))
    return [...taskBlockers, ...milestoneBlockers]
  }

  // What can still be added as a blocker - excludes itself and anything already linked.
  function blockerOptions(row: Row): { value: string; label: string }[] {
    if (row.kind === 'milestone') {
      const linked = new Set(row.milestone.blockedByWorkItemIds)
      return workItems.filter((w) => !linked.has(w.id)).map((w) => ({ value: `task:${w.id}`, label: `${w.referenceCode} · ${w.title}` }))
    }
    const linkedTasks = new Set(row.item.blockingWorkItemIds)
    const linkedMilestones = new Set(row.item.blockedByMilestoneIds)
    const taskOptions = workItems
      .filter((w) => w.id !== row.item.id && !linkedTasks.has(w.id))
      .map((w) => ({ value: `task:${w.id}`, label: `${w.referenceCode} · ${w.title}` }))
    const milestoneOptions = milestones
      .filter((m) => !linkedMilestones.has(m.id))
      .map((m) => ({ value: `milestone:${m.id}`, label: `◆ ${m.name} (${formatDate(m.date)})` }))
    return [...taskOptions, ...milestoneOptions]
  }

  async function handleAddBlocker(row: Row) {
    if (!depMenuSelection) return
    const [kind, id] = depMenuSelection.split(':')
    if (row.kind === 'milestone') {
      await addMilestoneDependency(projectId, row.milestone.id, id, 'WorkItemBlocksMilestone')
    } else if (kind === 'task') {
      await addDependency(row.item.boardId, row.item.id, id)
    } else {
      await addMilestoneDependency(projectId, id, row.item.id, 'MilestoneBlocksWorkItem')
    }
    setDepMenuSelection('')
    await refreshTimelineData()
  }

  async function handleRemoveBlocker(row: Row, blocker: { kind: 'task' | 'milestone'; id: string }) {
    if (row.kind === 'milestone') {
      await removeMilestoneDependency(projectId, row.milestone.id, blocker.id)
    } else if (blocker.kind === 'task') {
      await removeDependency(row.item.boardId, row.item.id, blocker.id)
    } else {
      await removeMilestoneDependency(projectId, blocker.id, row.item.id)
    }
    await refreshTimelineData()
  }

  function openEmptyContextMenu(event: React.MouseEvent, date: Date | null, endDate?: Date) {
    event.preventDefault()
    setContextMenu({ kind: 'empty', date, endDate, x: event.clientX, y: event.clientY })
  }

  // Used in the chart body (where the bars are) for a right-click that lands on empty space
  // within a day's column rather than on an existing bar - resolves to that specific day.
  function openEmptyContextMenuAtClick(event: React.MouseEvent) {
    const rect = event.currentTarget.getBoundingClientRect()
    const dayIndex = Math.max(0, Math.floor((event.clientX - rect.left) / dayWidth))
    openEmptyContextMenu(event, addDays(rangeStart, dayIndex))
  }

  // Week/month header cells span several days - "Aufgabe hinzufügen" from one of these should
  // pre-fill the task's whole start-to-end range from that week/month, not just a single day.
  function openEmptyContextMenuForGroup(event: React.MouseEvent, group: HeaderGroup) {
    const start = addDays(rangeStart, group.startIndex)
    const end = addDays(rangeStart, group.startIndex + group.span - 1)
    openEmptyContextMenu(event, start, end)
  }

  // Capture phase runs before any of the more specific onContextMenu handlers below get a
  // chance - if text is selected anywhere on the page, stopping propagation here means none of
  // them fire, so the browser's native menu (with Copy) shows instead, no matter which element
  // was right-clicked.
  function handlePageContextMenuCapture(event: React.MouseEvent) {
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      event.stopPropagation()
    }
  }

  // Bubble-phase fallback: fires only for right-clicks that no specific row/day/milestone
  // handler already claimed (those call preventDefault, which this checks for), so "right-click
  // anywhere" still offers the create menu instead of falling through to the native one.
  function handlePageContextMenu(event: React.MouseEvent) {
    if (event.defaultPrevented) return

    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, button, a')) return

    // Below the chart there's no visible date axis to click "on", so unlike the day-header/
    // chart-body cases (which pass the actual clicked day), no start date should be implied here.
    openEmptyContextMenu(event, null)
  }

  function openRowContextMenu(event: React.MouseEvent, row: TaskRow) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ kind: row.item.type === 'Phase' ? 'phase' : 'task', row, x: event.clientX, y: event.clientY })
  }

  function contextMenuItems(): ContextMenuEntry[] {
    if (!contextMenu) return []

    if (contextMenu.kind === 'milestone') {
      const m = contextMenu.milestone
      return [
        { label: 'Bearbeiten', onClick: () => openEditMilestone(m) },
        'divider',
        { label: 'Meilenstein löschen', onClick: () => handleDeleteMilestone(m), danger: true },
      ]
    }

    if (contextMenu.kind === 'empty') {
      const date = contextMenu.date
      const endDate = contextMenu.endDate
      return [
        {
          label: 'Phase hinzufügen',
          onClick: () => {
            setNewType('Phase')
            setNewParentId('')
            setParentLocked(false)
            setPendingBlockerLink(null)
            setShowTaskForm(true)
          },
        },
        {
          label: 'Aufgabe hinzufügen',
          onClick: () => {
            setNewType('Task')
            setNewParentId('')
            setParentLocked(false)
            setNewStart(date ? toDateInputValue(date) : '')
            setNewEnd(endDate ? toDateInputValue(endDate) : '')
            setPendingBlockerLink(null)
            setShowTaskForm(true)
          },
        },
        {
          label: 'Meilenstein hinzufügen',
          onClick: () => {
            setMilestoneParentId('')
            setMilestoneDate(date ? toDateInputValue(date) : '')
            setPendingBlockerLink(null)
            setShowMilestoneForm(true)
          },
        },
      ]
    }

    const { item } = contextMenu.row

    if (contextMenu.kind === 'phase') {
      return [
        { label: 'Aufgabe hinzufügen', onClick: () => openChildForm(item.id) },
        'divider',
        { label: 'Bearbeiten', onClick: () => openEditWorkItem(item) },
        { label: 'Phase löschen', onClick: () => handleDeleteWorkItem(contextMenu.row), danger: true },
      ]
    }

    return [
      {
        label: 'Unteraufgabe erstellen',
        onClick: () => {
          setNewType('Task')
          setNewParentId('')
          setParentLocked(false)
          setPendingBlockerLink(item.id)
          setShowTaskForm(true)
        },
      },
      {
        label: 'Meilenstein hinzufügen',
        onClick: () => {
          setMilestoneParentId('')
          setPendingBlockerLink(item.id)
          setShowMilestoneForm(true)
        },
      },
      'divider',
      { label: 'Bearbeiten', onClick: () => openEditWorkItem(item) },
      { label: 'Aufgabe löschen', onClick: () => handleDeleteWorkItem(contextMenu.row), danger: true },
    ]
  }

  function openEditWorkItem(item: WorkItem) {
    setEditTarget({ kind: 'workItem', item })
    setEditName(item.title)
    setEditStart(item.startDate ? toDateInputValue(new Date(item.startDate)) : '')
    setEditEnd(item.dueDate ? toDateInputValue(new Date(item.dueDate)) : '')
    setEditPriority(item.priority)
  }

  function openEditMilestone(milestone: Milestone) {
    setEditTarget({ kind: 'milestone', milestone })
    setEditName(milestone.name)
    setEditDate(toDateInputValue(new Date(milestone.date)))
  }

  function closeEdit() {
    setEditTarget(null)
  }

  async function handleSubmitEdit(event: FormEvent) {
    event.preventDefault()
    if (!editTarget) return
    const name = editName.trim()
    if (!name) return

    if (editTarget.kind === 'milestone') {
      if (!editDate) return
      const updated = await updateMilestone(
        projectId,
        editTarget.milestone.id,
        name,
        new Date(editDate).toISOString(),
        editTarget.milestone.description ?? undefined,
        editTarget.milestone.parentWorkItemId,
      )
      onMilestonesChange(milestones.map((m) => (m.id === updated.id ? updated : m)))
    } else {
      const item = editTarget.item
      if (item.type === 'Task' && !editStart) return
      const updated = await updateWorkItem(item.boardId, item.id, {
        title: name,
        description: item.description,
        type: item.type,
        priority: editPriority,
        category: item.category,
        assigneeId: item.assigneeId,
        parentWorkItemId: item.parentWorkItemId,
        startDate: item.type === 'Phase' ? null : new Date(editStart).toISOString(),
        dueDate: item.type === 'Phase' ? null : editEnd ? new Date(editEnd).toISOString() : null,
      })
      onWorkItemsChange(workItems.map((w) => (w.id === updated.id ? updated : w)))
    }

    closeEdit()
  }

  function LabelRow({
    children,
    style,
    onContextMenu,
  }: {
    children: React.ReactNode
    style?: React.CSSProperties
    onContextMenu?: (event: React.MouseEvent) => void
  }) {
    return (
      <div
        onContextMenu={onContextMenu}
        className="flex items-center border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
        style={{ height: rowHeight, ...style }}
      >
        {children}
      </div>
    )
  }

  function DependencyButton({ row }: { row: Row }) {
    const open = depMenuRow === row.key
    const blockers = currentBlockers(row)
    const options = blockerOptions(row)
    return (
      <div ref={open ? depMenuRef : undefined} className="relative inline-flex shrink-0">
        <button
          onClick={() => toggleDepMenu(row.key)}
          title="Abhängigkeiten"
          aria-label="Abhängigkeiten"
          className={`flex h-3 w-3 items-center justify-center ${
            blockers.length > 0
              ? 'text-amber-500 dark:text-amber-400'
              : 'text-slate-400 hover:text-indigo-500 dark:text-slate-600 dark:hover:text-indigo-400'
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M7.5 9.5 5.6 11.4a2.2 2.2 0 1 0 3.1 3.1L10.6 12.6M12.5 10.5l1.9-1.9a2.2 2.2 0 1 0-3.1-3.1L9.4 7.4" />
          </svg>
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-1.5 text-[10px] font-medium uppercase text-slate-500">Blockiert durch</p>
            {blockers.length === 0 && <p className="mb-2 text-xs text-slate-500">Keine Abhängigkeiten</p>}
            {blockers.length > 0 && (
              <ul className="mb-2 space-y-1">
                {blockers.map((b) => (
                  <li key={`${b.kind}-${b.id}`} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{b.label}</span>
                    <button
                      onClick={() => handleRemoveBlocker(row, b)}
                      className="shrink-0 text-slate-400 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-1 border-t border-slate-200 pt-2 dark:border-slate-800">
              <select
                value={depMenuSelection}
                onChange={(e) => setDepMenuSelection(e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Blocker wählen…</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleAddBlocker(row)}
                disabled={!depMenuSelection}
                className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="min-h-[calc(100vh-7rem)] space-y-6"
      onContextMenuCapture={handlePageContextMenuCapture}
      onContextMenu={handlePageContextMenu}
    >
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left Add Buttons */}
          <div className="flex items-center gap-2.5">
            {!showTaskForm && (
              <button
                onClick={() => {
                  setNewType('Phase')
                  setNewParentId('')
                  setParentLocked(false)
                  setShowTaskForm(true)
                }}
                className="flex items-center gap-2 rounded-lg border border-orange-300/80 bg-orange-50/80 px-3.5 py-2 text-xs font-semibold text-orange-700 transition-all hover:bg-orange-100 dark:border-orange-800/60 dark:bg-orange-950/40 dark:text-orange-300 dark:hover:bg-orange-900/60"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400">
                  <path d="M3 5.5h8M3 10h13M3 14.5h6" />
                </svg>
                <span>Phase anlegen</span>
              </button>
            )}
            {/* Eine Aufgabe gehört immer zu einer Phase - ohne mindestens eine Phase gibt es
                noch nichts, dem sie zugeordnet werden könnte. */}
            {!showTaskForm && workItems.some((w) => w.type === 'Phase') && (
              <button
                onClick={() => {
                  setNewType('Task')
                  setNewParentId('')
                  setParentLocked(false)
                  setShowTaskForm(true)
                }}
                className="flex items-center gap-2 rounded-lg bg-brand-accent px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-brand-accent/20 transition-all hover:bg-brand-accent-light hover:-translate-y-0.5"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3.5 w-3.5">
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
                <span>Aufgabe anlegen</span>
              </button>
            )}
            {!showMilestoneForm && (
              <button
                onClick={() => setShowMilestoneForm(true)}
                className="flex items-center gap-2 rounded-lg border border-purple-300/80 bg-purple-50/80 px-3.5 py-2 text-xs font-semibold text-purple-700 transition-all hover:bg-purple-100 dark:border-purple-800/60 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400">
                  <path d="M10 2.5 L17.5 10 L10 17.5 L2.5 10 Z" />
                </svg>
                <span>Meilenstein anlegen</span>
              </button>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Search Input Box */}
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5">
                  <circle cx="9" cy="9" r="6" />
                  <path d="M17 17l-3.5-3.5" />
                </svg>
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="In Timeline suchen..."
                className="h-9 w-44 sm:w-52 rounded-lg border border-slate-200/80 bg-white/80 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all focus:w-60 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Popover Button */}
            <div ref={filterMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setFilterMenuOpen((o) => !o)}
                className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all ${
                  filtersActive
                    ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-primary-light dark:bg-brand-primary/20 dark:text-brand-primary-light ring-2 ring-brand-primary/20'
                    : 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                  <path d="M4 5h16l-6.5 7.5V18l-3 1.5v-7z" />
                </svg>
                <span>Filter</span>
                {filtersActive && (
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-bold text-white dark:bg-brand-primary-light">
                    {filterStatuses.size + filterPriorities.size + filterAssignees.size + (searchQuery ? 1 : 0)}
                  </span>
                )}
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-60"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>

              {filterMenuOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Status</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFilterStatuses((prev) => toggleInSet(prev, s))}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          filterStatuses.has(s)
                            ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                            : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Priorität</p>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {PRIORITY_OPTIONS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setFilterPriorities((prev) => toggleInSet(prev, p))}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          filterPriorities.has(p)
                            ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                            : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                        }`}
                      >
                        {PRIORITY_LABELS[p]}
                      </button>
                    ))}
                  </div>

                  {assigneeOptions.length > 0 && (
                    <>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Zuständige</p>
                      <div className="mb-4 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                        {assigneeOptions.map(([id, name]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setFilterAssignees((prev) => toggleInSet(prev, id))}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                              filterAssignees.has(id)
                                ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                                : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
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
                        setSearchQuery('')
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
                    >
                      Alle Filter zurücksetzen
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Inline Segmented Zeitraum Range Switcher (1-Click) */}
            <div className="hidden sm:flex items-center rounded-lg border border-slate-200/80 bg-white/80 p-0.5 dark:border-slate-700/80 dark:bg-slate-800/80">
              {[
                { key: 'w1', label: '1W', days: 7 },
                { key: 'w2', label: '2W', days: 14 },
                { key: 'm1', label: '1M', days: 30 },
                { key: 'm3', label: '3M', days: 90 },
                { key: 'm6', label: '6M', days: 180 },
                { key: 'm12', label: '1J', days: 365 },
              ].map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.days, preset.key)}
                  className={`h-8 px-2.5 text-xs font-semibold rounded-md transition-colors ${
                    activePreset === preset.key
                      ? 'bg-brand-primary text-white shadow-xs dark:bg-brand-primary-light font-bold'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/80'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Root Level Zoom & Auto-Fit Control Group */}
            <div className="flex h-9 items-center rounded-lg border border-slate-200/80 bg-white/80 p-0.5 shadow-2xs dark:border-slate-700/80 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={zoomOut}
                title="Rauszoomen (-)"
                aria-label="Rauszoomen"
                className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/80"
              >
                −
              </button>

              <button
                type="button"
                onClick={resetZoom}
                title="Automatisch an Aufgaben-Umfang anpassen"
                className={`h-8 px-2.5 text-xs font-semibold transition-colors rounded-md ${
                  visibleDayCount === null
                    ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light font-bold'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/80'
                }`}
              >
                Auto-Fit
              </button>

              <button
                type="button"
                onClick={zoomIn}
                title="Reinzoomen (+)"
                aria-label="Reinzoomen"
                className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/80"
              >
                +
              </button>
            </div>

            {/* Zu Heute Button */}
            <button
              type="button"
              onClick={scrollToToday}
              disabled={todayOffset < 0 || todayOffset >= renderedDayCount}
              title="Zu heute springen"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Heute</span>
            </button>

            {/* Zeilendichte Control Group */}
            <div className="flex h-9 items-center rounded-lg border border-slate-200/80 bg-white/80 p-0.5 shadow-2xs dark:border-slate-700/80 dark:bg-slate-800/80">
              {DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreference('timelineDensity', option.value)}
                  title={`Dichte: ${option.label}`}
                  className={`h-8 px-2.5 text-xs font-semibold transition-colors rounded-md ${
                    density === option.value
                      ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light font-bold'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700/80'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Einklappen / Ausklappen Button */}
            <button
              type="button"
              onClick={toggleCollapseAll}
              disabled={groupIds.size === 0}
              title={allCollapsed ? 'Alle Abschnitte ausklappen' : 'Alle Abschnitte einklappen'}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                {allCollapsed ? <path d="M4 8l6-5 6 5M4 13l6 5 6-5" /> : <path d="M4 7l6 5 6-5M4 12l6-5 6 5" />}
              </svg>
              <span>{allCollapsed ? 'Ausklappen' : 'Einklappen'}</span>
            </button>
          </div>
        </div>

        {/* Removable Active Filter Chips Bar */}
        {filtersActive && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Aktive Filter:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light">
                Suche: "{searchQuery}"
                <button type="button" onClick={() => setSearchQuery('')} className="hover:text-red-500">✕</button>
              </span>
            )}
            {[...filterStatuses].map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {STATUS_LABELS[s]}
                <button type="button" onClick={() => setFilterStatuses((prev) => toggleInSet(prev, s))} className="hover:text-red-500">✕</button>
              </span>
            ))}
            {[...filterPriorities].map((p) => (
              <span key={p} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {PRIORITY_LABELS[p]}
                <button type="button" onClick={() => setFilterPriorities((prev) => toggleInSet(prev, p))} className="hover:text-red-500">✕</button>
              </span>
            ))}
            {[...filterAssignees].map((id) => {
              const name = assigneeOptions.find(([aId]) => aId === id)?.[1] ?? 'Unbekannt'
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {name}
                  <button type="button" onClick={() => setFilterAssignees((prev) => toggleInSet(prev, id))} className="hover:text-red-500">✕</button>
                </span>
              )
            })}
            <button
              type="button"
              onClick={() => {
                setFilterStatuses(new Set())
                setFilterPriorities(new Set())
                setFilterAssignees(new Set())
                setSearchQuery('')
              }}
              className="text-xs text-red-500 hover:underline font-semibold ml-1"
            >
              Alle löschen
            </button>
          </div>
        )}
      </div>

      <section className="flex overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="shrink-0 border-r border-slate-200 dark:border-slate-800" style={{ width: LABEL_WIDTH }}>
          <div style={{ height: SCROLLBAR_ROW_HEIGHT }} />
          <div className="flex items-center border-b border-slate-200 bg-slate-50/80 font-semibold dark:border-slate-700/60 dark:bg-slate-800/50" style={{ height: HEADER_HEIGHT }}>
            <span style={{ width: COL_NUMBER }} className="px-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              #
            </span>
            <span style={{ width: COL_ID }} className="px-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              ID
            </span>
            <span className="flex-1 px-2 text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Betreff</span>
            <span style={{ width: COL_TYPE }} className="px-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Typ
            </span>
            <span style={{ width: COL_STATUS }} className="px-2 text-center text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300" title="Status">
              St.
            </span>
            <span style={{ width: COL_PRIORITY }} className="px-2 text-center text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300" title="Priorität">
              Prio
            </span>
          </div>

          {rows.length === 0 && (
            <LabelRow style={{ paddingLeft: 8, height: 200 }} onContextMenu={(e) => openEmptyContextMenu(e, null)}>
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Noch keine Aufgaben oder Meilensteine mit Termin.</span>
            </LabelRow>
          )}

          {rows.map((row) => {
            if (row.kind === 'milestone') {
              const m = row.milestone
              return (
                <LabelRow
                  key={row.key}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ kind: 'milestone', milestone: m, x: e.clientX, y: e.clientY })
                  }}
                >
                  <span style={{ width: COL_NUMBER }} className="px-2 text-xs text-slate-400 dark:text-slate-500" />
                  <span style={{ width: COL_ID }} className="px-2 text-xs text-slate-500" />
                  <span className="flex flex-1 items-center gap-1.5 truncate px-2 text-sm font-bold text-purple-700 dark:text-purple-300" style={{ paddingLeft: row.depth * 16 }}>
                    <span className="text-xs">◆</span>
                    <span className="truncate">{m.name}</span>
                    <DependencyButton row={row} />
                    <button
                      onClick={() => handleDeleteMilestone(m)}
                      className="text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 ml-1"
                    >
                      ✕
                    </button>
                  </span>
                  <span style={{ width: COL_TYPE }} className="px-2 text-xs font-bold text-purple-600 dark:text-purple-400">
                    Meilenstein
                  </span>
                  <span style={{ width: COL_STATUS }} className="px-2" />
                  <span style={{ width: COL_PRIORITY }} className="px-2" />
                </LabelRow>
              )
            }

            const { item, depth, hasChildren } = row
            return (
              <LabelRow
                key={row.key}
                onContextMenu={(e) => openRowContextMenu(e, row)}
              >
                <span style={{ width: COL_NUMBER }} className="truncate px-2 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {row.number}
                </span>
                <span style={{ width: COL_ID }} className="truncate px-2 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  {item.referenceCode}
                </span>
                <span
                  className="flex flex-1 items-center gap-1.5 truncate px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                  style={{ paddingLeft: depth * 16 }}
                >
                  {hasChildren && (
                    <button
                      onClick={() => toggleCollapse(item.id)}
                      className="w-3.5 shrink-0 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 font-bold"
                    >
                      {collapsed.has(item.id) ? '▸' : '▾'}
                    </button>
                  )}
                  <span className="truncate">{item.title}</span>
                  {item.type !== 'Phase' && <DependencyButton row={row} />}
                  <button
                    onClick={() => openChildForm(item.id)}
                    title="Unteraufgabe hinzufügen"
                    aria-label="Unteraufgabe hinzufügen"
                    className="shrink-0 px-1 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 font-bold"
                  >
                    +
                  </button>
                </span>
                <span style={{ width: COL_TYPE }} className={`truncate px-2 text-xs font-bold ${TYPE_TEXT_COLOR[item.type]}`}>
                  {TYPE_LABELS[item.type]}
                </span>
                <span style={{ width: COL_STATUS }} className="flex items-center justify-center px-2">
                  {item.type !== 'Phase' && <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[item.columnType]}`} title={item.columnName} />}
                </span>
                <span style={{ width: COL_PRIORITY }} className="flex items-center justify-center px-2">
                  {item.type !== 'Phase' && <span className={`h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[item.priority]}`} title={`Priorität: ${PRIORITY_LABELS[item.priority]}`} />}
                </span>
              </LabelRow>
            )
          })}
        </div>

        <div ref={chartWheelRef} className="flex min-w-0 flex-1 flex-col">
          {/* Custom Styled Scrollbar Bar */}
          <div 
            ref={scrollbarRef} 
            className="overflow-x-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:bg-slate-300/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600/80 dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-500 transition-all" 
            onScroll={handleScrollbarScroll} 
            style={{ height: SCROLLBAR_ROW_HEIGHT }}
          >
            <div style={{ width: chartWidth, height: 1 }} />
          </div>

          {/* Month / Year Header Row with Alternating Month Colors */}
          <div
            ref={monthScrollRef}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onScroll={handleMonthScroll}
          >
            <div
              className="relative border-b border-slate-200 dark:border-slate-800"
              style={{ width: chartWidth, height: MONTH_ROW_HEIGHT }}
            >
              {monthGroups.map((g, i) => (
                <div
                  key={g.key}
                  onContextMenu={(e) => openEmptyContextMenuForGroup(e, g)}
                  className={`absolute top-0 flex h-full items-center justify-center overflow-hidden border-r text-[11px] font-bold uppercase tracking-wider transition-colors ${
                    i % 2 === 0
                      ? 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/80 dark:text-violet-200 dark:border-violet-800'
                      : 'bg-violet-200 text-violet-900 border-violet-400 dark:bg-violet-800/90 dark:text-violet-100 dark:border-violet-700'
                  }`}
                  style={{ left: g.startIndex * dayWidth, width: g.span * dayWidth }}
                >
                  {g.span * dayWidth >= 30 && (
                    <span className="truncate">
                      {dayWidth < 10 && g.label.includes(' ')
                        ? `${g.label.split(' ')[0].substring(0, 3)} '${g.label.split(' ')[1].substring(2)}`
                        : g.label}
                    </span>
                  )}
                </div>
              ))}
              
              {/* Elegant "Heute" Marker Line (Month Row) */}
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-40 flex flex-col items-center"
                  style={{ left: exactTodayOffset * dayWidth - 1 }}
                >
                  <div className="w-0.5 h-full bg-brand-primary/80 dark:bg-brand-primary-light/70 shadow-[0_0_8px_rgba(90,81,208,0.4)] dark:shadow-[0_0_8px_rgba(129,140,248,0.3)]" />
                </div>
              )}
            </div>
          </div>

          {/* Week & Day Header Rows with Alternating Colors & Weekend Highlighting */}
          <div
            ref={containerRef}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
            onScroll={handleHeaderScroll}
          >
            <div className="relative" style={{ width: chartWidth }}>
              <div className="flex flex-col border-b border-slate-200 dark:border-slate-800" style={{ height: WEEK_ROW_HEIGHT + DAY_ROW_HEIGHT }}>
                {/* Kalenderwoche Row */}
                <div className="relative border-b border-slate-200 dark:border-slate-800" style={{ height: WEEK_ROW_HEIGHT }}>
                  {weekGroups.map((g, i) => (
                    <div
                      key={g.key}
                      onContextMenu={(e) => openEmptyContextMenuForGroup(e, g)}
                      className={`absolute top-0 flex h-full items-center justify-center overflow-hidden border-r text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        i % 2 === 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-800/80 dark:text-emerald-100 dark:border-emerald-700'
                      }`}
                      style={{ left: g.startIndex * dayWidth, width: g.span * dayWidth }}
                    >
                      {g.span * dayWidth >= 14 && (
                        <span className="truncate">
                          {dayWidth < 10 ? g.label.replace('KW ', '') : g.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Day Row (Sa & So Extra Farbig!) */}
                <div className="relative" style={{ height: DAY_ROW_HEIGHT }}>
                  {days.map((d, i) => {
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    return (
                      <div
                        key={i}
                        onContextMenu={(e) => openEmptyContextMenu(e, d)}
                        className={`absolute top-0 flex h-full items-center justify-center border-l text-[11px] font-bold transition-colors ${
                          isWeekend
                            ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/80 dark:text-orange-300 dark:border-orange-700'
                            : i % 2 === 0
                            ? 'bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
                            : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                        }`}
                        style={{ left: i * dayWidth, width: dayWidth }}
                      >
                        {dayWidth >= 12 ? d.getDate() : ''}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Elegant "Heute" Marker Line & Badge (Week/Day Rows) */}
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-40 flex flex-col items-center"
                  style={{ left: exactTodayOffset * dayWidth - 1 }}
                >
                  <div className="absolute top-[18px] z-50 flex h-3 w-3 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary dark:bg-brand-primary-light opacity-80"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-primary dark:bg-brand-primary-light ring-2 ring-white dark:ring-slate-900"></span>
                  </div>
                  <div className="w-0.5 h-full bg-brand-primary/80 dark:bg-brand-primary-light/70 shadow-[0_0_8px_rgba(90,81,208,0.4)] dark:shadow-[0_0_8px_rgba(129,140,248,0.3)]" />
                </div>
              )}
            </div>
          </div>

          {/* Timeline Grid Body */}
          <div
            ref={bodyScrollRef}
            onScroll={handleBodyScroll}
            className="overflow-x-auto [&::-webkit-scrollbar]:hidden flex-1 flex flex-col"
            style={{ scrollbarWidth: 'none' }}
          >
            <div className="relative flex-1 min-h-[200px]" style={{ width: chartWidth }}>
              {/* Day Grid Lines & Weekend Background Highlights in Chart Body */}
              {days.map((d, i) => {
                const isWeekend = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={`grid-col-${i}`}
                    className={`pointer-events-none absolute inset-y-0 border-l ${
                      isWeekend 
                        ? 'bg-orange-50/60 dark:bg-orange-900/20 border-orange-200 dark:border-orange-900/60' 
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                    style={{ left: i * dayWidth, width: dayWidth }}
                  />
                )
              })}

              {/* Elegant "Heute" Marker Line (Grid Body) */}
              {todayOffset >= 0 && todayOffset < renderedDayCount && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-40 flex flex-col items-center"
                  style={{ left: exactTodayOffset * dayWidth - 1 }}
                >
                  <div className="w-0.5 h-full bg-brand-primary/80 dark:bg-brand-primary-light/70 shadow-[0_0_8px_rgba(90,81,208,0.4)] dark:shadow-[0_0_8px_rgba(129,140,248,0.3)]" />
                </div>
              )}

              {/* Parent → Child Dependency Connectors: a line from a Task's end date to each of
                  its subtasks' bars, with a "half dot" marker resting on each subtask's top edge.
                  Rendered after the bars in the DOM so the dots visibly sit on top of them. */}
              {parentChildConnectors.length > 0 && (
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-30"
                  width={chartWidth}
                  height={rows.length * rowHeight}
                >
                  {parentChildConnectors.map((connector) => (
                    <g key={connector.key} className={connector.colorClass}>
                      {connector.segments.map((segment) => (
                        <path
                          key={segment.key}
                          d={segment.d}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          strokeDasharray={segment.dashed ? '4 3' : undefined}
                        />
                      ))}
                      {connector.dots.map((dot) => (
                        // A true half-circle, not a full dot: flat edge sits exactly on the bar's
                        // top border, round side dipping down into the bar (sweep-flag 0 traces
                        // the arc through the bottom point instead of the top one). A contrasting
                        // stroke keeps it visible even against a similarly-colored bar underneath.
                        <path
                          key={dot.key}
                          d={`M ${dot.cx - CONNECTOR_DOT_RADIUS} ${dot.cy} A ${CONNECTOR_DOT_RADIUS} ${CONNECTOR_DOT_RADIUS} 0 0 0 ${dot.cx + CONNECTOR_DOT_RADIUS} ${dot.cy} Z`}
                          fill="currentColor"
                          className="stroke-white dark:stroke-slate-900"
                          strokeWidth={1.5}
                        />
                      ))}
                    </g>
                  ))}
                </svg>
              )}

              {rows.length === 0 && (
                <div
                  className="absolute inset-0"
                  onContextMenu={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const dayIndex = Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth))
                    openEmptyContextMenu(e, addDays(rangeStart, dayIndex))
                  }}
                />
              )}

              {rows.map((row) => {
                if (row.kind === 'milestone') {
                  const m = row.milestone
                  const left = diffDays(startOfDay(new Date(m.date)), rangeStart) * dayWidth + dayWidth / 2
                  return (
                    <div
                      key={row.key}
                      className="relative overflow-hidden border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
                      style={{ height: rowHeight }}
                    >
                      <div
                        title={`${m.name} — ${formatDate(m.date)}`}
                        className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 text-sm font-bold text-purple-600 dark:text-purple-300 drop-shadow-md"
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
                const barColor = isPhase
                  ? TYPE_BAR_COLOR.Phase
                  : barColorMode === 'priority'
                  ? PRIORITY_BAR_COLOR[item.priority]
                  : barColorMode === 'status'
                  ? getBarColor(item.columnName, item.columnType)
                  : hasChildren
                  ? 'bg-slate-600'
                  : getBarColor(item.columnName, item.columnType)
                const blocked = item.blockingWorkItemIds.length > 0 || item.blockedByMilestoneIds.length > 0

                return (
                  <div
                    key={row.key}
                    onContextMenu={(e) => {
                      // Only a click that actually lands on the bar edits/deletes this task -
                      // empty space in the row (there's no bar there, or it's a day the bar
                      // doesn't cover) should offer to create something at that day instead.
                      if ((e.target as HTMLElement).closest('[data-bar]')) {
                        openRowContextMenu(e, row)
                      } else {
                        openEmptyContextMenuAtClick(e)
                      }
                    }}
                    className="relative overflow-hidden border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/20"
                    style={{ height: rowHeight }}
                  >
                    {range && (
                      <div
                        data-bar="true"
                        // A Phase's bar is rolled up live from its subtasks (see phaseRange) - it
                        // isn't its own thing to drag/resize, so no pointer handlers or handles.
                        onPointerDown={isPhase ? undefined : handlePointerDown(item)}
                        onPointerMove={isPhase ? undefined : handlePointerMove}
                        onPointerUp={isPhase ? undefined : handlePointerUp(item)}
                        title={isPhase ? `${item.title} — ${formatDate(range.start.toISOString())} bis ${formatDate(range.finish.toISOString())}` : undefined}
                        className={`group absolute flex items-center rounded-sm ${barColor} ${isPhase ? 'opacity-90' : 'cursor-grab'} ${blocked ? 'border-l-4 border-amber-400' : ''}`}
                        style={{
                          left: diffDays(range.start, rangeStart) * dayWidth + 1,
                          width: Math.max((diffDays(range.finish, range.start) + 1) * dayWidth - 2, dayWidth - 2),
                          top: (rowHeight - barHeight) / 2,
                          height: barHeight,
                        }}
                      >
                        {!isPhase && (
                          <div data-handle="start" className="absolute left-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center rounded-l-sm bg-black/10 opacity-0 transition-opacity hover:bg-black/20 group-hover:opacity-100 dark:bg-white/10 dark:hover:bg-white/20">
                            <div className="h-2.5 w-[1.5px] rounded-full bg-white/70" />
                          </div>
                        )}
                        <div className="flex w-full items-center overflow-hidden px-3">
                          {!isPhase && (
                            <svg className="mr-1 h-3 w-3 shrink-0 text-white/60 opacity-0 transition-opacity group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="9" cy="12" r="1"></circle>
                              <circle cx="9" cy="5" r="1"></circle>
                              <circle cx="9" cy="19" r="1"></circle>
                              <circle cx="15" cy="12" r="1"></circle>
                              <circle cx="15" cy="5" r="1"></circle>
                              <circle cx="15" cy="19" r="1"></circle>
                            </svg>
                          )}
                          <span className="truncate text-[11px] font-semibold text-white shadow-sm select-none">{item.title}</span>
                        </div>
                        {!isPhase && (
                          <div data-handle="end" className="absolute right-0 flex h-full w-2.5 cursor-ew-resize items-center justify-center rounded-r-sm bg-black/10 opacity-0 transition-opacity hover:bg-black/20 group-hover:opacity-100 dark:bg-white/10 dark:hover:bg-white/20">
                            <div className="h-2.5 w-[1.5px] rounded-full bg-white/70" />
                          </div>
                        )}
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
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={() => {
            setShowTaskForm(false)
            setParentLocked(false)
            setShowMilestoneForm(false)
          }}
        >
          {showTaskForm && (
            <form
              onSubmit={handleCreateTask}
              onClick={(e) => e.stopPropagation()}
              className="glass w-full max-w-sm space-y-4 rounded-xl p-5"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-semibold">{newType === 'Phase' ? 'Neue Phase' : 'Neue Aufgabe'}</h3>
                <button type="button" onClick={() => { setShowTaskForm(false); setParentLocked(false) }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Titel</label>
                <input autoFocus required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setShowTaskForm(false)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notizen</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowTaskForm(false)
                  }}
                  placeholder="Notizen (optional)..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                />
              </div>
              {/* Der Typ steht schon durch den geklickten Button fest (Phase/Aufgabe anlegen,
                  oder "+" an einem bestehenden Element) - kein Umschalter mehr nötig. */}
              {newType === 'Task' && (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Priorität</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as WorkItemPriority)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100">
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                  </select>
                </div>
              )}
              {parentLocked && newParentId ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Wird zu <span className="font-semibold text-slate-700 dark:text-slate-200">{workItems.find((w) => w.id === newParentId)?.title}</span> hinzugefügt.
                </p>
              ) : (
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Übergeordnet</label>
                  <select
                    value={newParentId}
                    onChange={(e) => {
                      const parentId = e.target.value
                      setNewParentId(parentId)
                      if (parentId) {
                        const min = minStartForParent(parentId)
                        if (min && (!newStart || newStart < min)) setNewStart(min)
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                  >
                    <option value="">Keine übergeordnete Aufgabe</option>
                    {eligibleParentItems.map((w) => <option key={w.id} value={w.id}>{w.referenceCode} · {w.title}</option>)}
                  </select>
                </div>
              )}
              {newType === 'Task' ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Anfang</label>
                    <input
                      required
                      type="date"
                      min={(newParentId && minStartForParent(newParentId)) || undefined}
                      value={newStart}
                      onChange={(e) => {
                        const start = e.target.value
                        setNewStart(start)
                        // Keep the end date from ever sitting before the (now later) start date.
                        if (start && newEnd && newEnd < start) setNewEnd(start)
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Ende (optional)</label>
                    <input
                      type="date"
                      min={newStart || undefined}
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Der Zeitraum einer Phase ergibt sich automatisch aus ihren Unteraufgaben.</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowTaskForm(false); setParentLocked(false) }} className="rounded-lg border border-slate-300 px-4 py-2 text-xs transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Abbrechen</button>
                <button type="submit" className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-accent-light transition-all">Anlegen</button>
              </div>
            </form>
          )}

          {showMilestoneForm && (
            <form
              onSubmit={handleCreateMilestone}
              onClick={(e) => e.stopPropagation()}
              className="glass w-full max-w-sm space-y-4 rounded-xl p-5"
            >
              <div className="flex justify-between items-center mb-1">
                <h3 className="text-sm font-semibold">Neuer Meilenstein</h3>
                <button type="button" onClick={() => setShowMilestoneForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
              </div>
              
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Name</label>
                <input autoFocus required value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setShowMilestoneForm(false)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Datum</label>
                <input required type="date" value={milestoneDate} onChange={(e) => setMilestoneDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Übergeordnet</label>
                <select value={milestoneParentId} onChange={(e) => setMilestoneParentId(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100">
                  <option value="">Kein übergeordnetes Element</option>
                  {eligibleParentItems.map((w) => <option key={w.id} value={w.id}>{w.referenceCode} · {w.title}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMilestoneForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Abbrechen</button>
                <button type="submit" className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-accent-light transition-all">Anlegen</button>
              </div>
            </form>
          )}
        </div>
      )}

      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems()} onClose={() => setContextMenu(null)} />}

      {editTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40" onClick={closeEdit}>
          <form
            onSubmit={handleSubmitEdit}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-sm space-y-4 rounded-xl p-5"
          >
            <h3 className="text-sm font-semibold">
              {editTarget.kind === 'milestone' ? 'Meilenstein bearbeiten' : editTarget.item.type === 'Phase' ? 'Phase bearbeiten' : 'Aufgabe bearbeiten'}
            </h3>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Name</label>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeEdit()
                }}
                className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
              />
            </div>

            {editTarget.kind === 'milestone' ? (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Datum</label>
                <input required type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
              </div>
            ) : (
              <>
                {editTarget.item.type === 'Task' && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Anfang</label>
                      <input required type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Ende</label>
                      <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Priorität</label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as WorkItemPriority)}
                    className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeEdit} className="rounded-lg border border-slate-300 px-4 py-2 text-xs transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">
                Abbrechen
              </button>
              <button type="submit" className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-brand-accent-light hover:shadow-brand-accent/30">
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
