import { useCallback, useEffect, useState } from 'react'
import { getAdminUsers, type AdminUser } from '../api/adminUsers'
import { ApiError } from '../api/client'

export function adminErrorText(err: unknown, fallback: string) {
  return err instanceof ApiError && err.message ? err.message : fallback
}

// Shared by the user list and the role matrix on the admin page: one place that loads and reloads
// the user list (reload is for event handlers after a change - the first load is the effect below).
export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setUsers(await getAdminUsers())
      setLoadError(null)
    } catch (err) {
      setLoadError(adminErrorText(err, 'Benutzerliste konnte nicht geladen werden.'))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getAdminUsers()
      .then((list) => {
        if (!cancelled) setUsers(list)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(adminErrorText(err, 'Benutzerliste konnte nicht geladen werden.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { users, loading, loadError, reload }
}
