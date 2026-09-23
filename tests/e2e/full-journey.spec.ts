import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const output = 'artifacts/full-journey'
mkdirSync(output, { recursive: true })

async function signIn(page: Page, identifier: string) {
  await page.goto('/#/pages/auth/login')
  await page.locator('input').nth(0).fill(identifier)
  await page.locator('input').nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await expect(page).toHaveURL(/shell\/index/)
}

async function visit(page: Page, route: string) {
  await page.goto(`/#${route}`)
  await page.reload()
  await page.locator('.app-bar,.shell,.login-button').first().waitFor()
}

async function signOut(page: Page) {
  await page.locator('.tab-item').filter({ hasText: '我的' }).click()
  await page.locator('.profile-bar uni-button.bar-action').click()
  await page.locator('.list-row.logout').click()
  await page.locator('.modal-actions .primary').click()
  await expect(page).toHaveURL(/auth\/login/)
}

test('one session keeps user, primary dealer and secondary dealer flows isolated', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 400 && /\.(?:png|jpe?g|webp|svg|woff2?)(?:\?|$)/i.test(response.url())) {
      errors.push(`${response.status()} ${response.url()}`)
    }
  })

  await signIn(page, '13800002861')
  await expect(page.getByRole('region', { name: '首页轮播' })).toBeVisible()
  await expect(page.getByText('我的分类', { exact: true })).toBeVisible()
  await page.locator('.tab-item').filter({ hasText: '设备' }).click()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await page.screenshot({ path: `${output}/01-user-devices.png` })
  await visit(page, '/pages/device/detail?id=dev-01')
  await expect(page.locator('.helm-map')).toBeVisible()
  const before = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    return (stored.data || stored).waypoints.length as number
  })
  await page.locator('[data-action-key="waypoint-mark"]').click()
  await page.locator('.waypoint-name-form input').fill('连续流程航点')
  await page.locator('.modal-actions .primary').click()
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    return (stored.data || stored).waypoints.length as number
  })).toBe(before + 1)
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '手动控制' }).click()
  await expect(page.locator('.manual-control-panel')).toBeVisible()
  await page.screenshot({ path: `${output}/02-user-control.png` })
  await visit(page, '/pages/manage/form?entity=tickets&category=repair&deviceId=dev-01')
  await expect(page.getByText('顶流机-01', { exact: false }).first()).toBeVisible()
  await page.screenshot({ path: `${output}/03-user-repair-form.png` })
  await visit(page, '/pages/shell/index?tab=profile')
  await signOut(page)

  await signIn(page, '13800000028')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.getByText('待办事项', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${output}/04-primary-workbench.png` })
  await visit(page, '/pages/manage/list?entity=purchases&state=catalog')
  await expect(page.locator('.entity-card').first()).toBeVisible()
  await page.screenshot({ path: `${output}/05-purchase-catalog.png` })
  await visit(page, '/pages/manage/list?entity=devices&state=unassigned')
  await expect(page.getByText('制冰机-05', { exact: true })).toBeVisible()
  await visit(page, '/pages/shell/index?tab=profile')
  await signOut(page)

  await visit(page, '/pages/auth/login')
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw.data || raw
    db.accounts.find((item: { id: string }) => item.id === 'acc-first').firstLogin = false
    localStorage.setItem('shark-sister-db-v1', JSON.stringify(raw))
  })
  await signIn(page, 'DLR-SH-0028')
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.getByText('安装管理', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('设备分配与调拨', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: `${output}/06-secondary-workbench.png` })
  await visit(page, '/pages/manage/list?entity=materials&state=price-search')
  await expect(page.getByText('当前账号无权访问')).toBeVisible()
  await visit(page, '/pages/manage/list?entity=employees')
  await expect(page.getByText('员工账号管理', { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})
