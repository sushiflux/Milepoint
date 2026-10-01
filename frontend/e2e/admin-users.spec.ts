import { test, expect } from '@playwright/test'

// App administration (AdminPage.tsx: tabs Benutzer / Rollen / Spracherkennung, backed by
// AdminUsersController): an admin can create a local user, change its role in the role matrix and
// delete it; the own account and other admins are protected; a normal user gets no access to the
// admin API.

const adminName = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

test('admin creates, re-roles and deletes a local user', async ({ page, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const username = `e2e-user-${Date.now()}`
  const userPassword = 'e2e-pass-12345'

  await page.goto('/login')
  await page.fill('input[placeholder="Benutzername"]', adminName)
  await page.fill('input[placeholder="Passwort"]', adminPassword)
  await page.click('button:has-text("Anmelden")')
  await expect(page.locator('h1:has-text("Projekte")')).toBeVisible({ timeout: 15000 })

  // The admin area is its own page behind its own menu entry - not part of the personal settings.
  await page.click('button[title="Benutzerprofil & Einstellungen"]')
  await page.click('a:has-text("App-Administration")')
  await expect(page.locator('h1:has-text("App-Administration")')).toBeVisible()

  await page.goto('/settings')
  await expect(page.locator('h1:has-text("Einstellungen")')).toBeVisible()
  await expect(page.locator('text=Spracherkennung')).toHaveCount(0)
  await page.goto('/admin')

  // Own account: marked "(du)", no delete button; its role radios are disabled.
  const ownRow = page.locator('tr', { hasText: '(du)' })
  await expect(ownRow).toBeVisible()
  await expect(ownRow.locator('button:has-text("Löschen")')).toHaveCount(0)

  // Create.
  await page.click('button[aria-label="Benutzer anlegen"]')
  await page.fill('#new-username', username)
  await page.fill('#new-password', userPassword)
  await page.click('button:has-text("Benutzer anlegen")')
  const row = page.locator('tr', { hasText: username })
  await expect(row).toBeVisible()

  try {
    // Role matrix: own row locked, the new user's role can be switched.
    await page.click('button[role="tab"]:has-text("Rollen")')
    await expect(page.locator(`button[aria-label="${adminName}: Administrator"]`)).toBeDisabled()
    const leader = page.locator(`button[aria-label="${username}: Projektleiter"]`)
    await leader.click()
    await expect(leader).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator(`button[aria-label="${username}: Benutzer"]`)).toHaveAttribute('aria-checked', 'false')
    await page.locator(`button[aria-label="${username}: Benutzer"]`).click()
    await expect(page.locator(`button[aria-label="${username}: Benutzer"]`)).toHaveAttribute('aria-checked', 'true')

    // A normal user must not reach the admin API (server-side check, not just hidden UI).
    const login = await request.post(`${base}/api/auth/login`, { data: { username, password: userPassword } })
    expect(login.ok()).toBeTruthy()
    const { token } = await login.json()
    const denied = await request.get(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
    expect(denied.status()).toBe(403)

    // Delete via the confirm dialog on the user tab.
    await page.click('button[role="tab"]:has-text("Benutzer")')
    await page.locator('tr', { hasText: username }).locator('button:has-text("Löschen")').click()
    await page.locator('div.fixed button:has-text("Löschen")').click()
    await expect(page.locator('tr', { hasText: username })).toHaveCount(0)
  } finally {
    // Leave no test account behind if an assertion above failed half-way.
    const adminLogin = await request.post(`${base}/api/auth/login`, { data: { username: adminName, password: adminPassword } })
    const adminToken = (await adminLogin.json()).token as string
    const list = await request.get(`${base}/api/admin/users`, { headers: { Authorization: `Bearer ${adminToken}` } })
    const left = ((await list.json()) as { id: string; username: string }[]).find((u) => u.username === username)
    if (left) {
      await request.delete(`${base}/api/admin/users/${left.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })
    }
  }
})
