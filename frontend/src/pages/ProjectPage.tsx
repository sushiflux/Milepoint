import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { createBoard, getBoards, getProjects } from '../api/projects'
import { getTimeline } from '../api/timeline'
import { getNotes } from '../api/notes'
import type { Board, Milestone, Note, Project, WorkItem } from '../api/types'
import TimelineView from './TimelineView'
import NotesView from './NotesView'
import Sidebar from '../components/Sidebar'

type Tab = 'timeline' | 'kanban' | 'notes'
const VALID_TABS: Tab[] = ['timeline', 'kanban', 'notes']

export default function ProjectPage() {
  const { projectId, tab } = useParams<{ projectId: string; tab: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return

    Promise.all([getProjects(), getBoards(projectId), getTimeline(projectId), getNotes(projectId)]).then(
      ([projects, boardList, timeline, noteList]) => {
        setProject(projects.find((p) => p.id === projectId) ?? null)
        setBoards(boardList)
        setWorkItems(timeline.workItems)
        setMilestones(timeline.milestones)
        setNotes(noteList)
        setLoading(false)
      },
    )
  }, [projectId])

  async function handleCreateBoard() {
    if (!projectId) return
    const board = await createBoard(projectId, 'Board')
    setBoards((prev) => [...prev, board])
  }

  if (!projectId) return null

  if (!tab || !VALID_TABS.includes(tab as Tab)) {
    return <Navigate to={`/projects/${projectId}/timeline`} replace />
  }
  const activeTab = tab as Tab

  if (loading || !project) {
    return <div className="p-6 text-slate-500 dark:text-slate-400">Projekt wird geladen…</div>
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar project={{ id: project.id, name: project.name }} activeTab={activeTab} />

      <div className="flex-1">
        <main className="p-6">
          {activeTab === 'timeline' && (
            <TimelineView
              projectId={projectId}
              boards={boards}
              workItems={workItems}
              milestones={milestones}
              onWorkItemsChange={setWorkItems}
              onMilestonesChange={setMilestones}
            />
          )}

          {activeTab === 'kanban' && (
            <div className="space-y-3">
              <button
                onClick={handleCreateBoard}
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                + Board
              </button>
              <ul className="flex flex-wrap gap-2">
                {boards.map((board) => (
                  <li key={board.id}>
                    <button
                      onClick={() => navigate(`/projects/${projectId}/boards/${board.id}`)}
                      className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
                    >
                      {board.name}
                    </button>
                  </li>
                ))}
                {boards.length === 0 && (
                  <li className="text-sm text-slate-500 dark:text-slate-500">Noch keine Boards — oben auf "+ Board" klicken.</li>
                )}
              </ul>
            </div>
          )}

          {activeTab === 'notes' && <NotesView projectId={projectId} notes={notes} onNotesChange={setNotes} />}
        </main>
      </div>
    </div>
  )
}
