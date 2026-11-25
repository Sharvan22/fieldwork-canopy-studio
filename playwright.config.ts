import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 30000 },
  reporter: 'list',
  use: {
    baseURL: process.env.STUDIO_BASE_URL || 'http://127.0.0.1:5178',
    viewport: { width: 1440, height: 948 },
    launchOptions: {
      channel: process.env.STUDIO_BROWSER || undefined,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: process.env.STUDIO_BASE_URL ? undefined : {
    command: 'npm run dev -- --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
