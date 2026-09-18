import { defineConfig } from '@playwright/test'

// Runs against this project's own running dev stack (see start.ps1) - not a stack Playwright
// spins up itself. Goes through this project's own Caddy under the "localhost" name it actually
// matches on (see Caddyfile's site address), not straight to the frontend container - Vite's dev
// server rejects requests whose Host header isn't in its allowedHosts (see vite.config.ts), which
// a raw "http://frontend:5173" baseURL trips over since that becomes the Host header Playwright
// sends. run.mjs resolves "localhost" to the Caddy container's address via Chromium's
// --host-resolver-rules, since plain container-network DNS has no "localhost" entry pointing there.
export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://localhost',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    launchOptions: process.env.E2E_CADDY_IP
      ? { args: [`--host-resolver-rules=MAP localhost ${process.env.E2E_CADDY_IP}`] }
      : {},
  },
})
