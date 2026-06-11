import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isTauri = process.env.TAURI_ENV_PLATFORM != null

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __FEATURE_TAURI__: JSON.stringify(isTauri),
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST === 'true' || false,
  },
  envPrefix: ['VITE_', 'TAURI_'],
})
