import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Vite's own DNS-rebinding protection otherwise 403s any request whose Host header isn't
    // "localhost"/an IP - this project's Caddy (see Caddyfile) proxies through with the actual
    // hostname the browser used intact, so every hostname Caddy is configured to accept needs
    // to be listed here too.
    allowedHosts: ['localhost', 'milepoint.localhost', 'milepoint.sushifluxdevelop'],
    hmr: {
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) || 5173,
      // The primary access path is now https:// through Caddy, so the HMR upgrade request
      // must be wss:// too or the browser blocks it as mixed content.
      protocol: 'wss',
    },
    // Safety net for accessing the frontend directly on :5173 instead of through Caddy
    // (which is what actually gives it a single origin with the backend in normal use) -
    // without this, /api and /hubs 404 since Vite itself has no idea what those paths are.
    proxy: {
      '/api': { target: 'http://backend:8080', changeOrigin: true },
      '/hubs': { target: 'http://backend:8080', changeOrigin: true, ws: true },
    },
    // Docker Desktop on Windows doesn't reliably forward filesystem change events
    // across the Windows-to-container bind mount, so poll instead.
    watch: {
      usePolling: true,
      interval: 300,
      // *.tsbuildinfo (tsc --incremental's cache) share the "tsconfig*" name prefix, and Vite
      // treats writes to them like a tsconfig change - a full forced page reload, not HMR. The
      // editor's TS server rewrites these on every background type-check (i.e. on every save,
      // independent of what actually changed), so without this exclusion an unrelated save can
      // fire a reload command while the intended one is still in flight; the browser can end up
      // mid-navigation between the two and render nothing until a clean full reload.
      ignored: ['**/*.tsbuildinfo'],
    },
  },
})
