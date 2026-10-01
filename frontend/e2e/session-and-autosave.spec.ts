import { test, expect } from '@playwright/test'

// Session handling and autosave:
//  - API responses are never cacheable (Cache-Control: no-store), so a restored browser tab can't
//    show a stale state without asking the server;
//  - an expired/invalid session lands on the normal login page (with a hint) and returns to the
//    page the user was on after logging in - no overlay window;
//  - notes are saved on their own (no Save button): what is typed is on the server shortly after.

const adminName = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

test('API responses are not cacheable', async ({ request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const login = await request.post(`${base}/api/auth/login`, { data: { username: adminName, password: adminPassword } })
  expect(login.headers()['cache-control']).toContain('no-store')
  const token = ((await login.json()) as { token: string }).token
  const projects = await request.get(`${base}/api/projects`, { headers: { Authorization: `Bearer ${token}` } })
  expect(projects.headers()['cache-control']).toContain('no-store')
})

test('an expired session goes to the login page and returns to the same page afterwards', async ({ page }) => {
  // A token the server rejects, like one that ran out overnight.
  await page.addInitScript(() => {
    localStorage.setItem('pm.token', 'abgelaufen.oder.ungueltig')
    localStorage.setItem('pm.username', 'admin')
    localStorage.setItem('pm.displayName', 'Admin')
    localStorage.setItem('pm.roles', JSON.stringify(['Admin']))
  })
  await page.goto('/admin?tab=roles')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('text=Deine Sitzung ist abgelaufen')).toBeVisible()

  await page.evaluate(() => localStorage.clear())
  await page.addInitScript(() => undefined)
  await page.fill('input[placeholder="Benutzername"]', adminName)
  await page.fill('input[placeholder="Passwort"]', adminPassword)
  await page.click('button:has-text("Anmelden")')

  await expect(page).toHaveURL(/\/admin\?tab=roles$/)
  await expect(page.locator('h1:has-text("App-Administration")')).toBeVisible()
})

test('notes are saved automatically without a Save button', async ({ page, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const login = await request.post(`${base}/api/auth/login`, { data: { username: adminName, password: adminPassword } })
  const headers = { Authorization: `Bearer ${((await login.json()) as { token: string }).token}` }
  const projectRes = await request.post(`${base}/api/projects`, { headers, data: { name: `E2E Autosave ${Date.now()}`, description: null } })
  const projectId = ((await projectRes.json()) as { id: string }).id

  try {
    const noteRes = await request.post(`${base}/api/projects/${projectId}/notes`, {
      headers,
      data: { title: 'Autosave-Notiz', content: '', color: null },
    })
    expect(noteRes.ok()).toBeTruthy()
    const noteId = ((await noteRes.json()) as { id: string }).id

    await page.goto('/login')
    await page.fill('input[placeholder="Benutzername"]', adminName)
    await page.fill('input[placeholder="Passwort"]', adminPassword)
    await page.click('button:has-text("Anmelden")')
    await expect(page.locator('button[title="Benutzerprofil & Einstellungen"]')).toBeVisible({ timeout: 15000 })

    await page.goto(`/projects/${projectId}/notes`)
    // The admin's saved view (List/Graph) may be Graph from other tests - the editor is in the list.
    await page.locator('button:text-is("Liste")').click()
    await page.locator('text=Autosave-Notiz').first().click()
    await expect(page.locator('button:has-text("Speichern")')).toHaveCount(0)

    const editor = page.locator('textarea')
    await editor.fill('Dieser Text wird von allein gespeichert.')
    await expect(page.locator('[role="status"]:has-text("Gespeichert")')).toBeVisible({ timeout: 10000 })

    const notes = (await (await request.get(`${base}/api/projects/${projectId}/notes`, { headers })).json()) as { id: string; content: string }[]
    expect(notes.find((n) => n.id === noteId)?.content).toBe('Dieser Text wird von allein gespeichert.')

    // Typing and leaving at once must not lose the text either (flush when the view goes away).
    await editor.fill('Schnell weg.')
    await page.goto(`/projects/${projectId}/kanban`)
    await expect
      .poll(async () => {
        const list = (await (await request.get(`${base}/api/projects/${projectId}/notes`, { headers })).json()) as { id: string; content: string }[]
        return list.find((n) => n.id === noteId)?.content
      })
      .toBe('Schnell weg.')
  } finally {
    await request.delete(`${base}/api/projects/${projectId}`, { headers })
  }
})
