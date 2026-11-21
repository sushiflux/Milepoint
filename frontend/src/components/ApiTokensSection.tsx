import { useEffect, useState } from 'react'
import { createApiToken, deleteApiToken, listApiTokens, type ApiTokenDto } from '../api/tokens'
import { ApiError } from '../api/client'
import { ConfirmDialog } from './ConfirmDialog'

const MAX_NAME_LENGTH = 100

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'Unbegrenzt (kein Ablauf)', days: null },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: '1 Jahr (365 Tage)', days: 365 },
]

const inputClass =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100'

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function ApiTokensSection() {
  const [tokens, setTokens] = useState<ApiTokenDto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [createdSecret, setCreatedSecret] = useState<{ name: string; token: string } | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedError, setCopiedError] = useState(false)

  const [revokeTarget, setRevokeTarget] = useState<ApiTokenDto | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listApiTokens()
      .then((data) => {
        if (active) {
          setTokens(data)
          setLoadError(null)
        }
      })
      .catch((err) => {
        if (active) {
          setLoadError(err instanceof ApiError && err.message ? err.message : 'API-Tokens konnten nicht geladen werden.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const trimmedName = name.trim()
  const nameEmpty = nameTouched && trimmedName.length === 0
  const nameTooLong = trimmedName.length > MAX_NAME_LENGTH
  const nameInvalid = nameEmpty || nameTooLong
  const canCreate = !creating && trimmedName.length > 0 && !nameTooLong

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setNameTouched(true)
    if (!canCreate) return

    setCreating(true)
    setCreateError(null)
    setCopiedToken(false)

    try {
      const response = await createApiToken(trimmedName, expiresInDays)
      setTokens((prev) => [response.token, ...prev])
      setCreatedSecret({ name: response.token.name, token: response.plainTextToken })
      setName('')
      setNameTouched(false)
    } catch (err) {
      setCreateError(err instanceof ApiError && err.message ? err.message : 'API-Token konnte nicht erstellt werden.')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyToken() {
    if (!createdSecret) return
    try {
      await navigator.clipboard.writeText(createdSecret.token)
      setCopiedToken(true)
      window.setTimeout(() => setCopiedToken(false), 3000)
    } catch {
      // Clipboard API may be blocked in non-HTTPS contexts; keep the token selectable.
    }
  }

  async function handleCopyError(message: string) {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedError(true)
      window.setTimeout(() => setCopiedError(false), 2500)
    } catch {
      // Keep text selectable even if clipboard access is denied.
    }
  }

  async function handleConfirmRevoke() {
    if (!revokeTarget || revoking) return
    setRevoking(true)
    setRevokeError(null)
    try {
      await deleteApiToken(revokeTarget.id)
      setTokens((prev) => prev.filter((t) => t.id !== revokeTarget.id))
      setRevokeTarget(null)
    } catch (err) {
      setRevokeError(err instanceof ApiError && err.message ? err.message : 'API-Token konnte nicht widerrufen werden.')
      setRevokeTarget(null)
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Neues API-Token</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Für externe Tools wie den Milepoint MCP-Server (Claude Desktop, Antigravity). Der Token-Wert wird nur einmal nach dem Erstellen angezeigt.
        </p>

        <form onSubmit={handleCreate} className="mt-4 max-w-md space-y-3">
          <div>
            <label htmlFor="api-token-name" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Bezeichnung
            </label>
            <input
              id="api-token-name"
              type="text"
              placeholder="z. B. Claude Desktop oder Antigravity"
              className={`${inputClass} ${nameInvalid ? 'border-red-500 focus:ring-red-500/40 dark:border-red-500' : ''}`}
              aria-invalid={nameInvalid}
              value={name}
              onChange={(e) => {
                setNameTouched(true)
                setName(e.target.value)
                if (createError) setCreateError(null)
              }}
            />
            {nameEmpty && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">Bitte gib eine Bezeichnung für das Token ein.</p>
            )}
            {nameTooLong && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                Zu lang: {trimmedName.length} von höchstens {MAX_NAME_LENGTH} Zeichen.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="api-token-expiry" className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Gültigkeit
            </label>
            <select
              id="api-token-expiry"
              className={inputClass}
              value={expiresInDays === null ? 'never' : String(expiresInDays)}
              onChange={(e) => setExpiresInDays(e.target.value === 'never' ? null : Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.label} value={opt.days === null ? 'never' : String(opt.days)} className="bg-white dark:bg-slate-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {createError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              <p className="select-all break-words">{createError}</p>
              <button
                type="button"
                onClick={() => handleCopyError(createError)}
                className="mt-1.5 font-semibold underline hover:no-underline"
              >
                {copiedError ? 'Kopiert' : 'Fehlertext kopieren'}
              </button>
            </div>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={!canCreate}
              className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
            >
              {creating ? 'Wird erstellt...' : 'API-Token erstellen'}
            </button>
          </div>
        </form>

        {createdSecret && (
          <div className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50/90 p-4 dark:border-emerald-800 dark:bg-emerald-950/40">
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Token „{createdSecret.name}“ erstellt
            </p>
            <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
              Kopiere diesen Schlüssel jetzt – aus Sicherheitsgründen wird er danach nie wieder vollständig angezeigt.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="flex-1 select-all break-all rounded-md border border-emerald-300/80 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-emerald-700 dark:bg-slate-900 dark:text-slate-100">
                {createdSecret.token}
              </code>
              <button
                type="button"
                onClick={handleCopyToken}
                className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
              >
                {copiedToken ? 'Kopiert' : 'Kopieren'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Aktive API-Tokens</h2>

        {revokeError && (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <p className="select-all break-words">{revokeError}</p>
            <button
              type="button"
              onClick={() => handleCopyError(revokeError)}
              className="mt-1.5 font-semibold underline hover:no-underline"
            >
              {copiedError ? 'Kopiert' : 'Fehlertext kopieren'}
            </button>
          </div>
        )}

        {loading && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">API-Tokens werden geladen...</p>
        )}

        {!loading && loadError && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <p className="select-all break-words">{loadError}</p>
            <button
              type="button"
              onClick={() => handleCopyError(loadError)}
              className="mt-1.5 font-semibold underline hover:no-underline"
            >
              {copiedError ? 'Kopiert' : 'Fehlertext kopieren'}
            </button>
          </div>
        )}

        {!loading && !loadError && tokens.length === 0 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Noch keine API-Tokens angelegt.</p>
        )}

        {!loading && !loadError && tokens.length > 0 && (
          <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {tokens.map((token) => (
              <div key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{token.name}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {token.tokenPrefix}…
                    </code>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Erstellt: {formatDate(token.createdAt)} · Läuft ab: {token.expiresAt ? formatDate(token.expiresAt) : 'Nie'} · Zuletzt genutzt: {formatDate(token.lastUsedAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRevokeTarget(token)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Widerrufen
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        title="API-Token widerrufen"
        message={
          revokeTarget
            ? `Möchtest du das API-Token „${revokeTarget.name}“ (${revokeTarget.tokenPrefix}…) wirklich widerrufen? Alle verbundenen Tools (z. B. Claude Desktop oder Antigravity) verlieren damit sofort den Zugriff.`
            : ''
        }
        confirmLabel="Widerrufen"
        cancelLabel="Abbrechen"
        isDanger
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}
