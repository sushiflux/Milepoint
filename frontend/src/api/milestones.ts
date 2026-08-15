import { apiFetch } from './client'
import type { Milestone, MilestoneDependencyDirection } from './types'

export const getMilestones = (projectId: string) => apiFetch<Milestone[]>(`/projects/${projectId}/milestones`)

export const createMilestone = (projectId: string, name: string, date: string, description?: string, parentWorkItemId?: string | null) =>
  apiFetch<Milestone>(`/projects/${projectId}/milestones`, {
    method: 'POST',
    body: JSON.stringify({ name, description, date, parentWorkItemId: parentWorkItemId || null }),
  })

export const deleteMilestone = (projectId: string, milestoneId: string) =>
  apiFetch<void>(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' })

export const addMilestoneDependency = (
  projectId: string,
  milestoneId: string,
  workItemId: string,
  direction: MilestoneDependencyDirection,
) =>
  apiFetch<void>(`/projects/${projectId}/milestones/${milestoneId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ workItemId, direction }),
  })

export const removeMilestoneDependency = (projectId: string, milestoneId: string, workItemId: string) =>
  apiFetch<void>(`/projects/${projectId}/milestones/${milestoneId}/dependencies/${workItemId}`, { method: 'DELETE' })
