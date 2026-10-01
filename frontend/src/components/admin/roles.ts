import type { UserRole } from '../../api/adminUsers'

export const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'User', label: 'Benutzer', description: 'Sieht nur eigene und zugewiesene Projekte.' },
  { value: 'Projektleiter', label: 'Projektleiter', description: 'Sieht alle Projekte.' },
  { value: 'Admin', label: 'Administrator', description: 'Alles, inklusive App-Administration.' },
]

export const roleLabel = (role: UserRole) => ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role
