import { apiFetch, apiFetchMultipart } from './client'
import type { TranscriptionSettings, UpdateTranscriptionSettingsRequest } from './types'

export const getTranscriptionSettings = () => apiFetch<TranscriptionSettings>('/transcription-settings')

export const updateTranscriptionSettings = (request: UpdateTranscriptionSettingsRequest) =>
  apiFetch<TranscriptionSettings>('/transcription-settings', {
    method: 'PUT',
    body: JSON.stringify(request),
  })

// audio's multipart field name must be "audio" - see backend TranscriptionController.Transcribe.
export function transcribeAudio(audio: Blob, fileName: string) {
  const formData = new FormData()
  formData.append('audio', audio, fileName)
  return apiFetchMultipart<{ text: string }>('/transcribe', formData)
}
