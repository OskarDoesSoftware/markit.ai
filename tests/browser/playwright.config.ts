import { defineConfig } from '@playwright/test'

const externalUrl = process.env.APP_TEST_URL

export default defineConfig({
  testDir: '.',
  outputDir: '../../.wrangler/app-test-results',
  fullyParallel: true,
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: externalUrl ?? 'http://127.0.0.1:3115',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.APP_BROWSER_PATH,
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--mute-audio',
      ],
    },
    permissions: ['microphone'],
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command: 'bun run dev -- --port 3115',
        cwd: '../..',
        url: 'http://127.0.0.1:3115',
        reuseExistingServer: !process.env.CI,
        env: { WRANGLER_SEND_METRICS: 'false' },
        timeout: 60_000,
      },
})
