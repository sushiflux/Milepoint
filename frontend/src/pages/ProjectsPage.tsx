import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProject, deleteProject, getProjects, renameProject } from '../api/projects'
import type { Project } from '../api/types'
import { validateRequired } from '../lib/validation'
import { shortId } from '../lib/ids'
import Sidebar from '../components/Sidebar'
import AddButton from '../components/AddButton'
import ContextMenu, { type ContextMenuEntry } from '../components/ContextMenu'

type ViewMode = 'tiles' | 'list'
const VIEW_MODE_STORAGE_KEY = 'pm.dashboard.viewMode'

const AVATAR_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-violet-500']

function avatarColor(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project | null } | null>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

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

  function handleTileContextMenu(event: React.MouseEvent, project: Project) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, project })
  }

  function handleAreaContextMenu(event: React.MouseEvent) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, project: null })
  }

  function startRename(project: Project) {
    setRenamingProjectId(project.id)
    setRenameValue(project.name)
  }

  function cancelRename() {
    setRenamingProjectId(null)
  }

  async function submitRename(project: Project) {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === project.name) {
      setRenamingProjectId(null)
      return
    }
    try {
      await renameProject(project.id, trimmed)
      setRenamingProjectId(null)
      await loadProjects()
    } catch {
      setError('Projekt konnte nicht umbenannt werden.')
    }
  }

  async function handleDeleteProject(project: Project) {
    if (!window.confirm(`Projekt "${project.name}" wirklich löschen? Boards, Aufgaben und Notizen gehen dabei unwiderruflich verloren.`)) {
      return
    }
    try {
      await deleteProject(project.id)
      await loadProjects()
    } catch {
      setError('Projekt konnte nicht gelöscht werden.')
    }
  }

  function projectMenuItems(project: Project): ContextMenuEntry[] {
    return [
      { label: 'Projekt öffnen', onClick: () => navigate(`/projects/${project.id}`) },
      { label: 'Kanban', onClick: () => navigate(`/projects/${project.id}/kanban`) },
      { label: 'Notizen', onClick: () => navigate(`/projects/${project.id}/notes`) },
      'divider',
      { label: 'Projekt umbenennen', onClick: () => startRename(project) },
      { label: 'Projekt löschen', onClick: () => handleDeleteProject(project), danger: true },
    ]
  }

  const nameMsg = fieldMessage('name', nameError)

  const createForm = (
    <form onSubmit={handleCreateProject} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          className={`w-full rounded border bg-white px-3 py-2 text-sm dark:bg-slate-900 ${nameMsg ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'}`}
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
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          placeholder="Beschreibung (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500">
        Anlegen
      </button>
      <button
        type="button"
        onClick={() => setShowCreateForm(false)}
        className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        Abbrechen
      </button>
    </form>
  )

  function renderProject(project: Project) {
    const progressLabel = project.isOwner ? 'Projekt-Fortschritt' : 'Meine Aufgaben'

    if (renamingProjectId === project.id) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitRename(project)
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelRename()
            }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <button type="submit" className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium hover:bg-indigo-500">
            Speichern
          </button>
          <button
            type="button"
            onClick={cancelRename}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
        </form>
      )
    }

    return (
      <button
        onClick={() => navigate(`/projects/${project.id}`)}
        onContextMenu={(e) => handleTileContextMenu(e, project)}
        className="w-full text-left"
      >
        <div>
          <span className="font-mono text-xs text-slate-500">#{shortId(project.id)}</span>
          <h2 className="text-base font-medium">{project.name}</h2>
          {project.description && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{project.description}</p>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <p className="text-slate-500 dark:text-slate-500">Meine Aufgaben</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {project.myCompletedTaskCount} / {project.myAssignedTaskCount} erledigt
            </p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-500">{progressLabel}</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{project.completionPercent}%</p>
          </div>
          <div>
            <p className="text-slate-500 dark:text-slate-500">Offene Tickets</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{project.openTicketCount}</p>
          </div>
        </div>

        {project.nextMilestoneName && (
          <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">
            Nächster Meilenstein: <span className="text-slate-700 dark:text-slate-200">{project.nextMilestoneName}</span>
            {project.nextMilestoneDate && ` · ${new Date(project.nextMilestoneDate).toLocaleDateString('de-DE')}`}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex -space-x-1.5">
            {project.members.slice(0, 5).map((member) => (
              <span
                key={member.id}
                title={member.displayName}
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-medium text-white dark:border-slate-900 ${avatarColor(member.id)}`}
              >
                {initials(member.displayName)}
              </span>
            ))}
            {project.members.length > 5 && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-400 text-[10px] font-medium text-white dark:border-slate-900">
                +{project.members.length - 5}
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">Aktiv: {new Date(project.lastActivityAt).toLocaleDateString('de-DE')}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />

      <div className="min-w-0 flex-1" onContextMenu={handleAreaContextMenu}>
        <main className="space-y-6 p-6">
        {projects === null ? (
          <p className="text-sm text-slate-500">Lade Projekte…</p>
        ) : projects.length === 0 && !showCreateForm ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-300 py-16 text-center dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400">Noch kein Projekt vorhanden.</p>
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
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">Projekte</h1>
                {!showCreateForm && <AddButton onClick={() => setShowCreateForm(true)} label="Projekt anlegen" />}
              </div>

              <div className="ml-4 flex shrink-0 rounded border border-slate-300 text-xs dark:border-slate-700">
                <button
                  onClick={() => changeViewMode('tiles')}
                  className={`px-3 py-1.5 ${viewMode === 'tiles' ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'}`}
                >
                  Kacheln
                </button>
                <button
                  onClick={() => changeViewMode('list')}
                  className={`border-l border-slate-300 px-3 py-1.5 dark:border-slate-700 ${viewMode === 'list' ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'}`}
                >
                  Liste
                </button>
              </div>
            </div>

            {showCreateForm && createForm}

            {error && <p className="text-sm text-red-400">{error}</p>}

            {viewMode === 'tiles' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    {renderProject(project)}
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-4">
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                  >
                    {renderProject(project)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        </main>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.project ? projectMenuItems(contextMenu.project) : [{ label: 'Neues Projekt anlegen', onClick: () => setShowCreateForm(true) }]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
