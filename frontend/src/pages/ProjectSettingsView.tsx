import { useAuth } from '../context/AuthContext'
import type { Board, ProjectCategory } from '../api/types'
import CategoriesSettings from '../components/project/CategoriesSettings'
import ColumnsSettings from '../components/project/ColumnsSettings'
import TabBar from '../components/TabBar'
import { useUrlTab, type TabDef } from '../hooks/useUrlTab'

type Tab = 'columns' | 'categories'
const TABS: TabDef<Tab>[] = [
  { value: 'columns', label: 'Spalten' },
  { value: 'categories', label: 'Kategorien' },
]

interface Props {
  projectId: string
  board: Board
  categories: ProjectCategory[]
  onBoardChange: (board: Board) => void
  onCategoriesChange: (categories: ProjectCategory[]) => void
}

// Settings of ONE project (columns and categories of its Kanban board) - distinct from the personal
// settings and from the app administration. Only Projektleiter and Admin may change them; the
// server enforces that too (BoardColumnsController / ProjectCategoriesController).
export default function ProjectSettingsView({ projectId, board, categories, onBoardChange, onCategoriesChange }: Props) {
  const { isProjectLeader } = useAuth()
  const [tab, setTab] = useUrlTab(TABS)

  if (!isProjectLeader) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Projekt-Einstellungen</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Spalten und Kategorien dieses Projekts können nur Projektleiter und Administratoren ändern.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Projekt-Einstellungen</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Gelten nur für dieses Projekt - nur für Projektleiter und Administratoren.</p>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'columns' && <ColumnsSettings projectId={projectId} board={board} onBoardChange={onBoardChange} />}
      {tab === 'categories' && <CategoriesSettings projectId={projectId} categories={categories} onCategoriesChange={onCategoriesChange} />}
    </div>
  )
}
