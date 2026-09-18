import { test, expect } from '@playwright/test'

// Minimal smoke test: the seeded dev admin account can actually log in and land on a real page.
// Credentials match .env.example's ADMIN_USERNAME/ADMIN_INITIAL_PASSWORD defaults - override via
// E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD if a stack was started with different ones.
const username = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const password = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

test('admin can log in', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="Benutzername"]', username)
  await page.fill('input[placeholder="Passwort"]', password)
  await page.click('button:has-text("Anmelden")')

  await expect(page.locator('h1:has-text("Projekte")')).toBeVisible({ timeout: 15000 })
})
