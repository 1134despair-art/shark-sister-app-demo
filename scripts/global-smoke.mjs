import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.argv[2] || 'http://127.0.0.1:18763'
const executablePath = 'C:\\Users\\EDY\\AppData\\Local\\ms-playwright\\chromium-1148\\chrome-win\\chrome.exe'
const output = resolve('artifacts', 'global')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const runtimeErrors = []
page.on('console', (message) => {
  if (message.type() !== 'error') return
  const location = message.location()
  runtimeErrors.push([message.text(), location.url].filter(Boolean).join(' · '))
})
page.on('pageerror', (error) => runtimeErrors.push(error.message))

async function assertEnglish(name) {
  await page.waitForTimeout(450)
  const text = await page.locator('body').innerText()
  const chinese = [...new Set(text.match(/[\u4e00-\u9fff]+/g) || [])]
  if (chinese.length) throw new Error(`${name}: untranslated text: ${chinese.join(', ')}`)
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false })
}

async function login(identifier, password) {
  const inputs = page.locator('input')
  await inputs.nth(0).fill(identifier)
  await inputs.nth(1).fill(password)
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/, { timeout: 10_000 })
}

async function visit(name, hash) {
  const url = new URL(baseUrl)
  url.hash = hash
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await assertEnglish(name)
}

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await assertEnglish('01-login')
await login('captain@seawind.com', '123456')
await assertEnglish('02-user-home')
await page.locator('.tab-item').filter({ hasText: 'Devices' }).click()
await assertEnglish('03-user-devices')
await visit('04-device-detail', '/pages/device/detail?id=dev-01')
await visit('05-device-add', '/pages/device/add?step=0')
await visit('06-settings', '/pages/profile/settings')
await visit('07-support', '/pages/manage/list?entity=tickets&mode=hub')
await visit('08-repair-form', '/pages/manage/form?entity=tickets&category=repair&deviceId=dev-01')
await visit('09-device-control', '/pages/process/index?scenario=control&deviceId=dev-01')
await visit('10-firmware', '/pages/process/index?scenario=ota&deviceId=dev-01')
await visit('11-message-detail', '/pages/manage/list?entity=tickets&state=message-detail&id=ticket-04')
await visit('12-message-transfer', '/pages/manage/list?entity=tickets&state=transfer-selector&id=ticket-04')

await page.evaluate(() => localStorage.clear())
await page.goto(baseUrl, { waitUntil: 'networkidle' })
await login('13800000028', '123456')
await page.locator('.tab-item').filter({ hasText: 'Workspace' }).click()
await assertEnglish('13-dealer-workspace')
await visit('14-projects', '/pages/manage/list?entity=projects&state=search')
await visit('15-project-form', '/pages/manage/form?entity=projects&step=device')
await visit('16-materials', '/pages/manage/list?entity=materials')
await visit('17-transfers', '/pages/manage/list?entity=transfers')
await visit('18-purchases', '/pages/manage/list?entity=purchases')
await visit('19-dealer-analytics', '/pages/process/index?scenario=dealerAnalytics')
await visit('20-mainboard-replacement', '/pages/process/index?scenario=mainboard&deviceId=dev-01')

await browser.close()
if (runtimeErrors.length) throw new Error(`Browser console errors:\n${runtimeErrors.join('\n')}`)
console.log('Global smoke passed: 20 user, device, service, and dealer pages contain English-only visible copy')
