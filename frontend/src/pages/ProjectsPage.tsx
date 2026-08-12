import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBoard, createProject, getBoards, getProjects } from '../api/projects'
import type { Board, Project } from '../api/types'
import { useAuth } from '../context/AuthContext'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [boardsByProject, setBoardsByProject] = useState<Record<string, Board[]>>({})
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { displayName, signOut } = useAuth()
  const navigate = useNavigate()

  async function loadProjects() {
    const data = await getProjects()
    setProjects(data)
  }

  useEffect(() => {
    loadProjects().catch(() => setError('Projekte konnten nicht geladen werden.'))
  }, [])

  async function loadBoards(projectId: string) {
    const boards = await getBoards(projectId)
    setBoardsByProject((prev) => ({ ...prev, [projectId]: boards }))
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await createProject(key, name)
      setKey('')
      setName('')
      await loadProjects()
    } catch {
      setError('Projekt konnte nicht erstellt werden (Key evtl. schon vergeben).')
    }
  }

  async function handleCreateBoard(projectId: string) {
    await createBoard(projectId, 'Board')
    await loadBoards(projectId)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">PM — Projekte</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{displayName}</span>
          <button onClick={signOut} className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">
            Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <form onSubmit={handleCreateProject} className="flex gap-2">
          <input
            className="w-24 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm uppercase"
            placeholder="KEY"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            maxLength={10}
            required
          />
          <input
            className="flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Projektname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
            Neues Projekt
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-xs text-slate-500">{project.key}</span>
                  <h2 className="text-base font-medium">{project.name}</h2>
                </div>
                <button
                  onClick={() => (boardsByProject[project.id] ? handleCreateBoard(project.id) : loadBoards(project.id))}
                  className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                >
                  {boardsByProject[project.id] ? '+ Board' : 'Boards anzeigen'}
                </button>
              </div>

              {boardsByProject[project.id] && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {boardsByProject[project.id].map((board) => (
                    <li key={board.id}>
                      <button
                        onClick={() => navigate(`/projects/${project.id}/boards/${board.id}`)}
                        className="rounded bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
                      >
                        {board.name}
                      </button>
                    </li>
                  ))}
                  {boardsByProject[project.id].length === 0 && (
                    <li className="text-sm text-slate-500">Noch keine Boards — oben auf "+ Board" klicken.</li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
