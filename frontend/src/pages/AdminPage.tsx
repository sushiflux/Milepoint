import Header from '../components/Header'
import TabBar from '../components/TabBar'
import { useUrlTab, type TabDef } from '../hooks/useUrlTab'
import AdminUsersTab from '../components/admin/AdminUsersTab'
import AdminRolesTab from '../components/admin/AdminRolesTab'
import TranscriptionSettingsSection from '../components/TranscriptionSettingsSection'

// Instance-wide administration - deliberately NOT part of the personal SettingsPage: those are a
// user's own options, these change the whole app for everyone. Reachable only for the Admin role
// (App.tsx's RequireAdmin + the menu entry in Header.tsx).
type Tab = 'users' | 'roles' | 'speech'
const TABS: TabDef<Tab>[] = [
  { value: 'users', label: 'Benutzer' },
  { value: 'roles', label: 'Rollen' },
  { value: 'speech', label: 'Spracherkennung' },
]

export default function AdminPage() {
  const [tab, setTab] = useUrlTab(TABS)

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">App-Administration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Einstellungen für die ganze Instanz - nur für Administratoren sichtbar.</p>
        </div>

        <TabBar tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'users' && <AdminUsersTab />}
        {tab === 'roles' && <AdminRolesTab />}
        {tab === 'speech' && <TranscriptionSettingsSection />}
      </main>
    </div>
  )
}
