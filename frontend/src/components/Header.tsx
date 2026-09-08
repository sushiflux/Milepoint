import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { getVersion } from '../api/version'
import ThemeToggle from './ThemeToggle'
import ProjectSwitcher from './ProjectSwitcher'
import logoDark from '../assets/logo-dark.svg'
import logoLight from '../assets/logo-light.svg'
import wordmarkDark from '../assets/wordmark-dark.svg'
import wordmarkLight from '../assets/wordmark-light.svg'

const SEARCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-slate-400">
    <circle cx="9" cy="9" r="6" />
    <path d="M17 17l-3.5-3.5" />
  </svg>
)

const LOGOUT_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d="M7.5 17.5H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1h3.5" />
    <path d="M13 14l4-4-4-4" />
    <path d="M17 10H7.5" />
  </svg>
)

const USER_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 opacity-60">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
)

const SETTINGS_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d="M8.3 2.5h3.4l.5 2.2a5.9 5.9 0 011.6.93l2.2-.7 1.7 2.94-1.75 1.5a5.9 5.9 0 010 1.86l1.75 1.5-1.7 2.94-2.2-.7a5.9 5.9 0 01-1.6.93l-.5 2.2H8.3l-.5-2.2a5.9 5.9 0 01-1.6-.93l-2.2.7-1.7-2.94 1.75-1.5a5.9 5.9 0 010-1.86L2.3 8.87 4 5.93l2.2.7a5.9 5.9 0 011.6-.93l.5-2.2z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
)

export default function Header() {
  const { displayName, signOut } = useAuth()
  const { theme } = useTheme()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const logo = theme === 'dark' ? logoDark : logoLight
  const wordmark = theme === 'dark' ? wordmarkDark : wordmarkLight

  // Fetched once on mount rather than per dropdown-open - GET /api/version is cheap and public,
  // but there's no reason to re-fetch it every time the user opens their profile menu since it
  // only changes when the backend container is rebuilt/restarted anyway.
  useEffect(() => {
    getVersion()
      .then((res) => setAppVersion(res.version))
      .catch(() => setAppVersion(null))
  }, [])

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-xl transition-colors dark:border-slate-800/70 dark:bg-[#0b0a1a]/85">
      {/* Left Navigation & Active Project Breadcrumb */}
      <div className="flex items-center gap-3.5">
        <Link
          to="/"
          className="group flex items-center rounded-lg px-1.5 py-1 transition-all hover:bg-slate-100 dark:hover:bg-slate-800/60"
          title="Zur Dashboard Startseite"
        >
          {/* Logo-Icon auf kleinen Bildschirmen / Mobilgeräte */}
          <img src={logo} alt="Milepoint" className="h-6 w-auto sm:hidden transition-transform group-hover:scale-105" />
          {/* Wortmarke auf Desktop / normalen Bildschirmen */}
          <img src={wordmark} alt="Milepoint" className="hidden sm:block h-4.5 w-auto transition-transform group-hover:scale-105" />
        </Link>

        <span className="text-slate-300 dark:text-slate-700 font-light text-sm select-none">/</span>

        <ProjectSwitcher />
      </div>

      {/* Middle Global Search Trigger */}
      <div className="hidden md:flex items-center w-full max-w-xs">
        <div
          title="Schnellsuche (Coming Soon)"
          className="flex h-8 w-full items-center justify-between rounded-lg border border-slate-200/80 bg-slate-100/60 px-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60"
        >
          <span className="flex items-center gap-2 truncate">
            {SEARCH_ICON}
            <span className="truncate">Suchen in Milepoint...</span>
          </span>
          <kbd className="hidden lg:inline-block rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Right Controls & User Profile Dropdown */}
      <div className="flex items-center gap-3">
        {/* Realtime Status Indicator Pill */}
        <div
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
          title="Echtzeit-Synchronisierung aktiv"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Synchronisiert
        </div>

        <ThemeToggle />

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700/80" />

        {/* User Profile Popover */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            title="Benutzerprofil & Einstellungen"
            className="flex items-center gap-2 rounded-full p-0.5 transition-all hover:ring-2 hover:ring-brand-primary/40 focus:outline-none"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white shadow-sm dark:bg-brand-primary-light">
              {(displayName ?? '?').slice(0, 1).toUpperCase()}
            </span>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95">
                {/* User Header */}
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-primary/10 text-sm font-bold text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light">
                    {(displayName ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{displayName}</p>
                    <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                      Benutzer
                    </span>
                  </div>
                </div>

                {/* Profile Actions */}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-200">
                    <span className="flex items-center gap-2">
                      {USER_ICON}
                      Status
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ● Online
                    </span>
                  </div>

                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"
                  >
                    {SETTINGS_ICON}
                    Einstellungen
                  </Link>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false)
                      signOut()
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    {LOGOUT_ICON}
                    Abmelden
                  </button>
                </div>

                {/* Footer: app version, always visible somewhere in the UI per project convention */}
                <div className="mt-2 border-t border-slate-100 pt-2 text-center text-[10px] font-medium text-slate-400 dark:border-slate-800 dark:text-slate-500">
                  Milepoint {appVersion ?? '–'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
