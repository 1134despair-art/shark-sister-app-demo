import { beforeEach, describe, expect, it } from 'vitest'
import { authService, effectiveAccount } from '@/services/auth'
import { authorizationService } from '@/services/authorization'
import { chartService } from '@/services/chart'
import { databaseService, DB_KEY } from '@/services/database'
import { deviceBindingService, deviceService, generateDeviceSerial, isDeviceSerialLike } from '@/services/device'
import { dealerService } from '@/services/dealer'
import { firmwareService } from '@/services/firmware'
import { profileService } from '@/services/profile'
import { projectService } from '@/services/project'
import { routeService } from '@/services/routes'
import { storage } from '@/services/storage'
import { workflowService } from '@/services/workflow'
import { warrantyService } from '@/services/warranty'
import type { Project, Ticket, Waypoint } from '@/types/models'

const accountContext = (id: string, scope?: string[]) => {
  const account = databaseService.snapshot().accounts.find((item) => item.id === id)!
  return authorizationService.context(account, scope)
}

const createProjectEvidence = (ownerId: string) => {
  const id = `test-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const timestamp = new Date().toISOString()
  databaseService.transact((db) => {
    db.attachments.unshift({
      id, createdAt: timestamp, updatedAt: timestamp, ownerId, entity: 'projects',
      name: 'installation-site.jpg', kind: 'image', localPath: '/tmp/installation-site.jpg',
      size: 1024, mimeType: 'image/jpeg', persisted: false,
    })
    return id
  }, { action: 'test-evidence-create', entity: 'attachments', entityId: id, operator: ownerId })
  return id
}

describe('V3.2 local business services', () => {
  beforeEach(async () => { await databaseService.reset() })

  it('keeps seeded project serials aligned with their linked devices', () => {
    const snapshot = databaseService.snapshot()
    for (const project of snapshot.projects.filter((item) => snapshot.devices.some((device) => device.projectId === item.id))) {
      const linkedDevices = snapshot.devices.filter((device) => device.projectId === project.id)
      expect(linkedDevices.some((device) => device.serialNumber === project.serialNumber && device.model === project.deviceModel)).toBe(true)
      const firstActivation = linkedDevices.filter((device) => device.activatedAt).map((device) => String(device.activatedAt)).sort()[0]
      if (firstActivation) expect(project.createdAt <= firstActivation).toBe(true)
    }
  })

  it('persists a project and its registered device relation in one transaction', () => {
    const context = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const attachmentId = createProjectEvidence(context.accountId!)
    const created = projectService.save({ name: '测试船设备安装', nameEn: 'Test Vessel Installation', vessel: '测试船', serialNumber: 'IC150020240505', customer: '陈先生', ownerName: '陈先生', deviceType: '制冰机', deviceModel: 'IC-1500', deviceSpecification: '标准型', rodLength: '2.8m', region: '福建省厦门市', factoryRegion: '福建省厦门市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13812345678', email: 'chen@example.com', warrantyEnd: '2028-08-13', description: '船尾安装', dealerId: 'dealer-01', attachmentIds: [attachmentId], status: 'installing' }, undefined, context)
    const snapshot = databaseService.snapshot()
    expect(snapshot.projects.find((item) => item.id === created.id)?.serialNumber).toBe('IC150020240505')
    expect(snapshot.attachments.find((item) => item.id === attachmentId)).toMatchObject({ entityId: created.id, persisted: true })
    expect(snapshot.devices.find((item) => item.serialNumber === 'IC150020240505')?.projectId).toBe(created.id)
    expect(snapshot.auditEvents.some((item) => item.action === 'project-create' && item.entityId === 'IC150020240505')).toBe(true)
  })

  it('derives the warranty expiry from the dealer default when a project omits it', () => {
    const context = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const created = projectService.save({ name: '默认质保项目', nameEn: 'Default Warranty Project', vessel: '质保测试船', serialNumber: 'BT600020240606', customer: '陈先生', ownerName: '陈先生', deviceType: '电池组', deviceModel: 'BT-6000', deviceSpecification: '标准型', rodLength: '2.8m', region: '福建省厦门市', factoryRegion: '福建省厦门市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13812345678', dealerId: 'dealer-01', attachmentIds: [createProjectEvidence(context.accountId!)], status: 'installing' }, undefined, context)
    expect(created.warrantyEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(created.warrantyEnd!).getFullYear()).toBe(new Date().getFullYear() + 2)
  })

  it('only accepts an existing device owned by the current dealer for project installation', () => {
    const context = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    expect(() => projectService.validateDevice('DL-NOT-OWNED-001', 'DL-3000', undefined, context, '顶流机/制冰机')).toThrow('DEVICE_SERIAL_NOT_FOUND')
    const selected = projectService.validateDevice('BT600020240606', 'BT-6000', undefined, context, '电池组')
    expect(selected.device).toMatchObject({ dealerId: 'dealer-01', model: 'BT-6000', category: '电池组' })
    expect(() => projectService.validateDevice('BT600020240606', 'BT-6000', undefined, context, '海水淡化器')).toThrow('DEVICE_TYPE_MISMATCH')
  })

  it('submits a cross-region installation for review without linking the device', () => {
    const context = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const created = projectService.save({ name: '跨区安装项目', nameEn: 'Cross-region Installation', vessel: '远航号', serialNumber: 'BT600020240606', customer: '远航船东', ownerName: '远航船东', deviceType: '电池组', deviceModel: 'BT-6000', deviceSpecification: '标准型', rodLength: '2.8m', region: '广东省汕头市', factoryRegion: '福建省厦门市', crossRegionRequired: true, crossRegionStatus: 'pending', phone: '13812345678', dealerId: 'dealer-01', attachmentIds: [createProjectEvidence(context.accountId!)], status: 'pendingApproval' }, undefined, context)
    const snapshot = databaseService.snapshot()
    expect(created).toMatchObject({ status: 'pendingApproval', crossRegionRequired: true, crossRegionStatus: 'pending', factoryRegion: '福建省厦门市' })
    expect(snapshot.devices.find((item) => item.serialNumber === 'BT600020240606')?.projectId).toBeUndefined()
    expect(snapshot.platformApprovals.find((item) => item.entity === 'installationTransfer' && item.entityId === created.id)).toMatchObject({ status: 'pending', originRegion: '福建省厦门市', targetRegion: '广东省汕头市' })
  })

  it('links the device only after the backend installation review demo approves the project', async () => {
    const context = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const created = projectService.save({ name: '跨区审核闭环', nameEn: 'Cross-region approval flow', vessel: '蓝海号', serialNumber: 'BT600020240606', customer: '蓝海船东', ownerName: '蓝海船东', deviceType: '电池组', deviceModel: 'BT-6000', deviceSpecification: '标准型', rodLength: '2.8m', region: '广东省汕头市', factoryRegion: '福建省厦门市', crossRegionRequired: true, crossRegionStatus: 'pending', phone: '13812345678', dealerId: 'dealer-01', attachmentIds: [createProjectEvidence(context.accountId!)], status: 'pendingApproval' }, undefined, context)
    expect(databaseService.snapshot().devices.find((item) => item.serialNumber === created.serialNumber)?.projectId).toBeUndefined()

    await workflowService.reviewByDemoPlatform('installationTransfer', created.id, 'approved', 'region and ownership checked')
    const snapshot = databaseService.snapshot()
    expect(snapshot.projects.find((item) => item.id === created.id)).toMatchObject({ status: 'installing', crossRegionStatus: 'approved' })
    expect(snapshot.devices.find((item) => item.serialNumber === created.serialNumber)?.projectId).toBe(created.id)
    expect(snapshot.platformApprovals.find((item) => item.entity === 'installationTransfer' && item.entityId === created.id)).toMatchObject({ status: 'approved', source: 'demo-exception' })
    expect(snapshot.messages.some((item) => item.type === 'approval' && item.dealerId === 'dealer-01' && item.body.includes('蓝海号'))).toBe(true)
    expect(snapshot.auditEvents.some((item) => item.entityId === created.id && item.source === 'demo-exception')).toBe(true)
  })

  it('uses 123456 for every predefined login and migrates legacy default credentials', async () => {
    const predefined = databaseService.snapshot().accounts.filter((item) => ['acc-user', 'acc-global', 'acc-dealer', 'acc-staff', 'acc-first'].includes(item.id))
    expect(predefined).toHaveLength(5)
    expect(predefined.every((item) => item.password === '123456')).toBe(true)
    const seed = databaseService.snapshot()
    storage.set(DB_KEY, { ...seed, accounts: seed.accounts.map((item) => item.id === 'acc-user' ? { ...item, password: 'Shark2026' } : item) })
    const migrated = await databaseService.initialize()
    expect(migrated.accounts.find((item) => item.id === 'acc-user')?.password).toBe('123456')
  })

  it('keeps dealer mobile service and device-user capabilities while limiting staff administration', () => {
    const snapshot = databaseService.snapshot()
    const shared = ['device.bind', 'map.edit', 'support.create']
    for (const id of ['acc-dealer', 'acc-staff', 'acc-first']) {
      expect(snapshot.accounts.find((item) => item.id === id)?.capabilities).toEqual(expect.arrayContaining(shared))
      expect(snapshot.accounts.find((item) => item.id === id)?.capabilities).toContain('device.control')
    }
    expect(snapshot.accounts.find((item) => item.id === 'acc-dealer')?.capabilities).toContain('material.approve')
    expect(snapshot.accounts.find((item) => item.id === 'acc-staff')?.capabilities).not.toContain('material.approve')
    expect(snapshot.accounts.find((item) => item.id === 'acc-staff')?.capabilities).not.toContain('device.assign')
  })

  it('registers an account and persists a verified session', async () => {
    const session = await authService.startVerification('13900001234', 'register', { password: 'NewUser2026' })
    const result = await authService.verify(session.id, '826104')
    expect(result.account?.identifier).toBe('13900001234')
    expect(databaseService.snapshot().session.accountId).toBe(result.account?.id)
  })

  it('signs in an existing mobile account with a one-time verification code', async () => {
    const session = await authService.startVerification('13800000028', 'login')
    const account = await authService.loginWithCode(session.id, '826104')
    expect(account.role).toBe('dealerAdmin')
    expect(databaseService.snapshot().session.accountId).toBe('acc-dealer')
    expect(databaseService.snapshot().verificationSessions.find((item) => item.id === session.id)?.consumedAt).toBeTruthy()
    await expect(authService.loginWithCode(session.id, '826104')).rejects.toThrow('VERIFICATION_REQUIRED')
  })

  it('does not create an account when a login code is requested for an unknown mobile number', async () => {
    await expect(authService.startVerification('13999999999', 'login')).rejects.toThrow('ACCOUNT_NOT_FOUND')
    expect(databaseService.snapshot().accounts.some((item) => item.identifier === '13999999999')).toBe(false)
  })

  it('locks an account after five failures and password reset clears the lock', async () => {
    for (let index = 0; index < 4; index += 1) await expect(authService.login('13800002861', 'wrong')).rejects.toThrow('INVALID_CREDENTIALS')
    await expect(authService.login('13800002861', 'wrong')).rejects.toThrow('ACCOUNT_LOCKED')
    const verification = await authService.startVerification('13800002861', 'forgot')
    await authService.verify(verification.id, '826104')
    await authService.resetPassword(verification.id, 'Reset2026')
    expect((await authService.login('13800002861', 'Reset2026')).role).toBe('user')
  })

  it('migrates V1 records to schema V15 without discarding existing data', async () => {
    const seed = databaseService.snapshot()
    storage.set(DB_KEY, { ...seed, schemaVersion: 1, devices: seed.devices.map(({ settings: _settings, salesRegion: _salesRegion, activationStatus: _activationStatus, bluetoothConnected: _bluetooth, controllerConnected: _controller, ...item }) => item) })
    const migrated = await databaseService.initialize()
    expect(migrated.schemaVersion).toBe(15)
    expect(migrated.devices[0].settings.anchorDriftAlertDistanceMeters).toBe(10)
    expect(migrated.devices[0].settings.arrivalProtectionEnabled).toBe(true)
    expect(migrated.devices[0].identity?.communicationId).toBeTruthy()
    expect(migrated.devices[0].identity?.chipId).toBeTruthy()
    expect(migrated.devices[0].connectionState).toBeTruthy()
    expect(migrated.devices[0].controlState.activeMode).toBeTruthy()
    expect(migrated.devices[0].controlState.liftPosition).toBeTruthy()
    expect(migrated.orders.length).toBeGreaterThan(0)
    expect(migrated.deviceModels.length).toBeGreaterThan(0)
    expect(migrated.auditEvents.some((item) => item.action === 'migrate')).toBe(true)
  })

  it('migrates V4 settings, identities, project regions, warranty defaults and FAQ documents to schema V15 without overriding existing values', async () => {
    const seed = databaseService.snapshot()
    const legacyDevices = seed.devices.map((item) => ({ ...item, settings: { mode: 'manual', power: item.id === 'dev-01' ? 55 : item.settings.power, bowHeadingEnabled: true, anchorDriftDistanceEnabled: true, linkedModeEnabled: false, magnetometerCalibrationEnabled: false, anchorDistanceEnabled: true, limitSwitchBypassEnabled: false, arrivalProtectionEnabled: true } }))
    const legacyModels = seed.deviceModels.map(({ supportsHelmSettings: _supportsHelmSettings, ...item }) => item)
    storage.set(DB_KEY, { ...seed, schemaVersion: 4, devices: legacyDevices, deviceModels: legacyModels })
    const migrated = await databaseService.initialize()
    expect(migrated.schemaVersion).toBe(15)
    expect(migrated.devices.find((item) => item.id === 'dev-01')?.settings.power).toBe(55)
    expect(migrated.devices.find((item) => item.id === 'dev-01')?.settings.bowHeadingReferenceDeg).toBe(130)
    expect(migrated.devices.find((item) => item.id === 'dev-01')?.settings.linkedRole).toBe('standalone')
    expect(migrated.deviceModels.find((item) => item.model === 'DL-3000')?.supportsHelmSettings).toBe(true)
    expect(migrated.deviceModels.find((item) => item.model === 'SW-2000')?.supportsHelmSettings).toBe(false)
    expect(migrated.waypoints).toHaveLength(seed.waypoints.length)
    expect(migrated.faqDocuments.some((item) => item.status === 'published' && item.fileUrl.endsWith('.pdf'))).toBe(true)
    expect(migrated.faqDocuments.every((item) => Array.isArray(item.deviceCategories) && Array.isArray(item.deviceModels) && Boolean(item.revision))).toBe(true)
    expect(migrated.projects.every((item) => item.deviceType && item.deviceSpecification && item.factoryRegion && item.crossRegionStatus)).toBe(true)
    expect(migrated.dealers.every((item) => item.defaultWarrantyYears >= 1)).toBe(true)
    expect(migrated.auditEvents.some((item) => item.detail === 'schemaVersion:4->15')).toBe(true)
  })

  it('migrates V8 projects, tickets and purchases to V15 business-detail structures', async () => {
    const seed = databaseService.snapshot()
    const projects = seed.projects.map(({ installedMaterials: _installedMaterials, ...item }) => item)
    const tickets = seed.tickets.map(({ chargeLines: _chargeLines, ...item }) => item.id === 'ticket-01' ? { ...item, serviceCharge: 260 } : item)
    const purchases = seed.purchases.map(({ items: _items, ...item }) => item)
    storage.set(DB_KEY, { ...seed, schemaVersion: 8, projects, tickets, purchases })
    const migrated = await databaseService.initialize()
    expect(migrated.schemaVersion).toBe(15)
    expect(migrated.projects.every((item) => Array.isArray(item.installedMaterials))).toBe(true)
    expect(migrated.tickets.find((item) => item.id === 'ticket-01')?.chargeLines).toEqual([expect.objectContaining({ type: 'labor', amount: 260 })])
    expect(migrated.purchases[0].items).toHaveLength(1)
    expect(migrated.purchases[0].amount).toBe(1280)
    expect(migrated.routes.every((item) => item.syncStatus && typeof item.syncAttempts === 'number')).toBe(true)
    expect(migrated.auditEvents.some((item) => item.detail === 'schemaVersion:8->15')).toBe(true)
  })

  it('migrates V11 controller booleans and move-point mode to V15 semantics', async () => {
    const seed = databaseService.snapshot()
    const devices = seed.devices.map((item) => ({
      ...item,
      settings: { power: 50, bowHeadingEnabled: true, anchorDriftDistanceEnabled: true, linkedModeEnabled: item.id === 'dev-01', magnetometerCalibrationEnabled: false, anchorDistanceEnabled: true, limitSwitchBypassEnabled: false, arrivalProtectionEnabled: true },
      controlState: { ...item.controlState, activeMode: item.id === 'dev-01' ? 'move-point' : 'manual' },
    }))
    const { chartPreferences: _chartPreferences, ...legacySettings } = seed.settings
    storage.set(DB_KEY, { ...seed, schemaVersion: 11, settings: legacySettings, devices })
    const migrated = await databaseService.initialize()
    const topFlow = migrated.devices.find((item) => item.id === 'dev-01')!
    expect(migrated.schemaVersion).toBe(15)
    expect(topFlow.settings.linkedRole).toBe('primary')
    expect(topFlow.settings.bowHeadingReferenceDeg).toBe(topFlow.telemetry.heading)
    expect(topFlow.settings.anchorDriftAlertDistanceMeters).toBe(10)
    expect(topFlow.settings.crawlDistanceMeters).toBe(10)
    expect(topFlow.controlState.activeMode).toBe('anchor')
    expect(migrated.settings.chartPreferences.zoomLevel).toBe(2)
    expect(migrated.auditEvents.some((item) => item.detail === 'schemaVersion:11->15')).toBe(true)
  })

  it('migrates V12 installation evidence and single-part requests to V15 structures', async () => {
    const seed = databaseService.snapshot()
    const projects = seed.projects.map(({ attachmentIds: _attachmentIds, ...item }) => item)
    const materialCatalog = seed.materialCatalog.map(({ compatibleDeviceTypes: _types, compatibleDeviceModels: _models, ...item }) => item)
    const materials = seed.materials.map(({ items: _items, ...item }) => item)
    storage.set(DB_KEY, { ...seed, schemaVersion: 12, projects, materialCatalog, materials })
    const migrated = await databaseService.initialize()
    expect(migrated.schemaVersion).toBe(15)
    expect(migrated.projects.every((item) => Array.isArray(item.attachmentIds))).toBe(true)
    expect(migrated.materialCatalog.every((item) => Array.isArray(item.compatibleDeviceTypes) && Array.isArray(item.compatibleDeviceModels))).toBe(true)
    expect(migrated.materials.every((item) => Array.isArray(item.items) && item.items.length > 0)).toBe(true)
    expect(migrated.auditEvents.some((item) => item.detail === 'schemaVersion:12->15')).toBe(true)
  })

  it('migrates V13 steering and installation review timing to V15 without replacing existing state', async () => {
    const seed = databaseService.snapshot()
    const devices = seed.devices.map((item) => ({ ...item, controlState: { ...item.controlState, steeringAngleDeg: undefined, steeringLimit: undefined } }))
    const createdAt = '2026-09-01T08:00:00.000Z'
    storage.set(DB_KEY, {
      ...seed,
      schemaVersion: 13,
      devices,
      platformApprovals: [{ id: 'approval-v13', createdAt, updatedAt: createdAt, entity: 'installationTransfer', entityId: 'pro-01', requestedBy: 'acc-user', status: 'pending', source: 'integration' }],
    })
    const migrated = await databaseService.initialize()
    expect(migrated.schemaVersion).toBe(15)
    expect(migrated.devices.every((item) => item.controlState.steeringAngleDeg === 0 && item.controlState.steeringLimit === 'none')).toBe(true)
    expect(migrated.platformApprovals[0].reviewEtaAt).toBe('2026-09-03T08:00:00.000Z')
    expect(migrated.platformApprovals[0].temporaryOperationUntil).toBe('2026-09-03T08:00:00.000Z')
    expect(migrated.auditEvents.some((item) => item.detail === 'schemaVersion:13->15')).toBe(true)
  })

  it('adds required V3 complaint and message examples without replacing V2 records', async () => {
    const seed = databaseService.snapshot()
    const legacyTicket = { ...seed.tickets[0], title: 'Preserved V2 ticket' }
    storage.set(DB_KEY, { ...seed, schemaVersion: 2, tickets: [legacyTicket] })
    const migrated = await databaseService.initialize()
    expect(migrated.tickets.find((item) => item.id === legacyTicket.id)?.title).toBe('Preserved V2 ticket')
    expect(migrated.tickets.some((item) => item.id === 'ticket-03' && item.category === 'complaint')).toBe(true)
    expect(migrated.tickets.some((item) => item.id === 'ticket-04' && item.category === 'message')).toBe(true)
  })

  it('enforces user and dealer hierarchy data scopes at repository level', async () => {
    const user = accountContext('acc-user')
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const userDevices = await databaseService.repository('devices', user).list()
    expect(userDevices.items.every((item) => (item as { ownerId?: string }).ownerId === 'acc-user')).toBe(true)
    const dealerProjects = await databaseService.repository<Project>('projects', dealer).list()
    expect(dealerProjects.items.some((item) => item.dealerId === 'dealer-02')).toBe(true)
    await expect(databaseService.repository<Project>('projects', user).list()).rejects.toThrow('FORBIDDEN')
  })

  it('prevents dealer staff from reading unassigned records and price data', async () => {
    const account = databaseService.snapshot().accounts.find((item) => item.id === 'acc-staff')!
    const staff = authorizationService.context(account, ['dealer-01'], 'emp-01')
    const devices = await databaseService.repository('devices', staff).list()
    expect(devices.items.length).toBeGreaterThan(0)
    expect(devices.items.every((item) => (item as { assignedTo?: string }).assignedTo === 'emp-01')).toBe(true)
    await expect(databaseService.repository('employees', staff).list()).rejects.toThrow('FORBIDDEN')
    await expect(databaseService.repository('payments', staff).list()).rejects.toThrow('FORBIDDEN')
  })

  it('removes disabled staff business access while preserving personal login', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const employee = dealerService.saveEmployee({ name: '王帆', nameEn: 'Fan Wang', phone: '13800001987', roleName: '项目工程师', dealerId: 'dealer-01', status: 'enabled', capabilities: ['project.manage'], initialPassword: 'Staff1987' }, undefined, dealer)
    const account = databaseService.snapshot().accounts.find((item) => item.phone === employee.phone)
    expect(account?.role).toBe('dealerStaff')
    expect(account?.firstLogin).toBe(true)
    expect((await authService.login(employee.phone, 'Staff1987')).id).toBe(account?.id)
    dealerService.setEmployeeStatus(employee.id, 'disabled', dealer)
    const personal = await authService.login(employee.phone, 'Staff1987')
    expect(personal).toMatchObject({ id: account?.id, role: 'user', dealerId: undefined })
    expect(personal.capabilities).not.toContain('project.manage')
    expect(databaseService.snapshot().accounts.find((item) => item.id === account?.id)?.active).toBe(false)
    dealerService.setEmployeeStatus(employee.id, 'enabled', dealer)
    expect((await authService.login(employee.phone, 'Staff1987')).role).toBe('dealerStaff')
  })

  it('downgrades a disabled dealer session without deleting owned data', async () => {
    databaseService.transact((db) => {
      db.dealers.find((item) => item.id === 'dealer-01')!.status = 'disabled'
      db.accounts.find((item) => item.id === 'acc-dealer')!.active = false
      return true
    }, { action: 'test-dealer-disable', entity: 'dealers', entityId: 'dealer-01' })
    const snapshot = databaseService.snapshot()
    const personal = effectiveAccount(snapshot.accounts.find((item) => item.id === 'acc-dealer')!, snapshot)
    expect(personal.role).toBe('user')
    expect(personal.dealerId).toBeUndefined()
    expect(personal.capabilities).not.toContain('dealer.manage')
    expect(authorizationService.context(personal).dealerScopeIds).toEqual([])
    expect(snapshot.purchases.length).toBeGreaterThan(0)
  })

  it('keeps local waypoints on-device and only uploads server-targeted waypoints', async () => {
    const context = accountContext('acc-user')
    const repository = databaseService.repository<Waypoint>('waypoints', context)
    const created = await repository.create({ name: '测试航点', nameEn: 'Test waypoint', lat: 24.5, lng: 118.1, note: 'offline', source: 'local', syncStatus: 'pending', syncAttempts: 0, ownerId: 'ignored' })
    expect(created.ownerId).toBe('acc-user')
    expect((await repository.list({ search: '测试' })).items).toHaveLength(1)
    await repository.remove(created.id)
    expect((await repository.get('wp-03'))?.syncStatus).toBe('failed')
    await expect(routeService.syncWaypoint('wp-03', context)).rejects.toThrow('WAYPOINT_LOCAL_ONLY')
    await databaseService.updateSettings({ waypointStorage: 'cloud' })
    const serverWaypoint = await routeService.createWaypoint({ name: '服务器航点', nameEn: 'Server waypoint', lat: 24.51, lng: 118.11, note: '' }, context)
    expect(serverWaypoint.storageTarget).toBe('server')
    expect(serverWaypoint.syncStatus).toBe('pending')
    await expect(routeService.syncWaypoint(serverWaypoint.id, context)).rejects.toThrow('INTEGRATION_NOT_CONFIGURED:cloudSync')
    expect(databaseService.snapshot().waypoints.find((item) => item.id === serverWaypoint.id)?.syncStatus).toBe('pending')
  })

  it('creates and edits a route only from explicitly selected visible waypoints', async () => {
    const context = accountContext('acc-user')
    await expect(routeService.createRoute('无效航线', ['wp-01'], 'dev-01', context)).rejects.toThrow('ROUTE_REQUIRES_TWO_WAYPOINTS')
    const created = await routeService.createRoute('东侧巡航', ['wp-01', 'wp-02'], 'dev-01', context)
    expect(created.waypointIds).toEqual(['wp-01', 'wp-02'])
    expect(created.distanceKm).toBeGreaterThan(0)
    const updated = await routeService.updateRoute(created.id, '东侧巡航调整', ['wp-02', 'wp-03'], 'dev-01', context)
    expect(updated.name).toBe('东侧巡航调整')
    expect(updated.waypointIds).toEqual(['wp-02', 'wp-03'])
    expect(updated.syncStatus).toBe('pending')
    const uploaded = await routeService.uploadRoute(updated.id, context)
    expect(uploaded.syncStatus).toBe('synced')
    expect(uploaded.syncAttempts).toBe(1)
    await expect(routeService.deleteWaypoint('wp-02', context)).rejects.toThrow('WAYPOINT_IN_ROUTE')
    expect(databaseService.snapshot().auditEvents.some((item) => item.action === 'route-upload' && item.entityId === created.id)).toBe(true)
  })

  it('runs device connection, control, and firmware as persisted on-device demo workflows', async () => {
    const context = accountContext('acc-user')
    expect((await deviceBindingService.check('DL350020260811', '福建省厦门市')).status).toBe('bound')
    expect((await deviceBindingService.check('DL350020260888', '福建省厦门市')).status).toBe('regionMismatch')
    const device = await deviceBindingService.activate('DL350020260810', context)
    const snapshot = databaseService.snapshot()
    await deviceService.setConnection(device.id, 'bluetooth', true, context)
    const command = await deviceService.sendCommand(device.id, 'start', { powerOn: true, power: 66, mode: 'manual' }, context)
    const firmware = await firmwareService.start(device.id, context)
    await firmwareService.update(firmware.id, 'completed', 100, context)
    const after = databaseService.snapshot()
    expect(command.status).toBe('acknowledged')
    expect(after.deviceCommands).toHaveLength(snapshot.deviceCommands.length + 1)
    expect(after.firmwareJobs).toHaveLength(snapshot.firmwareJobs.length + 1)
    expect(after.devices.find((item) => item.id === device.id)?.controlState.power).toBe(66)
    expect(after.devices.find((item) => item.id === device.id)?.firmware).toBe('3.3.0')
    expect(after.auditEvents.some((item) => item.action === 'start' && item.source === 'local')).toBe(true)
  })

  it('keeps activation-region review separate from the installation project and checks the target region', async () => {
    const context = accountContext('acc-user')
    expect((await deviceBindingService.check('DL350020260888', '福建省厦门市')).status).toBe('regionMismatch')
    const approval = await deviceBindingService.requestRegionReview('DL350020260888', '福建省厦门市', context)
    let snapshot = databaseService.snapshot()
    expect(approval).toMatchObject({ entity: 'deviceActivation', entityId: 'DL350020260888', serialNumber: 'DL350020260888', originRegion: '广东省汕头市', targetRegion: '福建省厦门市', status: 'pending', source: 'integration' })
    expect(Date.parse(approval.reviewEtaAt || '') - Date.parse(approval.createdAt)).toBe(48 * 60 * 60 * 1000)
    expect(approval.temporaryOperationUntil).toBe(approval.reviewEtaAt)
    expect(snapshot.projects.find((item) => item.id === snapshot.deviceRegistrations.find((entry) => entry.serialNumber === approval.serialNumber)?.projectId)?.region).toBe('广东省汕头市')
    await expect(deviceBindingService.activate('DL350020260888', context, '福建省厦门市')).rejects.toThrow('REGION_REVIEW_REQUIRED')
    expect(snapshot.devices.some((item) => item.serialNumber === 'DL350020260888' && item.activationStatus === 'active')).toBe(false)
    expect(snapshot.messages.some((item) => item.accountId === context.accountId && item.title === '跨区激活已提交审核')).toBe(true)
    expect(snapshot.auditEvents.some((item) => item.action === 'device-activation-region-review-request' && item.source === 'integration')).toBe(true)

    await workflowService.reviewByDemoPlatform('deviceActivation', approval.entityId, 'approved', 'region verified in backend')
    expect((await deviceBindingService.check('DL350020260888', '福建省厦门市')).status).toBe('ready')
    expect((await deviceBindingService.check('DL350020260888', '福建省泉州市')).status).toBe('regionMismatch')
    const activated = await deviceBindingService.activate('DL350020260888', context, '福建省厦门市')
    snapshot = databaseService.snapshot()
    expect(activated.activationStatus).toBe('active')
    expect(snapshot.deviceRegistrations.find((item) => item.serialNumber === activated.serialNumber)?.boundOwnerId).toBe(context.accountId)
  })

  it('blocks firmware updates before persistence when connection or version checks fail', async () => {
    const context = accountContext('acc-user')
    const device = databaseService.snapshot().devices.find((item) => item.id === 'dev-01')!
    await deviceService.setConnection(device.id, 'bluetooth', false, context)
    const before = databaseService.snapshot().firmwareJobs.length
    await expect(firmwareService.start(device.id, context)).rejects.toThrow('FIRMWARE_PRECHECK_FAILED:DEVICE_NOT_CONNECTED')
    expect(databaseService.snapshot().firmwareJobs).toHaveLength(before)

    await deviceService.setConnection(device.id, 'bluetooth', true, context)
    await databaseService.transact((db) => {
      const target = db.devices.find((item) => item.id === device.id)!
      target.firmware = '3.3.0'
      return target
    })
    await expect(firmwareService.start(device.id, context)).rejects.toThrow('FIRMWARE_PRECHECK_FAILED:NO_FIRMWARE_UPDATE')
    expect(databaseService.snapshot().firmwareJobs).toHaveLength(before)
    await databaseService.transact((db) => {
      const target = db.devices.find((item) => item.id === device.id)!
      target.firmware = '3.4.0'
      return target
    })
    expect(firmwareService.latestVersion(device.id).available).toBe(false)
    await expect(firmwareService.start(device.id, context)).rejects.toThrow('FIRMWARE_PRECHECK_FAILED:NO_FIRMWARE_UPDATE')
  })

  it('persists top-flow parameters and contextual controller commands with authorization and audit evidence', async () => {
    const context = accountContext('acc-user')
    const guest = accountContext('acc-guest')
    const before = databaseService.snapshot()
    const topFlow = before.devices.find((item) => item.id === 'dev-01')!
    const desalinator = before.devices.find((item) => item.id === 'dev-02')!
    expect(deviceService.supportsHelmSettings(topFlow, before.deviceModels)).toBe(true)
    expect(deviceService.supportsHelmSettings(desalinator, before.deviceModels)).toBe(false)

    await deviceService.saveSettings(topFlow.id, { linkedRole: 'primary', anchorDriftAlertDistanceMeters: 18, crawlDistanceMeters: 15, limitSwitchBypassEnabled: true, arrivalProtectionEnabled: false }, context)
    await expect(deviceService.saveSettings(topFlow.id, { linkedRole: 'standalone' }, guest)).rejects.toThrow('FORBIDDEN')
    await deviceService.changeGear(topFlow.id, 1, context)
    await deviceService.changeGear(topFlow.id, -1, context)
    await deviceService.setWorkMode(topFlow.id, 'anchor', context)
    await deviceService.directionalControl(topFlow.id, 'up', context)

    const after = databaseService.snapshot()
    const updated = after.devices.find((item) => item.id === topFlow.id)!
    expect(updated.settings).toMatchObject({ linkedRole: 'primary', linkedRolePendingRestart: true, anchorDriftAlertDistanceMeters: 18, crawlDistanceMeters: 15, limitSwitchBypassEnabled: true, arrivalProtectionEnabled: false })
    expect(updated.controlState).toMatchObject({ powerOn: false, propellerOn: false, power: 0, direction: 'stop' })
    expect(updated.controlState.anchorOffsetForwardMeters).toBe(1)
    expect(after.deviceCommands.filter((item) => item.deviceId === topFlow.id && item.command.startsWith('helm-gear-'))).toHaveLength(2)
    expect(after.auditEvents.some((item) => item.action === 'settings-save' && item.entityId === topFlow.id)).toBe(true)
    expect(after.auditEvents.some((item) => item.action === 'helm-gear-up' && item.entityId === topFlow.id)).toBe(true)
  })

  it('persists steering angle and reports both rotation limits', async () => {
    const context = accountContext('acc-user')
    const deviceId = 'dev-01'
    await deviceService.setWorkMode(deviceId, 'manual', context)
    databaseService.transact((db) => { const target = db.devices.find((item) => item.id === deviceId)!; target.controlState.steeringAngleDeg = -120; return target })
    await deviceService.directionalControl(deviceId, 'left', context)
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState).toMatchObject({ steeringAngleDeg: -130, steeringLimit: 'left' })
    await deviceService.directionalControl(deviceId, 'right', context)
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState).toMatchObject({ steeringAngleDeg: -120, steeringLimit: 'none' })
    databaseService.transact((db) => { const target = db.devices.find((item) => item.id === deviceId)!; target.controlState.steeringAngleDeg = 120; return target })
    await deviceService.directionalControl(deviceId, 'right', context)
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState).toMatchObject({ steeringAngleDeg: 130, steeringLimit: 'right' })
  })

  it('enforces crawl preconditions, side-thrust stop, shaft transitions and chart capability boundaries', async () => {
    const context = accountContext('acc-user')
    const deviceId = 'dev-01'
    await expect(deviceService.setWorkMode(deviceId, 'crawl', context)).rejects.toThrow('ANCHOR_REQUIRED')
    await expect(deviceService.setWorkMode(deviceId, 'anchor', context)).rejects.toThrow('LIFT_NOT_AT_BOTTOM')
    await deviceService.moveLift(deviceId, 'down', context)
    await deviceService.setWorkMode(deviceId, 'anchor', context)
    await deviceService.setWorkMode(deviceId, 'crawl', context)
    await deviceService.setWorkMode(deviceId, 'side-thrust', context)
    await expect(deviceService.directionalControl(deviceId, 'up', context)).rejects.toThrow('CONTROL_UNAVAILABLE_IN_MODE')
    await deviceService.directionalControl(deviceId, 'left', context)
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState.direction).toBe('left')
    await deviceService.stopSideThrust(deviceId, context)
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState.direction).toBe('stop')

    const liftTask = deviceService.moveLift(deviceId, 'up', context)
    await new Promise((resolve) => setTimeout(resolve, 260))
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState.liftPosition).toBe('movingUp')
    await liftTask
    expect(databaseService.snapshot().devices.find((item) => item.id === deviceId)?.controlState.liftPosition).toBe('top')

    const before = databaseService.snapshot()
    chartService.savePreferences({ theme: 'night', depthColors: 4, zoomLevel: 5 }, context)
    expect(databaseService.snapshot().settings.chartPreferences).toMatchObject({ theme: 'night', depthColors: 4, zoomLevel: 5 })
    expect(() => chartService.requireCapability('chartImport')).toThrow('INTEGRATION_NOT_CONFIGURED:chartImport')
    expect(() => chartService.requireCapability('measurement')).toThrow('INTEGRATION_NOT_CONFIGURED:measurement')
    expect(chartService.previewCapability('chartImport', context)).toMatchObject({ demo: true, capability: 'chartImport' })
    expect(databaseService.snapshot().auditEvents.some((item) => item.action === 'chart-chartImport-demo-preview')).toBe(true)
    expect(databaseService.snapshot().exports).toHaveLength(before.exports.length)
  })

  it('keeps an available local demo registration after the previous device was activated', async () => {
    const context = accountContext('acc-user')
    const first = deviceBindingService.ensureLocalDemoRegistration('福建省厦门市', context)
    await deviceBindingService.activate(first.serialNumber, context)
    const replacement = deviceBindingService.ensureLocalDemoRegistration('福建省厦门市', context)
    expect(replacement.serialNumber).not.toBe(first.serialNumber)
    expect(replacement.status).toBe('available')
    expect(databaseService.snapshot().projects.some((item) => item.id === replacement.projectId && item.serialNumber === replacement.serialNumber)).toBe(true)
  })

  it('reuses an unbound physical device without physically deleting its service history', async () => {
    const context = accountContext('acc-user')
    const before = databaseService.snapshot()
    const device = before.devices.find((item) => item.id === 'dev-01')!
    const repairTemplate = before.tickets.find((item) => item.category === 'repair')!
    databaseService.transact((db) => {
      db.tickets.unshift({ ...repairTemplate, id: 'ticket-rebind-repair', deviceId: device.id, ownerId: 'acc-user', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      return db.tickets[0]
    })

    await deviceService.unbind(device.id, context)
    const rebound = await deviceBindingService.activate(device.serialNumber, context)
    const after = databaseService.snapshot()
    expect(rebound.id).toBe(device.id)
    expect(rebound.ownerId).toBe('acc-user')
    expect(rebound.bindingId).not.toBe(device.bindingId)
    expect(after.tickets.some((item) => item.id === 'ticket-rebind-repair' && item.ownerId === 'acc-user')).toBe(true)
    expect(after.tickets.find((item) => item.id === 'ticket-rebind-repair')?.customerVisible).toBe(false)
    expect((await databaseService.repository<Ticket>('tickets', context).list()).items.some((item) => item.id === 'ticket-rebind-repair')).toBe(false)
    expect(after.tickets.some((item) => item.id === 'ticket-03' && item.category === 'complaint')).toBe(true)
    expect(after.tickets.some((item) => item.id === 'ticket-04' && item.category === 'message')).toBe(true)
    expect(after.auditEvents.some((item) => item.action === 'activate' && item.entityId === device.serialNumber)).toBe(true)
  })

  it('records warranty changes and creates each due reminder only once', () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const before = databaseService.snapshot().projects.find((item) => item.id === 'pro-01')!
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, installedMaterials, warrantyHistory, ...projectInput } = before
    const updated = projectService.save({ ...projectInput, installedMaterials, warrantyHistory, warrantyEnd: '2026-08-25' }, before.id, dealer)
    expect(updated.warrantyHistory?.at(-1)).toMatchObject({ previousEnd: before.warrantyEnd, newEnd: '2026-08-25', operatorId: 'acc-dealer' })
    expect(warrantyService.ensureReminders(new Date('2026-08-24T09:00:00.000Z'))).toBe(1)
    expect(warrantyService.ensureReminders(new Date('2026-08-24T10:00:00.000Z'))).toBe(0)
    expect(databaseService.snapshot().messages.filter((item) => item.id === `warranty-${before.id}-2026-08-25`)).toHaveLength(1)
  })

  it('accepts a format-valid manual serial and completes registration and activation', async () => {
    const context = accountContext('acc-user')
    const serialNumber = 'DL3421312321312312'
    const registration = deviceBindingService.prepareRegistration(serialNumber.toLowerCase(), '福建省厦门市', context)
    expect(registration.serialNumber).toBe(serialNumber)
    expect(registration.projectId).toBeTruthy()
    expect((await deviceBindingService.check(serialNumber, '福建省厦门市')).status).toBe('ready')
    const device = await deviceBindingService.activate(serialNumber, context)
    const snapshot = databaseService.snapshot()
    expect(device.ownerId).toBe('acc-user')
    expect(device.firmware).toBe('3.2.1')
    expect(device.firmware).not.toBe('待获取')
    expect(device.connectionState).toBe('connected')
    expect(device.bluetoothConnected).toBe(true)
    expect(device.controllerConnected).toBe(true)
    expect(device.telemetry.gpsSignal).toBeGreaterThanOrEqual(82)
    expect(device.networkStatus).toBeUndefined()
    expect(device.ipAddress).toBeUndefined()
    expect(snapshot.devices.some((item) => item.serialNumber === serialNumber)).toBe(true)
    expect(snapshot.deviceRegistrations.find((item) => item.serialNumber === serialNumber)?.status).toBe('bound')
    expect(snapshot.projects.some((item) => item.serialNumber === serialNumber)).toBe(true)
    expect(snapshot.auditEvents.some((item) => item.entityId === serialNumber && item.action === 'activate')).toBe(true)
  })

  it('generates an editable format-valid serial for the manual binding flow', () => {
    const serialNumber = generateDeviceSerial()
    expect(serialNumber).toMatch(/^DL\d{14}$/)
    expect(isDeviceSerialLike(serialNumber)).toBe(true)
  })

  it('requires verified contact sessions and consumes them during a profile update', async () => {
    const context = accountContext('acc-user')
    const session = await authService.startVerification('13900004567', 'profile-phone')
    await authService.verify(session.id, '826104')
    await profileService.update({ displayName: '林海船长', phone: '13900004567', email: 'captain@seawind.com', phoneVerificationId: session.id }, context)
    const snapshot = databaseService.snapshot()
    expect(snapshot.accounts.find((item) => item.id === 'acc-user')?.phone).toBe('13900004567')
    expect(snapshot.verificationSessions.find((item) => item.id === session.id)?.consumedAt).toBeTruthy()
    expect(() => profileService.update({ displayName: '林海船长', phone: '13900009999', email: 'captain@seawind.com' }, context)).toThrow('VERIFICATION_REQUIRED')
  })

  it('commits idempotent operations once and rolls back failed transactions', () => {
    const before = databaseService.snapshot()
    databaseService.transactOnce('ticket-op-001', (db) => { db.messages[0].read = true; return db.messages[0] }, { action: 'message-read', entity: 'messages', entityId: before.messages[0].id })
    expect(() => databaseService.transactOnce('ticket-op-001', () => null, { action: 'duplicate', entity: 'messages', entityId: before.messages[0].id })).toThrow('DUPLICATE_OPERATION')
    const committed = databaseService.snapshot()
    expect(committed.operationKeys).toContain('ticket-op-001')
    expect(() => databaseService.transact((db) => { db.messages.splice(0, 1); throw new Error('TRANSACTION_FAILED') })).toThrow('TRANSACTION_FAILED')
    expect(databaseService.snapshot().messages).toEqual(committed.messages)
  })

  it('preserves lifetime runtime when a dealer registers a mainboard replacement', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const before = databaseService.snapshot().devices.find((item) => item.id === 'dev-01')!
    const runtime = before.telemetry.runtime
    const record = await deviceService.replaceMainboard('dev-01', 'PCB-DL3-NEW', '3.4.0', dealer, 'field replacement')
    const after = databaseService.snapshot().devices.find((item) => item.id === 'dev-01')!
    expect(record.inheritedRuntime).toBe(runtime)
    expect(after.telemetry.runtime).toBe(runtime)
    expect(after.firmware).toBe('3.4.0')
  })

  it('transfers support messages and leaves an assignment and notification audit trail', async () => {
    const user = accountContext('acc-user')
    const transfer = await workflowService.escalateMessage('ticket-04', 'headquarters', undefined, 'dealer response overdue', user)
    const snapshot = databaseService.snapshot()
    expect(transfer.target).toBe('headquarters')
    expect(snapshot.tickets.find((item) => item.id === 'ticket-04')?.assignmentTarget).toBe('headquarters')
    expect(snapshot.messages.some((item) => item.transferId === transfer.id)).toBe(true)
    expect(snapshot.auditEvents.some((item) => item.action === 'message-transfer')).toBe(true)
  })

  it('allows headquarters to view and reply without completing the service ticket', async () => {
    const user = accountContext('acc-user')
    const transfer = await workflowService.escalateMessage('ticket-04', 'headquarters', undefined, 'dealer response overdue', user)
    const originalStatus = databaseService.snapshot().tickets.find((item) => item.id === 'ticket-04')?.status

    await workflowService.reviewByDemoPlatform('headquartersMessage', transfer.id, 'approved', 'headquarters accepted')
    let snapshot = databaseService.snapshot()
    expect(snapshot.messageTransfers.find((item) => item.id === transfer.id)?.status).toBe('accepted')
    expect(snapshot.tickets.find((item) => item.id === 'ticket-04')).toMatchObject({ assignmentTarget: 'headquarters', escalationStatus: 'transferred' })

    await workflowService.reviewByDemoPlatform('headquartersMessage', transfer.id, 'approved', 'Please contact your dealer for an appointment')
    snapshot = databaseService.snapshot()
    expect(snapshot.messageTransfers.find((item) => item.id === transfer.id)?.status).toBe('accepted')
    expect(snapshot.tickets.find((item) => item.id === 'ticket-04')?.status).toBe(originalStatus)
    expect(snapshot.messages.find((item) => item.transferId === transfer.id)?.body).toBe('Please contact your dealer for an appointment')
    expect(snapshot.messages.filter((item) => item.transferId === transfer.id)).toHaveLength(3)
    expect(snapshot.auditEvents.filter((item) => item.entityId === transfer.id && item.source === 'demo-exception')).toHaveLength(2)
  })

  it('requires each dealer role before the external platform can approve a service transfer', async () => {
    const origin = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const targetAccount = databaseService.snapshot().accounts.find((item) => item.id === 'acc-first')!
    const target = authorizationService.context({ ...targetAccount, firstLogin: false }, ['dealer-02'])
    await workflowService.transition('serviceTransfers', 'st-01', 'confirmOrigin', origin)
    await expect(workflowService.reviewByDemoPlatform('serviceTransfer', 'st-01', 'approved')).rejects.toThrow('INVALID_TRANSITION')
    await workflowService.transition('serviceTransfers', 'st-01', 'acceptTarget', target)
    const before = databaseService.snapshot()
    const originalFactoryRegion = before.projects.find((item) => item.id === 'pro-01')?.factoryRegion
    await workflowService.reviewByDemoPlatform('serviceTransfer', 'st-01', 'approved', 'scope checked')
    const snapshot = databaseService.snapshot()
    expect(snapshot.serviceTransfers.find((item) => item.id === 'st-01')?.status).toBe('completed')
    expect(snapshot.tickets.find((item) => item.id === 'ticket-02')?.dealerId).toBe('dealer-02')
    expect(snapshot.devices.find((item) => item.id === 'dev-02')?.dealerId).toBe('dealer-02')
    expect(snapshot.projects.find((item) => item.id === 'pro-01')).toMatchObject({ dealerId: 'dealer-02', region: '广东省汕头市', factoryRegion: originalFactoryRegion, crossRegionRequired: false, crossRegionStatus: 'approved' })
    expect(snapshot.deviceRegistrations.find((item) => item.serialNumber === 'SW200020240202')).toMatchObject({ dealerId: 'dealer-02', lastKnownRegion: '广东省汕头市' })
    expect(snapshot.messages.some((item) => item.transferId === 'st-01' && item.dealerId === 'dealer-02')).toBe(true)
    expect(snapshot.platformApprovals.some((item) => item.entityId === 'st-01' && item.status === 'approved')).toBe(true)
    expect(snapshot.platformApprovals.find((item) => item.entityId === 'st-01')?.source).toBe('demo-exception')
    expect(snapshot.auditEvents.some((item) => item.entityId === 'st-01' && item.source === 'demo-exception')).toBe(true)
  })

  it('rejects illegal workflow jumps and records legal approvals', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    await expect(workflowService.transition('materials', 'mat-02', 'ship', dealer)).rejects.toThrow('INVALID_TRANSITION')
    await workflowService.transition('materials', 'mat-02', 'approve', dealer)
    await workflowService.transition('materials', 'mat-02', 'ship', dealer)
    const snapshot = databaseService.snapshot()
    expect(snapshot.materials.find((item) => item.id === 'mat-02')?.status).toBe('shipping')
    expect(snapshot.shipments.some((item) => item.materialRequestId === 'mat-02')).toBe(true)
    expect(snapshot.approvals.filter((item) => item.entityId === 'mat-02')).toHaveLength(2)
  })

  it('creates a scoped material request and decrements stock only when it ships', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const initialStock = databaseService.snapshot().materialCatalog.find((item) => item.id === 'catalog-02')!.stock
    const request = workflowService.createMaterialRequest({ catalogId: 'catalog-02', projectId: 'pro-01', quantity: 3, reason: '安装补充' }, dealer)
    expect(databaseService.snapshot().materialCatalog.find((item) => item.id === 'catalog-02')?.stock).toBe(initialStock)
    await workflowService.transition('materials', request.id, 'approve', dealer)
    await workflowService.transition('materials', request.id, 'ship', dealer)
    const snapshot = databaseService.snapshot()
    expect(snapshot.materialCatalog.find((item) => item.id === 'catalog-02')?.stock).toBe(initialStock - 3)
    expect(snapshot.shipments.find((item) => item.materialRequestId === request.id)?.status).toBe('shipping')
    expect(snapshot.auditEvents.some((item) => item.action === 'material-request-create' && item.entityId === request.id)).toBe(true)
  })

  it('creates one compatible multi-part request and ships every line together', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const before = databaseService.snapshot()
    const stock01 = before.materialCatalog.find((item) => item.id === 'catalog-01')!.stock
    const stock02 = before.materialCatalog.find((item) => item.id === 'catalog-02')!.stock
    const request = workflowService.createMaterialRequest({
      projectId: 'pro-01', reason: '安装与售后备件',
      items: [{ catalogId: 'catalog-01', quantity: 2 }, { catalogId: 'catalog-02', quantity: 3 }],
    }, dealer)
    expect(request.items).toEqual([
      expect.objectContaining({ catalogId: 'catalog-01', quantity: 2 }),
      expect.objectContaining({ catalogId: 'catalog-02', quantity: 3 }),
    ])
    expect(request.quantity).toBe(5)
    await workflowService.transition('materials', request.id, 'approve', dealer)
    await workflowService.transition('materials', request.id, 'ship', dealer)
    const snapshot = databaseService.snapshot()
    expect(snapshot.materialCatalog.find((item) => item.id === 'catalog-01')?.stock).toBe(stock01 - 2)
    expect(snapshot.materialCatalog.find((item) => item.id === 'catalog-02')?.stock).toBe(stock02 - 3)
    expect(snapshot.shipments.filter((item) => item.materialRequestId === request.id)).toHaveLength(1)
    expect(() => workflowService.createMaterialRequest({ projectId: 'pro-02', reason: '错误型号', items: [{ catalogId: 'catalog-04', quantity: 1 }] }, dealer)).toThrow('MATERIAL_INCOMPATIBLE')
  })

  it('creates a repair ticket and linked replacement-material approval in one transaction', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const result = await workflowService.createTicket({
      title: '顶流机售后换料', titleEn: 'Surface jet replacement', ownerId: 'acc-dealer', deviceId: 'dev-01', projectId: 'pro-01',
      category: 'repair', faultCategory: '水下电机', description: '水下电机组件异常，需要更换', phone: '13800000028', contact: '13800000028', dealerId: 'dealer-01',
      replacementRequired: true, originalMaterialId: 'catalog-01', replacementMaterialId: 'catalog-04', replacementQuantity: 1, serviceCharge: 680,
      attachmentIds: [], status: 'submitted', history: [{ id: 'history-replacement', status: 'submitted', label: '售后项目已创建', at: new Date().toISOString(), operator: '林经理' }],
    }, dealer)
    const snapshot = databaseService.snapshot()
    expect(result.ticket.status).toBe('parts')
    expect(result.materialRequest).toMatchObject({ ticketId: result.ticket.id, projectId: 'pro-01', originalCatalogId: 'catalog-01', catalogId: 'catalog-04', source: 'serviceReplacement', status: 'pending' })
    expect(snapshot.tickets.find((item) => item.id === result.ticket.id)?.replacementMaterialRequestId).toBe(result.materialRequest?.id)
    expect(snapshot.projects.find((item) => item.id === 'pro-01')?.status).toBe('aftersales')
    expect(snapshot.approvals.some((item) => item.entityId === result.materialRequest?.id && item.action === 'submit')).toBe(true)
  })

  it('creates and completes one repair request containing multiple replacement lines', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02', 'dealer-03'])
    const result = await workflowService.createTicket({
      title: '多物料换料', titleEn: 'Multi-part replacement', ownerId: 'acc-dealer', deviceId: 'dev-01', projectId: 'pro-01',
      category: 'repair', faultCategory: '综合故障', description: '同时更换控制板和提升组件', phone: '13800000028', contact: '13800000028', dealerId: 'dealer-01',
      replacementRequired: true,
      replacementLines: [
        { id: 'replacement-a', originalCatalogId: 'catalog-01', replacementCatalogId: 'catalog-02', quantity: 2 },
        { id: 'replacement-b', originalCatalogId: 'catalog-03', replacementCatalogId: 'catalog-04', quantity: 1 },
      ],
      serviceCharge: 200, attachmentIds: [], status: 'submitted',
      history: [{ id: 'history-multi-replacement', status: 'submitted', label: '售后项目已创建', at: new Date().toISOString(), operator: '林经理' }],
    }, dealer)
    expect(result.ticket.replacementLines).toHaveLength(2)
    expect(result.materialRequest?.items).toEqual([
      expect.objectContaining({ originalCatalogId: 'catalog-01', catalogId: 'catalog-02', quantity: 2 }),
      expect.objectContaining({ originalCatalogId: 'catalog-03', catalogId: 'catalog-04', quantity: 1 }),
    ])
    expect(result.materialRequest?.quantity).toBe(3)
    expect(result.ticket.chargeLines?.filter((line) => line.type === 'material')).toHaveLength(2)

    await workflowService.transition('materials', result.materialRequest!.id, 'approve', dealer)
    await workflowService.transition('materials', result.materialRequest!.id, 'ship', dealer)
    await workflowService.transition('materials', result.materialRequest!.id, 'receive', dealer)
    await workflowService.transition('tickets', result.ticket.id, 'complete', dealer)
    const project = databaseService.snapshot().projects.find((item) => item.id === 'pro-01')!
    expect(project.installedMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ catalogId: 'catalog-01', status: 'removed', relatedCatalogId: 'catalog-02' }),
      expect.objectContaining({ catalogId: 'catalog-02', status: 'installed', relatedCatalogId: 'catalog-01', quantity: 2 }),
      expect.objectContaining({ catalogId: 'catalog-03', status: 'removed', relatedCatalogId: 'catalog-04' }),
      expect.objectContaining({ catalogId: 'catalog-04', status: 'installed', relatedCatalogId: 'catalog-03', quantity: 1 }),
    ]))
  })

  it('completes a replacement only after receipt and synchronizes project parts and billing', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const result = await workflowService.createTicket({
      title: '提升组件更换', titleEn: 'Lift assembly replacement', ownerId: 'acc-dealer', deviceId: 'dev-01', projectId: 'pro-01',
      category: 'repair', faultCategory: '提升', description: '提升组件磨损，需要更换', phone: '13800000028', contact: '13800000028', dealerId: 'dealer-01',
      replacementRequired: true, originalMaterialId: 'catalog-03', replacementMaterialId: 'catalog-04', replacementQuantity: 1, serviceCharge: 300,
      attachmentIds: [], status: 'submitted', history: [{ id: 'history-replacement-close', status: 'submitted', label: '售后项目已创建', at: new Date().toISOString(), operator: '林经理' }],
    }, dealer)
    await expect(workflowService.transition('tickets', result.ticket.id, 'complete', dealer)).rejects.toThrow('REPLACEMENT_NOT_RECEIVED')
    await workflowService.transition('materials', result.materialRequest!.id, 'approve', dealer)
    await workflowService.transition('materials', result.materialRequest!.id, 'ship', dealer)
    await workflowService.transition('materials', result.materialRequest!.id, 'receive', dealer)
    await workflowService.transition('tickets', result.ticket.id, 'complete', dealer)

    const snapshot = databaseService.snapshot()
    const ticket = snapshot.tickets.find((item) => item.id === result.ticket.id)!
    const project = snapshot.projects.find((item) => item.id === 'pro-01')!
    expect(ticket).toMatchObject({ status: 'completed', removedMaterialDisposition: 'returnPending', serviceCharge: 880 })
    expect(ticket.replacementCompletedAt).toBeTruthy()
    expect(ticket.chargeLines).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'labor', amount: 300 }),
      expect.objectContaining({ type: 'material', catalogId: 'catalog-04', amount: 580 }),
    ]))
    expect(snapshot.materials.find((item) => item.id === result.materialRequest!.id)?.status).toBe('installed')
    expect(project.installedMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ catalogId: 'catalog-03', status: 'removed', ticketId: ticket.id }),
      expect.objectContaining({ catalogId: 'catalog-04', status: 'installed', ticketId: ticket.id }),
    ]))
    expect(snapshot.auditEvents.some((item) => item.entityId === ticket.id && item.action === 'complete')).toBe(true)
  })

  it('creates a multi-line purchase using immutable catalog price snapshots', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const result = await workflowService.createPurchaseWithPayment({
      orderNo: 'PO-MULTI-001', title: '安装物料采购', titleEn: 'Installation materials',
      items: [{ catalogId: 'catalog-01', quantity: 1 }, { catalogId: 'catalog-02', quantity: 2 }],
    }, dealer, 'CNY')
    expect(result.purchase.quantity).toBe(3)
    expect(result.purchase.amount).toBe(2320)
    expect(result.purchase.items).toHaveLength(2)
    expect(result.payment).toBeUndefined()
    expect(result.purchase.status).toBe('pendingApproval')
    expect(result.purchase.paymentStatus).toBe('notCreated')
    expect(databaseService.snapshot().approvals.some((item) => item.entity === 'purchase' && item.entityId === result.purchase.id)).toBe(true)

    databaseService.transact((db) => {
      db.materialCatalog.find((item) => item.id === 'catalog-01')!.dealerPrice = 9999
      db.materialCatalog.find((item) => item.id === 'catalog-02')!.dealerPrice = 8888
      return db.materialCatalog
    })
    const persisted = databaseService.snapshot().purchases.find((item) => item.id === result.purchase.id)!
    expect(persisted.amount).toBe(2320)
    expect(persisted.items.map((item) => item.unitPrice)).toEqual([1680, 320])
  })

  it('creates a payable record only after sales, R&D, and production confirmation', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const beforePayments = databaseService.snapshot().payments.length
    const result = await workflowService.createPurchaseWithPayment({
      orderNo: 'PO-APPROVAL-001', title: '新物料采购', titleEn: 'New parts purchase',
      items: [{ catalogId: 'catalog-02', quantity: 1 }],
    }, dealer, 'CNY')
    expect(databaseService.snapshot().payments).toHaveLength(beforePayments)
    expect(result.purchase.status).toBe('pendingApproval')
    await workflowService.transition('purchases', result.purchase.id, 'approve', dealer)
    expect(databaseService.snapshot().payments).toHaveLength(beforePayments)
    await workflowService.transition('purchases', result.purchase.id, 'confirmRd', dealer)
    expect(databaseService.snapshot().payments).toHaveLength(beforePayments)
    await workflowService.transition('purchases', result.purchase.id, 'startProduction', dealer)
    expect(databaseService.snapshot().payments).toHaveLength(beforePayments)
    await workflowService.transition('purchases', result.purchase.id, 'finishProduction', dealer)
    const approvedSnapshot = databaseService.snapshot()
    const approved = approvedSnapshot.purchases.find((item) => item.id === result.purchase.id)!
    expect(approved.status).toBe('approved')
    expect(approved.paymentStatus).toBe('pending')
    expect(approved.history.at(-1)?.label).toContain('付款单已生成')
    expect(approvedSnapshot.payments.find((item) => item.orderNo === approved.orderNo)).toMatchObject({ status: 'pending', amount: approved.amount, paymentNo: `${approved.orderNo}-P01`, installmentNumber: 1 })
  })

  it('completes approved purchase payment and creates a traceable shipment', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const result = await workflowService.createPurchaseWithPayment({
      orderNo: 'PO-CLOSED-LOOP-001', title: '采购闭环验证', titleEn: 'Purchase closure check',
      items: [{ catalogId: 'catalog-02', quantity: 1 }],
    }, dealer, 'CNY')
    await workflowService.transition('purchases', result.purchase.id, 'approve', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'confirmRd', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'startProduction', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'finishProduction', dealer)
    const payment = databaseService.snapshot().payments.find((item) => item.orderNo === result.purchase.orderNo)!
    const timestamp = new Date().toISOString()
    databaseService.transact((db) => {
      db.attachments.unshift({
        id: 'purchase-closure-proof', createdAt: timestamp, updatedAt: timestamp, ownerId: 'acc-dealer',
        entity: 'payment-proof', name: 'purchase-closure-proof.png', kind: 'image', localPath: 'data:image/png;base64,dGVzdA==',
        size: 128, mimeType: 'image/png', persisted: false,
      })
      return db.attachments[0]
    })
    await workflowService.submitPaymentProof(payment.id, 'purchase-closure-proof', dealer)
    const awaitingFinance = databaseService.snapshot()
    expect(awaitingFinance.payments.find((item) => item.id === payment.id)?.status).toBe('verifying')
    expect(awaitingFinance.purchases.find((item) => item.id === result.purchase.id)?.paidAmount).toBe(0)
    expect(awaitingFinance.shipments.some((item) => item.orderNo === result.purchase.orderNo)).toBe(false)
    await workflowService.completePurchasePaymentReview(payment.id, dealer)

    const snapshot = databaseService.snapshot()
    expect(snapshot.payments.find((item) => item.id === payment.id)?.status).toBe('verified')
    expect(snapshot.purchases.find((item) => item.id === result.purchase.id)).toMatchObject({ status: 'paid', paymentStatus: 'paid' })
    const shipment = snapshot.shipments.find((item) => item.orderNo === result.purchase.orderNo)!
    expect(shipment).toMatchObject({ status: 'shipping', carrier: '顺丰速运' })
    expect(shipment.items).toEqual([expect.objectContaining({ catalogId: 'catalog-02', quantity: 1 })])
    expect(shipment.trackingNumber).toBeTruthy()
    expect(shipment.dispatchAttachmentIds).toHaveLength(1)
  })

  it('supports device purchase installments and adds received devices to unassigned inventory', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const before = databaseService.snapshot()
    const model = before.deviceModels.find((item) => item.stock > 0)!
    const originalDeviceIds = new Set(before.devices.map((item) => item.id))
    const result = await workflowService.createPurchaseWithPayment({
      orderNo: 'PO-DEVICE-INSTALLMENTS-001', title: '整机设备采购', titleEn: 'Equipment purchase',
      items: [{ catalogId: model.id, quantity: 1 }],
    }, dealer, 'CNY')

    expect(result.purchase).toMatchObject({ purchaseType: 'devices', status: 'pendingApproval', paidAmount: 0 })
    expect(result.purchase.items).toEqual([expect.objectContaining({ itemType: 'device', deviceModel: model.model, unitPrice: model.dealerPrice })])
    await workflowService.transition('purchases', result.purchase.id, 'approve', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'confirmRd', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'startProduction', dealer)
    await workflowService.transition('purchases', result.purchase.id, 'finishProduction', dealer)

    const firstPayment = databaseService.snapshot().payments.find((item) => item.orderNo === result.purchase.orderNo)!
    const firstAmount = Math.round(result.purchase.amount * 0.4 * 100) / 100
    await workflowService.setPurchasePaymentAmount(firstPayment.id, firstAmount, dealer)
    const addProof = (id: string) => databaseService.transact((db) => {
      const timestamp = new Date().toISOString()
      db.attachments.unshift({
        id, createdAt: timestamp, updatedAt: timestamp, ownerId: 'acc-dealer', entity: 'payment-proof',
        name: `${id}.png`, kind: 'image', localPath: 'data:image/png;base64,dGVzdA==', size: 128,
        mimeType: 'image/png', persisted: false,
      })
      return db.attachments[0]
    })
    await addProof('device-installment-proof-1')
    await workflowService.submitPaymentProof(firstPayment.id, 'device-installment-proof-1', dealer)
    await workflowService.completePurchasePaymentReview(firstPayment.id, dealer)

    let snapshot = databaseService.snapshot()
    let purchase = snapshot.purchases.find((item) => item.id === result.purchase.id)!
    expect(purchase).toMatchObject({ status: 'partiallyPaid', paymentStatus: 'partial', paidAmount: firstAmount, paymentCount: 1 })
    expect(purchase.remainingAmount).toBe(result.purchase.amount - firstAmount)
    expect(snapshot.shipments.some((item) => item.orderNo === result.purchase.orderNo)).toBe(false)
    const secondPayment = snapshot.payments.find((item) => item.orderNo === result.purchase.orderNo && item.status === 'pending')!
    expect(secondPayment).toMatchObject({ installmentNumber: 2, paymentNo: `${result.purchase.orderNo}-P02`, amount: purchase.remainingAmount })

    await addProof('device-installment-proof-2')
    await workflowService.submitPaymentProof(secondPayment.id, 'device-installment-proof-2', dealer)
    await workflowService.completePurchasePaymentReview(secondPayment.id, dealer)
    snapshot = databaseService.snapshot()
    purchase = snapshot.purchases.find((item) => item.id === result.purchase.id)!
    expect(purchase).toMatchObject({ status: 'paid', paymentStatus: 'paid', remainingAmount: 0, paymentCount: 2 })
    const shipment = snapshot.shipments.find((item) => item.orderNo === result.purchase.orderNo)!
    expect(shipment.items).toEqual([expect.objectContaining({ itemType: 'device', deviceModel: model.model, quantity: 1 })])

    await workflowService.transition('shipments', shipment.id, 'receive', dealer)
    snapshot = databaseService.snapshot()
    const receivedDevice = snapshot.devices.find((item) => !originalDeviceIds.has(item.id) && item.model === model.model)
    expect(receivedDevice).toMatchObject({ dealerId: 'dealer-01', activationStatus: 'registered' })
    expect(receivedDevice?.ownerId).toBeUndefined()
    expect(receivedDevice?.projectId).toBeUndefined()
    expect(receivedDevice?.assignedTo).toBeUndefined()
    expect(snapshot.deviceRegistrations.find((item) => item.serialNumber === receivedDevice?.serialNumber)).toMatchObject({ status: 'available', dealerId: 'dealer-01' })
  })

  it('submits scan payment proof for manual finance review without marking the order paid', () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const timestamp = new Date().toISOString()
    databaseService.transact((db) => {
      db.attachments.unshift({
        id: 'payment-proof-test', createdAt: timestamp, updatedAt: timestamp, ownerId: 'acc-dealer',
        entity: 'payment-proof', name: 'payment-proof.png', kind: 'image', localPath: 'data:image/png;base64,dGVzdA==',
        size: 128, mimeType: 'image/png', persisted: false,
      })
      return db.attachments[0]
    })

    workflowService.submitPaymentProof('pay-01', 'payment-proof-test', dealer)
    const snapshot = databaseService.snapshot()
    expect(snapshot.payments.find((item) => item.id === 'pay-01')).toMatchObject({
      method: 'scanQr', status: 'verifying', proofAttachmentId: 'payment-proof-test',
    })
    expect(snapshot.attachments.find((item) => item.id === 'payment-proof-test')).toMatchObject({
      entity: 'payments', entityId: 'pay-01', persisted: true,
    })
    expect(snapshot.purchases.find((item) => item.orderNo === 'PO202608100028')?.status).toBe('pendingApproval')
  })

  it('creates dispatch evidence with item list, photo, carrier and tracking details', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const request = workflowService.createMaterialRequest({ projectId: 'pro-01', reason: '发货证据校验', items: [{ catalogId: 'catalog-02', quantity: 1 }] }, dealer)
    await workflowService.transition('materials', request.id, 'approve', dealer)
    await workflowService.transition('materials', request.id, 'ship', dealer)
    const shipment = databaseService.snapshot().shipments.find((item) => item.materialRequestId === request.id)!
    expect(shipment.items).toEqual([expect.objectContaining({ catalogId: 'catalog-02', quantity: 1 })])
    expect(shipment.dispatchAttachmentIds).toHaveLength(1)
    expect(shipment.carrier).toBeTruthy()
    expect(shipment.trackingNumber).toBeTruthy()
    expect(databaseService.snapshot().attachments.some((item) => shipment.dispatchAttachmentIds.includes(item.id))).toBe(true)
  })

  it('keeps customer order workflow history without a repayment-proof upload stage', () => {
    const order = databaseService.snapshot().orders.find((item) => item.id === 'order-01')!
    expect(order.history.map((item) => item.status)).toEqual(['submitted', 'salesConfirmed', 'rdConfirmed', 'production', 'financeConfirmed', 'shipped', 'completed'])
    expect(order.history.every((item) => !item.label.includes('回款凭证') && !item.label.includes('回执单'))).toBe(true)
  })

  it('updates device assignment immediately and reallocation only after the platform exception approval', async () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02'])
    const assignment = workflowService.createTransfer({ deviceId: 'dev-05', kind: 'assignment', targetEmployeeId: 'emp-01' }, dealer)
    expect(assignment.status).toBe('completed')
    expect(databaseService.snapshot().devices.find((item) => item.id === 'dev-05')?.assignedTo).toBe('emp-01')
    expect(databaseService.snapshot().devices.find((item) => item.id === 'dev-06')?.dealerId).toBe('dealer-01')
    databaseService.transact((db) => { const target = db.dealers.find((item) => item.id === 'dealer-02')!; target.status = 'enabled'; return target })
    const reallocation = workflowService.createTransfer({ deviceId: 'dev-06', kind: 'reallocation', targetDealerId: 'dealer-02' }, dealer)
    expect(databaseService.snapshot().devices.find((item) => item.id === 'dev-06')?.dealerId).toBe('dealer-01')
    await workflowService.reviewByDemoPlatform('deviceTransfer', reallocation.id, 'approved', 'scope checked')
    const snapshot = databaseService.snapshot()
    expect(snapshot.transfers.find((item) => item.id === reallocation.id)?.status).toBe('completed')
    expect(snapshot.devices.find((item) => item.id === 'dev-06')?.dealerId).toBe('dealer-02')
    expect(snapshot.auditEvents.some((item) => item.entityId === reallocation.id && item.source === 'demo-exception')).toBe(true)
  })

  it('assigns an unallocated primary-dealer device directly to an enabled sub-dealer', () => {
    const dealer = accountContext('acc-dealer', ['dealer-01', 'dealer-02', 'dealer-03'])
    const assignment = workflowService.createTransfer({ deviceId: 'dev-05', kind: 'assignment', targetDealerId: 'dealer-03' }, dealer)
    const snapshot = databaseService.snapshot()
    expect(assignment).toMatchObject({ kind: 'assignment', status: 'completed', targetDealerId: 'dealer-03', to: '海沧服务网点' })
    expect(snapshot.devices.find((item) => item.id === 'dev-05')).toMatchObject({ dealerId: 'dealer-03' })
    expect(snapshot.devices.find((item) => item.id === 'dev-05')?.assignedTo).toBeUndefined()
    expect(snapshot.transfers.find((item) => item.id === assignment.id)?.history[0].label).toContain('设备已分配给')
  })

  it('restores deterministic seed data after local changes', async () => {
    const repository = databaseService.repository<Waypoint>('waypoints')
    const original = (await repository.list()).total
    await repository.remove((await repository.list()).items[0].id)
    await databaseService.reset()
    expect((await repository.list()).total).toBe(original)
  })
})
