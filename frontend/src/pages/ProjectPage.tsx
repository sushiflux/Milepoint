import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { createBoard, getBoards, getProjects } from '../api/projects'
import { getTimeline } from '../api/timeline'
import { getNotes } from '../api/notes'
import { getUsers, type UserSummary } from '../api/users'
import type { Board, Milestone, Note, Project, WorkItem } from '../api/types'
import TimelineView from './TimelineView'
import KanbanBoard from './KanbanBoard'
import NotesView from './NotesView'
import Sidebar from '../components/Sidebar'

type Tab = 'timeline' | 'kanban' | 'notes'
const VALID_TABS: Tab[] = ['timeline', 'kanban', 'notes']

export default function ProjectPage() {
  const { projectId, tab } = useParams<{ projectId: string; tab: string }>()

  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return

    Promise.all([getProjects(), getBoards(projectId), getTimeline(projectId), getNotes(projectId), getUsers()]).then(
      async ([projects, boardList, timeline, noteList, userList]) => {
        setProject(projects.find((p) => p.id === projectId) ?? null)
        // Every project gets a board automatically on creation - this only provisions one for
        // projects that predate that (or somehow still have none), so Kanban always has columns.
        const resolvedBoard = boardList[0] ?? (await createBoard(projectId, 'Board'))
        setBoard(resolvedBoard)
        setWorkItems(timeline.workItems)
        setMilestones(timeline.milestones)
        setNotes(noteList)
        setUsers(userList)
        setLoading(false)
      },
    )
  }, [projectId])

  if (!projectId) return null

  if (!tab || !VALID_TABS.includes(tab as Tab)) {
    return <Navigate to={`/projects/${projectId}/timeline`} replace />
  }
  const activeTab = tab as Tab

  if (loading || !project || !board) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Projekt wird geladen…</div>
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar project={{ id: project.id, name: project.name }} activeTab={activeTab} />

      <div className="min-w-0 flex-1">
        <main className="p-6">
          {activeTab === 'timeline' && (
            <TimelineView
              projectId={projectId}
              boards={[board]}
              workItems={workItems}
              milestones={milestones}
              onWorkItemsChange={setWorkItems}
              onMilestonesChange={setMilestones}
            />
          )}

          {activeTab === 'kanban' && <KanbanBoard board={board} items={workItems} users={users} onItemsChange={setWorkItems} />}

          {activeTab === 'notes' && <NotesView projectId={projectId} notes={notes} onNotesChange={setNotes} />}
        </main>
      </div>
    </div>
  )
}
