import React, { Fragment, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import * as signalR from '@microsoft/signalr'
import { createWorkItem, deleteWorkItem, moveWorkItem, updateWorkItem } from '../api/workItems'
import type { Board, BoardColumn, BoardColumnType, WorkItem, WorkItemCategory, WorkItemPriority } from '../api/types'
import type { UserSummary } from '../api/users'
import { createKanbanConnection } from '../realtime/signalr'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'
import ContextMenu, { type ContextMenuEntry } from '../components/ContextMenu'
import { ConfirmDialog } from '../components/ConfirmDialog'

interface Props {
  board: Board
  items: WorkItem[]
  users: UserSummary[]
  onItemsChange: Dispatch<SetStateAction<WorkItem[]>>
}

interface PointerDragState {
  item: WorkItem
  startColumnId: string
  currentX: number
  currentY: number
  cardWidth: number
  cardHeight: number
  offsetX: number
  offsetY: number
}

const UNASSIGNED = '__unassigned__'
const SORT_PREFERENCE_KEY = 'kanban.sortBy'

type SortKey = 'manual' | 'referenceCode' | 'priority' | 'category' | 'title' | 'assignee'

const SORT_LABELS: Record<SortKey, string> = {
  manual: 'Manuell (Ziehen)',
  referenceCode: 'Aufgaben-Nr.',
  priority: 'Priorität',
  category: 'Typ',
  title: 'Name',
  assignee: 'Zuständige/r',
}

const PRIORITY_ORDER: Record<WorkItemPriority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 }
const CATEGORY_ORDER: Record<string, number> = { Feature: 0, Bug: 1, Chore: 2 }
const PRIORITY_OPTIONS: WorkItemPriority[] = ['Urgent', 'High', 'Medium', 'Low']
const CATEGORY_OPTIONS: WorkItemCategory[] = ['Feature', 'Bug', 'Chore']

function toggleInSet<T>(set: Set<T>, value: T) {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}


function compareItems(a: WorkItem, b: WorkItem, sortBy: SortKey, users: UserSummary[]): number {
  switch (sortBy) {
    case 'referenceCode':
      return a.referenceCode.localeCompare(b.referenceCode, undefined, { numeric: true })
    case 'priority':
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    case 'category':
      return (CATEGORY_ORDER[a.category ?? ''] ?? 99) - (CATEGORY_ORDER[b.category ?? ''] ?? 99)
    case 'title':
      return a.title.localeCompare(b.title, 'de')
    case 'assignee': {
      const nameA = users.find((u) => u.id === a.assigneeId)?.displayName ?? '￿'
      const nameB = users.find((u) => u.id === b.assigneeId)?.displayName ?? '￿'
      return nameA.localeCompare(nameB, 'de')
    }
    default:
      return a.position - b.position
  }
}

export default function KanbanBoard({ board, items, users, onItemsChange }: Props) {
  const { token } = useAuth()
  const { getPreference, setPreference } = usePreferences()
  const [newTitleByColumn, setNewTitleByColumn] = useState<Record<string, string>>({})
  const [newDescriptionByColumn, setNewDescriptionByColumn] = useState<Record<string, string>>({})
  const [newPriorityByColumn, setNewPriorityByColumn] = useState<Record<string, WorkItemPriority>>({})
  const [newCategoryByColumn, setNewCategoryByColumn] = useState<Record<string, WorkItemCategory | ''>>({})
  const [openAddColumns, setOpenAddColumns] = useState<Set<string>>(new Set())
  const [activeDrag, setActiveDrag] = useState<PointerDragState | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{ id: string; placement: 'before' | 'after' } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const sortBy = getPreference(SORT_PREFERENCE_KEY, 'manual') as SortKey
  const [filterPriorities, setFilterPriorities] = useState<Set<WorkItemPriority>>(new Set())
  const [filterCategories, setFilterCategories] = useState<Set<WorkItemCategory>>(new Set())
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set())
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterMenuRef = useRef<HTMLDivElement>(null)

  const [cardContextMenu, setCardContextMenu] = useState<{ x: number; y: number; item: WorkItem } | null>(null)
  const [columnContextMenu, setColumnContextMenu] = useState<{ x: number; y: number; column: BoardColumn } | null>(null)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<WorkItem | null>(null)
  const [editTarget, setEditTarget] = useState<WorkItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const filtersActive = filterPriorities.size > 0 || filterCategories.size > 0 || filterAssignees.size > 0 || searchQuery.trim().length > 0

  function clearAllFilters() {
    setFilterPriorities(new Set())
    setFilterCategories(new Set())
    setFilterAssignees(new Set())
    setSearchQuery('')
  }

  useEffect(() => {
    if (!filterMenuOpen) return
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setFilterMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [filterMenuOpen])

  const pendingDragRef = useRef<{
    item: WorkItem
    columnId: string
    startX: number
    startY: number
    rect: DOMRect
  } | null>(null)

  // One project = one board, so joining/leaving the realtime group only needs to track board.id.
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
      const targetColumn = board.columns.find((c) => c.id === payload.targetColumnId)
      onItemsChange((prev) =>
        prev.map((i) =>
          i.id === payload.workItemId
            ? {
                ...i,
                columnId: payload.targetColumnId,
                columnName: targetColumn?.name ?? i.columnName,
                columnType: targetColumn?.type ?? i.columnType,
                position: payload.position,
              }
            : i,
        ),
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

  const activeDragRef = useRef<PointerDragState | null>(null)
  const dragOverColumnIdRef = useRef<string | null>(null)
  const [dragOverTrash, setDragOverTrash] = useState(false)
  const dragOverTrashRef = useRef(false)
  const dragOverItemRef = useRef<{ id: string; placement: 'before' | 'after' } | null>(null)

  // Keep refs in sync with state for stale-closure-free window event handlers
  useEffect(() => {
    activeDragRef.current = activeDrag
  }, [activeDrag])

  useEffect(() => {
    dragOverColumnIdRef.current = dragOverColumnId
  }, [dragOverColumnId])

  useEffect(() => {
    dragOverTrashRef.current = dragOverTrash
  }, [dragOverTrash])

  useEffect(() => {
    dragOverItemRef.current = dragOverItem
  }, [dragOverItem])

  // Global pointer listeners for smooth custom card dragging
  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      if (pendingDragRef.current && !activeDragRef.current) {
        const p = pendingDragRef.current
        const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
        if (dist > 3) {
          const newDrag: PointerDragState = {
            item: p.item,
            startColumnId: p.columnId,
            currentX: e.clientX,
            currentY: e.clientY,
            cardWidth: p.rect.width,
            cardHeight: p.rect.height,
            offsetX: p.startX - p.rect.left,
            offsetY: p.startY - p.rect.top,
          }
          activeDragRef.current = newDrag
          setActiveDrag(newDrag)
        }
      } else if (activeDragRef.current) {
        const updated: PointerDragState = {
          ...activeDragRef.current,
          currentX: e.clientX,
          currentY: e.clientY,
        }
        activeDragRef.current = updated
        setActiveDrag(updated)

        const elementBelow = document.elementFromPoint(e.clientX, e.clientY)

        if (elementBelow?.closest('[data-trash-target]')) {
          dragOverTrashRef.current = true
          setDragOverTrash(true)
          dragOverColumnIdRef.current = null
          setDragOverColumnId(null)
          dragOverItemRef.current = null
          setDragOverItem(null)
        } else {
          dragOverTrashRef.current = false
          setDragOverTrash(false)

          const columnEl = elementBelow?.closest('[data-column-id]')
          if (columnEl) {
            const colId = columnEl.getAttribute('data-column-id')
            dragOverColumnIdRef.current = colId
            setDragOverColumnId(colId)

            if (sortBy === 'manual') {
              const cards = Array.from(columnEl.querySelectorAll('[data-work-item-id]'))
              const placeholder = columnEl.querySelector('[data-drag-placeholder]')
              const placeholderHeight = placeholder ? placeholder.getBoundingClientRect().height : 0

              let foundItem: { id: string, placement: 'before' | 'after' } | null = null
              let shouldClear = false

              if (cards.length > 0) {
                const virtualCards = cards.map(card => {
                  const rect = card.getBoundingClientRect()
                  let top = rect.top
                  let bottom = rect.bottom
                  if (placeholder && (placeholder.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                    top -= placeholderHeight
                    bottom -= placeholderHeight
                  }
                  return { card, top, bottom, height: rect.height, midpoint: top + rect.height / 2 }
                })

                const lastVirtual = virtualCards[virtualCards.length - 1]
                
                if (e.clientY > lastVirtual.bottom) {
                  const lastId = lastVirtual.card.getAttribute('data-work-item-id')!
                  if (lastId !== activeDragRef.current.item.id) {
                    foundItem = { id: lastId, placement: 'after' }
                  } else {
                    shouldClear = true
                  }
                } else {
                  let closest = virtualCards[0]
                  let minDiff = Math.abs(e.clientY - closest.midpoint)
                  
                  for (let i = 1; i < virtualCards.length; i++) {
                    const vc = virtualCards[i]
                    const diff = Math.abs(e.clientY - vc.midpoint)
                    if (diff < minDiff) {
                      minDiff = diff
                      closest = vc
                    }
                  }

                  const itemId = closest.card.getAttribute('data-work-item-id')!
                  if (itemId !== activeDragRef.current.item.id) {
                    const placement = e.clientY < closest.midpoint ? 'before' : 'after'
                    foundItem = { id: itemId, placement }
                  } else {
                    shouldClear = true
                  }
                }
              }

              if (foundItem) {
                if (
                  dragOverItemRef.current?.id !== foundItem.id ||
                  dragOverItemRef.current?.placement !== foundItem.placement
                ) {
                  dragOverItemRef.current = foundItem
                  setDragOverItem(foundItem)
                }
              } else if (shouldClear || cards.length === 0) {
                if (dragOverItemRef.current) {
                  dragOverItemRef.current = null
                  setDragOverItem(null)
                }
              }
            } else {
              if (dragOverItemRef.current) {
                dragOverItemRef.current = null
                setDragOverItem(null)
              }
            }
          } else {
            dragOverColumnIdRef.current = null
            setDragOverColumnId(null)
            if (dragOverItemRef.current) {
              dragOverItemRef.current = null
              setDragOverItem(null)
            }
          }
        }
      }
    }

    function handlePointerUp() {
      const currentDrag = activeDragRef.current
      const targetColumnId = dragOverColumnIdRef.current
      const droppedOnTrash = dragOverTrashRef.current

      if (currentDrag && droppedOnTrash) {
        handleDeleteCard(currentDrag.item)
      } else if (currentDrag && targetColumnId) {
        const targetItem = dragOverItemRef.current
        if (targetColumnId !== currentDrag.item.columnId || targetItem) {
          const targetColumn = board.columns.find((c) => c.id === targetColumnId)
          if (targetColumn) {
            // handleMove updates local state optimistically before the request resolves - on
            // failure (e.g. an expired session) the card stays showing as moved locally until
            // the next reload picks up the real server state. Not ideal, but no worse than
            // before, and avoids an unhandled rejection now that a 401 no longer hard-navigates
            // away (see api/client.ts).
            handleMove(currentDrag.item, targetColumn, targetItem).catch(() => undefined)
          }
        }
      }

      pendingDragRef.current = null
      activeDragRef.current = null
      dragOverColumnIdRef.current = null
      dragOverTrashRef.current = false
      setActiveDrag(null)
      setDragOverColumnId(null)
      setDragOverTrash(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.columns])

  const itemsByColumn = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (item.type === 'Phase') return false
      if (q && !item.title.toLowerCase().includes(q) && !item.referenceCode.toLowerCase().includes(q)) return false
      if (filterPriorities.size > 0 && !filterPriorities.has(item.priority)) return false
      if (filterCategories.size > 0 && (!item.category || !filterCategories.has(item.category))) return false
      if (filterAssignees.size > 0 && !filterAssignees.has(item.assigneeId ?? UNASSIGNED)) return false
      return true
    })

    const map = new Map<string, WorkItem[]>()
    for (const item of filtered) {
      const list = map.get(item.columnId) ?? []
      list.push(item)
      map.set(item.columnId, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => compareItems(a, b, sortBy, users))
    }
    return map
  }, [items, searchQuery, filterPriorities, filterCategories, filterAssignees, sortBy, users])

  async function handleCreate(column: BoardColumn) {
    const title = (newTitleByColumn[column.id] ?? '').trim()
    if (!title) return

    const description = (newDescriptionByColumn[column.id] ?? '').trim()
    const priority = newPriorityByColumn[column.id] ?? 'Medium'
    const category = newCategoryByColumn[column.id] || undefined
    const created = await createWorkItem(board.id, column.id, title, 'Task', priority, description || undefined, { category })
    onItemsChange((prev) => (prev.some((i) => i.id === created.id) ? prev : [...prev, created]))
    setNewTitleByColumn((prev) => ({ ...prev, [column.id]: '' }))
    setNewDescriptionByColumn((prev) => ({ ...prev, [column.id]: '' }))
    setNewPriorityByColumn((prev) => ({ ...prev, [column.id]: 'Medium' }))
    setNewCategoryByColumn((prev) => ({ ...prev, [column.id]: '' }))
  }

  function toggleAddColumn(columnId: string, open: boolean) {
    setOpenAddColumns((prev) => {
      const next = new Set(prev)
      if (open) next.add(columnId)
      else next.delete(columnId)
      return next
    })
  }

  async function handleMove(item: WorkItem, targetColumn: BoardColumn, targetItemInfo?: { id: string; placement: 'before' | 'after' } | null) {
    let newPosition = 0
    let targetList = itemsByColumn.get(targetColumn.id) ?? []
    targetList = targetList.filter(i => i.id !== item.id)

    if (targetItemInfo) {
      const targetIndex = targetList.findIndex(i => i.id === targetItemInfo.id)
      if (targetIndex !== -1) {
        newPosition = targetItemInfo.placement === 'before' ? targetIndex : targetIndex + 1
      } else {
        newPosition = targetList.length
      }
    } else {
      newPosition = targetList.length
    }

    const updatedItems = [...targetList]
    updatedItems.splice(newPosition, 0, { ...item, columnId: targetColumn.id, columnName: targetColumn.name, columnType: targetColumn.type, position: newPosition })
    const reorderedIds = new Map(updatedItems.map((ui, idx) => [ui.id, idx]))

    onItemsChange((prev) => prev.map((i) => {
      // columnName/columnType are denormalized copies of the target column's own name/type -
      // Kanban itself never reads them back (it looks up board.columns by columnId instead), but
      // the Timeline view displays them directly, so leaving them stale here left a moved card
      // showing its old status/column there until a full reload re-fetched everything.
      if (i.id === item.id) return { ...i, columnId: targetColumn.id, columnName: targetColumn.name, columnType: targetColumn.type, position: newPosition }
      if (i.columnId === targetColumn.id && reorderedIds.has(i.id)) {
        return { ...i, position: reorderedIds.get(i.id)! }
      }
      return i
    }))

    await moveWorkItem(board.id, item.id, targetColumn.id, newPosition)
  }

  function handleCardPointerDown(e: React.PointerEvent<HTMLLIElement>, item: WorkItem, columnId: string) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('select') || target.closest('button') || target.closest('input')) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    pendingDragRef.current = {
      item,
      columnId,
      startX: e.clientX,
      startY: e.clientY,
      rect,
    }
  }

  async function handleAssign(item: WorkItem, assigneeId: string) {
    const updated = await updateWorkItem(board.id, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      category: item.category,
      assigneeId: assigneeId || null,
      parentWorkItemId: item.parentWorkItemId,
      startDate: item.startDate,
      dueDate: item.dueDate,
    })
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  async function handleCategoryChange(item: WorkItem, category: WorkItemCategory | '') {
    const updated = await updateWorkItem(board.id, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority: item.priority,
      category: category || null,
      assigneeId: item.assigneeId,
      parentWorkItemId: item.parentWorkItemId,
      startDate: item.startDate,
      dueDate: item.dueDate,
    })
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  async function handlePriorityChange(item: WorkItem, priority: WorkItemPriority) {
    const updated = await updateWorkItem(board.id, item.id, {
      title: item.title,
      description: item.description,
      type: item.type,
      priority,
      category: item.category,
      assigneeId: item.assigneeId,
      parentWorkItemId: item.parentWorkItemId,
      startDate: item.startDate,
      dueDate: item.dueDate,
    })
    onItemsChange((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
  }

  function handleCardContextMenu(event: React.MouseEvent, item: WorkItem) {
    event.preventDefault()
    setCardContextMenu({ x: event.clientX, y: event.clientY, item })
  }

  // Fires for a right-click anywhere in the column's card list, including empty space below/
  // between cards - but a card's own onContextMenu (which fires first, bubbling up) already
  // called preventDefault, so this backs off and lets that card's menu win instead.
  function handleColumnContextMenu(event: React.MouseEvent, column: BoardColumn) {
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, button')) return
    event.preventDefault()
    setColumnContextMenu({ x: event.clientX, y: event.clientY, column })
  }

  function openEditCard(item: WorkItem) {
    setEditTarget(item)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
  }

  async function submitEditCard(event: React.FormEvent) {
    event.preventDefault()
    if (!editTarget) return
    const title = editTitle.trim()
    if (!title) return

    const updated = await updateWorkItem(board.id, editTarget.id, {
      title,
      description: editDescription.trim() || null,
      type: editTarget.type,
      priority: editTarget.priority,
      category: editTarget.category,
      assigneeId: editTarget.assigneeId,
      parentWorkItemId: editTarget.parentWorkItemId,
      startDate: editTarget.startDate,
      dueDate: editTarget.dueDate,
    })
    onItemsChange((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    setEditTarget(null)
  }

  function handleDeleteCard(item: WorkItem) {
    setDeleteConfirmTarget(item)
    setCardContextMenu(null)
  }

  async function executeDeleteCard() {
    if (!deleteConfirmTarget) return
    const id = deleteConfirmTarget.id
    await deleteWorkItem(board.id, id)
    onItemsChange((prev) => prev.filter((i) => i.id !== id))
    setDeleteConfirmTarget(null)
    setActiveDrag(null)
  }

  function cardContextMenuItems(item: WorkItem): ContextMenuEntry[] {
    return [
      { label: 'Bearbeiten', onClick: () => openEditCard(item) },
      'divider',
      { label: 'Karte löschen', onClick: () => handleDeleteCard(item), danger: true },
    ]
  }

  function getInitials(name?: string) {
    if (!name) return '?'
    const parts = name.split(' ').filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  // Kept clear of the status colors below (yellow/blue/green/red) so a priority badge is never
  // mistaken for a status one when both show up next to each other.
  const PRIORITY_COLORS: Record<string, string> = {
    Low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold',
    Medium: 'bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-semibold',
    High: 'bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 font-semibold',
    Urgent: 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-semibold',
  }

  const CATEGORY_LABELS: Record<WorkItemCategory, string> = {
    Feature: 'Feature',
    Bug: 'Bug',
    Chore: 'Chore',
  }

  const CATEGORY_COLORS: Record<WorkItemCategory, string> = {
    Feature: 'bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-semibold',
    Bug: 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-semibold',
    Chore: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold',
  }

  const COLUMN_BORDER_COLORS: Record<string, string> = {
    Todo: 'bg-yellow-400 dark:bg-yellow-500',
    InProgress: 'bg-blue-400 dark:bg-blue-500',
    Done: 'bg-green-400 dark:bg-green-500',
  }

  const KNOWN_BORDER_COLORS: Record<string, string> = {
    'pausiert': 'bg-red-400 dark:bg-red-500',
    'blockiert': 'bg-red-400 dark:bg-red-500',
    'review': 'bg-purple-400 dark:bg-purple-500',
    'neu': 'bg-yellow-400 dark:bg-yellow-500',
  }

  function getColumnBorderColor(columnName: string, columnType: BoardColumnType) {
    const lowerName = columnName.toLowerCase()
    for (const [key, color] of Object.entries(KNOWN_BORDER_COLORS)) {
      if (lowerName.includes(key)) return color
    }
    return COLUMN_BORDER_COLORS[columnType] || 'bg-slate-400'
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 px-2">
          {/* Left Side Header / Actions */}
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Kanban Board</h2>
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
            placeholder="Karten durchsuchen..."
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

        {/* Sort Dropdown */}
        <select
          value={sortBy}
          onChange={(e) => setPreference(SORT_PREFERENCE_KEY, e.target.value)}
          className="h-9 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200"
        >
          {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
            <option key={key} value={key}>
              Sortierung: {label}
            </option>
          ))}
        </select>

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
                {filterPriorities.size + filterCategories.size + filterAssignees.size + (searchQuery ? 1 : 0)}
              </span>
            )}
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-60"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>

          {filterMenuOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95">
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
                    {p}
                  </button>
                ))}
              </div>

              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Typ</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFilterCategories((prev) => toggleInSet(prev, c))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      filterCategories.has(c)
                        ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                        : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                    }`}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              {users.length > 0 && (
                <>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Zuständige</p>
                  <div className="mb-4 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setFilterAssignees((prev) => toggleInSet(prev, u.id))}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          filterAssignees.has(u.id)
                            ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                            : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                        }`}
                      >
                        {u.displayName}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFilterAssignees((prev) => toggleInSet(prev, UNASSIGNED))}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        filterAssignees.has(UNASSIGNED)
                          ? 'bg-brand-primary text-white font-semibold dark:bg-brand-primary-light'
                          : 'border border-slate-200/80 bg-slate-100/50 text-slate-700 hover:bg-slate-200/60 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200'
                      }`}
                    >
                      Nicht zugewiesen
                    </button>
                  </div>
                </>
              )}

              {filtersActive && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/40"
                >
                  Alle Filter zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Removable Active Filter Chips Bar */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-1.5 px-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Aktive Filter:</span>
          {searchQuery && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-semibold text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light">
              Suche: "{searchQuery}"
              <button type="button" onClick={() => setSearchQuery('')} className="hover:text-red-500">✕</button>
            </span>
          )}
          {[...filterPriorities].map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {p}
              <button type="button" onClick={() => setFilterPriorities((prev) => toggleInSet(prev, p))} className="hover:text-red-500">✕</button>
            </span>
          ))}
          {[...filterCategories].map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {CATEGORY_LABELS[c]}
              <button type="button" onClick={() => setFilterCategories((prev) => toggleInSet(prev, c))} className="hover:text-red-500">✕</button>
            </span>
          ))}
          {[...filterAssignees].map((id) => {
            const name = id === UNASSIGNED ? 'Nicht zugewiesen' : users.find((u) => u.id === id)?.displayName ?? 'Unbekannt'
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {name}
                <button type="button" onClick={() => setFilterAssignees((prev) => toggleInSet(prev, id))} className="hover:text-red-500">✕</button>
              </span>
            )
          })}
          <button type="button" onClick={clearAllFilters} className="text-xs text-red-500 hover:underline font-semibold ml-1">
            Alle löschen
          </button>
        </div>
      )}
      </div>

    <div className="flex flex-1 min-h-0 gap-5 overflow-x-auto pb-8 pt-2 pl-2">
      {board.columns.map((column) => (
        <section
          key={column.id}
          data-column-id={column.id}
          className={`glass-panel flex flex-col flex-1 min-w-0 rounded-xl relative overflow-hidden transition-all duration-200 ${
            dragOverColumnId === column.id ? 'ring-2 ring-brand-primary bg-brand-primary/10 border-brand-primary/50 shadow-lg shadow-brand-primary/10' : ''
          }`}
        >
          {/* Status Color Line */}
          <div className={`absolute top-0 left-0 w-full h-1.5 ${getColumnBorderColor(column.name, column.type)}`} />

          {/* Column Header */}
          <div className="flex items-center justify-between border-b border-slate-200/50 bg-white/40 px-5 py-4 dark:border-slate-700/50 dark:bg-slate-800/40">
            <h2 className="flex items-center gap-3 text-sm font-bold text-slate-900 dark:text-white mt-1">
              {column.name}
              <span className="flex h-5 items-center justify-center rounded-full bg-slate-200 px-2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {itemsByColumn.get(column.id)?.length ?? 0}
              </span>
            </h2>
            {!openAddColumns.has(column.id) && (
              <button
                onClick={() => toggleAddColumn(column.id, true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                title="Neue Aufgabe in dieser Spalte"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              </button>
            )}
          </div>

          <div
            onContextMenu={(e) => handleColumnContextMenu(e, column)}
            className="flex-1 overflow-y-auto p-3 space-y-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600"
          >
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
                <textarea
                  value={newDescriptionByColumn[column.id] ?? ''}
                  onChange={(e) => setNewDescriptionByColumn((prev) => ({ ...prev, [column.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') toggleAddColumn(column.id, false)
                  }}
                  placeholder="Notizen (optional)..."
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm placeholder-slate-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                />
                <div className="mt-2 flex gap-2">
                  <select
                    value={newPriorityByColumn[column.id] ?? 'Medium'}
                    onChange={(e) => setNewPriorityByColumn((prev) => ({ ...prev, [column.id]: e.target.value as WorkItemPriority }))}
                    className="w-full rounded-lg border bg-transparent px-2 py-1.5 text-xs text-slate-700 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                  >
                    <option value="Low" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Low</option>
                    <option value="Medium" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Medium</option>
                    <option value="High" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">High</option>
                    <option value="Urgent" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Urgent</option>
                  </select>
                  <select
                    value={newCategoryByColumn[column.id] ?? ''}
                    onChange={(e) => setNewCategoryByColumn((prev) => ({ ...prev, [column.id]: e.target.value as WorkItemCategory | '' }))}
                    className="w-full rounded-lg border bg-transparent px-2 py-1.5 text-xs text-slate-700 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
                  >
                    <option value="" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Kein Typ</option>
                    <option value="Feature" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Feature</option>
                    <option value="Bug" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Bug</option>
                    <option value="Chore" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Chore</option>
                  </select>
                </div>
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

            {(itemsByColumn.get(column.id) ?? []).map((item) => {
              const isBeingDragged = activeDrag?.item.id === item.id
              const isDragOverBefore = dragOverItem?.id === item.id && dragOverItem.placement === 'before'
              const isDragOverAfter = dragOverItem?.id === item.id && dragOverItem.placement === 'after'

              return (
                <Fragment key={item.id}>
                  {isDragOverBefore && activeDrag && (
                    <li data-drag-placeholder="true" style={{ height: activeDrag.cardHeight }} className="rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 transition-all duration-200" />
                  )}
                  <li
                    data-work-item-id={item.id}
                    onPointerDown={(e) => handleCardPointerDown(e, item, column.id)}
                    onContextMenu={(e) => handleCardContextMenu(e, item)}
                    className={`group relative flex flex-col gap-3 rounded-xl border select-none touch-none transition-all duration-200 ${
                      isBeingDragged
                        ? 'border-2 border-dashed border-brand-primary/50 bg-brand-primary/5 dark:border-brand-primary/50 dark:bg-brand-primary/10 opacity-60 shadow-inner scale-[0.98] min-h-[120px]'
                        : 'border-slate-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-md cursor-grab active:cursor-grabbing hover:-translate-y-1 hover:shadow-lg hover:shadow-brand-primary/10 dark:border-slate-700/50 dark:bg-slate-800/70'
                    }`}
                  >
                  {!isBeingDragged && (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100 leading-snug select-none">{item.title}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditCard(item)}
                            title="Bearbeiten"
                            className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M13.5 3.5a1.5 1.5 0 012.12 2.12L6.5 14.75 3 15.5l.75-3.5L13.5 3.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCard(item)}
                            title="Löschen"
                            className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                          >
                            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                              <path d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m3 0-.7 10.5a1.5 1.5 0 01-1.5 1.5H6.2a1.5 1.5 0 01-1.5-1.5L4 6h12z" />
                            </svg>
                          </button>
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-slate-400 opacity-60 group-hover:opacity-100 dark:text-slate-400 transition-opacity">
                            <title>Ziehen zum Verschieben</title>
                            <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM13 4a1 1 0 11-2 0 1 1 0 012 0zM13 10a1 1 0 11-2 0 1 1 0 012 0zM13 16a1 1 0 11-2 0 1 1 0 012 0z" />
                          </svg>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
                            {item.referenceCode}
                          </span>
                        </div>
                      </div>

                      {item.description && (
                        <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400 select-none">{item.description}</p>
                      )}

                      <div className="flex items-center gap-2">
                        <div className="relative" title="Priorität ändern">
                          <select
                            value={item.priority}
                            onChange={(e) => handlePriorityChange(item, e.target.value as WorkItemPriority)}
                            className="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
                          >
                            <option value="Low" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Low</option>
                            <option value="Medium" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Medium</option>
                            <option value="High" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">High</option>
                            <option value="Urgent" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Urgent</option>
                          </select>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium}`}>
                            {item.priority}
                          </span>
                        </div>
                        <div className="relative" title="Typ ändern">
                          <select
                            value={item.category ?? ''}
                            onChange={(e) => handleCategoryChange(item, e.target.value as WorkItemCategory | '')}
                            className="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
                          >
                            <option value="" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Kein Typ</option>
                            <option value="Feature" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Feature</option>
                            <option value="Bug" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Bug</option>
                            <option value="Chore" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Chore</option>
                          </select>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              item.category ? CATEGORY_COLORS[item.category] : 'bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-300'
                            }`}
                          >
                            {item.category ? CATEGORY_LABELS[item.category] : '+ Typ'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/50">
                        {/* Assignee Avatar Dropdown */}
                        <div className="relative" title="Zuständigen ändern">
                          <select
                            value={item.assigneeId ?? ''}
                            onChange={(e) => handleAssign(item, e.target.value)}
                            className="absolute inset-0 z-10 w-full h-full cursor-pointer opacity-0"
                          >
                            <option value="" className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">Nicht zugewiesen</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id} className="text-slate-900 bg-white dark:text-slate-100 dark:bg-slate-800">{u.displayName}</option>
                            ))}
                          </select>
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 ring-2 ring-white transition-all group-hover:ring-brand-primary/30 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-800 dark:group-hover:ring-brand-primary/30">
                            {item.assigneeId ? getInitials(users.find(u => u.id === item.assigneeId)?.displayName) : (
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-50"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </li>
                  {isDragOverAfter && activeDrag && (
                    <li data-drag-placeholder="true" style={{ height: activeDrag.cardHeight }} className="rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary/5 transition-all duration-200" />
                  )}
                </Fragment>
              )
            })}
          </div>
        </section>
      ))}

      {/* Floating Pointer Drag Overlay */}
      {activeDrag && (
        <div
          style={{
            position: 'fixed',
            left: activeDrag.currentX - activeDrag.offsetX,
            top: activeDrag.currentY - activeDrag.offsetY,
            width: activeDrag.cardWidth,
            pointerEvents: 'none',
            zIndex: 99999,
            transform: dragOverTrash 
              ? 'scale(0.15) rotate(15deg)' 
              : (dragOverColumnId && dragOverColumnId !== activeDrag.startColumnId)
                ? 'scale(0.95) rotate(0deg)'
                : 'rotate(2.5deg) scale(1.02)',
            transformOrigin: `${activeDrag.offsetX}px ${activeDrag.offsetY}px`,
            opacity: dragOverTrash ? 0.3 : 1,
            transition: 'transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.3s ease-out',
          }}
          className={`flex flex-col gap-3 rounded-xl border-2 bg-white p-5 shadow-2xl dark:bg-slate-800 select-none ${
            dragOverTrash 
              ? 'border-rose-500 shadow-rose-500/50' 
              : 'border-brand-primary dark:border-brand-primary-light'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-slate-900 dark:text-white leading-snug">{activeDrag.item.title}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-primary">
                <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM13 4a1 1 0 11-2 0 1 1 0 012 0zM13 10a1 1 0 11-2 0 1 1 0 012 0zM13 16a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-600 dark:bg-slate-700/80 dark:text-slate-200">
                {activeDrag.item.referenceCode}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${PRIORITY_COLORS[activeDrag.item.priority] || PRIORITY_COLORS.Medium}`}>
              {activeDrag.item.priority}
            </span>
            {activeDrag.item.category && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${CATEGORY_COLORS[activeDrag.item.category]}`}>
                {CATEGORY_LABELS[activeDrag.item.category]}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/50">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 ring-2 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-800">
              {activeDrag.item.assigneeId ? getInitials(users.find(u => u.id === activeDrag.item.assigneeId)?.displayName) : (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-50"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
              )}
            </div>
            <div
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                dragOverTrash
                  ? 'bg-rose-500 text-white'
                  : 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light'
              }`}
            >
              {dragOverTrash ? 'Löschen' : board.columns.find(c => c.id === (dragOverColumnId || activeDrag.item.columnId))?.name}
            </div>
          </div>
        </div>
      )}
    </div>

      {/* Drag-to-Delete Trash Zone */}
      {activeDrag && (
        <div
          data-trash-target="true"
          className={`fixed bottom-8 right-8 z-[100000] flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-xl transition-all duration-300 ${
            dragOverTrash
              ? 'scale-125 border-rose-500 bg-rose-500 text-white shadow-rose-500/40 shadow-2xl'
              : 'scale-100 border-rose-200 bg-white text-rose-500 dark:border-rose-900/60 dark:bg-slate-800 dark:text-rose-400'
          }`}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`h-7 w-7 pointer-events-none transition-transform duration-300 ${dragOverTrash ? 'scale-110' : ''}`}>
            <path d="M4 6h12M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2m3 0-.7 10.5a1.5 1.5 0 01-1.5 1.5H6.2a1.5 1.5 0 01-1.5-1.5L4 6h12z" />
          </svg>
        </div>
      )}

      {cardContextMenu && (
        <ContextMenu
          x={cardContextMenu.x}
          y={cardContextMenu.y}
          items={cardContextMenuItems(cardContextMenu.item)}
          onClose={() => setCardContextMenu(null)}
        />
      )}

      {columnContextMenu && (
        <ContextMenu
          x={columnContextMenu.x}
          y={columnContextMenu.y}
          items={[{ label: 'Neue Karte anlegen', onClick: () => toggleAddColumn(columnContextMenu.column.id, true) }]}
          onClose={() => setColumnContextMenu(null)}
        />
      )}

      {editTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40" onClick={() => setEditTarget(null)}>
          <form
            onSubmit={submitEditCard}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-sm space-y-4 rounded-xl p-5"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Karte bearbeiten</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Titel</label>
              <input
                autoFocus
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditTarget(null)
                }}
                className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">Notizen</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditTarget(null)
                }}
                rows={4}
                className="w-full resize-none rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!editTitle.trim()}
                className="rounded-lg bg-brand-accent px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-brand-accent-light hover:shadow-brand-accent/30 disabled:opacity-50 disabled:shadow-none"
              >
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteConfirmTarget}
        title="Karte löschen"
        message={
          deleteConfirmTarget ? (
            <>
              Möchtest du die Karte <strong>"{deleteConfirmTarget.title}"</strong> wirklich löschen?<br />
              Diese Aktion kann nicht rückgängig gemacht werden.
            </>
          ) : ''
        }
        confirmLabel="Löschen"
        isDanger={true}
        onConfirm={executeDeleteCard}
        onCancel={() => setDeleteConfirmTarget(null)}
      />
    </div>
  )
}
