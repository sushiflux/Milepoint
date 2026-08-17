import { apiFetch } from './client'
import type { WorkItem, WorkItemCategory, WorkItemPriority, WorkItemType } from './types'

export const getWorkItems = (boardId: string) => apiFetch<WorkItem[]>(`/boards/${boardId}/workitems`)

export interface CreateWorkItemOptions {
  parentWorkItemId?: string | null
  startDate?: string | null
  dueDate?: string | null
  category?: WorkItemCategory | null
}

export const createWorkItem = (
  boardId: string,
  columnId: string,
  title: string,
  type: WorkItemType,
  priority: WorkItemPriority,
  description?: string,
  options?: CreateWorkItemOptions,
) =>
  apiFetch<WorkItem>(`/boards/${boardId}/workitems`, {
    method: 'POST',
    body: JSON.stringify({
      columnId,
      title,
      description,
      type,
      priority,
      parentWorkItemId: options?.parentWorkItemId ?? null,
      startDate: options?.startDate ?? null,
      dueDate: options?.dueDate ?? null,
      category: options?.category ?? null,
    }),
  })

export const moveWorkItem = (boardId: string, workItemId: string, targetColumnId: string, position: number) =>
  apiFetch<void>(`/boards/${boardId}/workitems/${workItemId}/move`, {
    method: 'PUT',
    body: JSON.stringify({ targetColumnId, position }),
  })

export const updateWorkItem = (
  boardId: string,
  workItemId: string,
  item: Pick<WorkItem, 'title' | 'description' | 'type' | 'priority' | 'category' | 'assigneeId' | 'parentWorkItemId' | 'startDate' | 'dueDate'>,
) =>
  apiFetch<WorkItem>(`/boards/${boardId}/workitems/${workItemId}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  })

export const addDependency = (boardId: string, workItemId: string, blockingWorkItemId: string) =>
  apiFetch<void>(`/boards/${boardId}/workitems/${workItemId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ blockingWorkItemId }),
  })

export const removeDependency = (boardId: string, workItemId: string, blockingWorkItemId: string) =>
  apiFetch<void>(`/boards/${boardId}/workitems/${workItemId}/dependencies/${blockingWorkItemId}`, {
    method: 'DELETE',
  })

// Deletes the whole subtree (the item and all its descendants), plus any milestones nested under
// it - the backend does the cascading, this call itself returns no body.
export const deleteWorkItem = (boardId: string, workItemId: string) =>
  apiFetch<void>(`/boards/${boardId}/workitems/${workItemId}`, { method: 'DELETE' })
