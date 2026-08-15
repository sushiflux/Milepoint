export interface AuthResponse {
  token: string
  expiresAt: string
  username: string
  email: string
  displayName: string
  roles: string[]
}

export interface ProjectMemberSummary {
  id: string
  displayName: string
}

export interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  isOwner: boolean
  myAssignedTaskCount: number
  myCompletedTaskCount: number
  /** Project-wide completion if isOwner, otherwise your own task completion. */
  completionPercent: number
  openTicketCount: number
  lastActivityAt: string
  nextMilestoneName: string | null
  nextMilestoneDate: string | null
  members: ProjectMemberSummary[]
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

export type WorkItemType = 'Task' | 'Phase'
export type WorkItemPriority = 'Low' | 'Medium' | 'High' | 'Urgent'

export interface WorkItem {
  id: string
  referenceCode: string
  boardId: string
  columnId: string
  columnName: string
  columnType: BoardColumnType
  parentWorkItemId: string | null
  title: string
  description: string | null
  type: WorkItemType
  priority: WorkItemPriority
  position: number
  assigneeId: string | null
  assigneeDisplayName: string | null
  startDate: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labelIds: string[]
  blockingWorkItemIds: string[]
  /** Milestones that must be reached (date passed) before this work item may leave Todo. */
  blockedByMilestoneIds: string[]
}

export type MilestoneDependencyDirection = 'WorkItemBlocksMilestone' | 'MilestoneBlocksWorkItem'

export interface Milestone {
  id: string
  name: string
  description: string | null
  date: string
  createdAt: string
  /** Visual nesting under a Phase/Task's subtree on the Timeline - null means top-level. */
  parentWorkItemId: string | null
  /** Work items that must reach a Done column before this milestone counts as reached. */
  blockedByWorkItemIds: string[]
  /** Work items that may not leave Todo until this milestone's date has passed. */
  blockingWorkItemIds: string[]
}

export interface Timeline {
  workItems: WorkItem[]
  milestones: Milestone[]
}

export interface NoteLinkRef {
  id: string
  title: string
}

export interface Note {
  id: string
  title: string
  content: string
  outgoingLinks: NoteLinkRef[]
  incomingLinks: NoteLinkRef[]
  createdAt: string
  updatedAt: string
}
