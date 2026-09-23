import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const baseUrl = process.argv[2] || 'http://127.0.0.1:18762'
const executablePath = 'C:\\Users\\EDY\\AppData\\Local\\ms-playwright\\chromium-1148\\chrome-win\\chrome.exe'
const screens = JSON.parse(await readFile('src/static/design-parity/screens.json', 'utf8'))
const ids = Object.keys(screens).sort((left, right) => left.localeCompare(right))
if (ids.length !== 115 || new Set(ids).size !== 115) throw new Error(`Expected 115 unique design templates, got ${ids.length}`)

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const errors = []
let activeId = ''
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${activeId}: console: ${message.text()}`) })
page.on('pageerror', (error) => errors.push(`${activeId}: pageerror: ${error.message}`))
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText || 'failed'
  if (reason !== 'net::ERR_ABORTED') errors.push(`${activeId}: request: ${request.url()} (${reason})`)
})

for (const id of ids) {
  activeId = id
  await page.goto(`${baseUrl}/#/pages/design-case/index?id=${id}`, { waitUntil: 'domcontentloaded' })
  await page.locator('.ss-design-parity[data-ready="true"]').waitFor({ timeout: 10_000 })
  const health = await page.locator('.ss-design-parity').evaluate((host) => {
    const root = host.shadowRoot
    const images = Array.from(root?.querySelectorAll('img') || [])
    return {
      brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')),
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
      error: host.getAttribute('data-error'),
    }
  })
  if (health.error) errors.push(`${id}: parity: ${health.error}`)
  if (health.brokenImages.length) errors.push(`${id}: broken images: ${health.brokenImages.join(', ')}`)
  if (health.width > health.viewport + 2) errors.push(`${id}: horizontal overflow ${health.width} > ${health.viewport}`)
}

await browser.close()
if (errors.length) throw new Error(`Design-case health failed:\n${errors.join('\n')}`)
console.log(`Design-case health passed: ${ids.length} pages, no console/page/request errors, broken images, or horizontal overflow`)
