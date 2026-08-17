import { useTheme } from '../context/ThemeContext'

const SUN_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-500 dark:text-amber-400">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MOON_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-indigo-500 dark:text-indigo-300">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Dunklen Modus aktivieren' : 'Hellen Modus aktivieren'}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-100/50 text-slate-600 transition-all hover:bg-slate-200/70 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {theme === 'light' ? MOON_ICON : SUN_ICON}
    </button>
  )
}
