import { chromium } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.argv[2] || 'http://127.0.0.1:4173'
const output = resolve('artifacts', 'visual')
const executablePath = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => candidate && existsSync(candidate))
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ executablePath, headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const errors = []
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim()) })
page.on('pageerror', (error) => errors.push(error.message))
page.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`) })

async function assertPage(name) {
  await page.waitForTimeout(350)
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    text: document.body.innerText.trim().length,
    brokenImages: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
  }))
  if (metrics.text < 20) throw new Error(`${name}: page is blank`)
  if (metrics.width > metrics.viewport + 2) throw new Error(`${name}: horizontal overflow ${metrics.width} > ${metrics.viewport}`)
  if (metrics.brokenImages.length) throw new Error(`${name}: ${metrics.brokenImages.length} broken images`)
  const file = resolve(output, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  if ((await stat(file)).size < 8000) throw new Error(`${name}: screenshot is unexpectedly small`)
}

async function signIn(targetPage, identifier, password) {
  const loginUrl = new URL(baseUrl)
  loginUrl.hash = '/pages/auth/login'
  await targetPage.goto(loginUrl.toString(), { waitUntil: 'networkidle' })
  const inputs = targetPage.locator('input')
  await inputs.nth(0).fill(identifier)
  await inputs.nth(1).fill(password)
  const agreement = targetPage.locator('.agreement .check')
  if (await agreement.count()) await agreement.click()
  await targetPage.locator('.login-button').click()
  await targetPage.waitForURL(/shell\/index/, { timeout: 10000 })
  await targetPage.waitForTimeout(500)
}

async function assertDetailScroll(targetPage, name) {
  const scrollNode = targetPage.locator('.detail-page .page-scroll .uni-scroll-view').first()
  if ((targetPage.viewportSize()?.width || 0) >= 768) {
    const beforeWheel = await targetPage.locator('.detail-page .page-scroll .uni-scroll-view').evaluateAll((nodes) => nodes.map((node) => node.scrollTop))
    await scrollNode.hover()
    await targetPage.mouse.wheel(0, 800)
    await targetPage.waitForTimeout(1000)
    const afterWheel = await targetPage.locator('.detail-page .page-scroll .uni-scroll-view').evaluateAll((nodes) => nodes.map((node) => node.scrollTop))
    if (!afterWheel.some((value, index) => value > (beforeWheel[index] || 0))) {
      throw new Error(name + ': mouse wheel did not move the vertical scroll area')
    }
  }

  const scrollMetrics = await targetPage.locator('.detail-page .page-scroll').evaluate((root) => {
    const candidates = [root, ...root.querySelectorAll('*')]
    const scroller = candidates.find((node) => {
      const style = getComputedStyle(node)
      return node.scrollHeight > node.clientHeight + 8 && /(auto|scroll)/.test(style.overflowY)
    })
    if (!scroller) return null
    scroller.scrollTop = scroller.scrollHeight
    const style = getComputedStyle(scroller)
    return {
      nodeName: scroller.nodeName,
      className: scroller.className,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollbarWidth: style.scrollbarWidth,
      overflowY: style.overflowY,
    }
  })
  if (!scrollMetrics || scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
    throw new Error(name + ': device detail has no working vertical scroll container')
  }
  if (scrollMetrics.scrollbarWidth !== 'none') {
    throw new Error(name + ': vertical scrollbar is still visible ' + JSON.stringify(scrollMetrics))
  }
  await targetPage.waitForTimeout(200)
  const lastRow = await targetPage.locator('.danger-row').boundingBox()
  const cta = await targetPage.locator('.fixed-cta').boundingBox()
  if (!lastRow || !cta || lastRow.y + lastRow.height > cta.y - 4) {
    throw new Error(name + ': final device action is covered by the fixed CTA')
  }
}

async function assertRightAlignedClose(targetPage, headSelector, closeSelector, name) {
  const metrics = await targetPage.evaluate(({ headSelector, closeSelector }) => {
    const head = document.querySelector(headSelector)
    const close = document.querySelector(closeSelector)
    if (!head || !close) return null
    const headRect = head.getBoundingClientRect()
    const closeRect = close.getBoundingClientRect()
    const style = getComputedStyle(close)
    return {
      headRight: headRect.right,
      closeRight: closeRect.right,
      closeWidth: closeRect.width,
      marginLeft: style.marginLeft,
      marginRight: style.marginRight,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
    }
  }, { headSelector, closeSelector })
  if (!metrics || Math.abs(metrics.headRight - metrics.closeRight) > 3 || metrics.closeWidth > 48 || metrics.closeWidth < 44 || metrics.marginLeft !== '0px' || metrics.marginRight !== '0px') {
    throw new Error(`${name}: close control is not aligned to the sheet header right edge ${JSON.stringify(metrics)}`)
  }
}

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
const loginUrl = new URL(baseUrl)
loginUrl.hash = '/pages/auth/login'
await page.goto(loginUrl.toString(), { waitUntil: 'networkidle' })
await assertPage('01-login')
await signIn(page, '13800002861', '123456')
await assertPage('02-user-home')
await page.locator('.overview-devices .equipment').first().click()
await page.waitForURL(/device\/detail/)
await assertPage('04-device-detail-top')
await page.locator('[aria-label="更多设备操作"]').click()
await assertRightAlignedClose(page, '.sheet-heading', '.sheet-heading .icon-button', 'device actions')
await assertPage('04b-device-actions-sheet')
await page.locator('.sheet-heading .icon-button').click()
await assertPage('05-device-detail-bottom')

const tabButtonStyles = await page.locator('.tab-item').evaluateAll((nodes) => nodes.map((node) => {
  const style = getComputedStyle(node)
  const after = getComputedStyle(node, '::after')
  return {
    background: style.backgroundColor,
    border: after.borderTopWidth,
    afterDisplay: after.display,
  }
}))
if (tabButtonStyles.some((style) => style.afterDisplay !== 'none' && style.border !== '0px')) {
  throw new Error('tab bar: UniApp default button frame leaked into the custom tab bar ' + JSON.stringify(tabButtonStyles))
}

const addUrl = new URL(baseUrl)
addUrl.hash = '/pages/device/add?step=1'
await page.goto(addUrl.toString(), { waitUntil: 'networkidle' })
await assertPage('07-add-device-method')
if (await page.locator('.fixed-cta').count()) {
  throw new Error('add device: empty fixed action bar is visible on method selection')
}

const repairUrl = new URL(baseUrl)
repairUrl.hash = '/pages/design-case/index?id=S03&parity=0'
await page.goto(repairUrl.toString(), { waitUntil: 'networkidle' })
await page.locator('.select-control').nth(1).click()
await assertRightAlignedClose(page, '.select-head', '.select-close', 'repair category')
await assertPage('07b-repair-category-sheet')
await page.locator('.select-close').click()

await context.clearCookies()
await page.evaluate(() => localStorage.clear())
await page.goto(baseUrl, { waitUntil: 'networkidle' })
await signIn(page, '13800000028', '123456')
await assertPage('08-dealer-home')
await page.locator('.tab-item').nth(1).click()
await assertPage('09-dealer-workbench')

await context.close()

const desktopContext = await browser.newContext({ viewport: { width: 1920, height: 920 }, deviceScaleFactor: 1 })
const desktopPage = await desktopContext.newPage()
desktopPage.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim()) })
desktopPage.on('pageerror', (error) => errors.push(error.message))
desktopPage.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`) })
await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' })
await signIn(desktopPage, '13800002861', '123456')

const frame = await desktopPage.locator('#app').boundingBox()
const tabbar = await desktopPage.locator('.tabbar').boundingBox()
if (!frame || Math.round(frame.width) !== 390 || Math.round(frame.height) !== 844) {
  throw new Error('desktop: app frame must be exactly 390x844')
}
if (Math.abs(frame.x - 765) > 1 || Math.abs(frame.y - 38) > 1) {
  throw new Error('desktop: app frame is not centered')
}
if (!tabbar || tabbar.x < frame.x - 1 || tabbar.x + tabbar.width > frame.x + frame.width + 1) {
  throw new Error('desktop: tab bar is outside the app frame')
}
await desktopPage.screenshot({ path: resolve(output, '10-desktop-frame.png'), fullPage: true })

const detailUrl = new URL(baseUrl)
detailUrl.hash = '/pages/device/detail?id=dev-01'
await desktopPage.goto(detailUrl.toString(), { waitUntil: 'networkidle' })
await desktopPage.screenshot({ path: resolve(output, '11-desktop-detail-bottom.png'), fullPage: true })

await desktopContext.close()

for (const width of [431, 600, 768, 792, 1024, 1440]) {
  const adaptiveContext = await browser.newContext({ viewport: { width, height: 1028 }, deviceScaleFactor: 1 })
  const adaptivePage = await adaptiveContext.newPage()
  adaptivePage.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim()) })
  adaptivePage.on('pageerror', (error) => errors.push(error.message))
  adaptivePage.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`) })
  const adaptiveLoginUrl = new URL(baseUrl)
  adaptiveLoginUrl.hash = '/pages/auth/login'
  await adaptivePage.goto(adaptiveLoginUrl.toString(), { waitUntil: 'networkidle' })
  const adaptiveMetrics = await adaptivePage.evaluate(() => {
    const app = document.querySelector('#app').getBoundingClientRect()
    const title = getComputedStyle(document.querySelector('.auth-title'))
    const field = document.querySelector('.field-control').getBoundingClientRect()
    return {
      rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      appWidth: app.width,
      appHeight: app.height,
      titleFontSize: Number.parseFloat(title.fontSize),
      fieldHeight: field.height,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }
  })
  if (Math.abs(adaptiveMetrics.rootFontSize - 16) > 0.05) throw new Error(width + ': desktop root font is not 16px')
  if (Math.abs(adaptiveMetrics.appWidth - 390) > 0.1 || Math.abs(adaptiveMetrics.appHeight - 844) > 0.1) throw new Error(width + ': desktop app frame is not 390x844')
  if (Math.abs(adaptiveMetrics.titleFontSize - 20) > 0.1 || Math.abs(adaptiveMetrics.fieldHeight - 50) > 0.1) throw new Error(width + ': login design tokens were scaled incorrectly')
  if (adaptiveMetrics.scrollWidth > adaptiveMetrics.clientWidth + 2) throw new Error(width + ': horizontal overflow')
  await adaptivePage.screenshot({ path: resolve(output, 'adaptive-' + width + '-login.png'), fullPage: true })
  await adaptiveContext.close()
}

for (const viewport of [{ width: 375, height: 667 }, { width: 430, height: 932 }]) {
  const responsiveContext = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const responsivePage = await responsiveContext.newPage()
  responsivePage.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`.trim()) })
  responsivePage.on('pageerror', (error) => errors.push(error.message))
  responsivePage.on('response', (response) => { if (response.status() === 404) errors.push(`404 ${response.url()}`) })
  await responsivePage.goto(baseUrl, { waitUntil: 'networkidle' })
  await signIn(responsivePage, '13800002861', '123456')
  const responsiveDetailUrl = new URL(baseUrl)
  responsiveDetailUrl.hash = '/pages/device/detail?id=dev-01'
  await responsivePage.goto(responsiveDetailUrl.toString(), { waitUntil: 'networkidle' })
  const widthMetrics = await responsivePage.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  if (widthMetrics.scrollWidth > widthMetrics.clientWidth + 2) {
    throw new Error(viewport.width + ': horizontal page overflow')
  }
  await responsivePage.screenshot({ path: resolve(output, 'responsive-' + viewport.width + '-detail-bottom.png'), fullPage: true })
  await responsiveContext.close()
}

await browser.close()
if (errors.length) throw new Error(`Browser console errors:\n${errors.join('\n')}`)
console.log('Visual checks passed: 375-430 mobile layouts and 431-1920 desktop frames use stable design dimensions')
