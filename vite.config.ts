import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiMiddleware } from './server/local'
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fieldwork-api',
      configureServer(server) {
        server.middlewares.use(apiMiddleware())
      },
      configurePreviewServer(server) {
        server.middlewares.use(apiMiddleware())
      },
    },
  ],
  build: { outDir: 'dist/client', chunkSizeWarningLimit: 650 },
})
