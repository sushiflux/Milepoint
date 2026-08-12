import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createBoard, createProject, getBoards, getProjects } from '../api/projects'
import { getProjectCategories } from '../api/projectCategories'
import type { Board, Project, ProjectCategory } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { validateRequired } from '../lib/validation'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [boardsByProject, setBoardsByProject] = useState<Record<string, Board[]>>({})
  const [categoryId, setCategoryId] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const { displayName, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const categoryError = validateRequired(categoryId, 'Typ')
  const nameError = validateRequired(name, 'Projektname')
  const hasBlockingErrors = Boolean(categoryError) || Boolean(nameError)

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function fieldMessage(field: string, fieldError: string | null) {
    return touched[field] && fieldError ? fieldError : null
  }

  async function loadProjects() {
    setProjects(await getProjects())
  }

  useEffect(() => {
    loadProjects().catch(() => setError('Projekte konnten nicht geladen werden.'))
    getProjectCategories()
      .then((data) => {
        setCategories(data)
        setCategoryId((current) => current || data[0]?.id || '')
      })
      .catch(() => setError('Kategorien konnten nicht geladen werden.'))
  }, [])

  async function loadBoards(projectId: string) {
    const boards = await getBoards(projectId)
    setBoardsByProject((prev) => ({ ...prev, [projectId]: boards }))
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault()
    setError(null)

    setTouched({ categoryId: true, name: true })
    if (hasBlockingErrors) return

    try {
      await createProject(categoryId, name)
      setName('')
      setTouched({})
      await loadProjects()
    } catch {
      setError('Projekt konnte nicht erstellt werden.')
    }
  }

  async function handleCreateBoard(projectId: string) {
    await createBoard(projectId, 'Board')
    await loadBoards(projectId)
  }

  const categoryMsg = fieldMessage('categoryId', categoryError)
  const nameMsg = fieldMessage('name', nameError)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Milepoint — Projekte</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          {isAdmin && (
            <Link to="/admin/project-categories" className="rounded border border-amber-800 px-2 py-1 text-amber-400 hover:bg-amber-950/30">
              Admin
            </Link>
          )}
          <span>{displayName}</span>
          <button onClick={signOut} className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">
            Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <form onSubmit={handleCreateProject} className="flex items-start gap-2">
          <div className="w-32">
            <select
              className={`w-full rounded border bg-slate-900 px-3 py-2 text-sm ${categoryMsg ? 'border-red-500' : 'border-slate-700'}`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              onBlur={() => markTouched('categoryId')}
              required
            >
              {categories.length === 0 && <option value="">Kein Typ verfügbar</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {categoryMsg && <p className="mt-1 text-xs text-red-400">{categoryMsg}</p>}
          </div>
          <div className="flex-1">
            <input
              className={`w-full rounded border bg-slate-900 px-3 py-2 text-sm ${nameMsg ? 'border-red-500' : 'border-slate-700'}`}
              placeholder="Projektname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => markTouched('name')}
              required
            />
            {nameMsg && <p className="mt-1 text-xs text-red-400">{nameMsg}</p>}
          </div>
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
