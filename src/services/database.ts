import { authorizationService } from './authorization'
import { createSeedDatabase } from './seed'
import { storage } from './storage'
import { createDefaultDeviceControlState, createDefaultDeviceIdentity, createDefaultDeviceSettings, defaultFirmwareForModel } from '@/config/deviceDefaults'
import { isSupportedLocale } from '@/config/locales'
import type { AccessContext, Account, AppDatabase, BaseEntity, ChartPreferences, DeviceControlState, DeviceSettings, EntityCollection, MaterialRequestLine, PageResult, PurchaseLine, Query } from '@/types/models'

export const DB_KEY = 'shark-sister-db-v1'
const region = (import.meta.env.VITE_APP_REGION === 'GLOBAL' ? 'GLOBAL' : 'CN') as 'CN' | 'GLOBAL'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const delay = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeRegion = (value: string) => String(value || '').replace(/[省市区县\s]/g, '')
const isAdministrativeRegion = (value?: string) => Boolean(value && /(省|市|自治区|特别行政区)/.test(value))
export const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const legacyDefaultPasswords = new Set(['Shark2026', 'Dealer2026', 'Staff2026', 'Temp2026'])
const crawlDistances = new Set([6, 10, 15, 20, 30])
const plusHoursIso = (value: string, hours: number) => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp + hours * 60 * 60 * 1000).toISOString() : undefined
}

function normalizeChartPreferences(value: Record<string, any> | undefined, fallback: ChartPreferences): ChartPreferences {
  return {
    displayMode: ['basic', 'standard', 'all'].includes(value?.displayMode) ? value!.displayMode : fallback.displayMode,
    theme: ['day', 'dusk', 'night'].includes(value?.theme) ? value!.theme : fallback.theme,
    boundaryStyle: ['simple', 'symbolized'].includes(value?.boundaryStyle) ? value!.boundaryStyle : fallback.boundaryStyle,
    pointSymbol: ['simple', 'paper'].includes(value?.pointSymbol) ? value!.pointSymbol : fallback.pointSymbol,
    depthColors: value?.depthColors === 4 ? 4 : 2,
    zoomLevel: [1, 2, 3, 4, 5].includes(value?.zoomLevel) ? value!.zoomLevel : fallback.zoomLevel,
  }
}

function normalizeDeviceSettings(value: Record<string, any> | undefined, heading?: number): DeviceSettings {
  const defaults = createDefaultDeviceSettings()
  const linkedRole = ['standalone', 'primary', 'secondary'].includes(value?.linkedRole)
    ? value!.linkedRole
    : value?.linkedModeEnabled === true ? 'primary' : 'standalone'
  const calibrationStatus = ['idle', 'calibrating', 'succeeded', 'failed'].includes(value?.magnetometerCalibrationStatus)
    ? value!.magnetometerCalibrationStatus
    : 'idle'
  const driftDistance = Number(value?.anchorDriftAlertDistanceMeters)
  const crawlDistance = Number(value?.crawlDistanceMeters)
  return {
    ...defaults,
    power: Number.isFinite(Number(value?.power)) ? Number(value!.power) : defaults.power,
    bowHeadingReferenceDeg: value?.bowHeadingReferenceDeg !== null && value?.bowHeadingReferenceDeg !== undefined && Number.isFinite(Number(value.bowHeadingReferenceDeg))
      ? Number(value!.bowHeadingReferenceDeg)
      : value?.bowHeadingEnabled === true && Number.isFinite(Number(heading)) ? Number(heading) : null,
    bowHeadingCalibratedAt: value?.bowHeadingCalibratedAt,
    anchorDriftAlertDistanceMeters: Number.isInteger(driftDistance) && driftDistance > 0 ? driftDistance : defaults.anchorDriftAlertDistanceMeters,
    linkedRole,
    linkedRolePendingRestart: Boolean(value?.linkedRolePendingRestart),
    magnetometerCalibrationStatus: calibrationStatus,
    magnetometerCalibratedAt: value?.magnetometerCalibratedAt,
    crawlDistanceMeters: crawlDistances.has(crawlDistance) ? crawlDistance as DeviceSettings['crawlDistanceMeters'] : defaults.crawlDistanceMeters,
    limitSwitchBypassEnabled: value?.limitSwitchBypassEnabled ?? defaults.limitSwitchBypassEnabled,
    arrivalProtectionEnabled: value?.arrivalProtectionEnabled ?? defaults.arrivalProtectionEnabled,
  }
}

function normalizeControlState(value: Record<string, any> | undefined, power: number): DeviceControlState {
  const defaults = createDefaultDeviceControlState()
  const legacyMode = value?.activeMode === 'move-point' ? 'anchor' : value?.activeMode === 'waypoint' ? 'manual' : value?.activeMode
  const activeMode = ['manual', 'anchor', 'drift', 'crawl', 'side-thrust', 'heading-lock', 'playback'].includes(legacyMode) ? legacyMode : defaults.activeMode
  return {
    ...defaults,
    ...value,
    power: Number.isFinite(Number(value?.power)) ? Number(value!.power) : power,
    activeMode,
    anchorEstablished: value?.anchorEstablished ?? ['anchor', 'crawl'].includes(legacyMode),
    anchorOffsetForwardMeters: Number(value?.anchorOffsetForwardMeters || 0),
    anchorOffsetStarboardMeters: Number(value?.anchorOffsetStarboardMeters || 0),
    controlPaused: Boolean(value?.controlPaused),
    steeringAngleDeg: Math.max(-130, Math.min(130, Number(value?.steeringAngleDeg || 0))),
    steeringLimit: ['left', 'right'].includes(value?.steeringLimit) ? value!.steeringLimit : 'none',
  }
}

function addAudit(db: AppDatabase, action: string, entity: string, entityId: string, operator = 'local-user', detail = '', source: AppDatabase['auditEvents'][number]['source'] = 'local', operationId?: string) {
  const timestamp = new Date().toISOString()
  db.auditEvents.unshift({ id: makeId('audit'), createdAt: timestamp, updatedAt: timestamp, action, entity, entityId, operator, detail: detail || `${action}:${entity}:${entityId}`, source, operationId })
}

function migrateV1(candidate: Record<string, unknown>): AppDatabase {
  const next = createSeedDatabase(region)
  const timestamp = new Date().toISOString()
  const source = candidate as Record<string, any>
  next.session = { accountId: source.session?.accountId ?? null, guest: false }
  const sourceSettings = source.settings ?? {}
  next.settings = {
    locale: isSupportedLocale(sourceSettings.locale) ? sourceSettings.locale : next.settings.locale,
    unitSystem: sourceSettings.unitSystem ?? next.settings.unitSystem,
    region: sourceSettings.region ?? next.settings.region,
    autoFirmware: sourceSettings.autoFirmware ?? next.settings.autoFirmware,
    waypointStorage: sourceSettings.waypointStorage ?? next.settings.waypointStorage,
    chartPreferences: normalizeChartPreferences(sourceSettings.chartPreferences, next.settings.chartPreferences),
    notifications: {
      device: sourceSettings.notifications?.device ?? next.settings.notifications.device,
      ota: sourceSettings.notifications?.ota ?? next.settings.notifications.ota,
      service: sourceSettings.notifications?.service ?? next.settings.notifications.service,
      sync: sourceSettings.notifications?.sync ?? next.settings.notifications.sync,
      product: sourceSettings.notifications?.product ?? next.settings.notifications.product,
    },
    agreements: Array.isArray(sourceSettings.agreements) ? sourceSettings.agreements : [],
    permissions: {
      bluetooth: sourceSettings.permissions?.bluetooth ?? next.settings.permissions.bluetooth,
      location: sourceSettings.permissions?.location ?? next.settings.permissions.location,
      camera: sourceSettings.permissions?.camera ?? next.settings.permissions.camera,
      notifications: sourceSettings.permissions?.notifications ?? next.settings.permissions.notifications,
    },
  }
  if (Array.isArray(source.accounts)) next.accounts = source.accounts.map((item: any) => ({
    ...item,
    active: item.active ?? true,
    verified: item.verified ?? true,
    failedAttempts: item.failedAttempts ?? 0,
  }))
  if (!next.accounts.some((item) => item.id === 'acc-guest')) next.accounts.unshift(createSeedDatabase(region).accounts[0])
  if (Array.isArray(source.devices)) next.devices = source.devices.map((item: any) => ({
    ...item,
    bindingId: item.bindingId ?? `binding-${item.id || item.serialNumber}-legacy`,
    salesRegion: item.salesRegion ?? item.location?.label ?? '福建省厦门市',
    activationStatus: item.activationStatus ?? 'active',
    activatedAt: item.activatedAt ?? item.createdAt ?? timestamp,
    bluetoothConnected: item.bluetoothConnected ?? item.status === 'online',
    connectionState: item.connectionState ?? (item.bluetoothConnected || item.status === 'online' ? 'connected' : 'disconnected'),
    firmware: !item.firmware || item.firmware === '待获取' || item.firmware === 'Pending' ? defaultFirmwareForModel(item.model) : item.firmware,
    guestVisible: item.guestVisible ?? item.publicDemo ?? false,
    identity: { ...createDefaultDeviceIdentity(item.serialNumber), ...(item.identity ?? {}) },
    settings: normalizeDeviceSettings(item.settings, item.telemetry?.heading),
    controlState: normalizeControlState(item.controlState, Number(item.settings?.power ?? 45)),
  }))
  if (Array.isArray(source.waypoints)) next.waypoints = source.waypoints.map((item: any) => ({ storageTarget: item.source === 'cloud' ? 'server' : 'local', syncAttempts: item.syncStatus === 'synced' ? 1 : 0, ...item }))
  if (Array.isArray(source.projects)) next.projects = source.projects.map((item: any) => ({ ownerName: item.customer || '', deviceModel: '', deviceSpecification: '标准型', rodLength: '', phone: '', installedMaterials: [], warrantyHistory: [], ...item }))
  if (Array.isArray(source.tickets)) next.tickets = source.tickets.map((item: any) => ({ ownerId: item.ownerId || (item.contact === '13800002861' ? 'acc-user' : undefined), phone: item.contact, attachmentIds: [], customerVisible: true, history: [{ id: makeId('history'), status: item.status, label: '已从旧数据迁移', at: item.updatedAt || timestamp, operator: '系统' }], ...item }))
  if (Array.isArray(source.employees)) next.employees = source.employees
  if (Array.isArray(source.materials)) next.materials = source.materials.map((item: any) => ({ history: [{ id: makeId('history'), status: item.status, label: '已从旧数据迁移', at: item.updatedAt || timestamp, operator: '系统' }], ...item }))
  if (Array.isArray(source.transfers)) next.transfers = source.transfers.map((item: any) => ({ kind: 'assignment', history: [{ id: makeId('history'), status: item.status, label: '已从旧数据迁移', at: item.updatedAt || timestamp, operator: '系统' }], ...item }))
  for (const key of ['purchases', 'payments', 'messages', 'auditEvents'] as const) if (Array.isArray(source[key])) (next[key] as any[]) = source[key]
  next.purchases = next.purchases.map((item, index) => ({ ...item, orderNo: item.orderNo ?? `PO-LEGACY-${String(index + 1).padStart(4, '0')}` }))
  next.dealers = next.dealers.map((item) => ({ ...item, defaultWarrantyYears: item.defaultWarrantyYears ?? 2 }))
  next.materials = next.materials.map((item) => ({ ...item, source: item.source ?? 'standard' }))
  next.schemaVersion = 15
  const normalized = normalizeV15(next)
  addAudit(normalized, 'migrate', 'database', 'schema-v15', 'system', 'schemaVersion:1->15', 'migration')
  return normalized
}

function normalizeV15(candidate: Partial<AppDatabase> & Record<string, any>): AppDatabase {
  const seed = createSeedDatabase(region)
  const normalized = { ...seed, ...candidate, schemaVersion: 15 } as AppDatabase
  normalized.session = { accountId: candidate.session?.accountId ?? null, guest: candidate.session?.guest ?? false }
  const candidateSettings = candidate.settings as Record<string, any> | undefined
  const candidateLocale = candidateSettings?.locale
  normalized.settings = {
    locale: isSupportedLocale(candidateLocale) ? candidateLocale : seed.settings.locale,
    unitSystem: candidateSettings?.unitSystem ?? seed.settings.unitSystem,
    region: candidateSettings?.region ?? seed.settings.region,
    autoFirmware: candidateSettings?.autoFirmware ?? seed.settings.autoFirmware,
    waypointStorage: candidateSettings?.waypointStorage ?? seed.settings.waypointStorage,
    chartPreferences: normalizeChartPreferences(candidateSettings?.chartPreferences, seed.settings.chartPreferences),
    notifications: {
      device: candidateSettings?.notifications?.device ?? seed.settings.notifications.device,
      ota: candidateSettings?.notifications?.ota ?? seed.settings.notifications.ota,
      service: candidateSettings?.notifications?.service ?? seed.settings.notifications.service,
      sync: candidateSettings?.notifications?.sync ?? seed.settings.notifications.sync,
      product: candidateSettings?.notifications?.product ?? seed.settings.notifications.product,
    },
    agreements: Array.isArray(candidateSettings?.agreements) ? candidateSettings!.agreements : [],
    permissions: {
      bluetooth: candidateSettings?.permissions?.bluetooth ?? seed.settings.permissions.bluetooth,
      location: candidateSettings?.permissions?.location ?? seed.settings.permissions.location,
      camera: candidateSettings?.permissions?.camera ?? seed.settings.permissions.camera,
      notifications: candidateSettings?.permissions?.notifications ?? seed.settings.permissions.notifications,
    },
  }
  for (const key of Object.keys(seed) as Array<keyof AppDatabase>) {
    if (Array.isArray(seed[key]) && !Array.isArray(normalized[key])) (normalized as any)[key] = clone(seed[key])
  }
  normalized.accounts = normalized.accounts.map((item) => {
    const employee = item.role === 'dealerStaff'
      ? normalized.employees.find((entry) => entry.dealerId === item.dealerId && entry.phone === item.phone)
      : undefined
    const roleCapabilities = employee?.capabilities ?? item.capabilities ?? []
    return {
      ...item,
      password: legacyDefaultPasswords.has(item.password) ? '123456' : item.password,
      active: item.active ?? true,
      verified: item.verified ?? true,
      failedAttempts: item.failedAttempts ?? 0,
      providerLinks: item.providerLinks ?? {},
      capabilities: item.role === 'dealerAdmin' || item.role === 'dealerStaff'
        ? [...new Set([...roleCapabilities, 'device.control', 'device.bind', 'map.edit', 'support.create'])]
        : item.capabilities,
    }
  })
  normalized.dealers = normalized.dealers.map((item) => ({ ...item, defaultWarrantyYears: Number(item.defaultWarrantyYears || 2) }))
  for (const requiredId of ['dealer-03']) {
    if (!normalized.dealers.some((item) => item.id === requiredId)) {
      const required = seed.dealers.find((item) => item.id === requiredId)
      if (required) normalized.dealers.push(clone(required))
    }
  }
  normalized.devices = normalized.devices.map((item) => ({
    ...item,
    bindingId: item.bindingId || `binding-${item.id}-legacy`,
  }))
  normalized.deviceModels = normalized.deviceModels.map((item) => ({
    ...item,
    supportsHelmSettings: item.supportsHelmSettings ?? seed.deviceModels.find((seedItem) => seedItem.model === item.model)?.supportsHelmSettings ?? false,
    specifications: Array.isArray(item.specifications) && item.specifications.length ? item.specifications : seed.deviceModels.find((seedItem) => seedItem.model === item.model)?.specifications ?? ['标准型'],
    rodLengths: Array.isArray(item.rodLengths) ? item.rodLengths : seed.deviceModels.find((seedItem) => seedItem.model === item.model)?.rodLengths ?? [],
    stock: Math.max(0, Number(item.stock ?? seed.deviceModels.find((seedItem) => seedItem.model === item.model)?.stock ?? 0)),
    dealerPrice: Math.max(0, Number(item.dealerPrice ?? seed.deviceModels.find((seedItem) => seedItem.model === item.model)?.dealerPrice ?? 0)),
    currency: item.currency === 'USD' ? 'USD' : 'CNY',
  }))
  normalized.deviceRegistrations = normalized.deviceRegistrations.map((item) => ({
    ...item,
    specification: item.specification || normalized.deviceModels.find((model) => model.model === item.model)?.specifications[0] || '标准型',
    lastKnownRegion: item.lastKnownRegion || item.salesRegion,
  }))
  normalized.devices = normalized.devices.map((item: any) => ({
    ...item,
    specification: item.specification || normalized.deviceRegistrations.find((entry) => entry.serialNumber === item.serialNumber)?.specification || normalized.deviceModels.find((model) => model.model === item.model)?.specifications[0] || '标准型',
    salesRegion: item.salesRegion ?? item.location?.label ?? '福建省厦门市',
    activationStatus: item.activationStatus ?? 'active',
    bluetoothConnected: item.bluetoothConnected ?? false,
    connectionState: item.connectionState ?? (item.bluetoothConnected ? 'connected' : 'disconnected'),
    firmware: !item.firmware || item.firmware === '待获取' || item.firmware === 'Pending' ? defaultFirmwareForModel(item.model) : item.firmware,
    guestVisible: item.guestVisible ?? item.publicDemo ?? false,
    identity: { ...createDefaultDeviceIdentity(item.serialNumber), ...(item.identity ?? {}) },
    settings: normalizeDeviceSettings(item.settings, item.telemetry?.heading),
    controlState: normalizeControlState(item.controlState, Number(item.settings?.power ?? 45)),
  }))
  for (const device of normalized.devices) {
    if (normalized.deviceRegistrations.some((item) => item.serialNumber === device.serialNumber)) continue
    normalized.deviceRegistrations.push({
      id: `registration-${device.id}-legacy`,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      serialNumber: device.serialNumber,
      model: device.model,
      specification: device.specification,
      category: device.category,
      categoryEn: device.categoryEn,
      salesRegion: device.salesRegion,
      lastKnownRegion: isAdministrativeRegion(device.location?.label) ? device.location!.label : device.salesRegion,
      projectId: device.projectId,
      boundOwnerId: device.ownerId,
      dealerId: device.dealerId || '',
      status: device.ownerId ? 'bound' : 'available',
    })
  }
  normalized.projects = normalized.projects.map((item) => {
    const linkedDevice = normalized.devices.find((device) => device.projectId === item.id && device.model === item.deviceModel)
      || normalized.devices.find((device) => device.projectId === item.id)
    const linkedRegistration = normalized.deviceRegistrations.find((entry) => entry.serialNumber === item.serialNumber)
    const serialNumber = String(item.serialNumber || '').startsWith('SHIP-') && linkedDevice ? linkedDevice.serialNumber : item.serialNumber
    const deviceModel = String(item.serialNumber || '').startsWith('SHIP-') && linkedDevice ? linkedDevice.model : item.deviceModel
    const regionValue = item.region === '福建厦门' ? '福建省厦门市' : item.region === '福建福州' ? '福建省福州市' : item.region
    const deviceType = item.deviceType || linkedRegistration?.category || linkedDevice?.category || normalized.deviceModels.find((model) => model.model === deviceModel)?.category || ''
    const factoryRegion = item.factoryRegion || linkedRegistration?.salesRegion || linkedDevice?.salesRegion || regionValue
    const crossRegionRequired = item.crossRegionRequired ?? normalizeRegion(regionValue) !== normalizeRegion(factoryRegion)
    const crossRegionStatus = item.crossRegionStatus || (crossRegionRequired ? 'pending' : 'notRequired')
    const linkedActivatedAt = normalized.devices.filter((device) => device.projectId === item.id && device.activatedAt).map((device) => String(device.activatedAt)).sort()[0]
    const createdAt = linkedActivatedAt && item.createdAt > linkedActivatedAt ? new Date(new Date(linkedActivatedAt).getTime() - 30 * 60 * 1000).toISOString() : item.createdAt
    const status = crossRegionRequired && crossRegionStatus === 'pending' && item.status === 'installing' ? 'pendingApproval' : item.status
    const deviceSpecification = item.deviceSpecification || linkedRegistration?.specification || linkedDevice?.specification || normalized.deviceModels.find((model) => model.model === deviceModel)?.specifications[0] || '标准型'
    return { ...item, serialNumber, deviceType, deviceModel, deviceSpecification, region: regionValue, factoryRegion, crossRegionRequired, crossRegionStatus, status, createdAt, attachmentIds: Array.isArray(item.attachmentIds) ? item.attachmentIds : [], installedMaterials: Array.isArray(item.installedMaterials) ? item.installedMaterials : [], warrantyHistory: Array.isArray(item.warrantyHistory) ? item.warrantyHistory : [] }
  })
  normalized.deviceRegistrations = normalized.deviceRegistrations.map((registration) => {
    const linkedProject = registration.projectId ? normalized.projects.find((project) => project.id === registration.projectId) : undefined
    if (!linkedProject || linkedProject.serialNumber === registration.serialNumber) return registration
    let matchingProject = normalized.projects.find((project) => project.serialNumber === registration.serialNumber)
    if (!matchingProject) {
      const seededProject = seed.projects.find((project) => project.serialNumber === registration.serialNumber)
      if (seededProject) {
        matchingProject = { ...seededProject, attachmentIds: [...(seededProject.attachmentIds || [])], installedMaterials: [...(seededProject.installedMaterials || [])] }
        normalized.projects.push(matchingProject)
      }
    }
    return matchingProject ? { ...registration, projectId: matchingProject.id } : registration
  })
  normalized.verificationSessions = normalized.verificationSessions.map((item) => ({ ...item, attempts: item.attempts ?? 0, maxAttempts: item.maxAttempts ?? 5 }))
  normalized.waypoints = normalized.waypoints.map((item) => ({
    ...item,
    storageTarget: item.storageTarget ?? (item.source === 'cloud' || item.syncStatus === 'pending' ? 'server' : 'local'),
  }))
  normalized.routes = normalized.routes.map((item) => ({
    ...item,
    syncStatus: item.syncStatus ?? 'synced',
    syncAttempts: item.syncAttempts ?? 0,
  }))
  normalized.attachments = normalized.attachments.map((item) => ({ ...item, size: item.size ?? 0, mimeType: item.mimeType ?? (item.kind === 'video' ? 'video/mp4' : item.kind === 'image' ? 'image/jpeg' : 'application/octet-stream'), persisted: item.persisted ?? true }))
  normalized.platformApprovals = normalized.platformApprovals.map((item) => {
    const isInstallationReview = item.entity === 'installationTransfer'
    return {
      ...item,
      source: item.source ?? 'demo-exception',
      reviewEtaAt: item.reviewEtaAt ?? (isInstallationReview ? plusHoursIso(item.createdAt, 48) : undefined),
      temporaryOperationUntil: item.temporaryOperationUntil ?? (isInstallationReview ? plusHoursIso(item.createdAt, 48) : undefined),
    }
  })
  normalized.auditEvents = normalized.auditEvents.map((item) => ({ ...item, source: item.source ?? (item.action === 'migrate' ? 'migration' : 'local') }))
  normalized.exports = Array.isArray(candidate.exports) ? candidate.exports : []
  normalized.operationKeys = Array.isArray(candidate.operationKeys) ? candidate.operationKeys : []
  normalized.tickets = normalized.tickets.map((item) => {
    const linkedDevice = item.deviceId ? normalized.devices.find((device) => device.id === item.deviceId) : undefined
    const replacementLines = Array.isArray(item.replacementLines) && item.replacementLines.length
      ? item.replacementLines.map((line, index) => ({
        id: line.id || `replacement-${item.id}-${index + 1}`,
        originalCatalogId: line.originalCatalogId,
        replacementCatalogId: line.replacementCatalogId,
        quantity: Math.max(1, Number(line.quantity || 1)),
      }))
      : item.originalMaterialId && item.replacementMaterialId
        ? [{ id: `replacement-${item.id}-legacy`, originalCatalogId: item.originalMaterialId, replacementCatalogId: item.replacementMaterialId, quantity: Math.max(1, Number(item.replacementQuantity || 1)) }]
        : []
    const chargeLines = Array.isArray(item.chargeLines) && item.chargeLines.length
      ? item.chargeLines.map((line, index) => ({ ...line, id: line.id || `charge-${item.id}-${index + 1}`, amount: Number(line.amount || 0) }))
      : Number(item.serviceCharge || 0) > 0
        ? [{ id: `charge-${item.id}-legacy`, type: 'labor' as const, label: '历史服务费', amount: Number(item.serviceCharge || 0) }]
        : []
    return {
      ...item,
      deviceBindingId: item.deviceBindingId || linkedDevice?.bindingId,
      customerVisible: item.customerVisible ?? true,
      escalationStatus: item.escalationStatus ?? 'none',
      replacementRequired: item.replacementRequired ?? false,
      replacementLines,
      replacementMaterialRequestIds: Array.isArray(item.replacementMaterialRequestIds)
        ? item.replacementMaterialRequestIds
        : item.replacementMaterialRequestId ? [item.replacementMaterialRequestId] : [],
      chargeLines,
      serviceCharge: chargeLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    }
  })
  normalized.materialCatalog = normalized.materialCatalog.map((item) => {
    const seedItem = seed.materialCatalog.find((entry) => entry.id === item.id || entry.sku === item.sku)
    return {
      ...item,
      compatibleDeviceTypes: Array.isArray(item.compatibleDeviceTypes) ? item.compatibleDeviceTypes : seedItem?.compatibleDeviceTypes ?? [],
      compatibleDeviceModels: Array.isArray(item.compatibleDeviceModels) ? item.compatibleDeviceModels : seedItem?.compatibleDeviceModels ?? [],
    }
  })
  normalized.materials = normalized.materials.map((item) => {
    const legacyCatalog = item.catalogId ? normalized.materialCatalog.find((entry) => entry.id === item.catalogId) : undefined
    const items: MaterialRequestLine[] = Array.isArray(item.items) && item.items.length
      ? item.items.map((line, index) => {
        const catalog = normalized.materialCatalog.find((entry) => entry.id === line.catalogId)
        return {
          id: line.id || `material-line-${item.id}-${index + 1}`,
          catalogId: line.catalogId,
          originalCatalogId: line.originalCatalogId,
          name: line.name || catalog?.name || item.name,
          nameEn: line.nameEn || catalog?.nameEn || item.nameEn,
          sku: line.sku || catalog?.sku || '',
          quantity: Math.max(1, Number(line.quantity || 1)),
        }
      })
      : legacyCatalog
        ? [{ id: `material-line-${item.id}-legacy`, catalogId: legacyCatalog.id, name: legacyCatalog.name, nameEn: legacyCatalog.nameEn, sku: legacyCatalog.sku, quantity: Math.max(1, Number(item.quantity || 1)) }]
        : []
    return {
      ...item,
      source: item.source ?? 'standard',
      items,
      catalogId: items.length === 1 ? items[0].catalogId : undefined,
      quantity: items.reduce((sum, line) => sum + line.quantity, 0) || Math.max(1, Number(item.quantity || 1)),
      name: items.length > 1 ? `${items.length} 种物料` : items[0]?.name || item.name,
      nameEn: items.length > 1 ? `${items.length} parts` : items[0]?.nameEn || item.nameEn,
    }
  })
  normalized.faqDocuments = normalized.faqDocuments.map((item) => ({
    ...item,
    deviceCategories: Array.isArray(item.deviceCategories) ? item.deviceCategories : [],
    deviceModels: Array.isArray(item.deviceModels) ? item.deviceModels : [],
    revision: item.revision || item.updatedAt.slice(0, 10),
  }))
  for (const requiredId of ['ticket-03', 'ticket-04']) {
    if (!normalized.tickets.some((item) => item.id === requiredId)) {
      const required = seed.tickets.find((item) => item.id === requiredId)
      if (required) normalized.tickets.push(clone(required))
    }
  }
  normalized.shipments = normalized.shipments.map((item) => {
    const request = item.materialRequestId ? normalized.materials.find((entry) => entry.id === item.materialRequestId) : undefined
    const lines = request?.items?.length ? request.items : []
    return {
      ...item,
      items: Array.isArray(item.items) && item.items.length ? item.items : lines.map((line, index) => ({ id: `ship-line-${item.id}-${index + 1}`, catalogId: line.catalogId, name: line.name, sku: line.sku, quantity: line.quantity })),
      dispatchAttachmentIds: Array.isArray(item.dispatchAttachmentIds) ? item.dispatchAttachmentIds : [],
      events: [...item.events].sort((a, b) => a.at.localeCompare(b.at)),
    }
  })
  normalized.purchases = normalized.purchases.map((item, index) => {
    const legacyCatalog = item.catalogId ? normalized.materialCatalog.find((entry) => entry.id === item.catalogId) : undefined
    const items: PurchaseLine[] = Array.isArray(item.items) && item.items.length
      ? item.items.map((line, lineIndex) => ({
        ...line,
        id: line.id || `purchase-line-${item.id}-${lineIndex + 1}`,
        quantity: Math.max(1, Number(line.quantity || 1)),
        unitPrice: Number(line.unitPrice || 0),
        amount: Number(line.amount ?? Number(line.unitPrice || 0) * Number(line.quantity || 1)),
        currency: line.currency || legacyCatalog?.currency || 'CNY',
        itemType: line.itemType === 'device' ? 'device' : 'material',
        deviceModel: line.deviceModel,
        specification: line.specification,
      }))
      : legacyCatalog && Number(item.quantity || 0) > 0
        ? [{
          id: `purchase-line-${item.id}-legacy`, catalogId: legacyCatalog.id, name: legacyCatalog.name, nameEn: legacyCatalog.nameEn,
          sku: legacyCatalog.sku, quantity: Number(item.quantity), unitPrice: Number(item.amount || 0) / Number(item.quantity),
          amount: Number(item.amount || 0), currency: legacyCatalog.currency,
          itemType: 'material' as const,
        }]
        : []
    const amount = items.reduce((sum, line) => sum + line.amount, 0)
    const verifiedPayments = normalized.payments.filter((payment) => payment.orderNo === item.orderNo && ['verified', 'paid'].includes(payment.status))
    const paidAmount = Math.min(amount, Number(item.paidAmount ?? verifiedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)))
    const remainingAmount = Math.max(0, Number(item.remainingAmount ?? amount - paidAmount))
    const itemTypes = new Set(items.map((line) => line.itemType))
    return {
      ...item,
      orderNo: item.orderNo ?? `PO-LEGACY-${String(index + 1).padStart(4, '0')}`,
      catalogId: items.length === 1 ? items[0].catalogId : undefined,
      quantity: items.reduce((sum, line) => sum + line.quantity, 0),
      amount,
      items,
      purchaseType: item.purchaseType || (itemTypes.size > 1 ? 'mixed' : itemTypes.has('device') ? 'devices' : 'materials'),
      paidAmount,
      remainingAmount,
      paymentCount: Number(item.paymentCount ?? verifiedPayments.length),
      status: item.status === 'pendingPayment' ? 'pendingApproval' : item.status,
      paymentStatus: item.status === 'paid' ? 'paid' : item.status === 'refunded' ? 'refunded' : item.paymentStatus || 'notCreated',
      settlementMode: item.settlementMode || (items[0]?.currency === 'USD' ? 'offlineFx' : 'onlinePending'),
      history: Array.isArray(item.history) && item.history.length ? item.history : [{ id: `purchase-history-${item.id}-migration`, status: item.status === 'paid' ? 'paid' : 'pendingApproval', label: item.status === 'paid' ? '历史采购记录已保留' : '旧采购已迁移至待审批', at: item.updatedAt, operator: '系统' }],
    }
  })
  normalized.payments = normalized.payments.map((item) => ({
    ...item,
    method: item.method === 'scanQr' ? 'scanQr' : item.status === 'pending' ? undefined : 'scanQr',
    status: item.status === 'paid' ? 'verified' : item.status,
    submittedAt: item.submittedAt || (item.status === 'paid' ? item.updatedAt : undefined),
    verifiedAt: item.verifiedAt || (item.status === 'paid' ? item.updatedAt : undefined),
    purchaseId: item.purchaseId || normalized.purchases.find((purchase) => purchase.orderNo === item.orderNo)?.id,
    installmentNumber: Math.max(1, Number(item.installmentNumber || 1)),
    paymentNo: item.paymentNo || `${item.orderNo}-P${String(Math.max(1, Number(item.installmentNumber || 1))).padStart(2, '0')}`,
  }))
  normalized.orders = normalized.orders.map((item) => {
    const legacyStatus = String(item.status)
    const status = legacyStatus === 'paid' ? 'financeConfirmed' : legacyStatus === 'refunded' ? 'cancelled' : item.status
    return {
      ...item,
      status,
      history: Array.isArray(item.history) && item.history.length ? item.history : [{ id: `order-history-${item.id}-migration`, status, label: legacyStatus === 'paid' ? '财务确认回款' : legacyStatus === 'refunded' ? '订单已取消' : '订单完成', at: item.updatedAt, operator: '系统' }],
    }
  })
  return normalized
}

function migrate(candidate: unknown): AppDatabase {
  if (!candidate || typeof candidate !== 'object') return createSeedDatabase(region)
  const value = candidate as { schemaVersion?: number }
  if (value.schemaVersion === 15) return normalizeV15(candidate as Partial<AppDatabase> & Record<string, any>)
  if (value.schemaVersion === 14 || value.schemaVersion === 13 || value.schemaVersion === 12 || value.schemaVersion === 11 || value.schemaVersion === 10 || value.schemaVersion === 9 || value.schemaVersion === 8 || value.schemaVersion === 7 || value.schemaVersion === 6 || value.schemaVersion === 5 || value.schemaVersion === 4 || value.schemaVersion === 3 || value.schemaVersion === 2) {
    const migrated = normalizeV15(candidate as Partial<AppDatabase> & Record<string, any>)
    addAudit(migrated, 'migrate', 'database', 'schema-v15', 'system', `schemaVersion:${value.schemaVersion}->15`, 'migration')
    return migrated
  }
  if (value.schemaVersion === 1) return migrateV1(candidate as Record<string, unknown>)
  return createSeedDatabase(region)
}

function read(): AppDatabase {
  const db = migrate(storage.get<unknown>(DB_KEY))
  storage.set(DB_KEY, clone(db))
  return clone(db)
}

function write(db: AppDatabase) {
  storage.set(DB_KEY, clone(db))
}

export interface LocalRepository<T extends BaseEntity> {
  list(query?: Query): Promise<PageResult<T>>
  get(id: string): Promise<T | null>
  create(input: Omit<T, keyof BaseEntity> & Partial<BaseEntity>): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T>
  remove(id: string): Promise<void>
}

class DatabaseRepository<T extends BaseEntity> implements LocalRepository<T> {
  constructor(private collection: EntityCollection, private context?: AccessContext) {}

  private authorize(action: 'list' | 'get' | 'create' | 'update' | 'remove') {
    if (this.context) authorizationService.assertCollection(this.context, this.collection, action)
  }

  private visible(items: T[]) {
    return this.context ? items.filter((item) => authorizationService.isItemVisible(this.context!, this.collection, item as unknown as Record<string, unknown>)) : items
  }

  async list(query: Query = {}): Promise<PageResult<T>> {
    this.authorize('list')
    await delay(35)
    const db = read()
    let items = this.visible(clone(db[this.collection] as unknown as T[]))
    if (query.search) {
      const search = query.search.trim().toLocaleLowerCase()
      items = items.filter((item) => JSON.stringify(item).toLocaleLowerCase().includes(search))
    }
    if (query.status) items = items.filter((item) => String((item as T & { status?: string; syncStatus?: string }).status || (item as T & { syncStatus?: string }).syncStatus) === query.status)
    if (query.category) items = items.filter((item) => String((item as T & { category?: string }).category) === query.category)
    if (query.dealerId) items = items.filter((item) => (item as T & { dealerId?: string }).dealerId === query.dealerId)
    if (query.ownerId) items = items.filter((item) => (item as T & { ownerId?: string }).ownerId === query.ownerId)
    items.sort((a, b) => query.sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, query.pageSize ?? 100)
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }
  }

  async get(id: string): Promise<T | null> {
    this.authorize('get')
    await delay(25)
    const item = clone((read()[this.collection] as unknown as T[]).find((entry) => entry.id === id) ?? null)
    if (item && this.context) authorizationService.assertItem(this.context, this.collection, item as unknown as Record<string, unknown>)
    return item
  }

  async create(input: Omit<T, keyof BaseEntity> & Partial<BaseEntity>): Promise<T> {
    this.authorize('create')
    await delay(45)
    const db = read()
    const timestamp = new Date().toISOString()
    const scoped = { ...input } as Record<string, unknown>
    if (this.context?.role === 'user' && ['waypoints', 'routes', 'tickets'].includes(this.collection)) scoped.ownerId = this.context.accountId
    if (this.context && ['dealerAdmin', 'dealerStaff'].includes(this.context.role) && !scoped.dealerId) scoped.dealerId = this.context.dealerId
    const entity = { ...scoped, id: input.id || makeId(this.collection.slice(0, 5)), createdAt: timestamp, updatedAt: timestamp } as unknown as T
    ;(db[this.collection] as unknown as T[]).unshift(entity)
    addAudit(db, 'create', this.collection, entity.id, this.context?.accountId || 'system')
    write(db)
    return clone(entity)
  }

  async update(id: string, patch: Partial<T>): Promise<T> {
    this.authorize('update')
    await delay(45)
    const db = read()
    const items = db[this.collection] as unknown as T[]
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('ENTITY_NOT_FOUND')
    if (this.context) authorizationService.assertItem(this.context, this.collection, items[index] as unknown as Record<string, unknown>)
    items[index] = { ...items[index], ...patch, id, updatedAt: new Date().toISOString() }
    addAudit(db, 'update', this.collection, id, this.context?.accountId || 'system')
    write(db)
    return clone(items[index])
  }

  async remove(id: string): Promise<void> {
    this.authorize('remove')
    await delay(45)
    const db = read()
    const items = db[this.collection] as unknown as T[]
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) throw new Error('ENTITY_NOT_FOUND')
    if (this.context) authorizationService.assertItem(this.context, this.collection, items[index] as unknown as Record<string, unknown>)
    items.splice(index, 1)
    addAudit(db, 'remove', this.collection, id, this.context?.accountId || 'system')
    write(db)
  }
}

export const databaseService = {
  async initialize() {
    await delay(20)
    return clone(read())
  },
  snapshot() {
    return clone(read())
  },
  transact<T>(mutator: (db: AppDatabase) => T, audit?: { action: string; entity: string; entityId: string; operator?: string; detail?: string; source?: AppDatabase['auditEvents'][number]['source']; operationId?: string }) {
    const db = read()
    const result = mutator(db)
    if (audit) addAudit(db, audit.action, audit.entity, audit.entityId, audit.operator, audit.detail, audit.source, audit.operationId)
    write(db)
    return clone(result)
  },
  transactOnce<T>(operationId: string, mutator: (db: AppDatabase) => T, audit: { action: string; entity: string; entityId: string; operator?: string; detail?: string; source?: AppDatabase['auditEvents'][number]['source'] }) {
    const db = read()
    if (db.operationKeys.includes(operationId)) throw new Error('DUPLICATE_OPERATION')
    const result = mutator(db)
    db.operationKeys.push(operationId)
    addAudit(db, audit.action, audit.entity, audit.entityId, audit.operator, audit.detail, audit.source, operationId)
    write(db)
    return clone(result)
  },
  async reset() {
    const db = createSeedDatabase(region)
    write(db)
    await delay(80)
    return clone(db)
  },
  async setSession(accountId: string | null, guest = false) {
    const db = read()
    db.session = { accountId, guest }
    write(db)
    return clone(db)
  },
  async updateSettings(patch: Partial<AppDatabase['settings']>) {
    const db = read()
    db.settings = { ...db.settings, ...patch }
    write(db)
    return clone(db)
  },
  async updateAccount(accountId: string, patch: Partial<Account>) {
    const db = read()
    const account = db.accounts.find((item) => item.id === accountId)
    if (!account) throw new Error('ACCOUNT_NOT_FOUND')
    Object.assign(account, patch, { id: accountId, updatedAt: new Date().toISOString() })
    addAudit(db, 'update', 'accounts', accountId, accountId)
    write(db)
    return clone(account)
  },
  async clearGeneratedCache(accountId: string) {
    const db = read()
    const usedAttachments = new Set(db.tickets.flatMap((item) => item.attachmentIds))
    db.exports = db.exports.filter((item) => item.ownerId !== accountId)
    db.attachments = db.attachments.filter((item) => item.ownerId !== accountId || usedAttachments.has(item.id) || item.entityId === accountId)
    addAudit(db, 'cache-clear', 'localCache', accountId, accountId, 'generated exports and unused attachments removed')
    write(db)
    return clone(db)
  },
  repository<T extends BaseEntity>(collection: EntityCollection, context?: AccessContext): LocalRepository<T> {
    return new DatabaseRepository<T>(collection, context)
  },
}
