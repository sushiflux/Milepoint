import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTranscriptionSettings, transcribeAudio } from '../api/transcription'
import { ApiError } from '../api/client'
import type { TranscriptionProvider } from '../api/types'
import { usePreferences } from '../context/PreferencesContext'
import { useClickOutside } from '../hooks/useClickOutside'
import { useMicLevels } from '../hooks/useMicLevels'

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

const CHEVRON_ICON = (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 shrink-0 opacity-60">
    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
)

const MIC_DEVICE_PREFERENCE_KEY = 'dictation.micDeviceId'

/**
 * Small mixer-style equalizer bars shown next to the mic button while recording, driven by
 * `useMicLevels`'s live per-band levels (0..1 each). This exists per explicit user feedback that
 * the previous `animate-ping` red ring wasn't enough feedback that the mic is actually listening
 * and reacting to voice - the bars are the "yes, it hears you right now" signal instead. Rounded
 * bar caps + a CSS transition on top of the hook's own easing keep the motion looking smooth
 * rather than snapping between FFT reads; kept to the existing recording-state red accent (see
 * the button's own `border-red-300 bg-red-50 text-red-600 dark:border-red-800 ...` classes) so it
 * reads as part of the same state, not a new/third color.
 */
function EqualizerBars({ levels }: { levels: number[] }) {
  return (
    <span className="flex h-8 items-center gap-[3px] px-1.5" aria-hidden="true">
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-red-500 transition-[height] duration-100 ease-out dark:bg-red-400"
          style={{ height: `${4 + level * 18}px` }}
        />
      ))}
    </span>
  )
}

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
 *
 * A small chevron next to the mic opens a device picker (navigator.mediaDevices.enumerateDevices)
 * so the user can switch between Windows input devices from inside the app - per explicit user
 * feedback, switching microphones used to mean going into the browser's own site settings and
 * revoking/re-granting the mic permission every time. Once permission is granted for this origin,
 * switching the deviceId we request does NOT re-trigger the browser's permission prompt, so this
 * genuinely avoids that round-trip. The permission prompt itself (first-ever grant) is a browser
 * security boundary that can't be skipped from application code - see the `not-allowed`/`NotAllowedError`
 * messages below for how that's explained instead. The chosen device is remembered as a DB-backed
 * preference (never localStorage, per project convention) so it survives across sessions/devices.
 */
export default function DictationButton({ onTranscribed, onInterimResult, className }: Props) {
  const { getPreference, setPreference } = usePreferences()
  const [provider, setProvider] = useState<TranscriptionProvider | null>(null)
  const [state, setState] = useState<DictationState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const preferredDeviceId = getPreference(MIC_DEVICE_PREFERENCE_KEY, '')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  // Mic stream used only for the equalizer's AnalyserNode - never for recording/transcription
  // itself. For the MediaRecorder path (Whisper/OpenAI/Google) this is just streamRef's own
  // stream, reused as-is. The Web Speech API path (Browser provider) has no stream of its own, so
  // startBrowserRecognition() requests a second, separate one purely for this visualization - see
  // that function below for why a second getUserMedia call is unavoidable there.
  const visualizerStreamRef = useRef<MediaStream | null>(null)
  const [visualizerStream, setVisualizerStream] = useState<MediaStream | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const [errorAlign, setErrorAlign] = useState<'center' | 'left' | 'right'>('center')
  const [deviceMenuAlign, setDeviceMenuAlign] = useState<'left' | 'right'>('left')

  const micLevels = useMicLevels(visualizerStream)

  const closeDeviceMenu = useCallback(() => setDeviceMenuOpen(false), [])
  useClickOutside(containerRef, deviceMenuOpen, closeDeviceMenu)

  const stopVisualizerStream = useCallback(() => {
    visualizerStreamRef.current?.getTracks().forEach((track) => track.stop())
    visualizerStreamRef.current = null
    setVisualizerStream(null)
  }, [])

  // Shared viewport-edge check for both popups this button can show (the error message and the
  // device menu) - per explicit user feedback that the error popup used to run off the window
  // near the edge and become unreadable. `align` decides which corner of the popup pins to the
  // button, so the popup grows inward from the edge instead of pushing past it.
  function computeEdgeAlign(popupWidth: number): 'left' | 'right' {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return 'left'
    const MARGIN = 8
    return rect.left + popupWidth > window.innerWidth - MARGIN ? 'right' : 'left'
  }

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
      visualizerStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Device labels are only populated once mic permission has been granted at least once (a
  // browser privacy measure) - listing devices before that still works, just with blank labels,
  // which the render below falls back to a generic "Mikrofon N" label for. setDevices only ever
  // happens inside the .then() callback, never synchronously in an effect body, matching
  // PreferencesContext's fetch pattern.
  const loadDevices = useCallback(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === 'audioinput')))
      .catch(() => {
        // Best-effort - the device picker just won't show anything if this fails.
      })
  }, [])

  useEffect(() => {
    loadDevices()
    // Devices can change at runtime (USB headset plugged/unplugged) - keep the list current so a
    // newly connected mic shows up in the picker without needing to reopen the app.
    navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', loadDevices)
  }, [loadDevices])

  const browserSupportsSpeech = getSpeechRecognitionCtor() !== null

  function deviceLabel(device: MediaDeviceInfo, index: number): string {
    return device.label || `Mikrofon ${index + 1}`
  }

  function showError(message: string) {
    // Position the popup so it never runs off the viewport - anchored to the button's actual
    // horizontal position rather than always centered under it (the previous fixed
    // left-1/2 + -translate-x-1/2 clipped the message whenever the button sat near the window
    // edge, e.g. in a narrow editor toolbar - the user's exact complaint: the error text ran
    // outside the window and couldn't be read in full).
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      const POPUP_WIDTH = 260
      const MARGIN = 8
      if (rect.left + rect.width / 2 - POPUP_WIDTH / 2 < MARGIN) setErrorAlign('left')
      else if (rect.left + rect.width / 2 + POPUP_WIDTH / 2 > window.innerWidth - MARGIN) setErrorAlign('right')
      else setErrorAlign('center')
    }
    setErrorMessage(message)
    setState('error')
    window.setTimeout(() => {
      setErrorMessage((current) => (current === message ? null : current))
      setState((current) => (current === 'error' ? 'idle' : current))
    }, 6000)
  }

  // Shared across both the Web Speech API path (which has no deviceId concept of its own - it
  // always uses the OS/browser default input) and the MediaRecorder path (which explicitly
  // requests a device) so error copy stays consistent and actually explains what to do, per
  // explicit user feedback that generic messages weren't helpful.
  function micPermissionDeniedMessage(): string {
    return 'Mikrofonzugriff wurde blockiert. Klicke auf das Schloss-/Kamera-Symbol links in der Adressleiste, erlaube das Mikrofon dauerhaft und lade die Seite neu.'
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
      // Surface the actual browser error code - the Web Speech API's errors mostly map to fixable
      // causes (not-allowed = mic permission, network = the browser couldn't reach its speech
      // recognition backend, service-not-allowed = browser policy blocked it) rather than "broken".
      const reasons: Record<string, string> = {
        'not-allowed': micPermissionDeniedMessage(),
        'service-not-allowed': 'Der Browser hat den Zugriff auf den Spracherkennungsdienst blockiert.',
        network: 'Der Browser konnte den Spracherkennungsdienst nicht erreichen (Netzwerkproblem).',
        'audio-capture': 'Kein Mikrofon gefunden. Bitte prüfe, ob ein Mikrofon angeschlossen und in Windows als Eingabegerät aktiv ist.',
        'language-not-supported': 'Die eingestellte Sprache wird nicht unterstützt.',
      }
      showError(reasons[event.error] ?? `Spracherkennung fehlgeschlagen (${event.error}).`)
      recognitionRef.current = null
    }

    recognition.onend = () => {
      recognitionRef.current = null
      stopVisualizerStream()
      setState((current) => (current === 'recording' ? 'idle' : current))
      const text = finalText.trim()
      if (text) onTranscribed(text)
    }

    recognitionRef.current = recognition
    recognition.start()
    setState('recording')

    // The Web Speech API has no MediaStream of its own to tap for the equalizer (it's an opaque
    // browser-internal recognition service, not something we feed audio into ourselves) - request
    // a second, independent mic stream purely to drive the visualization. Best-effort: if this
    // second permission prompt/request fails for any reason, recognition itself is already running
    // and keeps working - the user just doesn't get the equalizer bars, not a hard error, since the
    // actual dictation doesn't depend on this stream at all. Respects the same device preference as
    // the MediaRecorder path so the bars reflect whichever mic was actually chosen.
    const audioConstraint: MediaTrackConstraints | boolean = preferredDeviceId
      ? { deviceId: { ideal: preferredDeviceId } }
      : true
    navigator.mediaDevices
      ?.getUserMedia({ audio: audioConstraint })
      .then((stream) => {
        // Recognition may have already ended (fast stop) by the time this resolves - don't leave
        // a dangling stream open in that case.
        if (recognitionRef.current !== recognition) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        visualizerStreamRef.current = stream
        setVisualizerStream(stream)
      })
      .catch(() => {
        // Best-effort, see comment above - no user-visible error for this one.
      })
  }

  function stopBrowserRecognition() {
    recognitionRef.current?.stop()
  }

  async function startMediaRecording() {
    try {
      // Request the preferred device explicitly when we have one; browsers treat an unknown/
      // stale deviceId as "ideal" (falls back to the default) rather than throwing, so this is
      // safe even right after a device was unplugged.
      const audioConstraint: MediaTrackConstraints | boolean = preferredDeviceId
        ? { deviceId: { ideal: preferredDeviceId } }
        : true
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })
      streamRef.current = stream
      // Reuse the same stream for the equalizer - no second getUserMedia call needed here, unlike
      // the Web Speech API path. Not routed through visualizerStreamRef/stopVisualizerStream since
      // its lifecycle (stopping tracks) is already fully owned by streamRef/recorder.onstop below;
      // this only needs to clear the analyser-facing state once recording stops.
      setVisualizerStream(stream)
      // Device labels are blank until permission is granted at least once - refresh the list now
      // that we have it, so the picker shows real names from here on instead of "Mikrofon N".
      loadDevices()
      const mimeType = pickMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setVisualizerStream(null)

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
    } catch (err) {
      // getUserMedia rejects with a DOMException whose .name identifies the cause - distinguish
      // "permission blocked" (fixable via browser site settings, see micPermissionDeniedMessage)
      // from "no device" (a hardware/OS problem) instead of one generic catch-all message.
      const name = err instanceof DOMException ? err.name : null
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showError(micPermissionDeniedMessage())
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        showError('Kein Mikrofon gefunden. Bitte prüfe, ob ein Mikrofon angeschlossen und in Windows als Eingabegerät aktiv ist.')
      } else if (name === 'NotReadableError') {
        showError('Auf das Mikrofon kann nicht zugegriffen werden - vermutlich wird es bereits von einer anderen Anwendung verwendet.')
      } else {
        showError('Mikrofonzugriff nicht möglich. Bitte Berechtigung prüfen.')
      }
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

  function selectDevice(deviceId: string) {
    setPreference(MIC_DEVICE_PREFERENCE_KEY, deviceId)
    setDeviceMenuOpen(false)
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

  // The device picker only affects the MediaRecorder path (Whisper/OpenAI/Google) - the Web
  // Speech API used for the Browser provider has no deviceId concept, it always listens on
  // whatever the OS/browser default input is, so showing a picker there would be misleading.
  const showDevicePicker = provider !== null && provider !== 'Browser' && (devices?.length ?? 0) > 0

  const selectedDeviceLabel = useMemo(() => {
    if (!devices) return null
    const index = devices.findIndex((d) => d.deviceId === preferredDeviceId)
    if (index === -1) return 'Standardmikrofon'
    return deviceLabel(devices[index], index)
  }, [devices, preferredDeviceId])

  return (
    <div className="relative inline-flex items-center" ref={containerRef}>
      <div ref={buttonRef} className="flex items-center">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || state === 'processing'}
          title={title}
          aria-label={title}
          className={
            className ??
            `flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              showDevicePicker ? 'rounded-r-none border-r-0' : ''
            } ${
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

        {/* Equalizer bars: only actually mounted while recording (real levels), but the wrapper's
            width/opacity transition runs every time so the button doesn't visibly jump when it
            appears/disappears - matches computeEdgeAlign's assumption that buttonRef's own layout
            (the mic + chevron buttons) stays stable, since this sits outside that ref entirely. */}
        <span
          className={`overflow-hidden transition-all duration-200 ease-out ${
            state === 'recording' ? 'ml-1.5 w-[76px] opacity-100' : 'ml-0 w-0 opacity-0'
          }`}
        >
          {state === 'recording' && (
            <span className="flex items-center rounded-lg border border-red-200/70 bg-red-50/70 dark:border-red-800/60 dark:bg-red-500/10">
              <EqualizerBars levels={micLevels} />
            </span>
          )}
        </span>

        {showDevicePicker && (
          <button
            type="button"
            onClick={() => {
              setDeviceMenuAlign(computeEdgeAlign(256)) // 256px = the menu's w-64
              setDeviceMenuOpen((prev) => !prev)
            }}
            disabled={disabled}
            title={`Mikrofon wählen (aktuell: ${selectedDeviceLabel ?? 'Standardmikrofon'})`}
            aria-label="Mikrofon wählen"
            className={`flex h-8 w-5 items-center justify-center rounded-r-lg border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              deviceMenuOpen
                ? 'border-brand-primary/50 bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light'
                : 'border-slate-200/80 bg-slate-100/50 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
          >
            {CHEVRON_ICON}
          </button>
        )}
      </div>

      {deviceMenuOpen && devices && (
        <div
          className={`absolute top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95 ${
            deviceMenuAlign === 'left' ? 'left-0' : 'right-0'
          }`}
        >
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Mikrofon
          </p>
          <button
            type="button"
            onClick={() => selectDevice('')}
            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
              preferredDeviceId === ''
                ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light'
                : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
            }`}
          >
            <span className="truncate">Standardmikrofon (Windows)</span>
          </button>
          {devices.map((device, index) => (
            <button
              key={device.deviceId}
              type="button"
              onClick={() => selectDevice(device.deviceId)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                preferredDeviceId === device.deviceId
                  ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/20 dark:text-brand-primary-light'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70'
              }`}
            >
              <span className="truncate">{deviceLabel(device, index)}</span>
            </button>
          ))}
          {devices.every((d) => !d.label) && (
            <p className="px-2 pb-0.5 pt-2 text-[10px] text-slate-400 dark:text-slate-500">
              Gerätenamen erscheinen nach der ersten erteilten Mikrofonberechtigung.
            </p>
          )}
        </div>
      )}

      {errorMessage && (
        <span
          role="alert"
          className={`absolute top-full z-50 mt-1.5 w-max max-w-[260px] rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium leading-snug text-red-600 shadow-lg dark:border-red-800 dark:bg-slate-900 dark:text-red-400 ${
            errorAlign === 'center'
              ? 'left-1/2 -translate-x-1/2'
              : errorAlign === 'left'
                ? 'left-0'
                : 'right-0'
          }`}
        >
          {errorMessage}
        </span>
      )}
    </div>
  )
}
