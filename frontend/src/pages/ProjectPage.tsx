import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { createBoard, getBoards, getProjects } from '../api/projects'
import { getTimeline } from '../api/timeline'
import { getNotes } from '../api/notes'
import type { Board, Milestone, Note, Project, WorkItem } from '../api/types'
import TimelineView from './TimelineView'
import NotesView from './NotesView'

type Tab = 'timeline' | 'kanban' | 'notes'

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [tab, setTab] = useState<Tab>('timeline')
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

  if (loading || !project) {
    return <div className="p-6 text-slate-400">Projekt wird geladen…</div>
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <button onClick={() => navigate('/')} className="mb-2 text-xs text-slate-500 hover:text-slate-300">
          ← Dashboard
        </button>
        <h1 className="text-lg font-semibold">{project.name}</h1>
        {project.description && <p className="mt-1 text-sm text-slate-400">{project.description}</p>}

        <div className="mt-4 flex gap-1 border-b border-slate-800">
          <button
            onClick={() => setTab('timeline')}
            className={`px-4 py-2 text-sm ${tab === 'timeline' ? 'border-b-2 border-indigo-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Timeline
          </button>
          <button
            onClick={() => setTab('kanban')}
            className={`px-4 py-2 text-sm ${tab === 'kanban' ? 'border-b-2 border-indigo-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setTab('notes')}
            className={`px-4 py-2 text-sm ${tab === 'notes' ? 'border-b-2 border-indigo-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Notizen
          </button>
        </div>
      </header>

      <main className={tab === 'timeline' ? 'p-6' : 'mx-auto max-w-5xl p-6'}>
        {tab === 'timeline' && (
          <TimelineView
            projectId={projectId}
            boards={boards}
            workItems={workItems}
            milestones={milestones}
            onWorkItemsChange={setWorkItems}
            onMilestonesChange={setMilestones}
          />
        )}

        {tab === 'kanban' && (
          <div className="space-y-3">
            <button
              onClick={handleCreateBoard}
              className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
            >
              + Board
            </button>
            <ul className="flex flex-wrap gap-2">
              {boards.map((board) => (
                <li key={board.id}>
                  <button
                    onClick={() => navigate(`/projects/${projectId}/boards/${board.id}`)}
                    className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
                  >
                    {board.name}
                  </button>
                </li>
              ))}
              {boards.length === 0 && (
                <li className="text-sm text-slate-500">Noch keine Boards — oben auf "+ Board" klicken.</li>
              )}
            </ul>
          </div>
        )}

        {tab === 'notes' && <NotesView projectId={projectId} notes={notes} onNotesChange={setNotes} />}
      </main>
    </div>
  )
}
