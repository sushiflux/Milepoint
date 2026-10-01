import { test, expect } from '@playwright/test'

// A signed-in user changes their OWN password in the personal settings: current password once,
// new password twice. Uses a throwaway account created through the admin API (never the admin's own
// password), which is removed again at the end.

const adminName = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

test('user changes their own password', async ({ page, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const username = `e2e-pw-${Date.now()}`
  const oldPassword = 'old-pass-12345'
  const newPassword = 'new-pass-67890'

  const adminLogin = await request.post(`${base}/api/auth/login`, { data: { username: adminName, password: adminPassword } })
  const adminToken = (await adminLogin.json()).token as string
  const adminHeaders = { Authorization: `Bearer ${adminToken}` }
  const created = await request.post(`${base}/api/admin/users`, {
    headers: adminHeaders,
    data: { username, password: oldPassword, role: 'User' },
  })
  expect(created.ok()).toBeTruthy()
  const userId = (await created.json()).id as string

  try {
    await page.goto('/login')
    await page.fill('input[placeholder="Benutzername"]', username)
    await page.fill('input[placeholder="Passwort"]', oldPassword)
    await page.click('button:has-text("Anmelden")')
    // A fresh user has no projects, so there is no "Projekte" heading - the profile menu is the
    // reliable sign of being logged in.
    await expect(page.locator('button[title="Benutzerprofil & Einstellungen"]')).toBeVisible({ timeout: 15000 })

    await page.goto('/settings')
    await page.click('button[role="tab"]:has-text("Sicherheit")')
    const submit = page.locator('button:has-text("Passwort ändern")')

    // Submit stays disabled until the two new passwords match.
    await page.fill('#current-password', oldPassword)
    await page.fill('#new-password', newPassword)
    await page.fill('#repeat-password', `${newPassword}x`)
    await expect(page.locator('text=stimmen nicht überein')).toBeVisible()
    await expect(submit).toBeDisabled()

    // Wrong current password: specific server message, nothing changes.
    await page.fill('#repeat-password', newPassword)
    await page.fill('#current-password', 'definitely-wrong')
    await submit.click()
    await expect(page.locator('text=Das aktuelle Passwort ist falsch.')).toBeVisible()

    // Correct current password works.
    await page.fill('#current-password', oldPassword)
    await submit.click()
    await expect(page.locator('text=Passwort geändert.')).toBeVisible()

    const oldLogin = await request.post(`${base}/api/auth/login`, { data: { username, password: oldPassword } })
    expect(oldLogin.status()).toBe(401)
    const newLogin = await request.post(`${base}/api/auth/login`, { data: { username, password: newPassword } })
    expect(newLogin.ok()).toBeTruthy()
  } finally {
    await request.delete(`${base}/api/admin/users/${userId}`, { headers: adminHeaders })
  }
})
