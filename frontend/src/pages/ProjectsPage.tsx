import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject, getProjects } from '../api/projects'
import type { Project } from '../api/types'
import { useAuth } from '../context/AuthContext'
import { validateRequired } from '../lib/validation'
import { shortId } from '../lib/ids'

type ViewMode = 'tiles' | 'list'
const VIEW_MODE_STORAGE_KEY = 'pm.dashboard.viewMode'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_STORAGE_KEY) as ViewMode | null) ?? 'tiles',
  )

  const { displayName, signOut } = useAuth()
  const navigate = useNavigate()

  const nameError = validateRequired(name, 'Projektname')

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function fieldMessage(field: string, fieldError: string | null) {
    return touched[field] && fieldError ? fieldError : null
  }

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  }

  async function loadProjects() {
    setProjects(await getProjects())
  }

  useEffect(() => {
    loadProjects().catch(() => setError('Projekte konnten nicht geladen werden.'))
  }, [])

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault()
    setError(null)

    setTouched({ name: true })
    if (nameError) return

    try {
      await createProject(name, description || undefined)
      setName('')
      setDescription('')
      setTouched({})
      setShowCreateForm(false)
      await loadProjects()
    } catch {
      setError('Projekt konnte nicht erstellt werden.')
    }
  }

  const nameMsg = fieldMessage('name', nameError)

  const createForm = (
    <form onSubmit={handleCreateProject} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          className={`w-full rounded border bg-slate-900 px-3 py-2 text-sm ${nameMsg ? 'border-red-500' : 'border-slate-700'}`}
          placeholder="Projektname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => markTouched('name')}
          autoFocus
          required
        />
        {nameMsg && <p className="mt-1 text-xs text-red-400">{nameMsg}</p>}
      </div>
      <div className="flex-1">
        <input
          className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          placeholder="Beschreibung (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
        Anlegen
      </button>
    </form>
  )

  function renderProject(project: Project) {
    const progressLabel = project.isOwner ? 'Projekt-Fortschritt' : 'Meine Aufgaben'

    return (
      <button onClick={() => navigate(`/projects/${project.id}`)} className="w-full text-left">
        <div>
          <span className="font-mono text-xs text-slate-500">{shortId(project.id)}</span>
          <h2 className="text-base font-medium">{project.name}</h2>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-400">
          <div>
            <p className="text-slate-500">Meine Aufgaben</p>
            <p className="text-sm text-slate-200">
              {project.myCompletedTaskCount} / {project.myAssignedTaskCount} erledigt
            </p>
          </div>
          <div>
            <p className="text-slate-500">Offene Tickets</p>
            <p className="text-sm text-slate-200">{project.openTicketCount}</p>
          </div>
          <div>
            <p className="text-slate-500">{progressLabel}</p>
            <p className="text-sm text-slate-200">{project.completionPercent}%</p>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Milepoint — Dashboard</h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{displayName}</span>
          <button onClick={signOut} className="rounded border border-slate-700 px-2 py-1 hover:bg-slate-800">
            Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-6">
        {projects === null ? (
          <p className="text-sm text-slate-500">Lade Projekte…</p>
        ) : projects.length === 0 && !showCreateForm ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-800 py-16 text-center">
            <p className="text-slate-400">Noch kein Projekt vorhanden.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
            >
              + Projekt anlegen
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              {showCreateForm ? (
                createForm
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500"
                >
                  + Projekt anlegen
                </button>
              )}

              <div className="ml-4 flex shrink-0 rounded border border-slate-700 text-xs">
                <button
                  onClick={() => changeViewMode('tiles')}
                  className={`px-3 py-1.5 ${viewMode === 'tiles' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900'}`}
                >
                  Kacheln
                </button>
                <button
                  onClick={() => changeViewMode('list')}
                  className={`border-l border-slate-700 px-3 py-1.5 ${viewMode === 'list' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:bg-slate-900'}`}
                >
                  Liste
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {viewMode === 'tiles' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {projects.map((project) => (
                  <div key={project.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-slate-700">
                    {renderProject(project)}
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-4">
                {projects.map((project) => (
                  <li key={project.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-slate-700">
                    {renderProject(project)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  )
}
