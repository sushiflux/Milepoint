import { apiFetch } from './client'

export interface ApiTokenDto {
  id: string
  name: string
  tokenPrefix: string
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export interface CreatedApiTokenResponse {
  token: ApiTokenDto
  plainTextToken: string
}

export const listApiTokens = () =>
  apiFetch<ApiTokenDto[]>('/auth/tokens')

export const createApiToken = (name: string, expiresInDays: number | null) =>
  apiFetch<CreatedApiTokenResponse>('/auth/tokens', {
    method: 'POST',
    body: JSON.stringify({ name, expiresInDays }),
  })

export const deleteApiToken = (id: string) =>
  apiFetch<void>(`/auth/tokens/${id}`, {
    method: 'DELETE',
  })
