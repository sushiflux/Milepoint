import { useEffect, useRef, useState } from 'react'
import { getTranscriptionSettings, transcribeAudio } from '../api/transcription'
import { ApiError } from '../api/client'
import type { TranscriptionProvider } from '../api/types'

interface Props {
  onTranscribed: (text: string) => void
  /** Optional: live interim results while recording with the Browser provider (Web Speech API). */
  onInterimResult?: (text: string) => void
  className?: string
}

type DictationState = 'idle' | 'recording' | 'processing' | 'error'

const MIC_ICON = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <rect x="7" y="2.5" width="6" height="9.5" rx="3" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0" />
    <path d="M10 15v2.5M7 17.5h6" />
  </svg>
)

const STOP_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
    <rect x="5" y="5" width="10" height="10" rx="1.5" />
  </svg>
)

const SPINNER_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 animate-spin">
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth={1.8} strokeOpacity={0.25} />
    <path d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
)

// Prefer a widely-supported, reasonably compressed container. Browsers advertise support
// differently, so probe at call time rather than hardcoding one type.
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
      return type
    }
  }
  return ''
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

/**
 * Reusable dictation button. Behavior depends on the admin-configured transcription provider:
 * - Browser: uses the native Web Speech API entirely client-side, no backend call.
 * - Whisper/OpenAI/Google: records audio via MediaRecorder, uploads it to POST /api/transcribe
 *   once recording stops, and reports the resulting text.
 */
export default function DictationButton({ onTranscribed, onInterimResult, className }: Props) {
  const [provider, setProvider] = useState<TranscriptionProvider | null>(null)
  const [state, setState] = useState<DictationState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let cancelled = false
    getTranscriptionSettings()
      .then((settings) => {
        if (!cancelled) setProvider(settings.provider)
      })
      .catch(() => {
        // Best-effort - if settings can't be loaded (e.g. transient network issue), the button
        // stays disabled below via provider === null rather than guessing a provider.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const browserSupportsSpeech = getSpeechRecognitionCtor() !== null

  function showError(message: string) {
    setErrorMessage(message)
    setState('error')
    window.setTimeout(() => {
      setErrorMessage((current) => (current === message ? null : current))
      setState((current) => (current === 'error' ? 'idle' : current))
    }, 4000)
  }

  function startBrowserRecognition() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      showError('Spracherkennung wird von diesem Browser nicht unterstützt.')
      return
    }

    const recognition = new Ctor()
    recognition.lang = 'de-DE'
    recognition.continuous = true
    recognition.interimResults = true

    let finalText = ''

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalText += `${result[0].transcript} `
        } else {
          interim += result[0].transcript
        }
      }
      onInterimResult?.((finalText + interim).trim())
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      showError('Spracherkennung fehlgeschlagen.')
      recognitionRef.current = null
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setState((current) => (current === 'recording' ? 'idle' : current))
      const text = finalText.trim()
      if (text) onTranscribed(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    setState('recording')
  }

  function stopBrowserRecognition() {
    recognitionRef.current?.stop()
  }

  async function startMediaRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null

        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        chunksRef.current = []

        if (blob.size === 0) {
          setState('idle')
          return
        }

        setState('processing')
        try {
          const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm'
          const { text } = await transcribeAudio(blob, `dictation.${extension}`)
          setState('idle')
          if (text) onTranscribed(text)
        } catch (err) {
          const message = err instanceof ApiError ? err.message || 'Transkription fehlgeschlagen.' : 'Transkription fehlgeschlagen.'
          showError(message)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch {
      showError('Mikrofonzugriff nicht möglich. Bitte Berechtigung prüfen.')
    }
  }

  function stopMediaRecording() {
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current = null
  }

  function handleClick() {
    if (state === 'processing') return

    if (state === 'recording') {
      if (provider === 'Browser') stopBrowserRecognition()
      else stopMediaRecording()
      return
    }

    if (provider === 'Browser') startBrowserRecognition()
    else void startMediaRecording()
  }

  const disabled = provider === null || (provider === 'Browser' && !browserSupportsSpeech)
  const title =
    provider === null
      ? 'Diktieren wird geladen…'
      : provider === 'Browser' && !browserSupportsSpeech
        ? 'Spracherkennung wird von diesem Browser nicht unterstützt (z.B. Firefox). Bitte Chrome/Edge verwenden.'
        : state === 'recording'
          ? 'Aufnahme beenden'
          : state === 'processing'
            ? 'Transkription läuft…'
            : 'Diktieren'

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === 'processing'}
        title={title}
        aria-label={title}
        className={
          className ??
          `flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            state === 'recording'
              ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-500/15 dark:text-red-400'
              : state === 'error'
                ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-500/15 dark:text-red-400'
                : 'border-slate-200/80 bg-slate-100/50 text-slate-600 hover:bg-slate-200/70 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
          }`
        }
      >
        {state === 'recording' ? (
          <span className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
            {STOP_ICON}
          </span>
        ) : state === 'processing' ? (
          SPINNER_ICON
        ) : (
          MIC_ICON
        )}
      </button>

      {errorMessage && (
        <span
          role="alert"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-lg dark:border-red-800 dark:bg-slate-900 dark:text-red-400"
        >
          {errorMessage}
        </span>
      )}
    </div>
  )
}
