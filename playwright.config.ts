import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const reportName = process.env.PLAYWRIGHT_REPORT_NAME || 'e2e'
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((value): value is string => Boolean(value))
const executablePath = browserCandidates.find((value) => existsSync(value))

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: `artifacts/${reportName}/results.json` }],
    ['html', { outputFolder: `artifacts/${reportName}/html`, open: 'never' }],
  ],
  snapshotPathTemplate: '../ui-design/exports/screens/{arg}{ext}',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:18762',
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: {
    command: process.env.E2E_SERVER_COMMAND || 'node scripts/serve-static.mjs dist/releases/h5-cn 18762',
    url: process.env.E2E_BASE_URL || 'http://127.0.0.1:18762',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
