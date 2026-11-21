import http from 'node:http'
import https from 'node:https'

export interface ProjectSummary {
  id: string
  name: string
  description: string | null
  openWorkItemCount: number
  boardId: string | null
}

export interface BoardColumnDto {
  id: string
  name: string
  order: number
  type: 'Todo' | 'InProgress' | 'Done'
  isDefault: boolean
  isHidden: boolean
}

export interface BoardDto {
  id: string
  projectId: string
  name: string
  columns: BoardColumnDto[]
}

export interface WorkItemDto {
  id: string
  referenceCode: string
  boardId: string
  columnId: string
  columnName: string
  columnType: 'Todo' | 'InProgress' | 'Done'
  parentWorkItemId: string | null
  title: string
  description: string | null
  type: 'Task' | 'Phase'
  priority: 'Low' | 'Medium' | 'High' | 'Urgent'
  category: string | null
  position: number
  assigneeId: string | null
  assigneeDisplayName: string | null
  startDate: string | null
  dueDate: string | null
  createdAt: string
  updatedAt: string
  labelIds: string[]
  blockingWorkItemIds: string[]
  blockedByMilestoneIds: string[]
}

export interface NoteDto {
  id: string
  title: string
  content: string
  color: string | null
  createdAt: string
  updatedAt: string
}

export class MilepointClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly insecureTls: boolean

  constructor(baseUrl: string, apiKey: string, insecureTls = false) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey.trim()
    this.insecureTls = insecureTls
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`)
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const isHttps = url.protocol === 'https:'

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    }
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload).toString()
    }

    const response = await new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
      const transport = isHttps ? https : http
      const req = transport.request(
        url,
        {
          method,
          headers,
          rejectUnauthorized: isHttps ? !this.insecureTls : undefined,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              bodyText: Buffer.concat(chunks).toString('utf8'),
            })
          })
        }
      )

      req.on('error', (err) => reject(err))
      if (payload !== undefined) {
        req.write(payload)
      }
      req.end()
    })

    if (response.status < 200 || response.status >= 300) {
      const detail = response.bodyText.trim() || `HTTP ${response.status}`
      throw new Error(`Milepoint API error (${response.status} ${method} ${path}): ${detail}`)
    }

    if (!response.bodyText) {
      return undefined as T
    }

    return JSON.parse(response.bodyText) as T
  }

  listProjects(): Promise<ProjectSummary[]> {
    return this.request<ProjectSummary[]>('GET', '/api/projects')
  }

  listBoards(projectId: string): Promise<BoardDto[]> {
    return this.request<BoardDto[]>('GET', `/api/projects/${encodeURIComponent(projectId)}/boards`)
  }

  listWorkItems(boardId: string): Promise<WorkItemDto[]> {
    return this.request<WorkItemDto[]>('GET', `/api/boards/${encodeURIComponent(boardId)}/workitems`)
  }

  createWorkItem(
    boardId: string,
    payload: {
      columnId: string
      title: string
      description?: string | null
      type: 'Task' | 'Phase'
      priority: 'Low' | 'Medium' | 'High' | 'Urgent'
      parentWorkItemId?: string | null
      startDate?: string | null
      dueDate?: string | null
      category?: string | null
    }
  ): Promise<WorkItemDto> {
    return this.request<WorkItemDto>('POST', `/api/boards/${encodeURIComponent(boardId)}/workitems`, payload)
  }

  updateWorkItem(
    boardId: string,
    workItemId: string,
    payload: {
      title: string
      description: string | null
      type: 'Task' | 'Phase'
      priority: 'Low' | 'Medium' | 'High' | 'Urgent'
      assigneeId: string | null
      parentWorkItemId: string | null
      startDate: string | null
      dueDate: string | null
      category: string | null
    }
  ): Promise<WorkItemDto> {
    return this.request<WorkItemDto>(
      'PUT',
      `/api/boards/${encodeURIComponent(boardId)}/workitems/${encodeURIComponent(workItemId)}`,
      payload
    )
  }

  moveWorkItem(boardId: string, workItemId: string, targetColumnId: string, position: number): Promise<WorkItemDto> {
    return this.request<WorkItemDto>(
      'PUT',
      `/api/boards/${encodeURIComponent(boardId)}/workitems/${encodeURIComponent(workItemId)}/move`,
      { targetColumnId, position }
    )
  }

  listNotes(projectId: string): Promise<NoteDto[]> {
    return this.request<NoteDto[]>('GET', `/api/projects/${encodeURIComponent(projectId)}/notes`)
  }

  createNote(projectId: string, title: string, content: string, color?: string | null): Promise<NoteDto> {
    return this.request<NoteDto>('POST', `/api/projects/${encodeURIComponent(projectId)}/notes`, {
      title,
      content,
      color: color ?? null,
    })
  }
}
