export interface AuthResponse {
  token: string
  expiresAt: string
  username: string
  email: string
  displayName: string
}

export interface Project {
  id: string
  key: string
  name: string
  description: string | null
  createdAt: string
}

export interface BoardColumn {
  id: string
  name: string
  order: number
  wipLimit: number | null
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
