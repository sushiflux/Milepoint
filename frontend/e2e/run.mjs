// Cross-platform wrapper for `npm run test:e2e` - resolves this directory's absolute path in
// Node (works identically on Windows/PowerShell and POSIX shells) instead of relying on a shell
// builtin like $(pwd) that behaves differently across npm's platform-dependent script shell.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const e2eDir = dirname(fileURLToPath(import.meta.url))
const image = 'mcr.microsoft.com/playwright:v1.63.0-jammy'

// This project's own Caddy is what the tests talk to (see playwright.config.ts's baseURL) - its
// container-network IP changes on every stack restart, so it's resolved fresh here rather than
// hardcoded, and handed to Chromium via --host-resolver-rules so "https://localhost" (the Caddyfile
// site address these tests need to match) resolves inside the test browser without touching the
// host's own DNS/hosts file.
const inspect = spawnSync('docker', [
  'inspect',
  'milepoint-caddy-1',
  '--format',
  '{{.NetworkSettings.Networks.milepoint_default.IPAddress}}',
])
const caddyIp = inspect.stdout?.toString().trim()
if (inspect.status !== 0 || !caddyIp) {
  console.error('Could not resolve milepoint-caddy-1\'s container IP - is the stack running (.\\start.ps1)?')
  process.exit(1)
}

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'milepoint_default',
    // Patches "localhost" to resolve to this project's own Caddy container INSIDE this container -
    // covers both Chromium (see playwright.config.ts's launchOptions, needed since --add-host alone
    // doesn't affect a browser's own DNS resolution) and Playwright's Node-side `request` fixture
    // (which has no browser process/Chromium flags to hook into, but does respect the OS resolver).
    '--add-host',
    `localhost:${caddyIp}`,
    '-v',
    `${e2eDir}:/work`,
    '-w',
    '/work',
    '-e',
    `E2E_CADDY_IP=${caddyIp}`,
    image,
    'sh',
    '-c',
    'npm init -y >/dev/null 2>&1 && npm install @playwright/test@1.63.0 >/dev/null 2>&1 && npx playwright test',
  ],
  { stdio: 'inherit' },
)

process.exit(result.status ?? 1)
