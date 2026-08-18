import { apiFetch } from './client'

export const getPreferences = () => apiFetch<Record<string, string>>('/preferences')

export const setPreference = (key: string, value: string) =>
  apiFetch<void>(`/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
