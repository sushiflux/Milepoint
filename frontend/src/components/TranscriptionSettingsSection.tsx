import { useEffect, useState } from 'react'
import { getTranscriptionSettings, updateTranscriptionSettings } from '../api/transcription'
import { ApiError } from '../api/client'
import type { TranscriptionProvider } from '../api/types'
import ToggleSwitch from './ToggleSwitch'

interface ProviderOption {
  value: TranscriptionProvider
  label: string
  description: string
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: 'Browser',
    label: 'Browser',
    description: 'Kostenlos, läuft direkt im Browser des Nutzers. Eingeschränkte Sprachqualität, nicht in jedem Browser verfügbar (z.B. Firefox).',
  },
  {
    value: 'Whisper',
    label: 'Selbst gehostet (Whisper)',
    description: 'Lokal gehostet - keine Daten verlassen den Server. Benötigt eine erreichbare Whisper-Endpoint-URL.',
  },
  {
    value: 'OpenAI',
    label: 'OpenAI',
    description: 'Cloud-API, benötigt einen eigenen OpenAI-API-Key.',
  },
  {
    value: 'Google',
    label: 'Google',
    description: 'Cloud-API (Gemini), benötigt einen eigenen Google-API-Key.',
  },
]

const LANGUAGE_OPTIONS = [
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
  { value: 'en-US', label: 'Englisch (USA)' },
  { value: 'en-GB', label: 'Englisch (Vereinigtes Königreich)' },
  { value: 'fr-FR', label: 'Französisch' },
  { value: 'es-ES', label: 'Spanisch' },
  { value: 'it-IT', label: 'Italienisch' },
]

const KEY_PLACEHOLDER = '•••• (unverändert lassen)'

export default function TranscriptionSettingsSection() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [provider, setProvider] = useState<TranscriptionProvider>('Browser')
  const [whisperEndpointUrl, setWhisperEndpointUrl] = useState('')
  const [language, setLanguage] = useState('de-DE')
  const [autoSummarize, setAutoSummarize] = useState(false)
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false)
  const [hasGoogleKey, setHasGoogleKey] = useState(false)
  const [openAiKeyInput, setOpenAiKeyInput] = useState('')
  const [googleKeyInput, setGoogleKeyInput] = useState('')

  useEffect(() => {
    let cancelled = false
    getTranscriptionSettings()
      .then((settings) => {
        if (cancelled) return
        setProvider(settings.provider)
        setWhisperEndpointUrl(settings.whisperEndpointUrl ?? '')
        setLanguage(settings.language)
        setAutoSummarize(settings.autoSummarize)
        setHasOpenAiKey(settings.hasOpenAiKey)
        setHasGoogleKey(settings.hasGoogleKey)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof ApiError ? err.message || 'Einstellungen konnten nicht geladen werden.' : 'Einstellungen konnten nicht geladen werden.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const autoSummarizeEligible = provider === 'OpenAI' || provider === 'Google'

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const updated = await updateTranscriptionSettings({
        provider,
        whisperEndpointUrl: whisperEndpointUrl.trim() || null,
        language,
        // Tri-state: empty input means "don't touch" unless the admin explicitly typed something.
        // A non-empty input replaces the key; there's no explicit "clear" UI affordance yet since
        // the backend has no dedicated clear button convention elsewhere - typing a single space
        // and saving is not a graceful way to clear, so this is a known gap (see summary).
        openAiApiKey: openAiKeyInput.length > 0 ? openAiKeyInput : null,
        googleApiKey: googleKeyInput.length > 0 ? googleKeyInput : null,
        autoSummarize,
      })
      setProvider(updated.provider)
      setWhisperEndpointUrl(updated.whisperEndpointUrl ?? '')
      setLanguage(updated.language)
      setAutoSummarize(updated.autoSummarize)
      setHasOpenAiKey(updated.hasOpenAiKey)
      setHasGoogleKey(updated.hasGoogleKey)
      setOpenAiKeyInput('')
      setGoogleKeyInput('')
      setSaveSuccess(true)
      window.setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message || 'Einstellungen konnten nicht gespeichert werden.' : 'Einstellungen konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Spracherkennung</h2>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Lädt…</p>
      </section>
    )
  }

  return (
    <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Spracherkennung</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Instanzweite Konfiguration für das Diktieren von Text per Mikrofon. Nur für Administratoren sichtbar.
      </p>

      {loadError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{loadError}</p>}

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Anbieter</p>
        <div className="mt-2 space-y-2">
          {PROVIDER_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                provider === option.value
                  ? 'border-brand-primary bg-brand-primary/5 dark:border-brand-primary-light dark:bg-brand-primary/10'
                  : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
              }`}
            >
              <input
                type="radio"
                name="transcriptionProvider"
                className="mt-0.5 accent-brand-primary"
                checked={provider === option.value}
                onChange={() => setProvider(option.value)}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {provider === 'Whisper' && (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100" htmlFor="whisper-endpoint">
            Whisper-Endpoint-URL
          </label>
          <input
            id="whisper-endpoint"
            type="text"
            value={whisperEndpointUrl}
            onChange={(e) => setWhisperEndpointUrl(e.target.value)}
            placeholder="https://whisper.internal.example.com"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
      )}

      {provider === 'OpenAI' && (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100" htmlFor="openai-key">
            OpenAI-API-Key
          </label>
          <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
            {hasOpenAiKey ? 'Ein Key ist aktuell gesetzt.' : 'Kein Key gesetzt.'}
          </p>
          <input
            id="openai-key"
            type="password"
            value={openAiKeyInput}
            onChange={(e) => setOpenAiKeyInput(e.target.value)}
            placeholder={hasOpenAiKey ? KEY_PLACEHOLDER : 'sk-…'}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
      )}

      {provider === 'Google' && (
        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100" htmlFor="google-key">
            Google-API-Key
          </label>
          <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
            {hasGoogleKey ? 'Ein Key ist aktuell gesetzt.' : 'Kein Key gesetzt.'}
          </p>
          <input
            id="google-key"
            type="password"
            value={googleKeyInput}
            onChange={(e) => setGoogleKeyInput(e.target.value)}
            placeholder={hasGoogleKey ? KEY_PLACEHOLDER : 'AIza…'}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100"
          />
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100" htmlFor="transcription-language">
          Sprache
        </label>
        <select
          id="transcription-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Automatisch zusammenfassen</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {autoSummarizeEligible
              ? 'Fasst diktierten Text automatisch zusammen.'
              : 'Nur bei den Anbietern OpenAI oder Google verfügbar.'}
          </p>
        </div>
        <ToggleSwitch
          checked={autoSummarize}
          onChange={setAutoSummarize}
          disabled={!autoSummarizeEligible}
          label="Automatisch zusammenfassen"
        />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        {saveSuccess && <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Gespeichert.</span>}
        {saveError && <span className="text-sm text-red-500 dark:text-red-400">{saveError}</span>}
      </div>
    </section>
  )
}
