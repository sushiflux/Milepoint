import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createProjectCategory,
  deleteProjectCategory,
  getProjectCategories,
  updateProjectCategory,
} from '../api/projectCategories'
import type { ProjectCategory } from '../api/types'
import { ApiError } from '../api/client'
import { validateMaxLength, validateRequired } from '../lib/validation'

export default function AdminProjectCategoriesPage() {
  const [categories, setCategories] = useState<ProjectCategory[]>([])
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const codeError = validateRequired(code, 'Code') ?? validateMaxLength(code, 10, 'Code')
  const nameError = validateRequired(name, 'Name')
  const hasBlockingErrors = Boolean(codeError) || Boolean(nameError)

  function markTouched(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function fieldMessage(field: string, fieldError: string | null) {
    return touched[field] && fieldError ? fieldError : null
  }

  async function load() {
    setCategories(await getProjectCategories())
  }

  useEffect(() => {
    load().catch(() => setError('Kategorien konnten nicht geladen werden.'))
  }, [])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setTouched({ code: true, name: true })
    if (hasBlockingErrors) return

    try {
      await createProjectCategory(code, name)
      setCode('')
      setName('')
      setTouched({})
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Kategorie konnte nicht angelegt werden.' : 'Unbekannter Fehler.')
    }
  }

  async function handleDelete(category: ProjectCategory) {
    setError(null)
    try {
      await deleteProjectCategory(category.id)
      await load()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message || 'Kategorie konnte nicht gelöscht werden (wird evtl. noch von einem Projekt verwendet).'
          : 'Unbekannter Fehler.',
      )
    }
  }

  async function handleRename(category: ProjectCategory, newName: string) {
    if (!newName.trim() || newName === category.name) return
    try {
      await updateProjectCategory(category.id, category.code, newName)
      await load()
    } catch {
      setError('Kategorie konnte nicht umbenannt werden.')
    }
  }

  const codeMsg = fieldMessage('code', codeError)
  const nameMsg = fieldMessage('name', nameError)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-amber-900/50 bg-amber-950/20 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-400">Admin-Bereich</p>
          <h1 className="text-lg font-semibold">Projekt-Kategorien</h1>
        </div>
        <Link to="/" className="rounded border border-slate-700 px-3 py-1 text-sm hover:bg-slate-800">
          Zurück zu Projekten
        </Link>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <p className="text-sm text-slate-400">
          Diese Kategorien stehen beim Anlegen eines Projekts als Typ-Auswahl zur Verfügung und bestimmen das
          Präfix des generierten Projekt-Keys (z.B. <span className="font-mono">WEB#a4b9c</span>).
        </p>

        <form onSubmit={handleCreate} className="flex items-start gap-2">
          <div className="w-28">
            <input
              className={`w-full rounded border bg-slate-900 px-3 py-2 text-sm uppercase ${codeMsg ? 'border-red-500' : 'border-slate-700'}`}
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onBlur={() => markTouched('code')}
              maxLength={10}
              required
            />
            {codeMsg && <p className="mt-1 text-xs text-red-400">{codeMsg}</p>}
          </div>
          <div className="flex-1">
            <input
              className={`w-full rounded border bg-slate-900 px-3 py-2 text-sm ${nameMsg ? 'border-red-500' : 'border-slate-700'}`}
              placeholder="Name (z.B. Web)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => markTouched('name')}
              required
            />
            {nameMsg && <p className="mt-1 text-xs text-red-400">{nameMsg}</p>}
          </div>
          <button type="submit" className="rounded bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500">
            Anlegen
          </button>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {categories.map((category) => (
            <li key={category.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-20 shrink-0 font-mono text-xs text-slate-500">{category.code}</span>
              <input
                defaultValue={category.name}
                onBlur={(e) => handleRename(category, e.target.value)}
                className="flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-slate-700 focus:border-slate-600 focus:outline-none"
              />
              <button
                onClick={() => handleDelete(category)}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-red-400 hover:bg-slate-800"
              >
                Löschen
              </button>
            </li>
          ))}
          {categories.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Noch keine Kategorien.</li>}
        </ul>
      </main>
    </div>
  )
}
