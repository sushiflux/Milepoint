import { useState } from 'react'
import { createCategory, deleteCategory, updateCategory } from '../../api/categories'
import { ApiError } from '../../api/client'
import type { ProjectCategory } from '../../api/types'
import { CATEGORY_COLOR_LABELS, CATEGORY_PALETTE, categoryBadgeClass, categorySwatchClass } from '../../lib/categoryColors'
import AddButton from '../AddButton'
import { ConfirmDialog } from '../ConfirmDialog'
import ToggleSwitch from '../ToggleSwitch'

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-brand-primary/50 dark:border-slate-700 dark:text-slate-100'

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError && err.message ? err.message : fallback)

interface Props {
  projectId: string
  categories: ProjectCategory[]
  onCategoriesChange: (categories: ProjectCategory[]) => void
}

function ColorPicker({ value, onChange, name }: { value: string; onChange: (color: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={`Farbe ${name}`} className="flex flex-wrap gap-1.5">
      {CATEGORY_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={CATEGORY_COLOR_LABELS[color]}
          title={CATEGORY_COLOR_LABELS[color]}
          onClick={() => onChange(color)}
          className={`h-6 w-6 rounded-full ${categorySwatchClass(color)} ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900 ${
            value === color ? 'ring-2 ring-slate-900 dark:ring-white' : 'opacity-70 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  )
}

// Work-item categories ("Typ") of the project: Feature/Bug/Chore are built in and can only be
// hidden/shown; custom ones can be added, renamed, recolored and deleted (not while cards use them).
export default function CategoriesSettings({ projectId, categories, onCategoriesChange }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>('sky')
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectCategory | null>(null)

  async function run(action: () => Promise<void>, failure: string) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(`${failure}: ${errorText(err, 'unbekannter Fehler')}`)
    }
  }

  const replace = (updated: ProjectCategory) => onCategoriesChange(categories.map((c) => (c.id === updated.id ? updated : c)))

  const handleAdd = () =>
    run(async () => {
      const created = await createCategory(projectId, name.trim(), color)
      onCategoriesChange([...categories, created])
      setName('')
      setShowAdd(false)
    }, 'Kategorie konnte nicht angelegt werden')

  const handleVisibility = (category: ProjectCategory, visible: boolean) =>
    run(async () => replace(await updateCategory(projectId, category.id, { isHidden: !visible })), `Sichtbarkeit von '${category.name}' konnte nicht geändert werden`)

  const handleSaveEdit = () =>
    run(async () => {
      if (!editing) return
      const updated = await updateCategory(projectId, editing.id, { name: editing.name.trim(), color: editing.color })
      replace(updated)
      setEditing(null)
    }, 'Kategorie konnte nicht geändert werden')

  const handleDelete = () =>
    run(async () => {
      if (!deleteTarget) return
      const target = deleteTarget
      setDeleteTarget(null)
      await deleteCategory(projectId, target.id)
      onCategoriesChange(categories.filter((c) => c.id !== target.id))
    }, `Kategorie '${deleteTarget?.name ?? ''}' konnte nicht gelöscht werden`)

  return (
    <section className="glass-panel rounded-xl border border-slate-200/80 p-5 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Kategorien (Typ)</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Feature, Bug und Chore (Routine- und Pflegeaufgaben ohne neue Funktion) lassen sich nur aus- und einblenden. Eigene Kategorien
            kannst du anlegen, umbenennen, umfärben und löschen - gelöscht werden kann nur, was keine Karte mehr verwendet.
          </p>
        </div>
        <AddButton label="Kategorie hinzufügen" onClick={() => setShowAdd((v) => !v)} icon={showAdd ? '×' : '+'} />
      </div>

      {showAdd && (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div>
            <label htmlFor="new-category-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-200">Name</label>
            <input id="new-category-name" className={`${inputClass} mt-1 max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Design" />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">Farbe</p>
            <ColorPicker value={color} onChange={setColor} name="neue Kategorie" />
          </div>
          <button
            onClick={handleAdd}
            disabled={name.trim().length === 0}
            className="rounded-lg bg-brand-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-accent-light disabled:opacity-40 disabled:shadow-none"
          >
            Kategorie anlegen
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{error}</p>}

      <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
        {categories.map((category) => (
          <li key={category.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5" data-category-row={category.name}>
            {editing?.id === category.id ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <input aria-label="Kategoriename" className={`${inputClass} max-w-xs`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                <ColorPicker value={editing.color} onChange={(c) => setEditing({ ...editing, color: c })} name={category.name} />
                <button onClick={() => void handleSaveEdit()} disabled={editing.name.trim().length === 0} className="rounded-lg bg-brand-accent px-3 py-2 text-sm font-medium text-white hover:bg-brand-accent-light disabled:opacity-40">Speichern</button>
                <button onClick={() => setEditing(null)} className="text-sm text-slate-500 hover:underline dark:text-slate-400">Abbrechen</button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className={`rounded-md px-2 py-0.5 text-xs ${categoryBadgeClass(category.color)} ${category.isHidden ? 'opacity-60' : ''}`}>{category.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {category.isDefault ? 'Standard' : 'Eigene Kategorie'}
                  {category.isHidden ? ' · ausgeblendet' : ''}
                </span>
              </div>
            )}

            {editing?.id !== category.id && (
              <>
                {!category.isDefault && (
                  <>
                    <button
                      onClick={() => setEditing({ id: category.id, name: category.name, color: category.color })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => setDeleteTarget(category)}
                      className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Löschen
                    </button>
                  </>
                )}
                <span className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  Sichtbar
                  <ToggleSwitch checked={!category.isHidden} onChange={(visible) => void handleVisibility(category, visible)} label={`${category.name} sichtbar`} />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Kategorie löschen?"
        message={`Die Kategorie '${deleteTarget?.name ?? ''}' wird gelöscht. Das geht nur, wenn keine Karte sie mehr verwendet.`}
        confirmLabel="Löschen"
        isDanger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  )
}
