import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
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
    },
  },
})
