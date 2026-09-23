import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve('artifacts', 'recording-remediation')
mkdirSync(output, { recursive: true })

async function signIn(page: Page, identifier: string) {
  await page.goto('/#/pages/auth/login')
  await page.locator('input').nth(0).fill(identifier)
  await page.locator('input').nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/)
}

async function visit(page: Page, route: string, ready: string) {
  await page.goto(`/#${route}`)
  await page.reload()
  await page.locator(ready).first().waitFor()
}

async function capture(page: Page, name: string) {
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), name).toBe(true)
  expect(await page.evaluate(() => [...document.images].filter((element) => {
    const box = element.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && element.complete && !element.naturalWidth
  }).map((element) => element.src)), name).toEqual([])
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false })
}

test('recording remediation evidence covers user and dealer business flows', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, '13800002861')
  await capture(page, 'homepage-390x844')

  await page.locator('#overview-device-list').scrollIntoViewIfNeeded()
  await capture(page, 'device-list-390x844')
  await visit(page, '/pages/device/detail?id=dev-01', '.helm-map')
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await capture(page, `device-detail-${viewport.width}x${viewport.height}`)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, '/pages/device/add', '.add-page')
  await capture(page, 'binding-purpose-390x844')
  await page.evaluate(() => localStorage.clear())
  await signIn(page, '13800000028')
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await page.locator('.workspace-queue').waitFor()
  await capture(page, 'workbench-390x844')

  await visit(page, '/pages/manage/list?entity=purchases&state=catalog', '.purchase-view-tabs')
  await capture(page, 'purchasing-390x844')
  await visit(page, '/pages/manage/list?entity=materials', '.entity-list')
  await capture(page, 'materials-390x844')
  await visit(page, '/pages/process/index?scenario=logistics&shipmentId=ship-01', '.timeline-card')
  await capture(page, 'shipping-390x844')
  await visit(page, '/pages/manage/list?entity=orders', '.page')
  await expect(page.locator('.entity-card')).toHaveCount(2)
  await expect(page.getByText('SO202602060016', { exact: true })).toBeVisible()
  await page.locator('.entity-card').first().click()
  await expect(page.locator('.business-history')).toBeVisible()
  await expect(page.getByText('经销商提单')).toBeVisible()
  await capture(page, 'orders-390x844')
})
