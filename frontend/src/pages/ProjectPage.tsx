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
import Header from '../components/Header'

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
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-primary dark:border-slate-800 dark:border-t-brand-primary-light"></div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Projekt wird geladen…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar project={{ id: project.id, name: project.name }} activeTab={activeTab} />

        <div className="min-w-0 flex-1 overflow-y-auto">
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
    </div>
  )
}
