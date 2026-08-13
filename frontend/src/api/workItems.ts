import { apiFetch } from './client'
import type { WorkItem, WorkItemPriority, WorkItemType } from './types'

export const getWorkItems = (boardId: string) => apiFetch<WorkItem[]>(`/boards/${boardId}/workitems`)

export const createWorkItem = (
  boardId: string,
  columnId: string,
  title: string,
  type: WorkItemType,
  priority: WorkItemPriority,
  description?: string,
) =>
  apiFetch<WorkItem>(`/boards/${boardId}/workitems`, {
    method: 'POST',
    body: JSON.stringify({ columnId, title, description, type, priority }),
  })

export const moveWorkItem = (boardId: string, workItemId: string, targetColumnId: string, position: number) =>
  apiFetch<void>(`/boards/${boardId}/workitems/${workItemId}/move`, {
    method: 'PUT',
    body: JSON.stringify({ targetColumnId, position }),
  })

export const updateWorkItem = (
  boardId: string,
  workItemId: string,
  item: Pick<WorkItem, 'title' | 'description' | 'type' | 'priority' | 'assigneeId' | 'dueDate'>,
) =>
  apiFetch<WorkItem>(`/boards/${boardId}/workitems/${workItemId}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  })
