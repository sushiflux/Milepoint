import { apiFetch } from './client'
import type { Milestone } from './types'

export const getMilestones = (projectId: string) => apiFetch<Milestone[]>(`/projects/${projectId}/milestones`)

export const createMilestone = (projectId: string, name: string, date: string, description?: string) =>
  apiFetch<Milestone>(`/projects/${projectId}/milestones`, {
    method: 'POST',
    body: JSON.stringify({ name, description, date }),
  })

export const deleteMilestone = (projectId: string, milestoneId: string) =>
  apiFetch<void>(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' })
