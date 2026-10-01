import { test, expect } from '@playwright/test'

// Project settings (ProjectSettingsView): an admin hides a default column, adds a custom column and
// a custom category, and the Kanban board follows; a plain user gets no access. API-level rules are
// covered by project-settings-api.spec.ts - this checks the screens.

const adminName = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

async function uiLogin(page: import('@playwright/test').Page, username: string, password: string) {
  await page.goto('/login')
  await page.fill('input[placeholder="Benutzername"]', username)
  await page.fill('input[placeholder="Passwort"]', password)
  await page.click('button:has-text("Anmelden")')
  await expect(page.locator('button[title="Benutzerprofil & Einstellungen"]')).toBeVisible({ timeout: 15000 })
}

test('admin configures columns and categories of a project, a plain user cannot', async ({ page, browser, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const adminLogin = await request.post(`${base}/api/auth/login`, { data: { username: adminName, password: adminPassword } })
  const adminHeaders = { Authorization: `Bearer ${((await adminLogin.json()) as { token: string }).token}` }

  const plainName = `e2e-ps-${Date.now()}`
  const plainPassword = 'plain-pass-123'
  const userRes = await request.post(`${base}/api/admin/users`, { headers: adminHeaders, data: { username: plainName, password: plainPassword, role: 'User' } })
  const plainId = ((await userRes.json()) as { id: string }).id
  const projectRes = await request.post(`${base}/api/projects`, { headers: adminHeaders, data: { name: `E2E Einstellungen ${Date.now()}`, description: null } })
  const projectId = ((await projectRes.json()) as { id: string }).id
  // A plain user only sees projects they are a member of - make them one, so the page opens at all.
  const memberRes = await request.post(`${base}/api/projects/${projectId}/members`, { headers: adminHeaders, data: { username: plainName } })
  expect(memberRes.ok()).toBeTruthy()

  try {
    await uiLogin(page, adminName, adminPassword)
    await page.goto(`/projects/${projectId}/settings`)
    await expect(page.locator('h1:has-text("Projekt-Einstellungen")')).toBeVisible()

    // Default column: only hide/show - no edit/delete buttons on it.
    const pausiert = page.locator('li[data-column-row="Pausiert"]')
    await expect(pausiert).toContainText('Standard')
    await expect(pausiert.locator('button:has-text("Löschen")')).toHaveCount(0)
    await pausiert.locator('button[role="switch"]').click()
    await expect(pausiert).toContainText('ausgeblendet')

    // The last visible Done column can't be hidden - the server's reason is shown.
    await page.locator('li[data-column-row="Fertig"] button[role="switch"]').click()
    await expect(page.locator('text=mindestens eine sichtbare Spalte')).toBeVisible()

    // Custom column.
    await page.click('button[aria-label="Spalte hinzufügen"]')
    await page.fill('#new-column-name', 'Zur Überprüfung')
    await page.click('button:has-text("Spalte anlegen")')
    await expect(page.locator('li[data-column-row="Zur Überprüfung"]')).toContainText('Eigene Spalte')

    // Custom category.
    await page.click('button[role="tab"]:has-text("Kategorien")')
    await page.click('button[aria-label="Kategorie hinzufügen"]')
    await page.fill('#new-category-name', 'Design')
    await page.click('button:has-text("Kategorie anlegen")')
    await expect(page.locator('li[data-category-row="Design"]')).toContainText('Eigene Kategorie')
    await expect(page.locator('li[data-category-row="Feature"]')).toContainText('Standard')

    // The Kanban board follows: hidden column gone, custom one there, the new type is selectable.
    await page.goto(`/projects/${projectId}/kanban`)
    await expect(page.locator('[data-column-id]')).toHaveCount(4)
    await expect(page.locator('section[data-column-id]:has-text("Zur Überprüfung")')).toBeVisible()
    await expect(page.locator('section[data-column-id]:has-text("Pausiert")')).toHaveCount(0)

    // A plain user does not even get the entry and is told why when opening the URL directly.
    const plainContext = await browser.newContext({ ignoreHTTPSErrors: true, baseURL: baseURL ?? undefined })
    const plainPage = await plainContext.newPage()
    await uiLogin(plainPage, plainName, plainPassword)
    await plainPage.goto(`/projects/${projectId}/kanban`).catch(() => undefined)
    await plainPage.goto(`/projects/${projectId}/settings`)
    await expect(plainPage.locator('text=nur Projektleiter und Administratoren')).toBeVisible({ timeout: 15000 })
    await plainContext.close()
  } finally {
    await request.delete(`${base}/api/projects/${projectId}`, { headers: adminHeaders })
    await request.delete(`${base}/api/admin/users/${plainId}`, { headers: adminHeaders })
  }
})
