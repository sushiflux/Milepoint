import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'

type ProjectTab = 'timeline' | 'kanban' | 'notes' | 'settings'

interface Props {
  project?: { id: string; name: string } | null
  activeTab?: ProjectTab | null
  // Projektleiter/Admin only: the project's own settings (columns, categories).
  canManage?: boolean
}

const TAB_LABELS: Record<ProjectTab, string> = {
  timeline: 'Timeline',
  kanban: 'Kanban',
  notes: 'Notizen',
  settings: 'Einstellungen',
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
  settings: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <path d="M8.3 2.5h3.4l.5 2.2a5.9 5.9 0 011.6.93l2.2-.7 1.7 2.94-1.75 1.5a5.9 5.9 0 010 1.86l1.75 1.5-1.7 2.94-2.2-.7a5.9 5.9 0 01-1.6.93l-.5 2.2H8.3l-.5-2.2a5.9 5.9 0 01-1.6-.93l-2.2.7-1.7-2.94 1.75-1.5a5.9 5.9 0 010-1.86L2.3 8.87 4 5.93l2.2.7a5.9 5.9 0 011.6-.93l.5-2.2z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  ),
}

const PREFERENCE_KEY = 'sidebarCollapsed'

function navLinkClass(active: boolean, collapsed: boolean) {
  return `flex items-center gap-3 truncate rounded-lg py-2 text-sm font-medium transition-colors ${collapsed ? 'justify-center px-2' : 'px-3'} ${
    active
      ? 'bg-brand-primary/10 text-brand-primary font-bold dark:bg-brand-primary/20 dark:text-brand-primary-light'
      : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
  }`
}

export default function Sidebar({ project, activeTab, canManage = false }: Props) {
  const { getPreference, setPreference } = usePreferences()
  const collapsed = getPreference(PREFERENCE_KEY, '0') === '1'

  function toggleCollapsed() {
    setPreference(PREFERENCE_KEY, collapsed ? '0' : '1')
  }

  // If there is no project context, the sidebar doesn't have much to show in this layout.
  if (!project) return null

  return (
    <aside
      className={`flex ${collapsed ? 'w-16' : 'w-64'} shrink-0 flex-col border-r border-slate-200/80 bg-slate-50/70 ${collapsed ? 'p-2' : 'p-4'} transition-all duration-300 dark:border-slate-800/80 dark:bg-[#0b0a1a]`}
      style={{ minHeight: 'calc(100vh - 3.5rem)' }} // Subtract Header height
    >
      <div className={`mb-6 flex items-center ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
        {!collapsed && <h3 className="truncate text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-200">Module</h3>}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
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
            {(Object.keys(TAB_LABELS) as ProjectTab[]).filter((tab) => tab !== 'settings' || canManage).map((tab) => (
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
