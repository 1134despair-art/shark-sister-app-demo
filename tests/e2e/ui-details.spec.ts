import { expect, test } from '@playwright/test'

async function openCase(page: import('@playwright/test').Page, id: string) {
  await page.goto(`/#/pages/design-case/index?id=${id}&parity=0`)
  await page.waitForTimeout(700)
}

test('dealer data statistics shows annual sales, service, and combined trend', async ({ page }, testInfo) => {
  await openCase(page, 'B12')

  await expect(page.locator('.analytics-page .report-range-tabs')).toHaveCount(0)
  await expect(page.getByText('年度销售', { exact: true })).toBeVisible()
  await expect(page.getByText('年度售后', { exact: true })).toBeVisible()
  await expect(page.locator('.analytics-stats > uni-view')).toHaveCount(4)
  await expect(page.locator('.line-chart')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('B12-service-analytics-year.png') })
})

test('purchase checkout shows the parent order and completes payment to shipment', async ({ page }, testInfo) => {
  await openCase(page, 'B17')
  await expect(page.locator('.mock-qr')).toBeVisible()
  await expect(page.getByText('扫码支付', { exact: true })).toBeVisible()
  await expect(page.getByText('订单编号', { exact: true })).toBeVisible()
  await expect(page.getByText('微信支付')).toHaveCount(0)
  await expect(page.getByText('支付宝')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('B17-scan-payment.png') })
  const chooserPromise = page.waitForEvent('filechooser')
  await page.locator('[data-action-key="payment-proof-upload"]').click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'payment-proof.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') })
  await expect(page.getByText('更换付款凭证', { exact: true })).toBeVisible()
  await page.getByText('提交付款凭证', { exact: true }).click()
  await expect(page.locator('.modal-title')).toHaveText('提交付款凭证')
  await page.locator('.modal-actions .primary').click()
  await expect(page.locator('.modal-title')).toHaveText('凭证已提交')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.payments?.find((item: { id: string }) => item.id === 'pay-01')?.status
  })).toBe('verifying')
  await page.locator('.modal-actions .primary').click()
  await page.locator('.payment-card').filter({ hasText: '待财务核实' }).first().click()
  await page.getByText('查看核实进度', { exact: true }).click()
  await page.locator('[data-action-key="demo-finance-review"]').click()
  await expect(page.locator('.modal-title')).toHaveText('订单已付清')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.payments?.find((item: { id: string }) => item.id === 'pay-01')?.status
  })).toBe('verified')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.shipments?.some((item: { orderNo: string; status: string }) => item.orderNo === 'PO202608100028' && item.status === 'shipping')
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('B17-payment-confirmed.png') })
})

test('save-current-location design persists an offline waypoint locally', async ({ page }) => {
  await openCase(page, 'M03')
  const waypointName = `东侧钓点-${Date.now()}`
  await page.locator('.waypoint-location-form input').fill(waypointName)
  await page.getByText('保存到本机', { exact: true }).click()
  await expect.poll(() => page.evaluate((name) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.waypoints?.some((item: { name: string; source: string; storageTarget: string; syncStatus: string }) => item.name === name && item.source === 'local' && item.storageTarget === 'local' && item.syncStatus === 'synced')
  }, waypointName)).toBe(true)
})

test('firmware update dialog matches the design action and opens the OTA workflow', async ({ page }) => {
  await openCase(page, 'X06')
  await expect(page.getByText('发现新固件 V2.4.1', { exact: true })).toBeVisible()
  await expect(page.getByText(/当前版本 V2\.3\.8/)).toBeVisible()
  await page.getByText('立即更新', { exact: true }).click()
  await expect(page).toHaveURL(/process\/index\?scenario=ota&stage=0/)
  await expect(page.getByText('固件升级', { exact: true })).toBeVisible()
})

test('service form select fields open the in-app option sheet and persist a choice', async ({ page }, testInfo) => {
  await openCase(page, 'S03')

  const selects = page.locator('.select-control')
  await expect(selects).toHaveCount(2)
  await selects.nth(1).click()
  await expect(page.locator('.select-sheet')).toBeVisible()
  await expect(page.locator('.select-option')).toHaveCount(5)
  await page.screenshot({ path: testInfo.outputPath('S03-select-open.png') })
  await page.locator('.select-option').last().click()
  await expect(page.locator('.select-sheet')).toBeHidden()
  await expect(selects.nth(1).locator('.support-design-value')).toHaveText('其他')
})

test('OTA runs as an explicit on-device demo workflow', async ({ page }, testInfo) => {
  await openCase(page, 'M09')
  await expect(page.getByText(/当前升级流程会更新固件版本、升级任务和操作记录/)).toBeVisible()
  await expect(page.locator('.connection-rail')).toBeVisible()
  await page.getByText('立即更新', { exact: true }).click()
  await expect(page.getByText('下载固件', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('M09-ota-local-demo.png') })
})

test('OTA can be deferred and refuses a disconnected device without creating a job', async ({ page }) => {
  await openCase(page, 'M09')
  await page.getByText('稍后提醒', { exact: true }).click()
  await expect(page).toHaveURL(/device\/detail/)
  await page.locator('[data-action-key="connection"]').click()
  await page.getByText('断开', { exact: true }).click()
  await page.getByText('连接', { exact: true }).click()
  await expect(page.getByText('固件更新提醒', { exact: true })).toBeVisible()
  await page.getByText('稍后', { exact: true }).click()

  await page.goto('/#/pages/process/index?scenario=ota&deviceId=dev-02')
  await expect(page.getByText('蓝牙未连接', { exact: true })).toBeVisible()
  await page.getByText('立即更新', { exact: true }).click()
  await expect(page.getByText('版本检查', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.firmwareJobs?.length || 0
  })).toBe(0)
})

test('device list keeps one add entry and the requested two-item user navigation', async ({ page }, testInfo) => {
  await openCase(page, 'D01')

  await expect(page.locator('.tabbar .tab-item')).toHaveCount(2)
  await expect(page.locator('.fab-icon')).toHaveCount(0)
  await expect(page.getByLabel('添加设备')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('D01-single-add-entry.png') })
})

test('device more menu exposes requirement-backed actions and routes correctly', async ({ page }, testInfo) => {
  await openCase(page, 'D05')

  await expect(page.locator('.app-title')).toHaveText('顶流机-01')
  await expect(page.locator('[data-action-key="connection"]')).toHaveCount(1)
  await expect(page.locator('[data-action-key="service-top"]')).toHaveCount(0)
  await expect(page.locator('[data-controller-state="connected"]')).toBeVisible()
  await expect(page.locator('[data-controller-state="connected"]')).toContainText('遥控器')
  await expect(page.locator('[data-controller-state="connected"]')).toContainText('76%')
  await page.locator('[data-action-key="connection"]').click()
  await expect(page.locator('[data-connection-item="controller"]')).toContainText('已连接 · 电量 76%')
  await page.locator('[data-action-key="close-panel"]').click()
  const moreButton = page.locator('.app-action.right')
  await expect(moreButton).toBeEnabled()
  await moreButton.click()
  await expect(page.locator('.action-sheet')).toBeVisible()
  await expect(page.locator('[data-action-key="info"]')).toBeVisible()
  await expect(page.locator('[data-action-key="settings"]')).toHaveCount(0)
  await expect(page.locator('[data-action-key="service"]')).toBeVisible()
  await expect(page.locator('[data-action-key="waypoints"]')).toBeVisible()
  await expect(page.locator('[data-action-key="repair"]')).toHaveCount(0)
  await expect(page.locator('[data-action-key="unbind"]')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('D05-more-actions.png') })

  await page.locator('[data-action-key="unbind"]').click()
  await expect(page.locator('.modal-title')).toHaveText('解绑二手机设备')
  await expect(page.getByText('设备销售地区', { exact: true })).toBeVisible()
  await expect(page.getByText('当前使用区域', { exact: true })).toBeVisible()
  await expect(page.getByText(/重新激活时将提示联系所属代理商处理/)).toBeVisible()
  await page.locator('.modal-actions .btn').first().click()

  await moreButton.click()

  await page.locator('.sheet-cancel').click()
  await moreButton.click()
  await page.locator('[data-action-key="service"]').click()
  await expect(page.locator('[data-action-key="repair"]')).toBeVisible()
  await expect(page.locator('[data-action-key="complaint"]')).toBeVisible()
  await expect(page.locator('[data-action-key="history"]')).toBeVisible()
  await page.locator('[data-action-key="repair"]').click()
  await expect(page).toHaveURL(/manage\/form\?entity=tickets&category=repair&deviceId=dev-01/)
  const fixedDevice = page.locator('[data-fixed-repair-device]')
  await expect(fixedDevice).toBeVisible()
  await expect(fixedDevice).toContainText('顶流机-01')
  await expect(fixedDevice).toContainText('DL-3000 · DL300020240101')
  await expect(page.getByText('服务类型', { exact: true })).toHaveCount(0)
  await expect(page.getByText('报修设备 *', { exact: true })).toHaveCount(0)
  await expect(page.locator('.select-control')).toHaveCount(1)
})

test('device waypoint marker asks for a name and persists the displayed coordinates', async ({ page }, testInfo) => {
  await openCase(page, 'D05')
  const name = `东侧作业点-${Date.now()}`
  const before = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const device = db.devices?.find((item: { id: string }) => item.id === 'dev-01')
    return { count: db.waypoints?.length || 0, lat: device?.location?.lat, lng: device?.location?.lng }
  })

  await page.locator('[data-action-key="waypoint-mark"]').click()
  await expect(page.locator('.modal-title')).toHaveText('命名航点')
  await expect(page.getByText('当前坐标', { exact: true })).toBeVisible()
  await page.locator('.waypoint-name-form input').fill(name)
  await page.screenshot({ path: testInfo.outputPath('D05-waypoint-name-dialog.png') })
  await page.locator('.modal-actions .primary').click()

  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.waypoints?.length || 0
  })).toBe(before.count + 1)
  const saved = await page.evaluate((waypointName) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.waypoints?.find((item: { name: string }) => item.name === waypointName)
  }, name)
  expect(saved).toMatchObject({ name, nameEn: name, deviceId: 'dev-01', lat: before.lat, lng: before.lng })
})

test('a selected chart point can be saved and navigated as one waypoint', async ({ page }) => {
  await openCase(page, 'D05')
  const name = `海图选点-${Date.now()}`
  await page.locator('.chart-viewport').click({ position: { x: 230, y: 210 } })
  await expect(page.locator('.chart-point-preview')).toContainText('保存为航点')
  await page.locator('.chart-point-preview').click()
  await expect(page.locator('.modal-title')).toHaveText('命名航点')
  await page.locator('.waypoint-name-form input').fill(name)
  await page.locator('.modal-actions .primary').click()

  await page.locator('[data-action-key="waypoint-list"]').click()
  const row = page.locator('.panel-list-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  await row.locator('.waypoint-navigate').click()
  await expect(page.locator('.modal-title')).toHaveText('前往航点')
  await page.locator('.modal-actions .primary').click()
  await expect(page.locator('.playback-console')).toContainText(name)
  await expect.poll(() => page.evaluate((waypointName) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const waypoint = db.waypoints?.find((item: { name: string }) => item.name === waypointName)
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.controlState?.targetWaypointId === waypoint?.id
  }, name)).toBe(true)
  await page.locator('.playback-actions .danger').click()
  await expect(page.locator('.playback-console')).toHaveCount(0)
})

test('repair from device details submits against the fixed current device', async ({ page }) => {
  await openCase(page, 'D05')
  await page.locator('.app-action.right').click()
  await page.locator('[data-action-key="service"]').click()
  await page.locator('[data-action-key="repair"]').click()
  const marker = `设备固定报修-${Date.now()}`
  await page.locator('.select-control').click()
  await page.locator('.select-option').first().click()
  await page.locator('.form-card textarea').fill(marker)
  await page.getByText('提交报修', { exact: true }).click()
  await expect(page).toHaveURL(/manage\/list\?entity=tickets&state=success&id=/)
  await expect.poll(() => page.evaluate((description) => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.tickets?.find((item: { description: string }) => item.description === description)
  }, marker)).toMatchObject({ category: 'repair', deviceId: 'dev-01' })
})

test('top-flow working parameters use actions, numbers, choices, and safety switches', async ({ page }) => {
  await openCase(page, 'D05')
  const openSettings = async () => {
    await page.locator('[data-action-key="working-parameters"]').click()
    await expect(page.getByText('设备工作参数', { exact: true })).toBeVisible()
  }
  const edit = async (name: string) => page.locator('.settings-menu-row').filter({ hasText: name }).click()

  await openSettings()
  const settingsPanel = page.locator('.detail-panel')
  await expect(page.locator('.settings-menu-row')).toHaveCount(6)
  await expect(settingsPanel.getByText('船艏向参考角', { exact: true })).toBeVisible()
  await expect(settingsPanel.getByText('走锚报警距离', { exact: true })).toBeVisible()
  await expect(settingsPanel.getByText('联机角色', { exact: true })).toBeVisible()
  await expect(settingsPanel.getByText('磁力计校准', { exact: true })).toBeVisible()
  await expect(settingsPanel.getByText('定点蠕动距离', { exact: true })).toBeVisible()
  await edit('走锚报警距离')
  await page.locator('.number-field input').fill('33')
  await page.locator('[data-action-key="close-panel"]').click()

  await openSettings()
  await edit('走锚报警距离')
  await expect(page.locator('.number-field input')).toHaveValue('10')
  await page.locator('.setting-back').click()
  await edit('船艏向参考角')
  await page.getByText('设置参考角', { exact: true }).click()
  await expect(page.locator('.modal-title')).toHaveText('设置船艏向参考')
  await page.locator('.modal-actions .btn').first().click()
  await page.locator('.setting-back').click()
  await edit('安全保护')
  const limitBypass = page.locator('[data-setting-key="limitSwitchBypassEnabled"]')
  await limitBypass.click()
  await expect(page.locator('.modal-title')).toHaveText('开启限位开关屏蔽')
  await page.locator('.modal-actions .btn').first().click()
  await expect(limitBypass).toHaveAttribute('aria-checked', 'false')
  await limitBypass.click()
  await page.getByText('确认修改', { exact: true }).click()
  await expect(limitBypass).toHaveAttribute('aria-checked', 'true')
  await page.locator('.setting-actions').getByText('保存', { exact: true }).click()

  await openSettings()
  await edit('联机角色')
  await page.getByText('主机', { exact: true }).click()
  await page.locator('.setting-actions').getByText('保存', { exact: true }).click()
  await openSettings()
  await edit('定点蠕动距离')
  await page.getByText('15m', { exact: true }).click()
  await page.locator('.setting-actions').getByText('保存', { exact: true }).click()
  await expect(page.locator('.detail-panel')).toHaveCount(0)

  await page.reload()
  await expect(page.locator('.app-title')).toHaveText('顶流机-01')
  await openSettings()
  await edit('安全保护')
  await expect(page.locator('[data-setting-key="limitSwitchBypassEnabled"]')).toHaveAttribute('aria-checked', 'true')
  await page.locator('.setting-back').click()
  await edit('联机角色')
  await expect(settingsPanel.locator('.segment-control uni-button').filter({ hasText: /^主机$/ })).toHaveClass(/active/)
  await page.locator('.setting-back').click()
  await edit('定点蠕动距离')
  await expect(settingsPanel.locator('.distance-options uni-button').filter({ hasText: /^15m$/ })).toHaveClass(/active/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.settings?.linkedRole
  })).toBe('primary')
})

test('waypoint management persists the account cloud-sync preference', async ({ page }) => {
  await openCase(page, 'D05')
  await page.locator('.app-action.right').click()
  await page.locator('[data-action-key="waypoints"]').click()
  const syncSetting = page.locator('.waypoint-sync-setting')
  await expect(syncSetting).toHaveAttribute('aria-checked', 'false')
  await syncSetting.click()
  await expect(syncSetting).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.settings?.waypointStorage
  })).toBe('cloud')
})

test('top-flow gear controls use the 0-10 range and persist device commands', async ({ page }) => {
  await openCase(page, 'D05')
  const gearValue = page.locator('[data-metric-key="gear"] strong')
  await expect(page.locator('.remote-pad')).toHaveCount(0)
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '手动控制' }).click()
  await expect(page.locator('.manual-control-panel')).toBeVisible()
  const gearUp = page.locator('.north-button')
  const gearDown = page.locator('.south-button')
  await expect(gearValue).toHaveText(/^0\s*档$/)
  await gearUp.click()
  await expect(gearValue).toHaveText(/^1\s*档$/)
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    const device = db.devices?.find((item: { id: string }) => item.id === 'dev-01')
    return { power: device?.controlState?.power, running: device?.controlState?.propellerOn, command: db.deviceCommands?.[0]?.command }
  })).toEqual({ power: 10, running: true, command: 'helm-gear-up' })
  await gearDown.click()
  await expect(gearValue).toHaveText(/^0\s*档$/)
})

test('track settings starts navigation from a selected route and side-thrust exposes remote controls', async ({ page }) => {
  await openCase(page, 'D05')
  await page.locator('[data-action-key="chart-tools"]').click()
  await page.locator('[data-action-key="track-settings"]').click()
  await expect(page.locator('.detail-panel')).toContainText('航迹设置')
  await page.locator('.panel-list-row uni-button').filter({ hasText: '开始导航' }).first().click()
  await expect(page.locator('.playback-console')).toBeVisible()
  await expect(page.locator('.compass')).toHaveCount(0)
  await page.locator('.playback-actions .primary').click()
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.controlState?.controlPaused
  })).toBe(true)
  await expect(page.locator('[data-playback-status]')).toContainText('已暂停')

  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '侧推模式' }).click()
  await expect(page.locator('.side-thrust-console')).toBeVisible()
  await expect(page.locator('.north-button')).toHaveCount(0)
  const leftThrust = page.locator('.side-thrust-console .side-direction').first()
  await leftThrust.dispatchEvent('mousedown')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.controlState?.direction
  })).toBe('left')
  await leftThrust.dispatchEvent('mouseup')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.devices?.find((item: { id: string }) => item.id === 'dev-01')?.controlState?.direction
  })).toBe('stop')
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '手动控制' }).click()
  await expect(page.locator('.manual-control-panel')).toBeVisible()
  await expect(page.locator('.manual-control-pad')).toBeVisible()
})

test('chart display settings, zoom, fullscreen, and demo tools are interactive', async ({ page }) => {
  await openCase(page, 'D05')
  await page.locator('[data-action-key="chart-tools"]').click()
  await page.locator('[data-action-key="chart-settings"]').click()
  await page.getByText('黑夜', { exact: true }).click()
  await page.getByText('4 色', { exact: true }).click()
  await expect(page.locator('.helm-map')).toHaveClass(/theme-night/)
  await expect(page.locator('.helm-map')).toHaveClass(/depth-4/)
  await page.locator('[data-action-key="close-panel"]').click()
  await page.locator('[data-action-key="chart-zoom-in"]').click()
  await expect(page.locator('.zoom-control > uni-text')).toHaveText('3')
  await page.locator('[data-action-key="chart-tools"]').click()
  await page.locator('[data-action-key="chart-fullscreen"]').click()
  await expect(page.locator('.helm-map')).toHaveClass(/fullscreen/)
  await page.locator('[data-action-key="chart-fullscreen"]').click()

  await page.locator('[data-action-key="chart-tools"]').click()
  await page.locator('[data-action-key="chart-import"]').click()
  await expect(page.locator('.demo-chart-badge')).toContainText('海图预览')
  await expect(page.locator('[data-action-key="chart-import"]')).toContainText('海图已载入')
  await page.locator('[data-action-key="chart-measurement"]').click()
  await expect(page.locator('.demo-measurement')).toContainText('1.28 km')
  await expect.poll(() => page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('shark-sister-db-v1') || '{}')
    const db = raw?.type === 'object' && raw?.data ? raw.data : raw
    return db.auditEvents?.filter((item: { action: string }) => item.action.includes('demo-preview')).map((item: { action: string }) => item.action)
  })).toEqual(expect.arrayContaining(['chart-chartImport-demo-preview', 'chart-measurement-demo-preview']))
  await page.locator('[data-action-key="chart-measurement"]').click()
  await expect(page.locator('.demo-measurement')).toHaveCount(0)
})

test('remote settings are hidden for devices without top-flow capability', async ({ page }) => {
  await openCase(page, 'D05')
  await page.goto('/#/pages/device/detail?id=dev-02')
  await expect(page.locator('.app-title')).toHaveText('海水淡化器-02')
  await page.locator('.app-action.right').click()
  await expect(page.locator('[data-action-key="settings"]')).toHaveCount(0)
})

test('remote settings panel stays usable at supported mobile widths', async ({ page }) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await openCase(page, 'D05')
    await page.locator('[data-action-key="working-parameters"]').click()

    const panel = page.locator('.detail-panel')
    const close = page.locator('[data-action-key="close-panel"]')
    await expect(panel).toBeVisible()
    await expect(page.locator('.settings-menu-row')).toHaveCount(6)
    await page.locator('.settings-menu-row').filter({ hasText: '安全保护' }).click()
    await expect(page.locator('[data-setting-key]')).toHaveCount(2)
    const panelBox = await panel.boundingBox()
    const closeBox = await close.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(closeBox).not.toBeNull()
    expect(panelBox!.x).toBeGreaterThanOrEqual(0)
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width + 1)
    expect(closeBox!.x).toBeGreaterThan(width / 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await close.click()
  }
})

test('device summary and chart tools stay clear of bottom controls at supported widths', async ({ page }, testInfo) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await openCase(page, 'D05')

    const summary = page.locator('.helm-summary')
    const connection = page.locator('[data-action-key="connection"]')
    const tools = page.locator('.chart-interactions')
    const modeActions = page.locator('.helm-dock .dock-steering-actions')
    const propeller = page.locator('.dock-propeller-button')
    const lift = page.locator('.lift-up')
    const dock = page.locator('.helm-dock')
    const summaryBox = await summary.boundingBox()
    const connectionBox = await connection.boundingBox()
    const toolsBox = await tools.boundingBox()
    const modeBox = await modeActions.boundingBox()
    const propellerBox = await propeller.boundingBox()
    const liftBox = await lift.boundingBox()
    const dockBox = await dock.boundingBox()

    expect(summaryBox).not.toBeNull()
    expect(connectionBox).not.toBeNull()
    expect(toolsBox).not.toBeNull()
    expect(modeBox).not.toBeNull()
    expect(propellerBox).not.toBeNull()
    expect(liftBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(toolsBox!.y)
    expect(toolsBox!.y + toolsBox!.height).toBeLessThanOrEqual(dockBox!.y + 1)
    expect(modeBox!.y).toBeGreaterThanOrEqual(dockBox!.y)
    expect(modeBox!.y + modeBox!.height).toBeLessThanOrEqual(dockBox!.y + dockBox!.height)
    expect(propellerBox!.x + propellerBox!.width).toBeLessThanOrEqual(modeBox!.x)
    expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(liftBox!.x)
    expect(connectionBox!.width).toBeGreaterThanOrEqual(44)
    expect(connectionBox!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    if (width === 390) {
      await page.screenshot({ path: testInfo.outputPath('D05-detail-chart-controls.png') })
    }
  }
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '定点锚定' }).click()
  await expect(page.getByText('主杆尚未到底')).toBeVisible()
  await page.getByText('下降并锚定').click()
  await expect(page.locator('[data-action-key="mode-selector"]')).toContainText('定点锚定')
  await page.locator('[data-action-key="mode-selector"]').click()
  await page.locator('.mode-list uni-button').filter({ hasText: '手动控制' }).click()
  await expect(page.locator('.manual-control-panel')).toBeVisible()
})

test('device more menu adapts to offline state and dealer permissions', async ({ page }) => {
  await openCase(page, 'D06')
  await page.locator('.app-action.right').click()
  await expect(page.locator('[data-action-key="reconnect"]')).toBeVisible()
  await page.locator('[data-action-key="reconnect"]').click()
  await expect(page.locator('.detail-panel')).toBeVisible()
  await expect(page.locator('.detail-panel').getByText('连接设备', { exact: true })).toBeVisible()
  await page.locator('.detail-panel .panel-list-row').first().locator('.compact-action').click()
  await expect(page.locator('.detail-panel .connection-overview strong')).toHaveText('已连接')
  await expect(page.locator('.detail-panel .panel-list-row').first().locator('.compact-action')).toHaveText('断开')

  await openCase(page, 'B22')
  await page.locator('.device-item').first().click()
  await expect(page).toHaveURL(/device\/detail/)
  await page.locator('.app-action.right').click()
  await expect(page.locator('[data-action-key="assignment"]')).toHaveCount(0)
  await expect(page.locator('[data-action-key="mainboard"]')).toBeVisible()
  await expect(page.locator('[data-action-key="unbind"]')).toHaveCount(0)

  await page.locator('[data-action-key="mainboard"]').click()
  await expect(page).toHaveURL(/process\/index\?scenario=mainboard/)
  await expect(page.getByText('确认登记主板更换', { exact: true })).toBeVisible()
})

test('route planner renders its map and waypoint controls', async ({ page }, testInfo) => {
  await openCase(page, 'M06')
  const map = page.locator('.route-design-map')
  await expect(map).toBeVisible()
  const box = await map.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThan(190)
  await expect(page.locator('.route-design-map > uni-image')).toBeVisible()
  await expect(page.locator('.route-design-marker')).toHaveCount(3)
  await expect(page.locator('.route-design-stages > uni-view')).toHaveCount(3)
  await expect(page.getByText('调整航点', { exact: true })).toBeVisible()
  await expect(page.getByText('保存并上传', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('M06-route-planner.png') })
})

test('support message can be transferred and remains visible after reload', async ({ page }, testInfo) => {
  await openCase(page, 'S09')
  await expect(page.getByText('咨询离线航点同步', { exact: true })).toBeVisible()
  await page.getByText('升级或转单', { exact: true }).click()
  await expect(page).toHaveURL(/state=transfer-selector/)
  await page.locator('.transfer-choices .list-row').first().click()
  await page.locator('textarea').fill('当前服务地点已变更，请由泉州网点继续处理。')
  await page.getByText('确认升级并转单', { exact: true }).click()
  await expect(page).toHaveURL(/state=message-progress/)
  await expect(page.getByText('泉州远航服务网点', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('当前服务地点已变更，请由泉州网点继续处理。', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('S11-message-transfer.png') })
})

test('app bar returns from a directly opened device detail to the shared home navigation', async ({ page }) => {
  await openCase(page, 'D05')
  await page.locator('.app-bar .app-action').first().click()

  await expect(page).toHaveURL(/pages\/shell\/index/)
  await expect(page.locator('.tab-item.active')).toContainText('设备')
})

test('app bar preserves the real previous page when detail was opened from a list', async ({ page }) => {
  await openCase(page, 'D01')
  await page.locator('.device-item').first().click()
  await expect(page).toHaveURL(/pages\/device\/detail/)

  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/shell\/index\?tab=device/)
  await expect(page.locator('.tab-item.active')).toContainText('设备')
})

test('back action steps out of nested settings before leaving settings', async ({ page }) => {
  await openCase(page, 'P06')
  await expect(page.locator('.app-title')).toContainText('通知设置')

  await page.locator('.app-bar .app-action').first().click()
  await expect(page.locator('.app-title')).toContainText('App 设置')
  await expect(page.locator('.settings-page')).toBeVisible()

  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/shell\/index\?tab=profile/)
  await expect(page.locator('.tab-item.active')).toContainText('我的')
})

test('directly opened business pages return to their semantic parent', async ({ page }) => {
  await openCase(page, 'D14')
  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/device\/detail\?id=dev-01/)

  await openCase(page, 'M02')
  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/device\/detail\?id=dev-01/)

  await openCase(page, 'S05')
  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/manage\/list\?entity=tickets$/)

  await openCase(page, 'B10')
  await page.locator('.app-bar .app-action').first().click()
  await expect(page).toHaveURL(/pages\/shell\/index\?tab=workbench/)
})

test('device add back action returns to the previous step before leaving the flow', async ({ page }) => {
  await openCase(page, 'D17')
  await expect(page.locator('.qr-design-scroll')).toBeVisible()

  await page.locator('.app-bar .app-action').first().click()
  await expect(page.locator('.method-list')).toBeVisible()
  await expect(page).toHaveURL(/pages\/device\/add/)
})

test('device add completes through the on-device Bluetooth workflow', async ({ page }, testInfo) => {
  await openCase(page, 'D15')
  await page.locator('.add-ready-primary').click()
  await expect(page.getByText(/发现 \d+ 台设备/)).toBeVisible()
  await page.locator('.fixed-cta uni-button').click()
  await expect(page.locator('.success-state > uni-text').first()).toHaveText('设备已激活')
  await expect(page.locator('.success-storage')).toContainText('同步服务器')
  await page.screenshot({ path: testInfo.outputPath('D21-device-bound.png') })
})
