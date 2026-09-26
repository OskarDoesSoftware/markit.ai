import { defineConfig } from '@playwright/test'

const externalUrl = process.env.PRESENTATION_TEST_URL

export default defineConfig({
  testDir: './tests',
  outputDir: '../.wrangler/presentation-test-results',
  fullyParallel: true,
  workers: 3,
  reporter: 'list',
  use: {
    baseURL: externalUrl ?? 'http://127.0.0.1:8795',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PRESENTATION_BROWSER_PATH },
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command:
          'bunx wrangler dev --config presentation/wrangler.toml --local --ip 127.0.0.1 --port 8795',
        cwd: '..',
        url: 'http://127.0.0.1:8795',
        reuseExistingServer: !process.env.CI,
        env: { WRANGLER_SEND_METRICS: 'false' },
      },
})
