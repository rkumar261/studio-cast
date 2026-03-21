import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run dev:api',
      cwd: './backend',
      port: 8080,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev',
      cwd: './frontend',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        NEXT_PUBLIC_API_BASE: 'http://127.0.0.1:8080',
      },
    },
  ],
});