import type { TabDef } from '../hooks/useUrlTab'

// Segmented tab bar shared by the personal settings and the app administration (same look as the
// List/Graph toggle in the Notes view). State handling: hooks/useUrlTab.ts.
export default function TabBar<T extends string>({ tabs, active, onChange }: { tabs: TabDef<T>[]; active: T; onChange: (next: T) => void }) {
  return (
    <div role="tablist" className="flex w-fit rounded-lg p-1 glass-panel">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={active === t.value}
          onClick={() => onChange(t.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            active === t.value
              ? 'bg-white text-brand-primary shadow-sm dark:bg-slate-700 dark:text-brand-primary-light'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
