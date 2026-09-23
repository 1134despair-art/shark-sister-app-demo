import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/#/pages/auth/login')
  const inputs = page.locator('input')
  await inputs.nth(0).fill(identifier)
  await inputs.nth(1).fill(password)
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/)
}

test('every launch shows the configurable splash and first install adds an onboarding guide', async ({ page }, testInfo) => {
  await page.goto('/#/pages/startup/index?preview=1')
  await expect(page.locator('.launch-page')).toBeVisible()
  await expect(page.getByText('鲨鱼妹妹', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('startup-first-launch.png') })
  await page.evaluate(() => {
    localStorage.removeItem('shark-sister-launch-screen-revision')
    localStorage.removeItem('shark-sister-onboarding-seen-v1')
  })

  await page.goto('/')
  await expect(page.locator('.launch-page')).toBeVisible()
  await expect(page.getByText('鲨鱼妹妹', { exact: true })).toBeVisible()
  await page.locator('.launch-skip').click()
  await expect(page).toHaveURL(/pages\/startup\/guide/)
  await expect(page.getByText('连接船载设备', { exact: true })).toBeVisible()
  await page.getByText('下一步', { exact: true }).click()
  await page.getByText('下一步', { exact: true }).click()
  await page.getByText('开始使用', { exact: true }).click()
  await expect(page).toHaveURL(/pages\/auth\/login/)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('shark-sister-launch-screen-revision') || 'null'))).toBe('v3.2-default')

  await page.goto('/#/pages/startup/index')
  await expect(page.locator('.launch-page')).toBeVisible()
  await page.locator('.launch-skip').click()
  await expect(page).toHaveURL(/pages\/auth\/login/)
})

async function expectVisibleFieldIcon(page: Page) {
  const icon = page.locator('.field-control .ss-iconfont').first()
  await expect(icon).toBeVisible()
  await expect(icon).toHaveAttribute('data-glyph', /.+/)
  await expect(icon).toHaveText('')
  expect(await icon.evaluate((element) => getComputedStyle(element).fontFamily)).toContain('SharkIconfont')
}

test('login account icons use the bundled Iconfont glyphs', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  await expectVisibleFieldIcon(page)
  await page.locator('input').first().fill('captain@seawind.com')
  await expectVisibleFieldIcon(page)
})

test('email password login is available from the main login page', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  await page.getByText('邮箱登录', { exact: true }).click()
  const inputs = page.locator('input')
  await inputs.nth(0).fill('captain@seawind.com')
  await inputs.nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/shell\/index/)
})

test('email registration creates an account and signs in', async ({ page }) => {
  const email = `captain.${Date.now()}@example.com`
  await page.goto('/#/pages/auth/register?method=email')
  await expect(page.getByText('邮箱注册', { exact: true }).first()).toBeVisible()
  const inputs = page.locator('input')
  await inputs.nth(0).fill(email)
  await inputs.nth(2).fill('Ocean2026')
  await inputs.nth(3).fill('Ocean2026')
  await page.getByText('获取验证码', { exact: true }).click()
  await expect(inputs.nth(1)).toHaveValue('826104')
  await page.locator('.agreement .check').click()
  await page.locator('.register-submit').click()
  await page.waitForURL(/shell\/index/)
  await expect.poll(() => page.evaluate((target) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.accounts?.some((item: { identifier: string }) => item.identifier === target)
  }, email)).toBe(true)
})

test('Google sign-in creates a verified user session', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  await page.locator('.agreement .check').click()
  await page.locator('.social').filter({ hasText: 'Google' }).click()
  await page.waitForURL(/shell\/index/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.accounts?.some((item: { providerLinks?: { Google?: string } }) => Boolean(item.providerLinks?.Google))
  })).toBe(true)
})

test('language settings exposes all requested locales and persists direction', async ({ page }, testInfo) => {
  test.setTimeout(75_000)
  await signIn(page, '13800002861', '123456')
  await page.goto('/#/pages/profile/settings?section=language')
  await expect(page.locator('[data-language-picker]')).toBeVisible()
  await expect(page.locator('[data-locale]')).toHaveCount(0)
  await page.locator('[data-language-picker]').click()
  await expect(page.locator('.language-picker-sheet')).toBeVisible()
  await expect(page.locator('[data-locale]')).toHaveCount(13)
  await expect(page.locator('[data-locale="ko"]')).toContainText('한국어')
  await expect(page.locator('[data-locale="ja"]')).toContainText('日本語')
  await expect(page.locator('[data-locale="ar"]')).toContainText('العربية')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('language-picker-zh.png'), fullPage: true })

  await page.locator('[data-locale="ja"]').click()
  await expect(page.locator('.language-picker-sheet')).toBeHidden()
  await expect(page.locator('[data-language-picker]')).toContainText('日本語')
  await page.locator('.apply-language').click()
  await page.waitForURL(/shell\/index\?tab=profile/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return { locale: db.settings?.locale, lang: document.documentElement.lang, dir: document.documentElement.dir }
  })).toEqual({ locale: 'ja', lang: 'ja', dir: 'ltr' })
  await expect(page.getByText('日本語', { exact: true })).toBeVisible()

  await page.goto('/#/pages/profile/settings?section=language')
  await expect(page.locator('[data-language-picker]')).toContainText('日本語')
  await page.locator('[data-language-picker]').click()
  await expect(page.locator('[data-locale="ja"]')).toHaveClass(/selected/)
  await page.locator('[data-locale="ar"]').click()
  await page.locator('.apply-language').click()
  await page.waitForURL(/shell\/index\?tab=profile/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return { locale: db.settings?.locale, lang: document.documentElement.lang, dir: document.documentElement.dir }
  })).toEqual({ locale: 'ar', lang: 'ar', dir: 'rtl' })
  await expect(page.getByText('العربية', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await page.waitForTimeout(700)
  await page.screenshot({ path: testInfo.outputPath('profile-arabic-rtl.png'), fullPage: true })
})

test('ordinary user signs in, uses the shared navigation and opens service records', async ({ page }) => {
  await signIn(page, '13800002861', '123456')
  await expect(page.getByRole('region', { name: '首页轮播' })).toBeVisible()
  await expect(page.getByText('我的设备', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('我的分类', { exact: true })).toBeVisible()
  expect(await page.locator('.category-list uni-button').count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('[data-action-key="priority-repair"]')).toHaveCount(0)
  await expect(page.locator('.overview-all')).toHaveCount(0)
  await expect(page.locator('.stats-grid')).toHaveCount(0)
  await expect(page.getByText('进入链接设备', { exact: true })).toHaveCount(0)
  await expect(page.locator('.section-link-action')).toHaveCount(0)
  await expect(page.locator('.overview-shortcuts .shortcut-icon')).toHaveCount(2)
  await expect(page.getByText('故障报修', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.tab-item')).toHaveCount(2)
  await expect(page.locator('.tab-item').filter({ hasText: '添加' })).toHaveCount(0)
  await expect(page.locator('.tab-item').filter({ hasText: '设备' })).toHaveCount(1)
  await expect(page.locator('.tab-item').filter({ hasText: '地图' })).toHaveCount(0)
  await page.locator('.tab-item').filter({ hasText: '我的' }).click()
  await expect(page.getByText('报修记录', { exact: true })).toBeVisible()
  await expect(page.getByText('跨区转移', { exact: true })).toBeVisible()
  await expect(page.getByText('航迹设置', { exact: true })).toBeVisible()
  await page.getByText('售后服务', { exact: true }).click()
  await expect(page.getByText('故障报修', { exact: true })).toBeVisible()
  await expect(page.getByText('跨区转移', { exact: true })).toBeVisible()
})

test('home category row fully displays three categories on phone widths', async ({ page }) => {
  await signIn(page, '13800002861', '123456')
  for (const width of [375, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/pages/shell/index?tab=home')
    const cards = page.locator('.category-list uni-button')
    await expect(cards).toHaveCount(3)
    const scrollBox = await page.locator('.category-scroll').boundingBox()
    const thirdBox = await cards.nth(2).boundingBox()
    expect(scrollBox).not.toBeNull()
    expect(thirdBox).not.toBeNull()
    expect(thirdBox!.x + thirdBox!.width).toBeLessThanOrEqual(scrollBox!.x + scrollBox!.width + 1)
  }
})

test('ordinary user creates a route from explicitly selected waypoints', async ({ page }) => {
  await signIn(page, '13800002861', '123456')
  await page.goto('/#/pages/manage/list?entity=routes')
  const before = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.routes?.length || 0
  })
  await expect(page.locator('.floating-add')).toHaveCount(0)
  await page.locator('.app-bar .app-action.right').click()
  await expect(page.getByText('航迹名称', { exact: false }).first()).toBeVisible()
  await page.getByText('选择航点', { exact: true }).first().click()
  await expect(page.locator('.route-picker-sheet')).toBeVisible()
  await page.locator('.route-picker-list .list-row').nth(0).click()
  await page.locator('.route-picker-list .list-row').nth(1).click()
  await page.getByText('完成选择', { exact: true }).click()
  await expect(page.getByText('2 个已选择', { exact: true })).toBeVisible()
  await page.getByText('仅保存', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.routes?.length || 0
  })).toBe(before + 1)
})

test('dealer admin receives complete workspace and sub-dealer domain pages', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  expect(await page.locator('.tab-item').allTextContents()).toEqual(['设备', '工作台', '我的'])
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.getByText('待办事项', { exact: true })).toBeVisible()
  await expect(page.getByText('常用功能', { exact: true })).toBeVisible()
  await expect(page.getByText('全部业务', { exact: true })).toBeVisible()
  await expect(page.getByText('安装管理', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('账号启用', { exact: true })).toHaveCount(0)
  await expect(page.locator('.workbench-summary')).toHaveCount(0)
  await expect(page.getByText('数据统计', { exact: true })).toBeVisible()
  await page.getByText('二级经销商', { exact: true }).click()
  await expect(page.getByText('二级经销商管理', { exact: true })).toBeVisible()
  await expect(page.getByText('泉州远航服务网点')).toBeVisible()
})

test('employee accounts expose one create entry in the app bar', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/list?entity=employees')
  await expect(page.locator('.app-bar .app-action.right')).toHaveCount(1)
  await expect(page.locator('.floating-add')).toHaveCount(0)
})

test('dealer assignment form searches scoped devices and persists the selected staff member', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/form?entity=transfers&mode=assignment&deviceId=dev-05')
  await expect(page.getByText('确认设备分配', { exact: true })).toBeVisible()
  await expect(page.locator('[data-assignment-field="device"]')).toContainText('IC150020240505')
  await page.locator('[data-assignment-field="device"]').click()
  await expect(page.locator('.select-search')).toBeVisible()
  await page.locator('.select-search input').fill('1500')
  await expect(page.locator('.select-option')).toHaveCount(1)
  await expect(page.locator('.select-option')).toContainText('IC-1500')
  await page.locator('.select-close').click()
  await page.locator('[data-assignment-field="target"]').click()
  await page.locator('.select-option').filter({ hasText: '周海峰' }).click()
  await page.getByText('确认分配设备', { exact: true }).click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const transfer = db.transfers?.find((item: { deviceId: string; kind: string }) => item.deviceId === 'dev-05' && item.kind === 'assignment')
    return {
      assignedTo: db.devices?.find((item: { id: string }) => item.id === 'dev-05')?.assignedTo,
      transferStatus: transfer?.status,
      targetEmployeeId: transfer?.targetEmployeeId,
    }
  })).toEqual({ assignedTo: 'emp-01', transferStatus: 'completed', targetEmployeeId: 'emp-01' })
})

test('material requests expose one create entry without the duplicate app-bar plus', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/list?entity=materials')
  await expect(page.locator('.app-bar .app-action.right')).toHaveCount(0)
  await expect(page.locator('.entity-card')).toHaveCount(2)
  await expect(page.locator('.floating-add')).toHaveCount(1)
})

test('dealer creates a multi-line material purchase from the catalog', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/list?entity=purchases&state=catalog')
  await expect(page.locator('.purchase-view-tabs')).toContainText('采购商品')
  await expect(page.locator('.purchase-view-tabs')).toContainText('采购记录')
  expect(await page.locator('.entity-card').count()).toBeGreaterThanOrEqual(2)
  await page.locator('.entity-card').nth(0).locator('.stepper').getByText('+', { exact: true }).click()
  await page.locator('.entity-card').nth(1).locator('.stepper').getByText('+', { exact: true }).click()
  await expect(page.locator('.purchase-cart-bar')).toContainText('已选商品')
  await expect(page.locator('.purchase-cart-bar')).toContainText('2 件')
  await page.getByText('提交采购单', { exact: true }).click()
  await expect(page).toHaveURL(/manage\/list\?entity=purchases$/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const purchase = db.purchases?.[0]
    return { itemCount: purchase?.items?.length, status: purchase?.status, paymentCount: db.payments?.filter((item: { purchaseId?: string }) => item.purchaseId === purchase?.id).length }
  })).toEqual({ itemCount: 2, status: 'pendingApproval', paymentCount: 0 })
})

test('dealer purchase records expose amount payment and shipment status', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/list?entity=purchases&state=catalog')
  await page.getByText('采购记录', { exact: false }).click()
  await expect(page).toHaveURL(/entity=purchases$/)
  await expect(page.locator('.purchase-record-meta').first()).toContainText('订单金额')
  await expect(page.locator('.entity-card').first()).toContainText('待销售确认')
  await expect(page.locator('.purchase-record-meta').first()).toContainText('付款状态')
  await expect(page.locator('.purchase-record-meta').first()).toContainText('物流状态')
})

test('dealer device detail exposes read-only linked project customer warranty and service records', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.getByText('设备管理', { exact: true })).toHaveCount(0)
  await page.locator('.workspace-shortcut').filter({ hasText: '安装管理' }).click()
  await expect(page).toHaveURL(/entity=projects/)
  await page.locator('.entity-card').filter({ hasText: '海风号' }).click()
  await expect(page).toHaveURL(/entity=projects&id=pro-01&mode=detail/)
  await page.locator('.project-device').filter({ hasText: 'DL300020240101' }).click()
  await expect(page).toHaveURL(/device\/detail\?id=dev-01&mode=manage/)
  const linked = page.locator('.linked-business')
  await expect(linked).toBeVisible()
  await expect(linked).toContainText('关联业务')
  await expect(linked).toContainText('只读')
  await expect(linked).toContainText('海风号设备安装')
  await expect(linked).toContainText('陈先生 · 海风号')
  await expect(linked).toContainText('质保至 2028-03-17')
  await expect(page.locator('.device-parts-section')).toContainText('子物料明细')
  await expect(page.locator('.device-parts-section')).toContainText('该设备尚未登记子物料')
  await linked.locator('.linked-row').filter({ hasText: '安装项目' }).click()
  await expect(page).toHaveURL(/entity=projects&id=pro-01&mode=detail/)
  await page.goBack()
  await page.locator('.linked-business .linked-row').filter({ hasText: '售后记录' }).click()
  await expect(page).toHaveURL(/entity=tickets&deviceId=dev-01/)
  await expect(page.locator('.entity-card')).toHaveCount(1)
  await expect(page.getByText('服务体验投诉', { exact: true })).toBeVisible()
})

test('dealer entering a top-flow device from the home context can operate it as a device user', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/device/detail?id=dev-01')
  await expect(page.locator('.helm-map')).toBeVisible()
  await expect(page.locator('.linked-business')).toHaveCount(0)
  const before = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.deviceCommands?.length || 0
  })
  await page.locator('.dock-propeller-button').click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return { count: db.deviceCommands?.length || 0, accountId: db.deviceCommands?.[0]?.accountId }
  })).toEqual({ count: before + 1, accountId: 'acc-dealer' })
})

test('dealer project search exposes combined dealer status and date filters', async ({ page }) => {
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/list?entity=projects&state=search')
  await page.locator('.project-search-toolbar .filter').last().click()
  await expect(page.locator('.project-advanced-filter .advanced-picker')).toHaveCount(4)
  await expect(page.locator('.advanced-picker strong').filter({ hasText: '全部经销商' })).toBeVisible()
  await expect(page.locator('.advanced-picker strong').filter({ hasText: '全部状态' })).toBeVisible()
})

test('dealer staff only sees granted modules and is blocked from staff management', async ({ page }) => {
  await signIn(page, '13800000268', '123456')
  await expect(page.locator('.tab-item')).toHaveCount(3)
  expect(await page.locator('.tab-item').allTextContents()).toEqual(['设备', '工作台', '我的'])
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  const staffMenu = page.locator('.list-row').filter({ hasText: '员工账号' })
  await expect(staffMenu).toHaveCount(0)
  await expect(page.locator('.business-row').filter({ hasText: '物料与设备审批' })).toHaveCount(0)
  await expect(page.locator('.business-row').filter({ hasText: '二级经销商' })).toHaveCount(0)
  await expect(page.locator('.business-row').filter({ hasText: '设备分配与调拨' })).toHaveCount(0)

  await page.goto('/#/pages/manage/list?entity=employees')
  await expect(page.getByText('当前账号无权访问')).toBeVisible()
  await page.goto('/#/pages/manage/list?entity=materials&state=price-search')
  await expect(page.getByText('当前账号无权访问')).toBeVisible()
})

test('secondary dealer hides parent-only workbench modules', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  await page.evaluate(() => {
    const raw = localStorage.getItem('shark-sister-db-v1')
    const state = raw ? JSON.parse(raw) : null
    const db = state?.type === 'object' && state?.data ? state.data : state
    const account = db?.accounts?.find((item: { id: string }) => item.id === 'acc-first')
    if (account) account.firstLogin = false
    if (db) localStorage.setItem('shark-sister-db-v1', JSON.stringify(state?.type === 'object' && state?.data ? { ...state, data: db } : db))
  })
  await signIn(page, 'DLR-SH-0028', '123456')
  await page.locator('.tab-item').filter({ hasText: '工作台' }).click()
  await expect(page.getByText('安装管理', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('售后管理', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('设备管理', { exact: true })).toHaveCount(0)
  await expect(page.getByText('物料申请', { exact: true })).toBeVisible()
  await expect(page.getByText('员工账号', { exact: true })).toBeVisible()
  await expect(page.getByText('设备分配与调拨', { exact: true })).toHaveCount(0)
  await expect(page.getByText('支付记录', { exact: true })).toHaveCount(0)
  await expect(page.getByText('二级经销商', { exact: true })).toHaveCount(0)
})

test('V3.2 guest mode exposes public content and blocks protected actions', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  await page.getByText('游客模式', { exact: true }).click()
  await expect(page.getByText('游客可浏览首页、公开设备信息和服务入口；绑定设备、设备控制、提交售后等操作需要登录。', { exact: true })).toBeVisible()
  await page.locator('.modal-actions .primary').click()
  await page.waitForURL(/shell\/index/)
  await expect(page.getByRole('region', { name: '首页轮播' })).toBeVisible()
  await expect(page.getByText('我的设备', { exact: true }).first()).toBeVisible()
  await page.getByText('绑定设备', { exact: true }).first().click()
  await expect(page.getByText('需要登录', { exact: true })).toBeVisible()
})

test('first-login dealer must verify the temporary password before continuing', async ({ page }) => {
  await page.goto('/#/pages/auth/login')
  const inputs = page.locator('input')
  await inputs.nth(0).fill('DLR-SH-0028')
  await inputs.nth(1).fill('123456')
  await page.locator('.agreement .check').click()
  await page.locator('.login-button').click()
  await page.waitForURL(/password\?mode=first/)
  await expect(page).toHaveURL(/password\?mode=first/)
  await expect(page.getByText('首次登录修改密码')).toBeVisible()
})

test('manual device SN creates a complete persistent binding flow', async ({ page }) => {
  const serial = `DL34${Date.now().toString().slice(-12)}`
  await signIn(page, '13800002861', '123456')
  await page.goto('/#/pages/device/add?step=2&method=manual')
  const serialInput = page.locator('input')
  const initialSerial = await serialInput.inputValue()
  await page.locator('.serial-generate').click()
  await expect(serialInput).not.toHaveValue(initialSerial)
  const generatedSerial = await serialInput.inputValue()
  expect(generatedSerial).toMatch(/^DL\d{14}$/)
  await serialInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await serialInput.fill('')
  await serialInput.fill(serial)
  await expect(serialInput).toHaveValue(serial)
  await serialInput.blur()
  await page.locator('.fixed-cta .btn').click()
  await expect(page.locator('.success-state > uni-text')).toHaveText('设备已激活')
  await expect(page.locator('.success-storage')).toContainText('同步服务器')
  await expect(page.getByText('销售地区', { exact: true })).toHaveCount(0)
  const persisted = await page.evaluate((targetSerial) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const device = db.devices?.find((item: { serialNumber: string }) => item.serialNumber === targetSerial)
    const registration = db.deviceRegistrations?.find((item: { serialNumber: string }) => item.serialNumber === targetSerial)
    return {
      deviceId: device?.id,
      projectId: device?.projectId,
      firmware: device?.firmware,
      connectionState: device?.connectionState,
      bluetoothConnected: device?.bluetoothConnected,
      controllerConnected: device?.controllerConnected,
      gpsSignal: device?.telemetry?.gpsSignal,
      registrationStatus: registration?.status,
      waypointStorage: db.settings?.waypointStorage,
      audit: db.auditEvents?.some((item: { entityId: string; action: string }) => item.entityId === targetSerial && item.action === 'activate'),
    }
  }, serial)
  expect(persisted.deviceId).toBeTruthy()
  expect(persisted.projectId).toBeTruthy()
  expect(persisted.firmware).toBe('3.2.1')
  expect(persisted.connectionState).toBe('connected')
  expect(persisted.bluetoothConnected).toBe(true)
  expect(persisted.controllerConnected).toBe(true)
  expect(persisted.gpsSignal).toBeGreaterThanOrEqual(82)
  expect(persisted.registrationStatus).toBe('bound')
  expect(persisted.waypointStorage).toBe('cloud')
  expect(persisted.audit).toBe(true)
  await page.reload()
  await page.getByText('查看设备详情', { exact: true }).click()
  await expect(page.locator('.app-title')).toContainText('顶流机')
  await expect(page.locator('.gps-block')).toContainText('GPS')
  await expect(page.locator('.connection-button')).toContainText('已连接')
  await expect(page.locator('.helm-map')).toBeVisible()
  await expect(page.locator('.offline-cover')).toHaveCount(0)
  await expect(page.locator('[data-action-key="mode-selector"]')).toContainText('手动控制')
  await expect(page.getByText('IP 地址', { exact: true })).toHaveCount(0)
  await expect(page.getByText('控制手柄', { exact: true })).toHaveCount(0)
})

test('bluetooth scan results include device type and model', async ({ page }) => {
  await signIn(page, '13800002861', '123456')
  await page.goto('/#/pages/device/add?step=2&method=bluetooth')
  const firstResult = page.locator('.scan-results .list-row').first()
  await expect(firstResult).toBeVisible()
  await expect(firstResult.getByText(/设备类型：.+ · DL-3500/)).toBeVisible()
  await expect(firstResult.getByText(/SN DL\d+ · -\d+ dBm/)).toBeVisible()
})

test('dealer project form resolves a partial serial and submits a backend region review', async ({ page }) => {
  test.setTimeout(90_000)
  await signIn(page, '13800000028', '123456')
  await page.goto('/#/pages/manage/form?entity=projects&step=device')
  await page.locator('.serial-methods').getByText('手工输入', { exact: true }).click()
  const inputs = page.locator('input')
  const serialInput = inputs.nth(0)
  await serialInput.fill('0606')
  await page.getByText('校验', { exact: true }).click()
  await expect(serialInput).toHaveValue('BT600020240606')
  await expect(page.getByText('电池组', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('BT-6000', { exact: true }).first()).toBeVisible()
  const registeredRegion = page.locator('.field').filter({ hasText: '设备登记销售地区' })
  await expect(registeredRegion).toContainText('福建省厦门市')
  await expect(registeredRegion).toContainText('系统核验')
  await expect(page.getByText('待分配仓库', { exact: true })).toHaveCount(0)
  await page.locator('.field').filter({ hasText: '杆长 *' }).locator('.inline-mode').click()
  await page.locator('.field').filter({ hasText: '杆长 *' }).locator('input').fill('2.8m')
  await page.getByText('下一步：客户信息', { exact: true }).click()
  await page.waitForURL(/entity=projects&step=customer/)
  await expect(page.getByText('2/2', { exact: true })).toBeVisible()
  await expect(page.getByText('船东姓名 *', { exact: true })).toBeVisible()
  const customerInputs = page.locator('input')
  await customerInputs.nth(0).fill('流程测试船')
  await customerInputs.nth(1).fill('跨区流程船东')
  await page.locator('.field').filter({ hasText: '安装地区（省/市）' }).locator('.field-control').click()
  await page.getByText('广东省汕头市', { exact: true }).last().click()
  await customerInputs.nth(2).fill('13812345678')
  await expect(page.getByText('需要后台审核', { exact: true })).toBeVisible()
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByText('照片 0 张', { exact: true }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({ name: 'installation-site.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('installation-evidence') })
  await expect(page.getByText('照片 1 张', { exact: true })).toBeVisible()
  await page.getByText('提交跨区安装审核', { exact: true }).click()
  await page.waitForURL(/entity=projects&id=.*&mode=detail/)
  await expect(page.getByText('等待后台跨区安装审核', { exact: true })).toBeVisible()
  const projectId = new URL(page.url()).hash.match(/[?&]id=([^&]+)/)?.[1] || ''
  expect(projectId).not.toBe('')
  expect(await page.evaluate(({ serial, id }) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const project = db.projects?.find((item: { id: string }) => item.id === id)
    const approval = db.platformApprovals?.find((item: { entity: string; entityId: string }) => item.entity === 'installationTransfer' && item.entityId === id)
    return {
      projectStatus: project?.status,
      deviceProjectId: db.devices?.find((item: { serialNumber: string }) => item.serialNumber === serial)?.projectId || '',
      attachmentCount: project?.attachmentIds?.length || 0,
      approvalStatus: approval?.status,
      approvalSource: approval?.source,
    }
  }, { serial: 'BT600020240606', id: projectId })).toEqual({ projectStatus: 'pendingApproval', deviceProjectId: '', attachmentCount: 1, approvalStatus: 'pending', approvalSource: 'integration' })
  await expect(page.getByText('后台通过演示', { exact: true })).toHaveCount(0)
  await expect(page.getByText('审核通过', { exact: true })).toHaveCount(0)
})

test('cross-region activation reports the exception and keeps dealer contact details', async ({ page }) => {
  await signIn(page, '13800002861', '123456')
  await page.goto('/#/pages/device/add?step=4&serial=DL350020260888')
  await expect(page.getByText('暂时无法激活', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('设备销售地区', { exact: true })).toHaveCount(0)
  await expect(page.getByText('当前使用地区', { exact: true })).toHaveCount(0)
  await expect(page.getByText('厦门海创一级经销商', { exact: true })).toBeVisible()
  await expect(page.getByText(/13800000028/)).toBeVisible()
  await expect(page.locator('.modal-actions .primary')).toContainText('上报异常')
  await page.locator('.modal-actions .primary').click()
  await expect(page.getByText('激活申请已上报', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('待平台核验', { exact: true })).toBeVisible()
  await expect(page.locator('.modal-actions .primary')).toContainText('联系代理商')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.platformApprovals?.some((item: { entity: string; serialNumber: string; targetRegion: string; status: string }) => item.entity === 'deviceActivation' && item.serialNumber === 'DL350020260888' && item.targetRegion === '福建省厦门市' && item.status === 'pending')
  })).toBe(true)
})
