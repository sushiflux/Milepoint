import { useState } from 'react'
import { updateAdminUserRole, type AdminUser, type UserRole } from '../../api/adminUsers'
import { adminErrorText, useAdminUsers } from '../../hooks/useAdminUsers'
import { ConfirmDialog } from '../ConfirmDialog'
import { ROLE_OPTIONS } from './roles'

// What each role may do - mirrors the server-side checks (ProjectsController: Projektleiter and
// Admin see every project; AdminUsersController/TranscriptionController: Admin only).
const CAPABILITIES: { label: string; roles: UserRole[] }[] = [
  { label: 'Eigene und zugewiesene Projekte sehen', roles: ['User', 'Projektleiter', 'Admin'] },
  { label: 'Alle Projekte sehen', roles: ['Projektleiter', 'Admin'] },
  { label: 'App-Administration (Benutzer, Rollen, Spracherkennung)', roles: ['Admin'] },
]

export default function AdminRolesTab() {
  const { users, loading, loadError, reload } = useAdminUsers()
  const [actionError, setActionError] = useState<string | null>(null)
  const [promote, setPromote] = useState<AdminUser | null>(null)

  async function setRole(user: AdminUser, role: UserRole) {
    setActionError(null)
    try {
      await updateAdminUserRole(user.id, role)
      await reload()
    } catch (err) {
      setActionError(`Rolle von '${user.username}' konnte nicht geändert werden: ${adminErrorText(err, 'unbekannter Fehler')}`)
    }
  }

  function choose(user: AdminUser, role: UserRole) {
    if (!user.canModify || user.role === role) return
    // A second administrator can't be demoted or deleted by another admin afterwards - ask first.
    if (role === 'Admin') setPromote(user)
    else void setRole(user, role)
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Wer hat welche Rolle?</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Klicke in die Spalte der gewünschten Rolle, um sie zu vergeben. Dein eigenes Konto und andere Administratoren sind gesperrt.
        </p>

        {actionError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{actionError}</p>}
        {loadError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{loadError}</p>}
        {loading && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Lädt…</p>}

        {!loading && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-2 pr-3 text-left font-semibold">Benutzer</th>
                  {ROLE_OPTIONS.map((o) => (
                    <th key={o.value} className="px-3 py-2 text-center font-semibold">{o.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        {user.displayName}
                        {user.isSelf && <span className="ml-2 text-xs font-medium text-slate-500 dark:text-slate-400">(du)</span>}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.username}</p>
                    </td>
                    {ROLE_OPTIONS.map((o) => {
                      const active = user.role === o.value
                      return (
                        <td key={o.value} className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={`${user.username}: ${o.label}`}
                            disabled={!user.canModify}
                            title={user.canModify ? `Rolle „${o.label}" vergeben` : 'Nicht änderbar (eigenes Konto oder Administrator)'}
                            onClick={() => choose(user, o.value)}
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                              active
                                ? 'border-brand-primary bg-brand-primary dark:border-brand-primary-light dark:bg-brand-primary-light'
                                : 'border-slate-400 hover:border-brand-primary dark:border-slate-500 dark:hover:border-brand-primary-light'
                            } ${user.canModify ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                          >
                            {active && <span className="h-2 w-2 rounded-full bg-white dark:bg-slate-900" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Was darf welche Rolle?</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 text-left font-semibold">Berechtigung</th>
                {ROLE_OPTIONS.map((o) => (
                  <th key={o.value} className="px-3 py-2 text-center font-semibold">{o.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {CAPABILITIES.map((cap) => (
                <tr key={cap.label}>
                  <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{cap.label}</td>
                  {ROLE_OPTIONS.map((o) => {
                    const allowed = cap.roles.includes(o.value)
                    return (
                      <td key={o.value} className="px-3 py-2.5 text-center">
                        <span
                          aria-label={allowed ? 'erlaubt' : 'nicht erlaubt'}
                          className={allowed ? 'text-base font-bold text-emerald-700 dark:text-emerald-400' : 'text-base text-slate-500 dark:text-slate-400'}
                        >
                          {allowed ? '✓' : '–'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        isOpen={promote !== null}
        title="Zum Administrator machen?"
        message={`'${promote?.username ?? ''}' bekommt alle Rechte, inklusive dieser Verwaltung. Ein Administrator lässt sich danach von anderen Administratoren weder herabstufen noch löschen.`}
        confirmLabel="Zum Administrator machen"
        isDanger
        onConfirm={() => {
          const target = promote
          setPromote(null)
          if (target) void setRole(target, 'Admin')
        }}
        onCancel={() => setPromote(null)}
      />
    </div>
  )
}
