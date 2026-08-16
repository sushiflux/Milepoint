import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import logoDark from '../assets/logo-dark.svg'
import logoLight from '../assets/logo-light.svg'
import wordmarkDark from '../assets/wordmark-dark.svg'
import wordmarkLight from '../assets/wordmark-light.svg'

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

const DASHBOARD_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
    <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
  </svg>
)

const LOGOUT_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d="M7.5 17.5H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h3.5" />
    <path d="M13 14l4-4-4-4" />
    <path d="M17 10H7.5" />
  </svg>
)

const STORAGE_KEY = 'pm.sidebarCollapsed'

function readInitialCollapsed() {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

function navLinkClass(active: boolean, collapsed: boolean) {
  return `flex items-center gap-2 truncate rounded py-1.5 text-sm ${collapsed ? 'justify-center px-2' : 'px-3'} ${
    active
      ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
  }`
}

export default function Sidebar({ project, activeTab }: Props) {
  const { displayName, signOut } = useAuth()
  const { theme } = useTheme()
  const [collapsed, setCollapsed] = useState(readInitialCollapsed)
  const logo = theme === 'dark' ? logoDark : logoLight
  const wordmark = theme === 'dark' ? wordmarkDark : wordmarkLight

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <aside
      className={`flex ${collapsed ? 'w-14' : 'w-56'} shrink-0 flex-col border-r border-slate-200 bg-white ${collapsed ? 'p-2' : 'p-4'} dark:border-slate-800 dark:bg-slate-900`}
    >
      <div className={`mb-6 flex items-center ${collapsed ? 'flex-col-reverse gap-2' : 'justify-between px-3'}`}>
        {collapsed ? (
          <img src={logo} alt="Milepoint" className="h-5 w-auto" />
        ) : (
          <span className="flex items-center gap-1.5">
            <img src={logo} alt="" className="h-5 w-auto" />
            <img src={wordmark} alt="Milepoint" className="h-3.5 w-auto" />
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d={collapsed ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} />
          </svg>
        </button>
      </div>

      <nav className="space-y-1">
        <Link to="/" title="Dashboard" className={navLinkClass(!project, collapsed)}>
          {DASHBOARD_ICON}
          {!collapsed && 'Dashboard'}
        </Link>
      </nav>

      {project && (
        <div className="mt-6">
          {!collapsed && <p className="mb-2 truncate px-3 text-xs font-medium uppercase text-slate-500">{project.name}</p>}
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
      )}

      <div className={`mt-auto space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        {collapsed ? (
          <span
            title={displayName ?? undefined}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {(displayName ?? '?').slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <p className="truncate px-3 text-sm text-slate-600 dark:text-slate-400">{displayName}</p>
        )}
        <button
          onClick={signOut}
          title="Abmelden"
          aria-label="Abmelden"
          className={`flex items-center gap-2 rounded text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900 ${
            collapsed ? 'h-6 w-6 justify-center' : 'w-full px-3 py-1.5 text-left'
          }`}
        >
          {LOGOUT_ICON}
          {!collapsed && 'Abmelden'}
        </button>
        <ThemeToggle />
      </div>
    </aside>
  )
}
