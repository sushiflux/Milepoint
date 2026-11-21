#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { MilepointClient, type BoardColumnDto, type BoardDto, type ProjectSummary, type WorkItemDto } from './client.js'

const milepointUrl = process.env.MILEPOINT_URL?.trim()
const milepointApiKey = process.env.MILEPOINT_API_KEY?.trim()
const insecureTls = process.env.MILEPOINT_INSECURE_TLS === 'true' || process.env.MILEPOINT_INSECURE_TLS === '1'

if (!milepointUrl || !milepointApiKey) {
  console.error('Missing required environment variables: MILEPOINT_URL and MILEPOINT_API_KEY must be set.')
  process.exit(1)
}

const client = new MilepointClient(milepointUrl, milepointApiKey, insecureTls)

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  }
}

async function resolveProject(projectRef: string): Promise<ProjectSummary> {
  const projects = await client.listProjects()
  const needle = projectRef.trim().toLowerCase()
  const exactId = projects.find((p) => p.id.toLowerCase() === needle)
  if (exactId) return exactId

  const exactName = projects.find((p) => p.name.trim().toLowerCase() === needle)
  if (exactName) return exactName

  const partial = projects.filter((p) => p.name.toLowerCase().includes(needle))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) {
    throw new Error(
      `Multiple projects match "${projectRef}": ${partial.map((p) => `${p.name} (${p.id})`).join(', ')}. Please be more specific.`
    )
  }

  throw new Error(
    `Project "${projectRef}" not found. Available projects: ${projects.map((p) => `${p.name} (${p.id})`).join(', ') || 'none'}.`
  )
}

async function resolveBoard(projectId: string, boardId?: string): Promise<BoardDto> {
  const boards = await client.listBoards(projectId)
  if (boards.length === 0) {
    throw new Error(`Project ${projectId} has no boards yet.`)
  }
  if (!boardId) return boards[0]

  const match = boards.find((b) => b.id === boardId || b.name.toLowerCase() === boardId.trim().toLowerCase())
  if (!match) {
    throw new Error(`Board "${boardId}" not found. Available: ${boards.map((b) => `${b.name} (${b.id})`).join(', ')}.`)
  }
  return match
}

function resolveColumn(board: BoardDto, columnRef?: string): BoardColumnDto {
  const visibleColumns = [...board.columns].filter((c) => !c.isHidden).sort((a, b) => a.order - b.order)
  if (visibleColumns.length === 0) {
    throw new Error(`Board "${board.name}" has no visible columns.`)
  }

  if (!columnRef) {
    return visibleColumns.find((c) => c.type === 'Todo') ?? visibleColumns[0]
  }

  const needle = columnRef.trim().toLowerCase()
  const match =
    visibleColumns.find((c) => c.id.toLowerCase() === needle) ??
    visibleColumns.find((c) => c.name.trim().toLowerCase() === needle) ??
    visibleColumns.find((c) => c.name.toLowerCase().includes(needle))

  if (!match) {
    throw new Error(
      `Column "${columnRef}" not found on board "${board.name}". Visible columns: ${visibleColumns.map((c) => `${c.name} (${c.id})`).join(', ')}.`
    )
  }
  return match
}

async function resolveWorkItem(boardId: string, itemRef: string): Promise<WorkItemDto> {
  const items = await client.listWorkItems(boardId)
  const needle = itemRef.trim().toLowerCase()
  const match =
    items.find((w) => w.id.toLowerCase() === needle) ??
    items.find((w) => w.referenceCode.toLowerCase() === needle)

  if (!match) {
    throw new Error(`Work item "${itemRef}" not found on board ${boardId}.`)
  }
  return match
}

const server = new McpServer({
  name: 'milepoint',
  version: '1.0.0',
})

server.tool(
  'list_projects',
  'List all Milepoint projects visible to the authenticated user.',
  {},
  async () => {
    const projects = await client.listProjects()
    return textResult(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        openWorkItemCount: p.openWorkItemCount,
        boardId: p.boardId,
      }))
    )
  }
)

server.tool(
  'list_boards',
  'List boards and their Kanban columns for a Milepoint project (by project ID or name).',
  {
    project: z.string().describe('Project ID or project name'),
  },
  async ({ project }) => {
    const resolved = await resolveProject(project)
    const boards = await client.listBoards(resolved.id)
    return textResult({
      project: { id: resolved.id, name: resolved.name },
      boards: boards.map((b) => ({
        id: b.id,
        name: b.name,
        columns: [...b.columns]
          .sort((a, c) => a.order - c.order)
          .map((c) => ({ id: c.id, name: c.name, type: c.type, isHidden: c.isHidden })),
      })),
    })
  }
)

server.tool(
  'list_work_items',
  'List cards/work items in a Milepoint project, optionally filtered by column, category, priority, or search text.',
  {
    project: z.string().describe('Project ID or project name'),
    column: z.string().optional().describe('Optional column name or ID filter'),
    category: z.string().optional().describe('Optional category filter (e.g. Bug, Feature, Chore)'),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().describe('Optional priority filter'),
    search: z.string().optional().describe('Optional case-insensitive substring match against title or description'),
    includeDone: z.boolean().optional().default(true).describe('Whether to include items in Done columns'),
  },
  async ({ project, column, category, priority, search, includeDone }) => {
    const resolvedProject = await resolveProject(project)
    const board = await resolveBoard(resolvedProject.id)
    let items = await client.listWorkItems(board.id)

    if (!includeDone) {
      items = items.filter((w) => w.columnType !== 'Done')
    }
    if (column) {
      const needle = column.trim().toLowerCase()
      items = items.filter((w) => w.columnId.toLowerCase() === needle || w.columnName.toLowerCase().includes(needle))
    }
    if (category) {
      const needle = category.trim().toLowerCase()
      items = items.filter((w) => (w.category ?? '').toLowerCase() === needle)
    }
    if (priority) {
      items = items.filter((w) => w.priority === priority)
    }
    if (search) {
      const needle = search.trim().toLowerCase()
      items = items.filter(
        (w) =>
          w.title.toLowerCase().includes(needle) ||
          (w.description ?? '').toLowerCase().includes(needle) ||
          w.referenceCode.toLowerCase().includes(needle)
      )
    }

    return textResult({
      project: { id: resolvedProject.id, name: resolvedProject.name },
      boardId: board.id,
      count: items.length,
      items: items.map((w) => ({
        id: w.id,
        referenceCode: w.referenceCode,
        title: w.title,
        description: w.description,
        column: w.columnName,
        columnType: w.columnType,
        type: w.type,
        priority: w.priority,
        category: w.category,
        dueDate: w.dueDate,
        updatedAt: w.updatedAt,
      })),
    })
  }
)

server.tool(
  'create_work_item',
  'Create a new Kanban card/work item in a Milepoint project.',
  {
    project: z.string().describe('Project ID or project name'),
    title: z.string().min(1).describe('Card title'),
    description: z.string().optional().describe('Optional Markdown description'),
    column: z.string().optional().describe('Target column name or ID (defaults to the first visible Todo column)'),
    category: z.string().optional().describe('Optional project category name such as "Bug", "Feature", or "Chore"'),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional().default('Medium'),
    type: z.enum(['Task', 'Phase']).optional().default('Task'),
    startDate: z.string().optional().describe('Optional ISO 8601 start date'),
    dueDate: z.string().optional().describe('Optional ISO 8601 due date'),
  },
  async ({ project, title, description, column, category, priority, type, startDate, dueDate }) => {
    const resolvedProject = await resolveProject(project)
    const board = await resolveBoard(resolvedProject.id)
    const targetColumn = resolveColumn(board, column)

    const created = await client.createWorkItem(board.id, {
      columnId: targetColumn.id,
      title: title.trim(),
      description: description ?? null,
      type,
      priority,
      parentWorkItemId: null,
      startDate: startDate ?? null,
      dueDate: dueDate ?? null,
      category: category ?? null,
    })

    return textResult({
      created: true,
      project: resolvedProject.name,
      item: {
        id: created.id,
        referenceCode: created.referenceCode,
        title: created.title,
        column: created.columnName,
        priority: created.priority,
        category: created.category,
        type: created.type,
      },
    })
  }
)

server.tool(
  'update_work_item',
  'Update fields of an existing Milepoint card (identified by ID or referenceCode such as TSK-12).',
  {
    project: z.string().describe('Project ID or project name'),
    workItem: z.string().describe('Work item ID or referenceCode (e.g. TSK-12)'),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    type: z.enum(['Task', 'Phase']).optional(),
    category: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
  },
  async ({ project, workItem, title, description, priority, type, category, startDate, dueDate }) => {
    const resolvedProject = await resolveProject(project)
    const board = await resolveBoard(resolvedProject.id)
    const existing = await resolveWorkItem(board.id, workItem)

    const updated = await client.updateWorkItem(board.id, existing.id, {
      title: title !== undefined ? title.trim() : existing.title,
      description: description !== undefined ? description : existing.description,
      type: type ?? existing.type,
      priority: priority ?? existing.priority,
      assigneeId: existing.assigneeId,
      parentWorkItemId: existing.parentWorkItemId,
      startDate: startDate !== undefined ? startDate : existing.startDate,
      dueDate: dueDate !== undefined ? dueDate : existing.dueDate,
      category: category !== undefined ? category : existing.category,
    })

    return textResult({
      updated: true,
      item: {
        id: updated.id,
        referenceCode: updated.referenceCode,
        title: updated.title,
        column: updated.columnName,
        priority: updated.priority,
        category: updated.category,
      },
    })
  }
)

server.tool(
  'move_work_item',
  'Move a Milepoint card to another Kanban column (by column name or ID).',
  {
    project: z.string().describe('Project ID or project name'),
    workItem: z.string().describe('Work item ID or referenceCode (e.g. TSK-12)'),
    targetColumn: z.string().describe('Target column name or ID'),
    position: z.number().int().min(0).optional().default(0).describe('0-based position inside the target column'),
  },
  async ({ project, workItem, targetColumn, position }) => {
    const resolvedProject = await resolveProject(project)
    const board = await resolveBoard(resolvedProject.id)
    const existing = await resolveWorkItem(board.id, workItem)
    const column = resolveColumn(board, targetColumn)

    const moved = await client.moveWorkItem(board.id, existing.id, column.id, position)
    return textResult({
      moved: true,
      referenceCode: moved.referenceCode,
      title: moved.title,
      column: moved.columnName,
    })
  }
)

server.tool(
  'list_notes',
  'List wiki-style notes in a Milepoint project.',
  {
    project: z.string().describe('Project ID or project name'),
  },
  async ({ project }) => {
    const resolvedProject = await resolveProject(project)
    const notes = await client.listNotes(resolvedProject.id)
    return textResult({
      project: resolvedProject.name,
      count: notes.length,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        updatedAt: n.updatedAt,
      })),
    })
  }
)

server.tool(
  'create_note',
  'Create a new note in a Milepoint project.',
  {
    project: z.string().describe('Project ID or project name'),
    title: z.string().min(1).describe('Note title (must be unique in the project)'),
    content: z.string().describe('Markdown content'),
  },
  async ({ project, title, content }) => {
    const resolvedProject = await resolveProject(project)
    const note = await client.createNote(resolvedProject.id, title.trim(), content)
    return textResult({
      created: true,
      project: resolvedProject.name,
      note: { id: note.id, title: note.title },
    })
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Milepoint MCP server failed:', err)
  process.exit(1)
})
