import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.argv.find((value) => value.startsWith('http')) || 'http://127.0.0.1:18762'
const strict = process.argv.includes('--strict')
const requestedIds = new Set((process.argv.find((value) => value.startsWith('--ids='))?.slice(6) || '').split(',').filter(Boolean))
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const executablePath = browserCandidates.find((value) => existsSync(value))
const expectedDirectory = resolve('..', 'ui-design', 'exports', 'screens')
const reportDirectory = resolve('artifacts', 'real-design-audit')
const actualDirectory = resolve(reportDirectory, 'actual')
const diffDirectory = resolve(reportDirectory, 'diff')

await Promise.all([
  mkdir(actualDirectory, { recursive: true }),
  mkdir(diffDirectory, { recursive: true }),
])

const screens = JSON.parse(await readFile('src/static/design-parity/screens.json', 'utf8'))
const registryIds = Object.keys(screens).sort((left, right) => left.localeCompare(right))
if (registryIds.length !== 115 || new Set(registryIds).size !== 115) throw new Error(`Expected 115 unique design IDs, got ${registryIds.length}`)
const ids = requestedIds.size ? registryIds.filter((id) => requestedIds.has(id)) : registryIds
if (requestedIds.size && ids.length !== requestedIds.size) throw new Error('One or more requested design IDs do not exist')

const require = createRequire(import.meta.url)
const packages = await readdir(resolve('node_modules', '.pnpm'))
const pixelmatchPackage = packages.find((name) => name.startsWith('pixelmatch@'))
const pngjsPackage = packages.find((name) => name.startsWith('pngjs@'))
if (!pixelmatchPackage || !pngjsPackage) throw new Error('Pixelmatch report dependencies are unavailable')
const pixelmatch = require(resolve('node_modules', '.pnpm', pixelmatchPackage, 'node_modules', 'pixelmatch'))
const { PNG } = require(resolve('node_modules', '.pnpm', pngjsPackage, 'node_modules', 'pngjs'))

const derivedIds = new Set(['H02', 'D10', 'D11', 'D12', 'D13'])
const extendedIds = new Set(['H04', 'H05', 'D09', 'B16', 'B29'])
const scopeFor = (id) => derivedIds.has(id) ? 'derived' : extendedIds.has(id) ? 'extended' : 'required'
const moduleFor = (id) => ({ A: 'auth', H: 'home', D: 'device', M: 'map', P: 'profile', S: 'support', B: 'dealer', X: 'dialog' })[id[0]]

const browser = await chromium.launch({ executablePath, headless: true })
const runtimeErrors = []

const results = []
for (const id of ids) {
  // A fresh page is required because UniApp can reuse an existing page instance
  // when only the hash query changes (all X states share one physical route).
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'zh-CN' })
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`${id}: console: ${message.text()}`)
  })
  page.on('pageerror', (error) => runtimeErrors.push(`${id}: pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || 'failed'
    if (reason !== 'net::ERR_ABORTED') runtimeErrors.push(`${id}: request: ${request.url()} (${reason})`)
  })
  const url = `${baseUrl}/#/pages/design-case/index?id=${id}&parity=0`
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
  await page.waitForTimeout(id.startsWith('X') ? 350 : 800)
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready })

  const health = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img'))
    const visible = images.filter((item) => {
      const style = getComputedStyle(item)
      const rect = item.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
    const icons = Array.from(document.querySelectorAll('.ss-icon')).filter((item) => {
      const style = getComputedStyle(item)
      const rect = item.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    })
    return {
      route: location.hash,
      overlayCount: document.querySelectorAll('.ss-design-parity').length,
      imageCount: visible.length,
      iconCount: icons.length,
      iconSources: [...new Set(icons.map((icon) => icon.getAttribute('src')).filter(Boolean))].sort(),
      brokenImages: visible.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute('src')),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }
  })

  const actualPath = resolve(actualDirectory, `${id}.png`)
  await page.screenshot({ path: actualPath, fullPage: false })
  const expected = PNG.sync.read(await readFile(resolve(expectedDirectory, `${id}.png`)))
  const actual = PNG.sync.read(await readFile(actualPath))
  if (expected.width !== 390 || expected.height !== 844 || actual.width !== 390 || actual.height !== 844) {
    throw new Error(`${id}: expected two 390x844 images`)
  }
  const diff = new PNG({ width: 390, height: 844 })
  const diffPixels = pixelmatch(expected.data, actual.data, diff.data, 390, 844, { threshold: 0.2, includeAA: false })
  await writeFile(resolve(diffDirectory, `${id}.png`), PNG.sync.write(diff))
  const similarity = 1 - diffPixels / (390 * 844)
  const expectedIconCount = (screens[id].match(/ss-png-icon/g) || []).length
  results.push({
    id,
    module: moduleFor(id),
    scope: scopeFor(id),
    similarity,
    diffPixels,
    passed: similarity >= 0.98,
    expectedIconCount,
    iconDeficit: Math.max(0, expectedIconCount - health.iconCount),
    ...health,
  })
  process.stdout.write(`${id} ${(similarity * 100).toFixed(2)}% icons=${health.iconCount}${health.brokenImages.length ? ` broken=${health.brokenImages.length}` : ''}\n`)
  await page.close()
}
await browser.close()

const moduleSummary = Object.fromEntries([...new Set(results.map((item) => item.module))].map((module) => {
  const items = results.filter((item) => item.module === module)
  return [module, {
    total: items.length,
    passed: items.filter((item) => item.passed).length,
    averageSimilarity: items.reduce((sum, item) => sum + item.similarity, 0) / items.length,
    minimumSimilarity: Math.min(...items.map((item) => item.similarity)),
  }]
}))
const summary = {
  generatedAt: new Date().toISOString(),
  source: 'real Vue routes with parity=0; SsDesignParity disabled',
  algorithm: { name: 'pixelmatch', threshold: 0.2, includeAA: false, formula: '1 - diffPixels / (390 * 844)', requiredSimilarity: 0.98 },
  counts: {
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    brokenImages: results.reduce((sum, item) => sum + item.brokenImages.length, 0),
    runtimeErrors: runtimeErrors.length,
    overlayViolations: results.filter((item) => item.overlayCount).length,
    overflowPages: results.filter((item) => item.scrollWidth > item.clientWidth + 2).length,
    iconDeficitPages: results.filter((item) => item.iconDeficit > 0).length,
    missingIconInstances: results.reduce((sum, item) => sum + item.iconDeficit, 0),
  },
  minimumSimilarity: Math.min(...results.map((item) => item.similarity)),
  averageSimilarity: results.reduce((sum, item) => sum + item.similarity, 0) / results.length,
  moduleSummary,
  runtimeErrors,
  results: results.sort((left, right) => left.similarity - right.similarity),
}
await writeFile(resolve(reportDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

const rows = summary.results.map((item) => `<tr class="${item.passed ? 'pass' : 'fail'}"><td>${item.id}</td><td>${item.module}</td><td>${item.scope}</td><td>${(item.similarity * 100).toFixed(3)}%</td><td>${item.expectedIconCount}</td><td>${item.iconCount}</td><td>${item.iconDeficit}</td><td>${item.brokenImages.length}</td><td>${item.route}</td><td><img src="../../../ui-design/exports/screens/${item.id}.png" alt="${item.id} design"></td><td><img src="actual/${item.id}.png" alt="${item.id} App"></td><td><img src="diff/${item.id}.png" alt="${item.id} diff"></td></tr>`).join('\n')
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>真实 App 与 UI 设计对齐审计</title><style>body{margin:0;padding:24px;font-family:Arial,"Microsoft YaHei",sans-serif;color:#121722;background:#eef2f7}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 20px;color:#475467}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:8px;border:1px solid #d8dfea;text-align:left;vertical-align:top}th{position:sticky;top:0;z-index:2;background:#f7f9fc}.fail td:nth-child(4){color:#b4232d;font-weight:700}.pass td:nth-child(4){color:#087a4e;font-weight:700}img{width:117px;height:auto;display:block}</style></head><body><h1>真实 App 与 115 页 UI 设计对齐审计</h1><p>覆盖层关闭；通过 ${summary.counts.passed}/${summary.counts.total}，平均 ${(summary.averageSimilarity * 100).toFixed(3)}%，最低 ${(summary.minimumSimilarity * 100).toFixed(3)}%，图标缺口页 ${summary.counts.iconDeficitPages}，缺少实例 ${summary.counts.missingIconInstances}，失效图片 ${summary.counts.brokenImages}，运行错误 ${summary.counts.runtimeErrors}。</p><table><thead><tr><th>ID</th><th>模块</th><th>范围</th><th>相似度</th><th>设计图标</th><th>实际图标</th><th>缺口</th><th>失效</th><th>真实路由</th><th>设计</th><th>App</th><th>差异</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
await writeFile(resolve(reportDirectory, 'index.html'), html, 'utf8')

console.log(`Real UI audit: ${summary.counts.passed}/${summary.counts.total} passed; average ${(summary.averageSimilarity * 100).toFixed(3)}%; minimum ${(summary.minimumSimilarity * 100).toFixed(3)}%; broken images ${summary.counts.brokenImages}; runtime errors ${summary.counts.runtimeErrors}`)
if (strict && (summary.counts.failed || summary.counts.brokenImages || summary.counts.runtimeErrors || summary.counts.overlayViolations || summary.counts.overflowPages)) {
  throw new Error('Real UI audit did not meet the strict acceptance criteria')
}
