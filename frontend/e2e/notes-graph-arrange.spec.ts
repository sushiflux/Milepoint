import { test, expect, type APIRequestContext } from '@playwright/test'

// Exercises the "Anordnen" button in the Notes graph view (NoteGraphView.tsx's handleArrange()) -
// the button that re-derives a clean, low-crossing network layout from scratch. Regression test
// for a bug caught while building this feature: React StrictMode's dev double-mount left the RAF
// loop's rafRef stuck non-null after the first (cleanup-cancelled) mount, silently preventing any
// later wake() call - including this button's - from ever scheduling a new animation frame again.
//
// Sets up its own project + linked notes via the API rather than depending on seeded data, so this
// test doesn't silently break just because someone's dev DB happens to lack a suitable project.

const username = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const password = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

async function login(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, {
    data: { username, password },
  })
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  return body.token as string
}

test('Anordnen re-lays-out the graph and persists the new positions', async ({ page, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const token = await login(request, base)
  const authHeaders = { Authorization: `Bearer ${token}` }

  const projectRes = await request.post(`${base}/api/projects`, {
    headers: authHeaders,
    data: { name: `E2E Arrange Test ${Date.now()}`, description: null },
  })
  expect(projectRes.ok()).toBeTruthy()
  const project = await projectRes.json()
  const projectId = project.id as string
  const rootTitle = project.name as string

  // Root note (created automatically with the project) gets linked from four more notes, giving
  // handleArrange() a real star-shaped graph to re-lay-out - the exact shape that originally
  // surfaced the loosely-connected-nodes-fly-off-screen force-balance issue this test guards.
  for (let i = 0; i < 4; i++) {
    const res = await request.post(`${base}/api/projects/${projectId}/notes`, {
      headers: authHeaders,
      data: { title: `Leaf ${i}`, content: `Links to [[${rootTitle}]]` },
    })
    expect(res.ok()).toBeTruthy()
  }

  try {
    await page.goto('/login')
    await page.fill('input[placeholder="Benutzername"]', username)
    await page.fill('input[placeholder="Passwort"]', password)
    await page.click('button:has-text("Anmelden")')
    await expect(page.locator('h1:has-text("Projekte")')).toBeVisible({ timeout: 15000 })

    await page.goto(`/projects/${projectId}/notes`)
    await page.click('button:has-text("Graph")')
    await expect(page.locator('svg circle').first()).toBeVisible({ timeout: 10000 })

    const arrangeButton = page.locator('button:has-text("Anordnen")')
    await expect(arrangeButton).toBeVisible()
    await expect(arrangeButton).toBeEnabled()

    const before = await page.evaluate(() =>
      Array.from(document.querySelectorAll('svg circle')).map((c) => c.getAttribute('cx') + ',' + c.getAttribute('cy')),
    )

    const putRequests: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'PUT' && req.url().includes('/position')) putRequests.push(req.url())
    })

    await arrangeButton.click()

    // Positions should visibly change within a couple of seconds (the reflow starts immediately).
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('svg circle')).map((c) => c.getAttribute('cx') + ',' + c.getAttribute('cy')),
          ),
        { timeout: 5000 },
      )
      .not.toEqual(before)

    // ...and the simulation should fully settle and persist the result within a generous margin
    // (headless Chromium's requestAnimationFrame can run well below 60fps).
    await expect.poll(() => putRequests.length, { timeout: 20000 }).toBeGreaterThan(0)
  } finally {
    await request.delete(`${base}/api/projects/${projectId}`, { headers: authHeaders })
  }
})
