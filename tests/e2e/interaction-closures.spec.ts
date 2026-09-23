import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const screenshotDirectory = resolve('artifacts', 'interaction-closures')
mkdirSync(screenshotDirectory, { recursive: true })

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/#/pages/auth/login')
  const inputs = page.locator('input')
  await inputs.nth(0).fill('13800002861')
  await inputs.nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/)
}

async function visit(page: import('@playwright/test').Page, route: string) {
  await page.goto(`/#${route}`)
  await page.reload({ waitUntil: 'networkidle' })
}

test('legal documents are available before sign-in', async ({ page }) => {
  for (const origin of [
    { route: '/pages/auth/login', backText: '欢迎回来' },
    { route: '/pages/auth/register', backText: '注册账号' },
  ]) {
    for (const legal of [
      { index: 0, title: '用户协议', content: '账号与安全' },
      { index: 1, title: '隐私政策', content: '我们收集的信息' },
    ]) {
      await page.goto(`/#${origin.route}`)
      await page.locator('.agreement .legal-link').nth(legal.index).click()
      await expect(page.getByText(legal.title, { exact: true }).first()).toBeVisible()
      await expect(page.getByText(legal.content, { exact: true })).toBeVisible()
      await page.locator('.app-bar .app-action').first().click()
      await expect(page).toHaveURL(new RegExp(origin.route.replaceAll('/', '\\/')))
      await expect(page.getByText(origin.backText, { exact: true }).first()).toBeVisible()
    }
  }
  await visit(page, '/pages/profile/settings?section=privacy-policy')
  await expect(page.getByText('隐私政策', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('我们收集的信息', { exact: true })).toBeVisible()
  await page.locator('.app-bar .app-action').first().click()
  await expect(page.getByText('隐私与数据', { exact: true }).first()).toBeVisible()
})

test('reported detail interactions are operable and persisted', async ({ page }) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('response', (response) => { if (response.status() >= 400 && /\.(png|jpe?g|webp)(?:\?|$)/i.test(response.url())) errors.push(`${response.status()} ${response.url()}`) })
  await signIn(page)

  await visit(page, '/pages/manage/list?entity=tickets&state=timeline&id=ticket-01')
  await page.locator('[data-action="add-note"]').click()
  await expect(page.locator('.supplement-sheet')).toBeVisible()
  await page.locator('.supplement-input textarea').fill('周六上午可以登船，请提前电话联系。')
  await page.getByText('保存说明', { exact: true }).click()
  await expect(page.getByText('周六上午可以登船，请提前电话联系。', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '01-ticket-note.png') })
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.tickets?.find((item: { id: string }) => item.id === 'ticket-01')?.history?.some((entry: { note?: string }) => entry.note === '周六上午可以登船，请提前电话联系。')
  })).toBe(true)

  await visit(page, '/pages/manage/list?entity=tickets&state=transfer-selector&id=ticket-04')
  await page.locator('[data-picker="target"]').click()
  await expect(page.getByText('选择转单对象', { exact: true })).toBeVisible()
  await page.locator('[data-action-key="target:headquarters"]').click()
  await expect(page.locator('[data-picker="target"]')).toContainText('总部客服')
  await page.locator('[data-picker="target"]').click()
  await page.locator('[data-action-key="target:dealer"]').click()
  await page.locator('[data-picker="dealer"]').click()
  await expect(page.getByText('选择接收经销商', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '02-transfer-picker.png') })
  await page.locator('[data-action-key^="dealer:"]').first().click()
  await expect(page.locator('[data-picker="dealer"]')).not.toContainText('请选择接收网点')

  await page.locator('[data-picker="target"]').click()
  await page.locator('[data-action-key="target:headquarters"]').click()
  await page.locator('.transfer-form textarea').fill('原服务范围无法继续处理，请由总部协调。')
  await page.getByText('确认升级并转单', { exact: true }).click()
  await expect(page).toHaveURL(/entity=tickets&state=message-progress&id=ticket-04/)
  await expect(page.getByText('当前等待后台总部客服接收，APP 仅展示进度。', { exact: true })).toBeVisible()
  await expect(page.getByText('后台接收处理', { exact: true })).toHaveCount(0)
  const headquartersTransfer = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const ticket = db.tickets?.find((item: { id: string }) => item.id === 'ticket-04')
    const transfer = db.messageTransfers?.find((item: { ticketId: string; target: string }) => item.ticketId === 'ticket-04' && item.target === 'headquarters')
    return {
      ticketStatus: ticket?.status,
      assignmentTarget: ticket?.assignmentTarget,
      transferStatus: transfer?.status,
      messageCount: db.messages?.filter((item: { ticketId?: string }) => item.ticketId === 'ticket-04').length || 0,
    }
  })
  expect(headquartersTransfer).toMatchObject({ ticketStatus: 'processing', assignmentTarget: 'headquarters', transferStatus: 'pending' })
  expect(headquartersTransfer.messageCount).toBeGreaterThanOrEqual(1)
  await page.screenshot({ path: resolve(screenshotDirectory, '02b-headquarters-flow.png') })

  await visit(page, '/pages/manage/list?entity=tickets')
  await page.locator('.list-toolbar .filter').click()
  await page.locator('.advanced-option').nth(0).click()
  await expect(page.locator('.advanced-option').nth(0)).toContainText('旧到新')
  await page.locator('.advanced-option').nth(1).click()
  await expect(page.locator('.advanced-option').nth(1)).toContainText('权限内全部数据')
  await page.screenshot({ path: resolve(screenshotDirectory, '03-list-filter.png') })

  await visit(page, '/pages/device/detail?id=dev-01')
  const waypointCount = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.waypoints?.length || 0
  })
  await page.locator('[data-action-key="waypoint-mark"]').click()
  await expect(page.locator('.modal-title')).toHaveText('命名航点')
  await page.locator('.waypoint-name-form input').fill(`流程航点-${Date.now()}`)
  await page.locator('.modal-actions .primary').click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.waypoints?.length || 0
  })).toBe(waypointCount + 1)
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '手动控制' }).click()
  await expect(page.locator('.manual-control-panel')).toBeVisible()
  await page.getByLabel('加档', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.controlState?.direction
  })).toBe('forward')
  await expect(page.locator('.helm-map')).toBeVisible()
  await expect(page.locator('.manual-control-pad')).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '04-device-helm.png') })

  await visit(page, '/pages/profile/settings?section=notifications')
  await expect(page.getByText('免打扰', { exact: false })).toHaveCount(0)
  const productNotificationsBefore = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.settings?.notifications?.product
  })
  await page.getByText('产品与服务消息', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.settings?.notifications?.product
  })).toBe(!productNotificationsBefore)
  await page.screenshot({ path: resolve(screenshotDirectory, '05-notifications.png') })

  await visit(page, '/pages/profile/settings')
  await page.getByText('隐私与数据', { exact: true }).click()
  await expect(page.getByText('你的数据由当前账号管理', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '06-privacy.png') })
  await page.locator('[data-legal="user-agreement"]').click()
  await expect(page.getByText('账号与安全', { exact: true })).toBeVisible()
  await visit(page, '/pages/profile/settings?section=privacy')
  await page.locator('[data-legal="privacy-policy"]').click()
  await expect(page.getByText('我们收集的信息', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '06b-privacy-policy.png') })
  await visit(page, '/pages/profile/settings')
  await page.getByText('关于鲨鱼妹妹', { exact: true }).click()
  await expect(page.getByText('智能船舶设备管理与售后服务', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '07-about.png') })

  await visit(page, '/pages/manage/list?entity=tickets&mode=hub')
  await page.locator('[data-support-action="ticket-progress"]').filter({ hasText: 'ticket-01' }).click()
  await expect(page).toHaveURL(/entity=tickets&state=timeline&id=ticket-01/)
  await expect(page.getByText('服务申请已提交', { exact: true })).toBeVisible()
  await visit(page, '/pages/manage/list?entity=tickets&mode=hub')
  await expect(page.locator('[data-support-action="shipment-progress"]')).toHaveCount(0)
  await visit(page, '/pages/process/index?scenario=logistics&shipmentId=ship-01&source=support')
  await expect(page.getByText('物流轨迹', { exact: true }).first()).toBeVisible()
  await visit(page, '/pages/manage/list?entity=tickets&mode=hub')
  await page.locator('[data-faq="topflow-manual"]').click()
  await expect(page.locator('.app-title')).toHaveText('顶流机使用与故障排查手册')
  await expect(page.locator('.pdf-frame')).toHaveAttribute('src', /topflow-machine-manual-zh\.pdf$/)
  await page.screenshot({ path: resolve(screenshotDirectory, '08-faq-detail.png') })

  await visit(page, '/pages/manage/list?entity=payments')
  await page.locator('.payment-card').filter({ hasText: 'SR202608080116' }).click()
  await expect(page.getByText('支付详情', { exact: true })).toBeVisible()
  await expect(page.getByText('交易流水号', { exact: true })).toBeVisible()
  await expect(page.getByText('¥600', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(screenshotDirectory, '09-payment-detail.png') })

  await visit(page, '/pages/manage/list?entity=waypoints')
  await expect(page.getByText('已同步', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('synced', { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    const key = 'shark-sister-db-v1'
    const raw = JSON.parse(localStorage.getItem(key) || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    db.settings.locale = 'en'
    localStorage.setItem(key, JSON.stringify(raw?.type === 'object' && raw?.data ? { ...raw, data: db } : db))
  })
  await visit(page, '/pages/manage/list?entity=waypoints')
  await expect(page.getByText('Synced', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('已同步', { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
