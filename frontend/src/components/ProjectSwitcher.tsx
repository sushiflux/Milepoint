import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addFavoriteProject, getProjects, removeFavoriteProject } from '../api/projects'
import type { Project } from '../api/types'
import { useClickOutside } from '../hooks/useClickOutside'

const SWITCHER_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light">
    <path d="M3 5a2 2 0 012-2h3.28a2 2 0 011.42.59l1.41 1.41A1 1 0 0011.83 5H15a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
  </svg>
)

const CHEVRON_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 opacity-60">
    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

const STAR_PATH = 'M9.05 3.29a1.1 1.1 0 011.9 0l1.6 2.75 3.08.7a1.1 1.1 0 01.6 1.8l-2.1 2.38.28 3.15a1.1 1.1 0 01-1.55 1.1L10 13.75l-2.86 1.42a1.1 1.1 0 01-1.55-1.1l.28-3.15-2.1-2.38a1.1 1.1 0 01.6-1.8l3.08-.7 1.6-2.75z'

const STAR_FILLED = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
    <path d={STAR_PATH} />
  </svg>
)

const STAR_OUTLINE = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
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
  const { projectId } = useParams<{ projectId?: string }>()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const close = useCallback(() => {
    setOpen(false)
    setSearch('')
  }, [])
  useClickOutside(containerRef, open, close)

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
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
      setProjects((prev) => prev?.map((p) => (p.id === project.id ? { ...p, isFavorite: !next } : p)) ?? prev)
    }
  }

  function goToProject(project: Project) {
    setOpen(false)
    setSearch('')
    navigate(`/projects/${project.id}/timeline`)
  }

  const currentProject = projects?.find((p) => p.id === projectId)
  const trimmedSearch = search.trim().toLowerCase()
  const visibleProjects =
    projects === null
      ? []
      : trimmedSearch
        ? projects.filter((p) => p.name.toLowerCase().includes(trimmedSearch))
        : projects

  const favoriteProjects = visibleProjects.filter((p) => p.isFavorite)
  const otherProjects = visibleProjects.filter((p) => !p.isFavorite)

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        title="Projekt wechseln"
        className={`flex h-8 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-100/60 px-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-200/60 hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:border-slate-600 ${
          open ? 'ring-2 ring-brand-primary/30 border-brand-primary/50' : ''
        }`}
      >
        {SWITCHER_ICON}
        <span className="max-w-[140px] sm:max-w-[200px] truncate">
          {currentProject ? currentProject.name : 'Alle Projekte'}
        </span>
        {CHEVRON_ICON}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95">
            <div className="relative mb-2">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {SEARCH_ICON}
              </span>
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Projekt suchen..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100"
              />
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
              {visibleProjects.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-slate-500 dark:text-slate-300">Keine Projekte gefunden.</p>
              )}

              {!trimmedSearch && favoriteProjects.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">Favoriten</p>
                  {favoriteProjects.map((project) => (
                    <div
                      key={project.id}
                      onClick={() => goToProject(project)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        project.id === projectId
                          ? 'bg-brand-primary/10 text-brand-primary font-bold dark:bg-brand-primary/20 dark:text-brand-primary-light'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="truncate">{project.name}</span>
                      <button
                        onClick={(e) => toggleFavorite(e, project)}
                        title="Favorit entfernen"
                        className="text-amber-400 hover:text-amber-500 p-0.5"
                      >
                        {STAR_FILLED}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {otherProjects.length > 0 && (
                <div>
                  {!trimmedSearch && favoriteProjects.length > 0 && (
                    <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Alle Projekte</p>
                  )}
                  {otherProjects.map((project) => (
                    <div
                      key={project.id}
                      onClick={() => goToProject(project)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        project.id === projectId
                          ? 'bg-brand-primary/10 text-brand-primary font-bold dark:bg-brand-primary/20 dark:text-brand-primary-light'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="truncate">{project.name}</span>
                      <button
                        onClick={(e) => toggleFavorite(e, project)}
                        title="Als Favorit markieren"
                        className="text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500 p-0.5"
                      >
                        {STAR_OUTLINE}
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}
