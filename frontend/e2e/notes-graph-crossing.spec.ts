import { test, expect, type APIRequestContext } from '@playwright/test'

// Exercises the "crossed edges get dashed" behavior (NoteGraphView.tsx's computeCrossedEdges()) -
// explicit user request: an unavoidable line crossing in the graph should read as "this connection
// passes behind another" via a dashed stroke, rather than looking like a clean uninterrupted line.
// The longer of the two crossing edges is the one that gets dashed.
//
// Sets up a small fully-connected 4-note ring+diagonals graph (guarantees a crossing once the
// physics layout settles into its natural roughly-square shape) via the API, same pattern as
// notes-graph-arrange.spec.ts.

const username = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const password = process.env.E2E_ADMIN_PASSWORD ?? 'admin'

async function login(request: APIRequestContext, baseURL: string): Promise<string> {
  const res = await request.post(`${baseURL}/api/auth/login`, { data: { username, password } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).token as string
}

test('crossing edges are rendered dashed', async ({ page, request, baseURL }) => {
  const base = baseURL ?? 'https://localhost'
  const token = await login(request, base)
  const authHeaders = { Authorization: `Bearer ${token}` }

  const projectRes = await request.post(`${base}/api/projects`, {
    headers: authHeaders,
    data: { name: `E2E Crossing Test ${Date.now()}`, description: null },
  })
  expect(projectRes.ok()).toBeTruthy()
  const project = await projectRes.json()
  const projectId = project.id as string

  const titles = ['Leaf0', 'Leaf1', 'Leaf2', 'Leaf3']
  const leafIds: string[] = []
  for (const title of titles) {
    const res = await request.post(`${base}/api/projects/${projectId}/notes`, {
      headers: authHeaders,
      data: { title, content: '' },
    })
    expect(res.ok()).toBeTruthy()
    leafIds.push((await res.json()).id)
  }

  // Ring (Leaf0-Leaf1-Leaf2-Leaf3-Leaf0) plus both diagonals - a fully-connected K4. The ring
  // keeps the physics layout stable (every neighbor is close); the diagonals are what's
  // guaranteed to cross once it settles into a roughly square shape.
  const linkTargets: string[][] = [
    ['Leaf1', 'Leaf3', 'Leaf2'],
    ['Leaf2', 'Leaf0', 'Leaf3'],
    ['Leaf3', 'Leaf1', 'Leaf0'],
    ['Leaf0', 'Leaf2', 'Leaf1'],
  ]
  for (let i = 0; i < 4; i++) {
    const content = linkTargets[i].map((t) => `[[${t}]]`).join(' ')
    const res = await request.put(`${base}/api/projects/${projectId}/notes/${leafIds[i]}`, {
      headers: authHeaders,
      data: { title: titles[i], content, color: null },
    })
    expect(res.ok()).toBeTruthy()
  }

  // Positions close to LINK_DISTANCE (160) rather than far apart - keeps the simulation quick to
  // settle instead of needing many seconds of damping from a wildly oversized starting spread.
  const positions: [number, number][] = [
    [0, 0],
    [140, 0],
    [140, 140],
    [0, 140],
  ]
  for (let i = 0; i < 4; i++) {
    const res = await request.put(`${base}/api/projects/${projectId}/notes/${leafIds[i]}/position`, {
      headers: authHeaders,
      data: { x: positions[i][0], y: positions[i][1] },
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

    // Let the layout settle into its natural shape before checking for a dashed crossing.
    await page.waitForTimeout(6000)

    const dashedCount = await page.locator('svg line[stroke-dasharray]').count()
    expect(dashedCount).toBeGreaterThan(0)
  } finally {
    await request.delete(`${base}/api/projects/${projectId}`, { headers: authHeaders })
  }
})
