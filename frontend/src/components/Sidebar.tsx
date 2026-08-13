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

function navLinkClass(active: boolean) {
  return `block truncate rounded px-3 py-1.5 text-sm ${
    active
      ? 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900'
  }`
}

export default function Sidebar({ project, activeTab }: Props) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-6 px-3 text-sm font-semibold">Milepoint</div>

      <nav className="space-y-1">
        <Link to="/" className={navLinkClass(!project)}>
          Dashboard
        </Link>
      </nav>

      {project && (
        <div className="mt-6">
          <p className="mb-2 truncate px-3 text-xs font-medium uppercase text-slate-500">{project.name}</p>
          <nav className="space-y-1">
            {(Object.keys(TAB_LABELS) as ProjectTab[]).map((tab) => (
              <Link key={tab} to={`/projects/${project.id}/${tab}`} className={navLinkClass(activeTab === tab)}>
                {TAB_LABELS[tab]}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </aside>
  )
}
