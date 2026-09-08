import Header from '../components/Header'
import { usePreferences } from '../context/PreferencesContext'
import { useAuth } from '../context/AuthContext'
import { BAR_COLOR_MODE_OPTIONS, BAR_COLOR_MODE_PREFERENCE_KEY, resolveBarColorMode } from '../lib/timelinePreferences'
import TranscriptionSettingsSection from '../components/TranscriptionSettingsSection'

export default function SettingsPage() {
  const { getPreference, setPreference } = usePreferences()
  const { isAdmin } = useAuth()
  const barColorMode = resolveBarColorMode(getPreference(BAR_COLOR_MODE_PREFERENCE_KEY, ''))

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <Header />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Einstellungen</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Persönliche Anzeigeoptionen - werden für dein Konto gespeichert.</p>
        </div>

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

        {isAdmin && (
          <div>
            <div className="mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Administration</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Instanzweite Einstellungen - nur für Administratoren sichtbar.</p>
            </div>
            <TranscriptionSettingsSection />
          </div>
        )}
      </main>
    </div>
  )
}
