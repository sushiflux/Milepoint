import { test, expect, type APIRequestContext } from '@playwright/test'

// Per-project Kanban columns and work-item categories (BoardColumnsController /
// ProjectCategoriesController): defaults can only be hidden, custom ones can be added/renamed/
// deleted, only Projektleiter/Admin may change anything, and the invariants (empty to hide, at
// least one visible Todo + Done column) hold. Uses its own throwaway project and user.

const adminName = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

async function login(request: APIRequestContext, base: string, username: string, password: string) {
  const res = await request.post(`${base}/api/auth/login`, { data: { username, password } })
  expect(res.ok()).toBeTruthy()
  return { Authorization: `Bearer ${((await res.json()) as { token: string }).token}` }
}

test('categories and columns are managed per project with the agreed rules', async ({ request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const admin = await login(request, base, adminName, adminPassword)

  // A plain user (role "User") to prove the server-side permission rule.
  const plainName = `e2e-plain-${Date.now()}`
  const created = await request.post(`${base}/api/admin/users`, {
    headers: admin,
    data: { username: plainName, password: 'plain-pass-123', role: 'User' },
  })
  expect(created.ok()).toBeTruthy()
  const plainId = ((await created.json()) as { id: string }).id
  const plain = await login(request, base, plainName, 'plain-pass-123')

  const projectRes = await request.post(`${base}/api/projects`, {
    headers: admin,
    data: { name: `E2E Spalten ${Date.now()}`, description: null },
  })
  expect(projectRes.ok()).toBeTruthy()
  const project = (await projectRes.json()) as { id: string }
  const pid = project.id

  try {
    const boards = (await (await request.get(`${base}/api/projects/${pid}/boards`, { headers: admin })).json()) as {
      id: string
      columns: { id: string; name: string; type: string; isDefault: boolean; isHidden: boolean }[]
    }[]
    const board = boards[0]
    const col = (name: string) => board.columns.find((c) => c.name === name)!
    expect(board.columns.map((c) => c.name)).toEqual(['Neu', 'In Arbeit', 'Fertig', 'Pausiert'])
    expect(board.columns.every((c) => c.isDefault && !c.isHidden)).toBeTruthy()
    const colUrl = `${base}/api/projects/${pid}/boards/${board.id}/columns`
    const catUrl = `${base}/api/projects/${pid}/categories`

    // --- Categories --------------------------------------------------------------------------
    const cats = (await (await request.get(catUrl, { headers: admin })).json()) as { id: string; name: string; isDefault: boolean }[]
    expect(cats.map((c) => c.name)).toEqual(['Feature', 'Bug', 'Chore'])

    // A normal user may read but not change anything.
    expect((await request.get(catUrl, { headers: plain })).status()).toBe(200)
    expect((await request.post(catUrl, { headers: plain, data: { name: 'Design', color: 'sky' } })).status()).toBe(403)
    expect((await request.post(colUrl, { headers: plain, data: { name: 'Review', type: 'InProgress' } })).status()).toBe(403)

    const design = (await (await request.post(catUrl, { headers: admin, data: { name: 'Design', color: 'sky' } })).json()) as { id: string }
    expect((await request.post(catUrl, { headers: admin, data: { name: 'design', color: 'sky' } })).status()).toBe(409)
    expect((await request.post(catUrl, { headers: admin, data: { name: 'X', color: 'pink-glitter' } })).status()).toBe(400)

    const feature = cats.find((c) => c.name === 'Feature')!
    const chore = cats.find((c) => c.name === 'Chore')!
    expect((await request.put(`${catUrl}/${feature.id}`, { headers: admin, data: { name: 'Funktion' } })).status()).toBe(400)
    expect((await request.delete(`${catUrl}/${feature.id}`, { headers: admin })).status()).toBe(400)
    // Hide / show a default instead.
    expect((await request.put(`${catUrl}/${chore.id}`, { headers: admin, data: { isHidden: true } })).status()).toBe(200)

    // A hidden category can't be assigned to a card, a visible custom one can - and follows a rename.
    const colNeu = col('Neu')
    const itemUrl = `${base}/api/boards/${board.id}/workitems`
    const baseItem = { columnId: colNeu.id, title: 'Karte', description: null, type: 'Task', priority: 'Medium', parentWorkItemId: null, startDate: null, dueDate: null }
    expect((await request.post(itemUrl, { headers: admin, data: { ...baseItem, category: 'Chore' } })).status()).toBe(400)
    expect((await request.post(itemUrl, { headers: admin, data: { ...baseItem, category: 'Gibt-es-nicht' } })).status()).toBe(400)
    const item = (await (await request.post(itemUrl, { headers: admin, data: { ...baseItem, category: 'design' } })).json()) as { id: string; category: string }
    expect(item.category).toBe('Design')

    expect((await request.delete(`${catUrl}/${design.id}`, { headers: admin })).status()).toBe(409)
    expect((await request.put(`${catUrl}/${design.id}`, { headers: admin, data: { name: 'Gestaltung' } })).status()).toBe(200)
    const items = (await (await request.get(itemUrl, { headers: admin })).json()) as { id: string; category: string | null }[]
    expect(items.find((i) => i.id === item.id)?.category).toBe('Gestaltung')

    // --- Columns -----------------------------------------------------------------------------
    const review = (await (await request.post(colUrl, { headers: admin, data: { name: 'Zur Überprüfung', type: 'InProgress' } })).json()) as { id: string; isDefault: boolean }
    expect(review.isDefault).toBe(false)
    expect((await request.post(colUrl, { headers: admin, data: { name: 'zur überprüfung', type: 'Todo' } })).status()).toBe(409)

    // Defaults: hide/show only - no rename, no delete.
    expect((await request.put(`${colUrl}/${col('Neu').id}`, { headers: admin, data: { name: 'Offen' } })).status()).toBe(400)
    expect((await request.delete(`${colUrl}/${col('Pausiert').id}`, { headers: admin })).status()).toBe(400)

    // Hiding needs an empty column; the card in "Neu" blocks it.
    expect((await request.put(`${colUrl}/${colNeu.id}`, { headers: admin, data: { isHidden: true } })).status()).toBe(409)
    // "Pausiert" is empty and a second Todo column exists ("Neu"), so it can be hidden ...
    expect((await request.put(`${colUrl}/${col('Pausiert').id}`, { headers: admin, data: { isHidden: true } })).status()).toBe(200)
    // ... and a card can neither be created in nor moved into a hidden column.
    expect((await request.post(itemUrl, { headers: admin, data: { ...baseItem, columnId: col('Pausiert').id } })).status()).toBe(400)
    expect((await request.put(`${itemUrl}/${item.id}/move`, { headers: admin, data: { targetColumnId: col('Pausiert').id, position: 0 } })).status()).toBe(400)
    // The last visible Done column can't go.
    expect((await request.put(`${colUrl}/${col('Fertig').id}`, { headers: admin, data: { isHidden: true } })).status()).toBe(409)
    // Show it again, then reorder: the custom column first.
    expect((await request.put(`${colUrl}/${col('Pausiert').id}`, { headers: admin, data: { isHidden: false } })).status()).toBe(200)
    const order = [review.id, ...board.columns.map((c) => c.id)]
    const reordered = await request.put(`${colUrl}/order`, { headers: admin, data: { columnIds: order } })
    expect(reordered.status()).toBe(200)
    expect(((await reordered.json()) as { id: string }[])[0].id).toBe(review.id)

    // Custom column: rename + retype + delete when empty; deleting with a card is refused.
    expect((await request.put(`${colUrl}/${review.id}`, { headers: admin, data: { name: 'Prüfung', type: 'Todo' } })).status()).toBe(200)
    expect((await request.put(`${itemUrl}/${item.id}/move`, { headers: admin, data: { targetColumnId: review.id, position: 0 } })).status()).toBe(204)
    expect((await request.delete(`${colUrl}/${review.id}`, { headers: admin })).status()).toBe(409)
    expect((await request.put(`${itemUrl}/${item.id}/move`, { headers: admin, data: { targetColumnId: colNeu.id, position: 0 } })).status()).toBe(204)
    expect((await request.delete(`${colUrl}/${review.id}`, { headers: admin })).status()).toBe(204)

    // Custom category: deletable once no card uses it.
    expect((await request.delete(`${itemUrl}/${item.id}`, { headers: admin })).status()).toBe(204)
    expect((await request.delete(`${catUrl}/${design.id}`, { headers: admin })).status()).toBe(204)
  } finally {
    await request.delete(`${base}/api/projects/${pid}`, { headers: admin })
    await request.delete(`${base}/api/admin/users/${plainId}`, { headers: admin })
  }
})
