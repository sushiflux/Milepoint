import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import ThemeToggle from './ThemeToggle'
import logoDark from '../assets/logo-dark.svg'
import logoLight from '../assets/logo-light.svg'
import wordmarkDark from '../assets/wordmark-dark.svg'
import wordmarkLight from '../assets/wordmark-light.svg'

const WAFFLE_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="11" y="3" width="6" height="6" rx="1" />
    <rect x="3" y="11" width="6" height="6" rx="1" />
    <rect x="11" y="11" width="6" height="6" rx="1" />
  </svg>
)

const LOGOUT_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d="M7.5 17.5H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h3.5" />
    <path d="M13 14l4-4-4-4" />
    <path d="M17 10H7.5" />
  </svg>
)

export default function Header() {
  const { displayName, signOut } = useAuth()
  const { theme } = useTheme()
  const logo = theme === 'dark' ? logoDark : logoLight
  const wordmark = theme === 'dark' ? wordmarkDark : wordmarkLight

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm dark:border-slate-800 dark:bg-[#0b0a1a]">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          title="Dashboard"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {WAFFLE_ICON}
        </Link>

        <Link to="/" className="flex items-center gap-2" title="Startseite">
          <img src={logo} alt="" className="h-6 w-auto" />
          <img src={wordmark} alt="Milepoint" className="hidden sm:block h-4 w-auto" />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-3 pl-1">
          <div className="flex items-center gap-2">
            <span
              title={displayName ?? undefined}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light"
            >
              {(displayName ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
              {displayName}
            </span>
          </div>
          
          <button
            onClick={signOut}
            title="Abmelden"
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-red-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
          >
            {LOGOUT_ICON}
          </button>
        </div>
      </div>
    </header>
  )
}
