import { apiFetch } from './client'

export interface VersionResponse {
  version: string
  baseVersion?: string
  fiveSegment?: string
  channel?: string
}

export const getVersion = () => apiFetch<VersionResponse>('/version')
