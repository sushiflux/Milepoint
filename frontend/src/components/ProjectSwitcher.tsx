import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { addFavoriteProject, getProjects, removeFavoriteProject } from '../api/projects'
import type { Project } from '../api/types'

const SWITCHER_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <rect x="3" y="4" width="14" height="3" rx="1" />
    <rect x="3" y="9" width="14" height="3" rx="1" />
    <rect x="3" y="14" width="8" height="3" rx="1" />
  </svg>
)

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

const SEARCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <circle cx="9" cy="9" r="6" />
    <path d="M17 17l-3.5-3.5" />
  </svg>
)

export default function ProjectSwitcher() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    // Header mounts once per page and this list is otherwise never refetched, so a favorite
    // toggled elsewhere (e.g. the Dashboard tiles) wouldn't show up here until a full page
    // reload. Refetching on every open keeps it current without needing shared state.
    getProjects()
      .then(setProjects)
      .catch(() => {})
  }, [open])

  async function toggleFavorite(e: MouseEvent, project: Project) {
    e.stopPropagation()
    const next = !project.isFavorite
    setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, isFavorite: next } : p)) ?? prev)
    try {
      if (next) await addFavoriteProject(project.id)
      else await removeFavoriteProject(project.id)
    } catch {
      // Konnte nicht gespeichert werden - lokalen Stern-Status zurückdrehen.
      setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, isFavorite: !next } : p)) ?? prev)
    }
  }

  function goToProject(project: Project) {
    setOpen(false)
    setSearch('')
    navigate(`/projects/${project.id}/timeline`)
  }

  const trimmedSearch = search.trim().toLowerCase()
  const visibleProjects =
    projects === null
      ? []
      : trimmedSearch
        ? projects.filter((p) => p.name.toLowerCase().includes(trimmedSearch))
        : projects.filter((p) => p.isFavorite)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Projekte"
        className={`flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${
          open ? 'bg-slate-100 dark:bg-slate-800' : ''
        }`}
      >
        {SWITCHER_ICON}
        <span className="hidden sm:inline">Projekte</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="relative mb-2">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {SEARCH_ICON}
              </span>
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Projekt suchen..."
                className="w-full rounded-md border border-slate-200 bg-transparent py-1.5 pl-8 pr-2 text-sm outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 dark:border-slate-700 dark:text-slate-100"
              />
            </div>

            <div className="max-h-72 space-y-0.5 overflow-y-auto">
              {!trimmedSearch && visibleProjects.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">
                  Noch keine Favoriten — oben suchen und mit dem Stern markieren.
                </p>
              )}
              {trimmedSearch && visibleProjects.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">Keine Projekte gefunden.</p>
              )}
              {visibleProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => goToProject(project)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <button
                    onClick={(e) => toggleFavorite(e, project)}
                    title={project.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                    className={`shrink-0 rounded p-0.5 transition-colors ${
                      project.isFavorite
                        ? 'text-amber-400 hover:text-amber-500'
                        : 'text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500'
                    }`}
                  >
                    {project.isFavorite ? STAR_FILLED : STAR_OUTLINE}
                  </button>
                  <span className="truncate">{project.name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
