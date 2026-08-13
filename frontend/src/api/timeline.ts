import { apiFetch } from './client'
import type { Timeline } from './types'

export const getTimeline = (projectId: string) => apiFetch<Timeline>(`/projects/${projectId}/timeline`)
