import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const output = 'artifacts/dealer-workspace'
mkdirSync(output, { recursive: true })
async function visit(page: Page, route: string) {
  await page.goto(`/#${route}`)
  await page.reload()
  await page.locator('.app-bar,.shell,.login-button').first().waitFor()
}
async function signIn(page: Page, phone = '13800000028') {
  await visit(page, '/pages/auth/login')
  await page.locator('input').nth(0).fill(phone)
  await page.locator('input').nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/)
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${output}/${page.viewportSize()?.width}-${name}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  expect(await page.evaluate(() => [...document.images].filter(image => {
    const box = image.getBoundingClientRect()
    return box.width > 0 && box.height > 0 && image.complete && !image.naturalWidth
  }).map(image => image.src))).toEqual([])
}

test('dealer workbench opens a contextual material review and preserves cancellation', async ({ page }) => {
  await signIn(page)
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.locator('.workspace-shortcut')).toHaveCount(4)
  await capture(page, 'workbench')
  await page.locator('.queue-row').filter({ hasText: '物料' }).click()
  await expect(page.locator('.business-summary')).toBeVisible()
  await capture(page, 'materials')
  await page.locator('.entity-card').filter({ hasText: '防水连接器' }).getByText('查看详情', { exact: true }).click()
  await expect(page).toHaveURL(/state=record-detail/)
  await expect(page.locator('.business-detail-facts')).toContainText('关联项目')
  await expect(page.locator('.business-history')).toBeVisible()
  await capture(page, 'material-detail')
  await page.locator('.business-detail-actions').getByText('审批通过', { exact: true }).click()
  await expect(page.locator('.business-confirmation')).toContainText('防水连接器')
  await capture(page, 'approval-confirmation')
  await page.locator('.modal-actions').getByText('取消', { exact: true }).click()
  await expect(page.locator('.business-detail-heading .status')).toContainText('待审批')
  await page.locator('.business-detail-actions').getByText('驳回申请', { exact: true }).click()
  await capture(page, 'rejection-confirmation')
  await page.locator('.modal-actions').getByText('取消', { exact: true }).click()
  await visit(page, '/pages/manage/list?entity=materials&state=record-detail&id=missing-record')
  await expect(page.getByText('记录不可用', { exact: true })).toBeVisible()
  await expect(page.locator('.business-detail-actions')).toHaveCount(0)
  await expect(page.getByText('防水连接器', { exact: true })).toHaveCount(0)
})

test('dealer outlet tabs show distinct scoped content and edit forms', async ({ page }) => {
  await signIn(page)
  await visit(page, '/pages/manage/list?entity=dealers')
  await page.locator('.entity-card').first().click()
  await expect(page.locator('.dealer-overview-facts')).toBeVisible()
  await capture(page, 'outlet-overview')
  await page.locator('.detail-tabs').getByText('权限', { exact: true }).click()
  await expect(page.locator('.dealer-overview-facts')).toHaveCount(0)
  await expect(page.locator('.dealer-access-list')).toContainText('已授权业务')
  await expect(page.getByText('project.manage', { exact: true })).toHaveCount(0)
  await capture(page, 'outlet-permissions')
  await page.locator('.detail-tabs').getByText('数据范围', { exact: true }).click()
  await expect(page.locator('.dealer-scope-total')).toBeVisible()
  await capture(page, 'outlet-scope')
  await page.locator('.detail-tabs').getByText('团队', { exact: true }).click()
  await expect(page.locator('.dealer-access-list')).toContainText('网点团队')
  await capture(page, 'outlet-team')
  await page.locator('.detail-edit').click()
  await expect(page.locator('.field-control').first()).toBeVisible()
  await capture(page, 'outlet-edit')
})

test('employee account form keeps icons compact and fields left aligned', async ({ page }) => {
  await signIn(page)
  await visit(page, '/pages/manage/form?entity=employees')
  const field = page.locator('.employee-account-form .field-control').first()
  const icon = field.locator('.ss-icon').first()
  const input = field.locator('uni-input').first()
  const [fieldBox, iconBox, inputBox] = await Promise.all([field.boundingBox(), icon.boundingBox(), input.boundingBox()])
  expect(fieldBox).toBeTruthy()
  expect(iconBox).toBeTruthy()
  expect(inputBox).toBeTruthy()
  expect(iconBox!.width).toBeLessThanOrEqual(24)
  expect(iconBox!.x).toBeGreaterThanOrEqual(fieldBox!.x + 10)
  expect(inputBox!.x).toBeGreaterThan(iconBox!.x + iconBox!.width)
  expect(inputBox!.width).toBeGreaterThan(fieldBox!.width * .7)
  await capture(page, 'staff-create-aligned')
})

test('primary dealer can assign a purchased unallocated device to a direct sub-dealer', async ({ page }) => {
  await signIn(page)
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  const assignmentShortcut = page.locator('.business-row,.workspace-shortcut').filter({ hasText: '设备分配' }).first()
  await expect(assignmentShortcut).toBeVisible()
  await expect(assignmentShortcut).toContainText('2')
  await assignmentShortcut.click()
  await expect(page).toHaveURL(/entity=devices&state=unassigned/)
  await expect(page.getByText('制冰机-05', { exact: true })).toBeVisible()
  await expect(page.getByText('电池组-06', { exact: true })).toBeVisible()
  await capture(page, 'unassigned-devices')

  const targetCard = page.locator('.entity-card').filter({ hasText: '制冰机-05' })
  await targetCard.getByText('分配给二级经销商', { exact: true }).click()
  await expect(page).toHaveURL(/mode=dealer-assignment&deviceId=dev-05/)
  await page.locator('[data-assignment-field="target"]').click()
  await expect(page.locator('.select-head')).toContainText('接收二级经销商')
  await page.locator('.select-option').filter({ hasText: '海沧服务网点' }).click()
  await capture(page, 'dealer-device-assignment')
  await page.locator('.assignment-submit').click()
  await expect(page).toHaveURL(/entity=devices&state=unassigned/)
  await expect(page.getByText('制冰机-05', { exact: true })).toHaveCount(0)
  await expect(page.getByText('电池组-06', { exact: true })).toBeVisible()

  const assignmentState = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((item) => item.includes('shark-sister'))
    const raw = key ? localStorage.getItem(key) : null
    const state = raw ? JSON.parse(raw) : null
    const database = state?.type === 'object' && state?.data ? state.data : state?.db || state?.database || state
    return {
      dealerId: database?.devices?.find((item: { id: string }) => item.id === 'dev-05')?.dealerId,
      transfer: database?.transfers?.find((item: { deviceId: string; targetDealerId?: string }) => item.deviceId === 'dev-05' && item.targetDealerId === 'dealer-03'),
    }
  })
  expect(assignmentState.dealerId).toBe('dealer-03')
  expect(assignmentState.transfer?.status).toBe('completed')
})

test('repair form supports multiple replacement material groups', async ({ page }) => {
  await signIn(page)
  await visit(page, '/pages/manage/form?entity=tickets&category=repair&deviceId=dev-01')
  const replacementCard = page.locator('.replacement-card')
  await replacementCard.locator('uni-switch').click()
  await expect(page.locator('.replacement-line')).toHaveCount(1)
  await page.getByText('添加一组更换物料', { exact: true }).click()
  await expect(page.locator('.replacement-line')).toHaveCount(2)
  await expect(page.locator('.replacement-line').nth(1).locator('[data-action="remove-replacement-line"]')).toBeVisible()
  await capture(page, 'repair-multiple-replacements')
})

test('dealer records connect project parts, logistics, transfers and approval-first purchasing', async ({ page }) => {
  await signIn(page)
  await visit(page, '/pages/manage/form?entity=projects&id=pro-01&mode=detail')
  await page.locator('.project-tabs').getByText('物料', { exact: true }).click()
  await page.locator('.project-panel .list-row').filter({ hasText: '主控板' }).first().click()
  await expect(page).toHaveURL(/state=record-detail&id=mat-01/)
  await page.locator('.business-related').click()
  await expect(page).toHaveURL(/scenario=logistics&shipmentId=ship-01/)
  await expect(page.locator('.timeline-card').first()).toContainText('SF1438265102')
  await capture(page, 'material-logistics')
  await visit(page, '/pages/manage/list?entity=transfers')
  await page.locator('.entity-card').first().getByText('查看详情', { exact: true }).click()
  await expect(page.locator('.business-detail-facts')).toContainText('接收方')
  await expect(page.locator('.business-history')).toBeVisible()
  await capture(page, 'transfer-detail')
  await visit(page, '/pages/manage/list?entity=purchases')
  await page.locator('.entity-card').first().getByText('查看详情', { exact: true }).click()
  await expect(page.locator('.business-detail-heading')).toContainText('PO202608100028')
  await capture(page, 'purchase-detail')
  await expect(page.locator('.business-detail-actions').getByText('销售确认', { exact: true })).toBeVisible()
  await expect(page.locator('.business-detail-actions').getByText('去支付', { exact: true })).toHaveCount(0)
  await page.locator('.business-detail-actions').getByText('销售确认', { exact: true }).click()
  await expect(page.locator('.modal-layer')).toBeVisible()
  await capture(page, 'purchase-approval')
  await page.locator('.modal-actions').getByText('确认执行', { exact: true }).click()
  for (const action of ['研发确认', '导入生产', '完成生产']) {
    await expect(page.locator('.business-detail-actions').getByText(action, { exact: true })).toBeVisible()
    await page.locator('.business-detail-actions').getByText(action, { exact: true }).click()
    await page.locator('.modal-actions').getByText('确认执行', { exact: true }).click()
  }
  await expect(page.locator('.business-detail-actions').getByText('开始付款', { exact: true })).toBeVisible()
  await page.locator('.business-detail-actions').getByText('开始付款', { exact: true }).click()
  await expect(page).toHaveURL(/scenario=payment&paymentId=/)
  await capture(page, 'device-payment-first-installment')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-action-key="payment-proof-upload"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'purchase-proof.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
  await page.getByText('提交付款凭证', { exact: true }).click()
  await page.locator('.modal-actions').getByText('确认提交', { exact: true }).click()
  await expect(page.locator('.modal-title')).toHaveText('凭证已提交')
  await page.locator('.modal-actions').getByText('查看支付记录', { exact: true }).click()
  await page.locator('.payment-card').filter({ hasText: '待财务核实' }).first().click()
  await page.getByText('查看核实进度', { exact: true }).click()
  await page.locator('[data-action-key="demo-finance-review"]').click()
  await expect(page.locator('.modal-title')).toHaveText('订单已付清')
  await page.locator('.modal-actions').getByText('查看物流进度', { exact: true }).click()
  await expect(page).toHaveURL(/scenario=logistics&shipmentId=/)
  await expect(page.locator('.timeline-card').first()).toContainText('顺丰速运')
})

test('dealer purchases equipment with two installments and receives it into unassigned inventory', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page)
  await visit(page, '/pages/manage/list?entity=purchases&state=catalog')
  await page.locator('.category-chips').getByText('设备', { exact: true }).click()
  const equipmentCard = page.locator('.entity-card').filter({ hasText: '整机设备' }).first()
  await expect(equipmentCard).toBeVisible()
  const purchasedModel = (await equipmentCard.locator('.list-copy strong').innerText()).trim()
  await equipmentCard.locator('.catalog-result .stepper uni-button').last().click()
  await expect(page.locator('.purchase-cart-bar')).toContainText('1 件')
  await page.locator('.purchase-cart-bar').getByText('提交采购单', { exact: true }).click()
  await expect(page).toHaveURL(/entity=purchases(?!.*state=catalog)/)

  const purchaseCard = page.locator('.entity-card').filter({ hasText: '1 种设备/配件采购' }).first()
  await expect(purchaseCard).toContainText('设备')
  await purchaseCard.getByText('查看详情', { exact: true }).click()
  await expect(page.locator('.business-detail-heading')).toContainText('待销售确认')
  for (const action of ['销售确认', '研发确认', '导入生产', '完成生产']) {
    await expect(page.locator('.business-detail-actions').getByText(action, { exact: true })).toBeVisible()
    await page.locator('.business-detail-actions').getByText(action, { exact: true }).click()
    await page.locator('.modal-actions').getByText('确认执行', { exact: true }).click()
  }
  await page.locator('.business-detail-actions').getByText('开始付款', { exact: true }).click()
  await expect(page).toHaveURL(/scenario=payment&paymentId=/)

  const orderTotal = Number((await page.locator('.installment-summary strong').first().innerText()).replace(/[^0-9.]/g, ''))
  const firstAmount = Math.max(1, Math.floor(orderTotal * 0.4))
  await page.locator('[data-payment-amount] input').fill(String(firstAmount))
  let chooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-action-key="payment-proof-upload"]').click()
  let chooser = await chooserPromise
  await chooser.setFiles({ name: 'device-payment-1.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
  await page.getByText('提交付款凭证', { exact: true }).click()
  await page.locator('.modal-actions').getByText('确认提交', { exact: true }).click()
  await expect(page.locator('.modal-title')).toHaveText('凭证已提交')
  await page.locator('.modal-actions').getByText('查看支付记录', { exact: true }).click()
  await page.locator('.payment-card').filter({ hasText: '待财务核实' }).first().click()
  await page.getByText('查看核实进度', { exact: true }).click()
  await page.locator('[data-action-key="demo-finance-review"]').click()
  await expect(page.locator('.modal-title')).toHaveText('本次付款已核实')
  await page.locator('.modal-actions').getByText('继续下一笔付款', { exact: true }).click()
  await expect(page.locator('.payment-section-head').first()).toContainText('第 2 笔付款')
  await capture(page, 'device-payment-second-installment')

  chooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-action-key="payment-proof-upload"]').click()
  chooser = await chooserPromise
  await chooser.setFiles({ name: 'device-payment-2.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
  await page.getByText('提交付款凭证', { exact: true }).click()
  await page.locator('.modal-actions').getByText('确认提交', { exact: true }).click()
  await expect(page.locator('.modal-title')).toHaveText('凭证已提交')
  await page.locator('.modal-actions').getByText('查看支付记录', { exact: true }).click()
  await page.locator('.payment-card').filter({ hasText: '待财务核实' }).first().click()
  await page.getByText('查看核实进度', { exact: true }).click()
  await page.locator('[data-action-key="demo-finance-review"]').click()
  await expect(page.locator('.modal-title')).toHaveText('订单已付清')
  await page.locator('.modal-actions').getByText('查看物流进度', { exact: true }).click()
  await expect(page.locator('.shipment-items')).toContainText(purchasedModel.split(' ')[0])

  await visit(page, '/pages/manage/list?entity=shipments')
  const shipmentCard = page.locator('.entity-card').first()
  await shipmentCard.getByText('确认签收', { exact: true }).click()
  await page.locator('.modal-actions').getByText('确认执行', { exact: true }).click()
  await expect(shipmentCard).toContainText('已签收')

  const received = await page.evaluate(() => {
    const raw = localStorage.getItem('shark-sister-db-v1')
    const state = raw ? JSON.parse(raw) : null
    const database = state?.type === 'object' && state?.data ? state.data : state?.db || state?.database || state
    return [...(database?.devices || [])]
      .filter((item: { activationStatus?: string; location?: { label?: string }; ownerId?: string; projectId?: string; assignedTo?: string }) => item.activationStatus === 'registered' && item.location?.label === '经销商库存' && !item.ownerId && !item.projectId && !item.assignedTo)
      .sort((a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt))[0]
  })
  expect(received).toBeTruthy()
  await visit(page, '/pages/manage/list?entity=devices&state=unassigned')
  await expect(page.getByText(received.name, { exact: true })).toBeVisible()
  await capture(page, 'purchased-device-unassigned')
})

test('dealer pages and nested forms fit mobile and short desktop layouts', async ({ page }) => {
  test.setTimeout(360_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await signIn(page)
  const routes = [
    ['projects', '/pages/manage/list?entity=projects'],
    ['project-query', '/pages/manage/list?entity=projects&state=search'],
    ['project-details', '/pages/manage/form?entity=projects&id=pro-01&mode=detail'],
    ['project-create', '/pages/manage/form?entity=projects&step=device'],
    ['project-customer', '/pages/manage/form?entity=projects&step=customer'],
    ['material-request', '/pages/manage/form?entity=materials'],
    ['catalog', '/pages/manage/list?entity=purchases&state=catalog'],
    ['purchase-orders', '/pages/manage/list?entity=purchases'],
    ['customer-orders', '/pages/manage/list?entity=orders'],
    ['tickets', '/pages/manage/list?entity=tickets'],
    ['service-form', '/pages/manage/form?entity=tickets&category=repair&deviceId=dev-01'],
    ['service-detail', '/pages/manage/list?entity=tickets&state=timeline&id=ticket-01'],
    ['transfers', '/pages/manage/list?entity=transfers'],
    ['assignment', '/pages/manage/form?entity=transfers&mode=dealer-assignment&deviceId=dev-05'],
    ['staff', '/pages/manage/list?entity=employees'],
    ['staff-create', '/pages/manage/form?entity=employees'],
    ['outlet-create', '/pages/manage/form?entity=dealers'],
    ['shipments', '/pages/manage/list?entity=shipments'],
    ['payments', '/pages/manage/list?entity=payments'],
    ['analytics', '/pages/process/index?scenario=dealerAnalytics'],
  ]
  for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport)
    for (const [name, route] of routes) { await visit(page, route); await capture(page, name) }
    await visit(page, '/pages/manage/form?entity=materials')
    await page.locator('.material-request-form .field-control').first().click()
    await expect(page.locator('.select-sheet')).toBeVisible()
    await capture(page, 'material-project-picker')
    await page.locator('.select-option').first().click()
    await expect(page.locator('.material-line').first()).toBeVisible()
    await page.locator('.quantity-stepper').first().locator('uni-button').last().click()
    await expect(page.locator('.quantity-stepper').first()).toContainText('1')
    await capture(page, 'material-lines')
    await visit(page, '/pages/manage/list?entity=employees')
    await page.locator('.entity-card').first().click()
    await expect(page.locator('.employee-permission-group').first()).toBeVisible()
    await capture(page, 'staff-permissions')
  }
  expect(errors).toEqual([])
})
