import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { addFavoriteProject, createProject, deleteProject, getProjects, removeFavoriteProject, renameProject } from '../api/projects'
import type { ColumnTicketCount, Project } from '../api/types'
import { validateRequired } from '../lib/validation'
import { shortId } from '../lib/ids'
import Header from '../components/Header'
import AddButton from '../components/AddButton'
import ContextMenu, { type ContextMenuEntry } from '../components/ContextMenu'
import { useAuth } from '../context/AuthContext'
import { usePreferences } from '../context/PreferencesContext'

type ViewMode = 'tiles' | 'list'
const VIEW_MODE_PREFERENCE_KEY = 'dashboard.viewMode'

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

const STAR_PATH = 'M9.05 3.29a1.1 1.1 0 011.9 0l1.6 2.75 3.08.7a1.1 1.1 0 01.6 1.8l-2.1 2.38.28 3.15a1.1 1.1 0 01-1.55 1.1L10 13.75l-2.86 1.42a1.1 1.1 0 01-1.55-1.1l.28-3.15-2.1-2.38a1.1 1.1 0 01.6-1.8l3.08-.7 1.6-2.75z'

const STAR_FILLED = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d={STAR_PATH} />
  </svg>
)

const STAR_OUTLINE = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d={STAR_PATH} />
  </svg>
)

function TicketBadgeRow({ items, overdueCount }: { items: ColumnTicketCount[]; overdueCount: number }) {
  const total = items.reduce((sum, c) => sum + c.count, 0)
  return (
    <div className="flex flex-wrap gap-1.5">
      {total > 0 && (
        <span
          title="Gesamtzahl offener Tickets über alle Spalten"
          className="rounded-md bg-brand-primary px-2.5 py-1 text-[11px] font-bold text-white dark:bg-brand-primary-light"
        >
          Gesamt {total}
        </span>
      )}
      {overdueCount > 0 && (
        <span
          title="Fällig, aber noch nicht erledigt"
          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
        >
          Überfällig {overdueCount}
        </span>
      )}
      {items.map((c) => (
        <span
          key={c.columnName}
          className="rounded-md border border-brand-primary/20 bg-brand-primary/5 px-2.5 py-1 text-[11px] font-medium text-brand-primary-dark dark:border-brand-primary/30 dark:bg-brand-primary/20 dark:text-white"
        >
          {c.columnName} <span className="ml-1 font-bold">{c.count}</span>
        </span>
      ))}
    </div>
  )
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; project: Project | null } | null>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const navigate = useNavigate()
  const { isProjectLeader } = useAuth()
  const { getPreference, setPreference } = usePreferences()
  const viewMode = getPreference(VIEW_MODE_PREFERENCE_KEY, 'tiles') as ViewMode

  const nameError = validateRequired(name, 'Projektname')

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function fieldMessage(field: string, fieldError: string | null) {
    return touched[field] && fieldError ? fieldError : null
  }

  function changeViewMode(mode: ViewMode) {
    setPreference(VIEW_MODE_PREFERENCE_KEY, mode)
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

  async function setFavorite(project: Project, next: boolean) {
    setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, isFavorite: next } : p)) ?? prev)
    try {
      if (next) await addFavoriteProject(project.id)
      else await removeFavoriteProject(project.id)
    } catch {
      setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, isFavorite: !next } : p)) ?? prev)
    }
  }

  function toggleFavorite(event: MouseEvent, project: Project) {
    event.stopPropagation()
    setFavorite(project, !project.isFavorite)
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
      {
        label: project.isFavorite ? 'Favorit entfernen' : 'Favorisieren',
        onClick: () => setFavorite(project, !project.isFavorite),
      },
      { label: 'Projekt umbenennen', onClick: () => startRename(project) },
      { label: 'Projekt löschen', onClick: () => handleDeleteProject(project), danger: true },
    ]
  }

  const nameMsg = fieldMessage('name', nameError)

  const createForm = (
    <form onSubmit={handleCreateProject} className="flex flex-col gap-3 sm:flex-row sm:items-start glass-panel p-4 rounded-xl mb-6">
      <div className="flex-1">
        <input
          className={`w-full rounded-lg border bg-transparent px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 ${nameMsg ? 'border-brand-accent/70' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'}`}
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
          className="w-full rounded-lg border bg-transparent px-4 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"
          placeholder="Beschreibung (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand-accent/20 transition-all hover:-translate-y-0.5 hover:shadow-brand-accent/40 hover:bg-brand-accent-light">
          Anlegen
        </button>
        <button
          type="button"
          onClick={() => setShowCreateForm(false)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
      </div>
    </form>
  )

  function renderFavoriteToggle(project: Project) {
    return (
      <button
        onClick={(e) => toggleFavorite(e, project)}
        title={project.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
        className={`absolute right-4 top-4 z-10 rounded-md p-1 transition-colors ${
          project.isFavorite
            ? 'text-amber-400 hover:text-amber-500'
            : 'text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500'
        }`}
      >
        {project.isFavorite ? STAR_FILLED : STAR_OUTLINE}
      </button>
    )
  }

  function renderProject(project: Project) {
    const progressLabel = project.isOwner ? 'Projekt-Fortschritt' : 'Meine Aufgaben'
    const showsFullBreakdown = project.isOwner || isProjectLeader

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
            className="w-full rounded border border-slate-300 bg-transparent px-2 py-1 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-600"
          />
          <button type="submit" className="rounded bg-brand-accent px-3 py-1 text-xs font-medium text-white hover:bg-brand-accent-light transition-colors">
            Speichern
          </button>
          <button
            type="button"
            onClick={cancelRename}
            className="rounded border border-slate-300 px-3 py-1 text-xs transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
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
        className="w-full text-left group"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-primary to-brand-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="mb-1">
          <span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 dark:text-slate-200">#{shortId(project.id)}</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 transition-colors group-hover:text-brand-accent dark:text-white dark:group-hover:text-brand-accent-light">{project.name}</h2>
          {project.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-200 leading-relaxed">{project.description}</p>}
        </div>

        <div className="mt-5 relative pt-5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700/50 to-transparent" />
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-200">{progressLabel}</p>
            <p className="text-[11px] font-bold text-brand-primary dark:text-brand-primary-light">{project.completionPercent}%</p>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-inner">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-accent transition-all duration-1000 ease-out" style={{ width: `${project.completionPercent}%` }} />
          </div>
        </div>

        {showsFullBreakdown && project.openTicketsByColumn.some((c) => c.count > 0) && (
          <div className="mt-5 relative pt-5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700/50 to-transparent" />
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-200">Gesamtübersicht</p>
            <TicketBadgeRow items={project.openTicketsByColumn} overdueCount={project.overdueCount} />
          </div>
        )}

        {project.myTicketsByColumn.some((c) => c.count > 0) && (
          <div className="mt-5 relative pt-5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700/50 to-transparent" />
            {showsFullBreakdown && <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-accent">Meine Aufgaben</p>}
            <TicketBadgeRow items={project.myTicketsByColumn} overdueCount={project.myOverdueCount} />
          </div>
        )}

        {project.nextMilestoneName && (
          <div className="mt-5 relative pt-5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700/50 to-transparent" />
            <p className="truncate text-xs text-slate-600 dark:text-slate-200">
              Nächster Meilenstein: <span className="font-semibold text-slate-800 dark:text-white">{project.nextMilestoneName}</span>
              {project.nextMilestoneDate && ` · ${new Date(project.nextMilestoneDate).toLocaleDateString('de-DE')}`}
            </p>
          </div>
        )}

        <div className="mt-5 relative flex items-center justify-between pt-5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-[1px] bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700/50 to-transparent" />
          <div className="flex -space-x-2">
            {project.members.slice(0, 5).map((member) => (
              <span
                key={member.id}
                title={member.displayName}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm ring-2 ring-transparent transition-all group-hover:ring-brand-primary/20 dark:border-[#15142b] ${avatarColor(member.id)}`}
              >
                {initials(member.displayName)}
              </span>
            ))}
            {project.members.length > 5 && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-xs font-bold text-slate-700 shadow-sm dark:border-[#15142b] dark:bg-slate-700 dark:text-slate-100">
                +{project.members.length - 5}
              </span>
            )}
          </div>
          <span className="flex flex-col items-end">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-200">Aktiv</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-100">{new Date(project.lastActivityAt).toLocaleDateString('de-DE')}</span>
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <Header />

      <div className="min-w-0 flex-1" onContextMenu={handleAreaContextMenu}>
        <main className="space-y-6 p-6">
        {projects === null && error ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-red-300 py-16 text-center dark:border-red-900">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={() => {
                setError(null)
                loadProjects().catch(() => setError('Projekte konnten nicht geladen werden.'))
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition-colors hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Erneut versuchen
            </button>
          </div>
        ) : projects === null ? (
          <p className="text-sm text-slate-500">Lade Projekte…</p>
        ) : projects.length === 0 && !showCreateForm ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-brand-primary/30 py-16 text-center glass-panel">
            <p className="text-slate-500 dark:text-slate-400">Noch kein Projekt vorhanden.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="rounded-lg bg-brand-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-accent-light transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-accent/30"
            >
              + Projekt anlegen
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Projekte</h1>
                {!showCreateForm && <AddButton onClick={() => setShowCreateForm(true)} label="Projekt anlegen" />}
              </div>

              <div className="ml-4 flex shrink-0 rounded-lg p-1 glass-panel">
                <button
                  onClick={() => changeViewMode('tiles')}
                  title="Kachel-Ansicht"
                  className={`rounded-md p-1.5 transition-colors ${viewMode === 'tiles' ? 'bg-white text-brand-accent shadow-sm dark:bg-slate-700 dark:text-brand-accent-light' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => changeViewMode('list')}
                  title="Listen-Ansicht"
                  className={`rounded-md p-1.5 transition-colors ${viewMode === 'list' ? 'bg-white text-brand-accent shadow-sm dark:bg-slate-700 dark:text-brand-accent-light' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
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
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-brand-primary/30 hover:shadow-xl hover:shadow-brand-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-primary/50"
                  >
                    {renderFavoriteToggle(project)}
                    {renderProject(project)}
                  </div>
                ))}
              </div>
            ) : (
              <ul className="space-y-4">
                {projects.map((project) => (
                  <li
                    key={project.id}
                    className="glass-panel relative rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-md group"
                  >
                    {renderFavoriteToggle(project)}
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
