import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ProjectTab = 'timeline' | 'kanban' | 'notes'

interface Props {
  project?: { id: string; name: string } | null
  activeTab?: ProjectTab | null
}

const TAB_LABELS: Record<ProjectTab, string> = {
  timeline: 'Timeline',
  kanban: 'Kanban',
  notes: 'Notizen',
}

const TAB_ICONS: Record<ProjectTab, ReactNode> = {
  timeline: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M3 5.5h8M3 10h13M3 14.5h6" />
    </svg>
  ),
  kanban: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <rect x="2.5" y="3" width="4.5" height="14" rx="1" />
      <rect x="8.75" y="3" width="4.5" height="9" rx="1" />
      <rect x="15" y="3" width="2.5" height="11" rx="1" />
    </svg>
  ),
  notes: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M5 2.5h6.5l3 3v11a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" />
      <path d="M6.75 9h6M6.75 12.25h6M6.75 15h3.5" />
    </svg>
  ),
}

const STORAGE_KEY = 'pm.sidebarCollapsed'

function readInitialCollapsed() {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

function navLinkClass(active: boolean, collapsed: boolean) {
  return `flex items-center gap-3 truncate rounded-md py-2 text-sm font-medium transition-colors ${collapsed ? 'justify-center px-2' : 'px-3'} ${
    active
      ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'
  }`
}

export default function Sidebar({ project, activeTab }: Props) {
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  // If there is no project context, the sidebar doesn't have much to show in this layout.
  if (!project) return null

  return (
    <aside
      className={`flex ${collapsed ? 'w-16' : 'w-64'} shrink-0 flex-col border-r border-slate-200 bg-slate-50/50 ${collapsed ? 'p-2' : 'p-4'} transition-all duration-300 dark:border-slate-800 dark:bg-[#0b0a1a]`}
      style={{ minHeight: 'calc(100vh - 3.5rem)' }} // Subtract Header height
    >
      <div className={`mb-6 flex items-center ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
        {!collapsed && <h3 className="truncate text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Module</h3>}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d={collapsed ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-6">
        <div>
          {!collapsed && <p className="mb-3 truncate px-3 text-[11px] font-bold uppercase tracking-wider text-brand-accent">{project.name}</p>}
          <nav className="space-y-1">
            {(Object.keys(TAB_LABELS) as ProjectTab[]).map((tab) => (
              <Link
                key={tab}
                to={`/projects/${project.id}/${tab}`}
                title={collapsed ? `${project.name} · ${TAB_LABELS[tab]}` : undefined}
                className={navLinkClass(activeTab === tab, collapsed)}
              >
                {TAB_ICONS[tab]}
                {!collapsed && TAB_LABELS[tab]}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </aside>
  )
}
