import { useState } from 'react'
import { createAdminUser, deleteAdminUser, resetAdminUserPassword, type AdminUser, type UserRole } from '../../api/adminUsers'
import { adminErrorText, useAdminUsers } from '../../hooks/useAdminUsers'
import AddButton from '../AddButton'
import { ConfirmDialog } from '../ConfirmDialog'
import { ROLE_OPTIONS, roleLabel } from './roles'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100'

export default function AdminUsersTab() {
  const { users, loading, loadError, reload } = useAdminUsers()
  const [actionError, setActionError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('User')
  const [creating, setCreating] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState('')

  async function handleCreate() {
    setActionError(null)
    setCreating(true)
    try {
      await createAdminUser({ username: username.trim(), displayName: displayName.trim() || undefined, email: email.trim() || undefined, password, role })
      setUsername('')
      setDisplayName('')
      setEmail('')
      setPassword('')
      setRole('User')
      setShowCreate(false)
      await reload()
    } catch (err) {
      setActionError(adminErrorText(err, 'Benutzer konnte nicht angelegt werden.'))
    } finally {
      setCreating(false)
    }
  }

  async function handleResetPassword() {
    if (!passwordTarget) return
    setActionError(null)
    try {
      await resetAdminUserPassword(passwordTarget.id, newPassword)
      setPasswordTarget(null)
      setNewPassword('')
    } catch (err) {
      setActionError(`Passwort von '${passwordTarget.username}' konnte nicht gesetzt werden: ${adminErrorText(err, 'unbekannter Fehler')}`)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    setActionError(null)
    try {
      await deleteAdminUser(target.id)
      await reload()
    } catch (err) {
      setActionError(`'${target.username}' konnte nicht gelöscht werden: ${adminErrorText(err, 'unbekannter Fehler')}`)
    }
  }

  return (
    <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Benutzer</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Lokale Konten anlegen, Passwörter setzen und Konten löschen. Dein eigenes Konto und andere Administratoren lassen sich nicht
            ändern oder löschen. Rollen vergibst du im Reiter „Rollen".
          </p>
        </div>
        <AddButton label="Benutzer anlegen" onClick={() => setShowCreate((v) => !v)} icon={showCreate ? '×' : '+'} />
      </div>

      {showCreate && (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="new-username" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Benutzername *</label>
              <input id="new-username" className={`${inputClass} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div>
              <label htmlFor="new-displayname" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Anzeigename</label>
              <input id="new-displayname" className={`${inputClass} mt-1`} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="wie Benutzername" />
            </div>
            <div>
              <label htmlFor="new-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">E-Mail</label>
              <input id="new-email" type="email" className={`${inputClass} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" />
            </div>
            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Start-Passwort * (mind. 5 Zeichen)</label>
              <input id="new-password" type="password" className={`${inputClass} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div>
            <label htmlFor="new-role" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Rolle</label>
            <select id="new-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={`${inputClass} mt-1 max-w-xs`}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label} - {o.description}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || username.trim().length < 3 || password.length < 5}
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
          >
            {creating ? 'Legt an…' : 'Benutzer anlegen'}
          </button>
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{actionError}</p>}
      {loadError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{loadError}</p>}
      {loading && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Lädt…</p>}

      {!loading && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="px-3 py-2 font-semibold">Rolle</th>
                <th className="px-3 py-2 text-right font-semibold">Projekte</th>
                <th className="py-2 pl-3 text-right font-semibold">Aktionen</th>
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {user.username}
                      {user.email ? ` · ${user.email}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{roleLabel(user.role)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{user.ownedProjects}</td>
                  <td className="py-2.5 pl-3">
                    {user.canModify && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setPasswordTarget(user); setNewPassword('') }}
                          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Passwort setzen
                        </button>
                        <button
                          onClick={() => setDeleteTarget(user)}
                          className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        >
                          Löschen
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {passwordTarget && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <label htmlFor="reset-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            Neues Passwort für '{passwordTarget.username}'
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input id="reset-password" type="password" className={`${inputClass} max-w-xs`} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <button
              onClick={handleResetPassword}
              disabled={newPassword.length < 5}
              className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white hover:bg-brand-accent-light disabled:opacity-40"
            >
              Speichern
            </button>
            <button onClick={() => setPasswordTarget(null)} className="text-sm text-slate-500 hover:underline dark:text-slate-400">Abbrechen</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Benutzer löschen?"
        message={`'${deleteTarget?.username ?? ''}' wird gelöscht. Zugewiesene Aufgaben bleiben erhalten, sind danach aber niemandem mehr zugewiesen.`}
        confirmLabel="Löschen"
        isDanger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
