import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173'
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const executablePath = browserCandidates.find((value) => existsSync(value))
const viewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 720 },
]
const routes = [
  { key: 'login', path: '/pages/auth/login' },
  { key: 'workbench', path: '/pages/design-case/index?id=B01&parity=0' },
  { key: 'device-detail', path: '/pages/design-case/index?id=D05&parity=0' },
]
const browser = await chromium.launch({ executablePath, headless: true })
const results = []
const errors = []

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  for (const route of routes) {
    const page = await context.newPage()
    const auditUrl = `${baseUrl.replace(/\/$/, '')}/#${route.path}`
    await page.goto(auditUrl, { waitUntil: 'networkidle' })
    const metrics = await page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        fontSize: style.fontSize,
      }
    }
      return {
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      app: box('#app'),
      brand: box('.brand-name'),
      title: box('.auth-title'),
      field: box('.field-control'),
      appClientWidth: document.querySelector('#app')?.clientWidth || 0,
      appScrollWidth: document.querySelector('#app')?.scrollWidth || 0,
    }
    })
    const label = `${route.key}@${viewport.width}x${viewport.height}`
    results.push({ screen: label, ...metrics })
    if (metrics.appScrollWidth > metrics.appClientWidth + 2) errors.push(label + ': horizontal overflow')
    if (viewport.width >= 431) {
      const rootFontSize = Number.parseFloat(metrics.rootFontSize)
      const expectedDesktopHeight = Math.min(844, viewport.height - 32)
      if (Math.abs(rootFontSize - 16) > 0.05) errors.push(label + ': desktop root font is ' + rootFontSize + 'px')
      if (Math.abs(metrics.app.width - 390) > 0.1 || Math.abs(metrics.app.height - expectedDesktopHeight) > 0.1) errors.push(label + `: desktop frame is not 390x${expectedDesktopHeight}`)
    } else if (Math.abs(metrics.app.width - viewport.width) > 0.1) {
      errors.push(label + ': mobile frame does not fill the viewport')
    }
    if (route.key === 'login') {
      if (!metrics.title) errors.push(label + ': login title is missing')
      if (!metrics.field) errors.push(label + ': login field is missing')
    }
    await page.close()
  }
  await context.close()
}

await browser.close()
console.table(results)
console.log(JSON.stringify(results, null, 2))
if (errors.length) throw new Error('Responsive audit failed:\n' + errors.join('\n'))
