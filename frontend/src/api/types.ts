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

export interface ColumnTicketCount {
  columnName: string
  count: number
  /** Timeline-vs-Kanban-only split of this column's own count. */
  timelineCount: number
  kanbanOnlyCount: number
}

export interface Project {
  id: string
  name: string
  description: string | null
  createdAt: string
  isOwner: boolean
  isFavorite: boolean
  /** Project-wide completion if isOwner, otherwise your own task completion. */
  completionPercent: number
  /** Of that same population - how many have a Timeline date (StartDate/DueDate) set vs. are Kanban-only. */
  timelineItemCount: number
  kanbanOnlyItemCount: number
  /** Open (non-Done) Task counts per board column, in column order - e.g. Neu / In Arbeit / Pausiert. */
  openTicketsByColumn: ColumnTicketCount[]
  /** Same breakdown, but only counting Tasks assigned to the current user. */
  myTicketsByColumn: ColumnTicketCount[]
  /** Timeline-vs-Kanban-only split of the open tickets openTicketsByColumn/myTicketsByColumn total up to. */
  openTimelineCount: number
  openKanbanOnlyCount: number
  myOpenTimelineCount: number
  myOpenKanbanOnlyCount: number
  /** Open Tasks with a DueDate in the past - project-wide, and just the current user's. */
  overdueCount: number
  myOverdueCount: number
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
export type WorkItemCategory = 'Feature' | 'Bug' | 'Chore'

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
  category: WorkItemCategory | null
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

// Mirrors backend Models/NoteShape.cs (serialized as a string by the default System.Text.Json
// enum behavior used across this API). Null means "no explicit shape chosen" - rendered the same
// as 'Rounded' but distinct so a future default change doesn't silently reinterpret existing data.
export type NoteShape = 'Rounded' | 'Rectangle' | 'Diamond' | 'Underline' | 'Ellipse'

export interface Note {
  id: string
  title: string
  content: string
  // Parent/child hierarchy for the radial tree view - separate from the free-form
  // outgoingLinks/incomingLinks cross-links above. Null parentNoteId means a root-level note.
  parentNoteId: string | null
  childNoteIds: string[]
  outgoingLinks: NoteLinkRef[]
  incomingLinks: NoteLinkRef[]
  // Concrete hex color (e.g. "#3b82f6") for this note's node in the graph/tree views, or null to
  // use the view's default neutral color. Palette/"scheme" selection is a frontend-only concept
  // (see notesGraph/colorSchemes.ts) - the backend only ever stores/returns the resolved color.
  color: string | null
  shape: NoteShape | null
  createdAt: string
  updatedAt: string
}

// Mirrors backend Models/TranscriptionEnums.cs's TranscriptionProvider enum (serialized as a
// string by the default System.Text.Json enum behavior used across this API).
export type TranscriptionProvider = 'Browser' | 'Whisper' | 'OpenAI' | 'Google'

// Mirrors Dtos/TranscriptionSettings/TranscriptionSettingsDtos.cs's TranscriptionSettingsResponse.
export interface TranscriptionSettings {
  provider: TranscriptionProvider
  whisperEndpointUrl: string | null
  language: string
  hasOpenAiKey: boolean
  hasGoogleKey: boolean
  autoSummarize: boolean
}

// Mirrors UpdateTranscriptionSettingsRequest. openAiApiKey/googleApiKey are tri-state: omit/undefined
// (or null) leaves the stored key untouched, '' clears it, a non-empty string replaces it - see the
// backend DTO's own doc comment for the full rationale. Callers must not collapse this to a simple
// falsy check.
export interface UpdateTranscriptionSettingsRequest {
  provider: TranscriptionProvider
  whisperEndpointUrl: string | null
  language: string
  openAiApiKey?: string | null
  googleApiKey?: string | null
  autoSummarize: boolean
}
