import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Vitest tournait déjà sans config grâce à vite.config.ts ; ce fichier
    // est dédié aux tests pour que jsdom + setup-files ne polluent pas
    // le build prod.
  },
})
