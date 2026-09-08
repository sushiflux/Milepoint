import { apiFetch } from './client'

export interface VersionResponse {
  version: string
}

export const getVersion = () => apiFetch<VersionResponse>('/version')
