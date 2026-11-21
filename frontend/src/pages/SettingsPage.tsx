import Header from '../components/Header'
import ChangePasswordSection from '../components/ChangePasswordSection'
import ApiTokensSection from '../components/ApiTokensSection'
import TabBar from '../components/TabBar'
import { useUrlTab, type TabDef } from '../hooks/useUrlTab'
import { usePreferences } from '../context/PreferencesContext'
import { BAR_COLOR_MODE_OPTIONS, BAR_COLOR_MODE_PREFERENCE_KEY, resolveBarColorMode } from '../lib/timelinePreferences'

// Personal settings, grouped by topic: Darstellung (how things look), Sicherheit (password, and
// later two-factor/passkeys), and API-Tokens (for MCP / external integrations). Instance-wide
// settings live in the separate app administration.
type Tab = 'appearance' | 'security' | 'api-tokens'
const TABS: TabDef<Tab>[] = [
  { value: 'appearance', label: 'Darstellung' },
  { value: 'security', label: 'Sicherheit' },
  { value: 'api-tokens', label: 'API-Tokens' },
]

export default function SettingsPage() {
  const { getPreference, setPreference } = usePreferences()
  const [tab, setTab] = useUrlTab(TABS)
  const barColorMode = resolveBarColorMode(getPreference(BAR_COLOR_MODE_PREFERENCE_KEY, ''))

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <Header />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Einstellungen</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Persönliche Optionen - werden für dein Konto gespeichert.</p>
        </div>

        <TabBar tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'appearance' && (
        <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Timeline</h2>

          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Balkenfarbe</p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Wonach sich die Farbe der Aufgaben-Balken in der Timeline richtet.</p>

            <div className="space-y-2">
              {BAR_COLOR_MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    barColorMode === option.value
                      ? 'border-brand-primary bg-brand-primary/5 dark:border-brand-primary-light dark:bg-brand-primary/10'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="timelineBarColorMode"
                    className="mt-0.5 accent-brand-primary"
                    checked={barColorMode === option.value}
                    onChange={() => setPreference(BAR_COLOR_MODE_PREFERENCE_KEY, option.value)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>
        )}

        {tab === 'security' && <ChangePasswordSection />}
        {tab === 'api-tokens' && <ApiTokensSection />}
      </main>
    </div>
  )
}
