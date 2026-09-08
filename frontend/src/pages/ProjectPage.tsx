import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { createBoard, getBoards, getProjects } from '../api/projects'
import { getTimeline } from '../api/timeline'
import { getNotes } from '../api/notes'
import { getUsers, type UserSummary } from '../api/users'
import type { Board, Milestone, Note, Project, WorkItem } from '../api/types'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import TimelineView from './TimelineView'
import KanbanBoard from './KanbanBoard'
import NotesView from './NotesView'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'

type Tab = 'timeline' | 'kanban' | 'notes'
const VALID_TABS: Tab[] = ['timeline', 'kanban', 'notes']

export default function ProjectPage() {
  const { projectId, tab } = useParams<{ projectId: string; tab: string }>()
  // authVersion changes on every successful (re-)login - see AuthContext's doc comment on why
  // this needs to be a load dependency, not just projectId.
  const { authVersion } = useAuth()

  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!projectId) return

    Promise.all([getProjects(), getBoards(projectId), getTimeline(projectId), getNotes(projectId), getUsers()])
      .then(async ([projects, boardList, timeline, noteList, userList]) => {
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
      })
      .catch((err) => {
        // Without this, a 401 (session expired mid-load) rejected the whole Promise.all with
        // nothing catching it - loading never left "true" (stuck on the spinner forever) and the
        // rejection surfaced only as an unhandled promise error in the console. A 401 specifically
        // resolves itself once the user logs back in via SessionExpiredModal (authVersion below
        // retriggers this effect then) - other errors get a visible message plus a retry button
        // instead of silently spinning forever.
        if (err instanceof ApiError && err.status === 401) {
          return
        }
        setLoadError(err instanceof ApiError ? err.message || 'Projekt konnte nicht geladen werden.' : 'Projekt konnte nicht geladen werden.')
        setLoading(false)
      })
  }, [projectId, authVersion, retryCount])

  if (!projectId) return null

  if (!tab || !VALID_TABS.includes(tab as Tab)) {
    return <Navigate to={`/projects/${projectId}/timeline`} replace />
  }
  const activeTab = tab as Tab

  if (loadError) {
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm font-medium text-red-500 dark:text-red-400">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null)
              setLoading(true)
              setRetryCount((c) => c + 1)
            }}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light"
          >
            Erneut versuchen
          </button>
        </div>
      </div>
    )
  }

  if (loading || !project || !board) {
    return (
      <div className="flex h-screen w-full items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-primary dark:border-slate-800 dark:border-t-brand-primary-light"></div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-200">Projekt wird geladen…</p>
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

          {activeTab === 'notes' && <NotesView projectId={projectId} projectName={project.name} notes={notes} onNotesChange={setNotes} />}
          </main>
        </div>
      </div>
    </div>
  )
}
