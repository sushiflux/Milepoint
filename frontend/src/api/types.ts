export interface AuthResponse {
  token: string
  expiresAt: string
  username: string
  email: string
  displayName: string
  roles: string[]
}

export interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  isOwner: boolean
  myAssignedTaskCount: number
  myCompletedTaskCount: number
  openTicketCount: number
  /** Project-wide completion if isOwner, otherwise your own task completion. */
  completionPercent: number
}

export type BoardColumnType = 'Todo' | 'InProgress' | 'Done'

export interface BoardColumn {
  id: string
  name: string
  order: number
  wipLimit: number | null
  type: BoardColumnType
}

export interface Board {
  id: string
  name: string
  createdAt: string
  columns: BoardColumn[]
}

export type WorkItemType = 'Task' | 'Bug' | 'Feature' | 'Epic'
export type WorkItemPriority = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface WorkItem {
  id: string
  referenceCode: string
  columnId: string
  title: string
  description: string | null
  type: WorkItemType
  priority: WorkItemPriority
  position: number
  assigneeId: string | null
  assigneeDisplayName: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labelIds: string[]
}
