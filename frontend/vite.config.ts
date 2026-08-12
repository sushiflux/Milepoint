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
    },
    // Docker Desktop on Windows doesn't reliably forward filesystem change events
    // across the Windows-to-container bind mount, so poll instead.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
})
