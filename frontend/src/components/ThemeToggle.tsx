import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      title={theme === 'light' ? 'Dark Mode aktivieren' : 'Light Mode aktivieren'}
      className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
