import { authorizationService } from './authorization'
import { databaseService, makeId } from './database'
import { bluetoothAdapter, integrationAvailability, integrationReason, isLocalDemoCapability } from './adapters'
import { createDefaultDeviceControlState, createDefaultDeviceIdentity, createDefaultDeviceSettings, defaultFirmwareForModel } from '@/config/deviceDefaults'
import type { AccessContext, AppDatabase, Device, DeviceCommand, DeviceIdentity, DeviceModelCatalogItem, DeviceRegistration, DeviceSettings, Project } from '@/types/models'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const crawlDistanceOptions = new Set([6, 10, 15, 20, 30])

export type BindingCheck =
  | { status: 'ready'; registration: DeviceRegistration }
  | { status: 'bound'; registration: DeviceRegistration }
  | { status: 'regionMismatch'; registration: DeviceRegistration; currentRegion: string }
  | { status: 'projectMissing'; serialNumber: string; registration?: DeviceRegistration }

function regionApproved(db: AppDatabase, registration: DeviceRegistration, region: string) {
  const project = db.projects.find((item) => item.id === registration.projectId)
  if (project?.serialNumber === registration.serialNumber && project.crossRegionStatus === 'approved' && project.region === region) return true
  return db.platformApprovals.some((item) => item.entity === 'deviceActivation' && item.serialNumber === registration.serialNumber && item.targetRegion === region && item.status === 'approved')
}

export function normalizeDeviceSerial(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function isDeviceSerialLike(value: string) {
  return /^[A-Z]{2,4}\d{6,20}$/.test(normalizeDeviceSerial(value))
}

export function generateDeviceSerial(prefix = 'DL') {
  const normalizedPrefix = prefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
  const safePrefix = /^[A-Z]{2,4}$/.test(normalizedPrefix) ? normalizedPrefix : 'DL'
  const timestamp = Date.now().toString().slice(-10)
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${safePrefix}${timestamp}${random}`
}

function createRegistration(serialNumber: string, currentRegion: string, context: AccessContext) {
  if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
  const timestamp = new Date().toISOString()
  const dealerId = context.dealerId || databaseService.snapshot().dealers.find((item) => item.region.includes('厦门'))?.id || 'dealer-01'
  const projectId = makeId('project')
  return databaseService.transact((db) => {
    const account = db.accounts.find((item) => item.id === context.accountId)
    const existingDevice = db.devices.find((item) => item.serialNumber === serialNumber)
    const project: Project = {
      id: projectId, createdAt: timestamp, updatedAt: timestamp, name: `设备安装项目 ${serialNumber.slice(-4)}`, nameEn: `Device Installation ${serialNumber.slice(-4)}`,
      vessel: `SEA-${serialNumber.slice(-4)}`, serialNumber, customer: account?.displayName || '设备用户', ownerName: account?.displayName || '设备用户',
      deviceType: existingDevice?.category || '顶流机/制冰机', deviceModel: existingDevice?.model || 'DL-3500', deviceSpecification: existingDevice?.specification || '标准型', rodLength: '3.0m', region: currentRegion,
      factoryRegion: existingDevice?.salesRegion || currentRegion, crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: account?.phone || '13800002861', email: account?.email,
      dealerId, installedMaterials: [], status: 'installing',
    }
    const registration: DeviceRegistration = {
      id: makeId('registration'), createdAt: timestamp, updatedAt: timestamp, serialNumber, model: existingDevice?.model || 'DL-3500', specification: existingDevice?.specification || '标准型',
      category: existingDevice?.category || '顶流机/制冰机', categoryEn: existingDevice?.categoryEn || 'Surface jet / ice maker', salesRegion: existingDevice?.salesRegion || currentRegion,
      projectId: existingDevice?.projectId || projectId, boundOwnerId: existingDevice?.ownerId, dealerId: existingDevice?.dealerId || dealerId, lastKnownRegion: existingDevice?.location.label || currentRegion,
      status: existingDevice?.activationStatus === 'active' ? 'bound' : 'available',
    }
    if (!existingDevice?.projectId) db.projects.unshift(project)
    db.deviceRegistrations.unshift(registration)
    return registration
  }, { action: 'registration-create', entity: 'deviceRegistrations', entityId: serialNumber, operator: context.accountId, detail: currentRegion, source: 'local' })
}

export const deviceBindingService = {
  prepareRegistration(serialNumber: string, currentRegion: string, context: AccessContext) {
    const normalized = normalizeDeviceSerial(serialNumber)
    if (!isDeviceSerialLike(normalized)) throw new Error('INVALID_DEVICE_SERIAL')
    const existing = databaseService.snapshot().deviceRegistrations.find((item) => item.serialNumber === normalized)
    return existing || createRegistration(normalized, currentRegion, context)
  },

  ensureLocalDemoRegistration(currentRegion: string, context: AccessContext) {
    const existing = databaseService.snapshot().deviceRegistrations.find((item) => item.status === 'available' && !item.boundOwnerId && item.projectId && item.salesRegion === currentRegion)
    if (existing) return existing
    return createRegistration(`DL${Date.now()}`, currentRegion, context)
  },

  async check(serialNumber: string, currentRegion: string): Promise<BindingCheck> {
    await new Promise((resolve) => setTimeout(resolve, 260))
    const normalized = normalizeDeviceSerial(serialNumber)
    const registration = databaseService.snapshot().deviceRegistrations.find((item) => item.serialNumber === normalized)
    if (!registration || !registration.projectId) return { status: 'projectMissing', serialNumber: normalized, registration }
    if (registration.status === 'bound' || registration.boundOwnerId) return { status: 'bound', registration }
    if (registration.salesRegion !== currentRegion && !regionApproved(databaseService.snapshot(), registration, currentRegion)) return { status: 'regionMismatch', registration, currentRegion }
    return { status: 'ready', registration }
  },

  async requestRegionReview(serialNumber: string, currentRegion: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    if (context.role === 'user' && !authorizationService.can(context, 'device.bind')) throw new Error('FORBIDDEN')
    const normalized = normalizeDeviceSerial(serialNumber)
    const accountId = context.accountId
    return databaseService.transact((db) => {
      const registration = db.deviceRegistrations.find((item) => item.serialNumber === normalized)
      if (!registration) throw new Error('DEVICE_NOT_REGISTERED')
      if (registration.status === 'bound' || registration.boundOwnerId) throw new Error('DEVICE_ALREADY_BOUND')
      if (!registration.projectId) throw new Error('PROJECT_REQUIRED')
      if (registration.salesRegion === currentRegion) throw new Error('REGION_REVIEW_NOT_REQUIRED')
      if (regionApproved(db, registration, currentRegion)) throw new Error('REGION_REVIEW_NOT_REQUIRED')
      const project = db.projects.find((item) => item.id === registration.projectId)
      if (!project) throw new Error('PROJECT_REQUIRED')
      const existing = db.platformApprovals.find((item) => item.entity === 'deviceActivation' && item.serialNumber === normalized && item.targetRegion === currentRegion && item.status === 'pending')
      if (existing) return existing

      const timestamp = new Date().toISOString()
      const reviewEtaAt = new Date(Date.parse(timestamp) + 48 * 60 * 60 * 1000).toISOString()
      const approval = {
        id: makeId('platform-approval'), createdAt: timestamp, updatedAt: timestamp,
        entity: 'deviceActivation' as const, entityId: normalized, requestedBy: accountId,
        dealerId: registration.dealerId, serialNumber: normalized, originRegion: registration.salesRegion,
        targetRegion: currentRegion, status: 'pending' as const, reviewEtaAt,
        temporaryOperationUntil: reviewEtaAt, source: 'integration' as const,
      }
      db.platformApprovals.unshift(approval)
      db.messages.unshift({
        id: makeId('message'), createdAt: timestamp, updatedAt: timestamp,
        title: '跨区激活已提交审核', titleEn: 'Cross-region activation submitted for review',
        body: `${normalized} · ${registration.salesRegion} → ${currentRegion} · 预计 48 小时内完成审核`,
        type: 'approval', accountId, dealerId: registration.dealerId, read: false,
      })
      return approval
    }, {
      action: 'device-activation-region-review-request', entity: 'platformApprovals', entityId: normalized,
      operator: accountId, detail: `${registrationRegion(serialNumber)}->${currentRegion}`, source: 'integration',
    })
  },

  async activate(serialNumber: string, context: AccessContext, currentRegion?: string) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    if (context.role === 'user' && !authorizationService.can(context, 'device.bind')) throw new Error('FORBIDDEN')
    const normalized = normalizeDeviceSerial(serialNumber)
    return databaseService.transact((db) => {
      const registration = db.deviceRegistrations.find((item) => item.serialNumber === normalized)
      if (!registration) throw new Error('DEVICE_NOT_REGISTERED')
      if (registration.status === 'bound') throw new Error('DEVICE_ALREADY_BOUND')
      if (!registration.projectId) throw new Error('PROJECT_REQUIRED')
      const timestamp = new Date().toISOString()
      const activatedRegion = currentRegion || registration.lastKnownRegion || registration.salesRegion
      if (registration.salesRegion !== activatedRegion && !regionApproved(db, registration, activatedRegion)) throw new Error('REGION_REVIEW_REQUIRED')
      const existingDevices = db.devices.filter((item) => item.serialNumber === normalized)
      const reusable = existingDevices
        .filter((item) => item.activationStatus === 'unbound' || !item.ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

      if (reusable) {
        reusable.bindingId = makeId('binding')
        reusable.ownerId = context.role === 'user' ? context.accountId || undefined : reusable.ownerId
        reusable.dealerId = registration.dealerId
        reusable.projectId = registration.projectId || reusable.projectId
        reusable.salesRegion = registration.salesRegion
        reusable.activationStatus = 'active'
        reusable.activatedAt = timestamp
        reusable.status = 'online'
        reusable.specification = registration.specification || reusable.specification || '标准型'
        reusable.connectionState = 'connected'
        if (!reusable.firmware || reusable.firmware === '待获取' || reusable.firmware === 'Pending') reusable.firmware = defaultFirmwareForModel(reusable.model)
        reusable.bluetoothConnected = true
        reusable.controllerConnected = true
        reusable.telemetry = {
          ...reusable.telemetry,
          gpsSignal: Math.max(82, Number(reusable.telemetry.gpsSignal || 0)),
          heading: reusable.telemetry.heading ?? 130,
          targetHeading: reusable.telemetry.targetHeading ?? 90,
          offsetDistance: reusable.telemetry.offsetDistance ?? 0.2,
          controllerBattery: reusable.telemetry.controllerBattery ?? 100,
        }
        reusable.controlState = { ...createDefaultDeviceControlState(), power: reusable.settings.power }
        reusable.updatedAt = timestamp
        registration.status = 'bound'
        registration.boundOwnerId = context.accountId || undefined
        registration.lastKnownRegion = activatedRegion
        registration.updatedAt = timestamp
        return reusable
      }

      const index = db.devices.length + 1
      const device: Device = {
        id: makeId('dev'), createdAt: timestamp, updatedAt: timestamp, name: `${registration.category.split('/')[0]}-${String(index).padStart(2, '0')}`,
        nameEn: `${registration.categoryEn.split('/')[0]}-${String(index).padStart(2, '0')}`, category: registration.category, categoryEn: registration.categoryEn,
        model: registration.model, specification: registration.specification || '标准型', serialNumber: registration.serialNumber, status: 'offline', ownerId: context.role === 'user' ? context.accountId || undefined : undefined, bindingId: makeId('binding'),
        dealerId: registration.dealerId, projectId: registration.projectId || undefined, firmware: defaultFirmwareForModel(registration.model), salesRegion: registration.salesRegion,
        activationStatus: 'active', activatedAt: timestamp, connectionState: 'connected', bluetoothConnected: true, controllerConnected: true,
        location: { lat: 24.4852, lng: 118.0921, label: activatedRegion, labelEn: activatedRegion },
        telemetry: { voltage: 220, current: 0, power: 0, temperature: 22, runtime: 0, output: 0, gpsSignal: 82, heading: 130, targetHeading: 90, offsetDistance: 0.2, controllerBattery: 100 },
        identity: createDefaultDeviceIdentity(registration.serialNumber),
        settings: createDefaultDeviceSettings(),
        controlState: createDefaultDeviceControlState(), lastOnline: timestamp,
      }
      db.devices.unshift(device)
      registration.status = 'bound'
      registration.boundOwnerId = context.accountId || undefined
      registration.lastKnownRegion = activatedRegion
      registration.updatedAt = timestamp
      return device
    }, { action: 'activate', entity: 'devices', entityId: normalized, operator: context.accountId, detail: 'binding-activated;historical-service-records-retained-and-owner-scoped' })
  },
}

function registrationRegion(serialNumber: string) {
  const normalized = normalizeDeviceSerial(serialNumber)
  return databaseService.snapshot().deviceRegistrations.find((item) => item.serialNumber === normalized)?.salesRegion || 'unknown'
}

export const deviceService = {
  resolveIdentity(identifier: string) {
    const normalized = identifier.trim().toUpperCase()
    return databaseService.snapshot().devices.find((item) => {
      const identity = item.identity
      return item.serialNumber.toUpperCase() === normalized
        || identity?.communicationId.toUpperCase() === normalized
        || identity?.chipId.toUpperCase() === normalized
        || identity?.mainboardSerial.toUpperCase() === normalized
        || Object.values(identity?.componentSerials || {}).some((value) => value.toUpperCase() === normalized)
    })
  },

  async saveIdentity(deviceId: string, identity: DeviceIdentity, context: AccessContext) {
    requireIdentityFields(identity)
    if (!authorizationService.can(context, 'support.manage')) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      const identifiers = [identity.communicationId, identity.chipId, identity.mainboardSerial, ...Object.values(identity.componentSerials)].map((value) => value.trim().toUpperCase())
      const duplicate = db.devices.some((item) => item.id !== deviceId && item.identity && [item.identity.communicationId, item.identity.chipId, item.identity.mainboardSerial, ...Object.values(item.identity.componentSerials)].some((value) => identifiers.includes(value.trim().toUpperCase())))
      if (duplicate) throw new Error('DEVICE_IDENTITY_DUPLICATE')
      device.identity = { ...identity, componentSerials: { ...identity.componentSerials } }
      device.updatedAt = new Date().toISOString()
      return device
    }, { action: 'identity-save', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
  },

  supportsHelmSettings(device: Device | undefined, models: DeviceModelCatalogItem[] = []) {
    if (!device) return false
    return models.find((item) => item.model === device.model)?.supportsHelmSettings ?? false
  },

  controlProfile(device: Device | undefined) {
    if (!device) return { power: false, direction: false, lift: false, propeller: false }
    if (device.category.includes('电池')) return { power: false, direction: false, lift: false, propeller: false }
    if (device.category.includes('淡化')) return { power: true, direction: false, lift: false, propeller: false }
    return { power: true, direction: true, lift: true, propeller: true }
  },

  async sendCommand(deviceId: string, command: string, payload: DeviceCommand['payload'], context: AccessContext) {
    if (!integrationAvailability.deviceControl.ready) throw new Error(`INTEGRATION_NOT_CONFIGURED:deviceControl:${integrationReason('deviceControl')}`)
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    const snapshot = databaseService.snapshot()
    const target = snapshot.devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    authorizationService.assertItem(context, 'devices', target as unknown as Record<string, unknown>)
    if (target.connectionState !== 'connected' || !target.bluetoothConnected) throw new Error('DEVICE_NOT_CONNECTED')
    if (target.settings.magnetometerCalibrationStatus === 'calibrating' && command !== 'helm-magnetometer-calibrate') throw new Error('MAGNETOMETER_CALIBRATING')
    const timestamp = new Date().toISOString()
    const pending: DeviceCommand = databaseService.transact((db) => {
      const item: DeviceCommand = { id: makeId('command'), createdAt: timestamp, updatedAt: timestamp, deviceId, accountId: context.accountId || 'guest', command, payload, status: 'sent' }
      db.deviceCommands.unshift(item)
      return item
    }, { action: `${command}-sent`, entity: 'deviceCommands', entityId: deviceId, operator: context.accountId || 'guest', detail: 'command-sent-awaiting-device-readback', source: isLocalDemoCapability('deviceControl') ? 'local' : 'integration' })
    let adapterStatus: DeviceCommand['status']
    try {
      adapterStatus = await bluetoothAdapter.send(deviceId, command, payload)
    } catch (error) {
      databaseService.transact((db) => {
        const item = db.deviceCommands.find((entry) => entry.id === pending.id)
        if (item) { item.status = 'failed'; item.updatedAt = new Date().toISOString() }
      }, { action: `${command}-failed`, entity: 'deviceCommands', entityId: deviceId, operator: context.accountId || 'guest', detail: 'adapter-failed-before-device-readback', source: isLocalDemoCapability('deviceControl') ? 'local' : 'integration' })
      throw error
    }
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      if (device.connectionState !== 'connected' || !device.bluetoothConnected) throw new Error('DEVICE_NOT_CONNECTED')
      const status: DeviceCommand['status'] = adapterStatus
      const item = db.deviceCommands.find((entry) => entry.id === pending.id)
      if (!item) throw new Error('ENTITY_NOT_FOUND')
      item.status = status
      item.updatedAt = new Date().toISOString()
      if (status === 'acknowledged') {
        if (typeof payload.power === 'number') device.settings.power = payload.power
        if (typeof payload.powerOn === 'boolean') device.controlState.powerOn = payload.powerOn
        if (typeof payload.power === 'number') device.controlState.power = payload.power
        if (typeof payload.direction === 'string' && ['forward', 'reverse', 'left', 'right', 'stop'].includes(payload.direction)) device.controlState.direction = payload.direction as Device['controlState']['direction']
        if (typeof payload.lift === 'string' && ['up', 'down', 'stop'].includes(payload.lift)) device.controlState.lift = payload.lift as Device['controlState']['lift']
        if (typeof payload.propellerOn === 'boolean') device.controlState.propellerOn = payload.propellerOn
        if (typeof payload.activeMode === 'string' && ['manual', 'anchor', 'drift', 'crawl', 'side-thrust', 'heading-lock', 'playback'].includes(payload.activeMode)) device.controlState.activeMode = payload.activeMode as Device['controlState']['activeMode']
        if (typeof payload.targetWaypointId === 'string') device.controlState.targetWaypointId = payload.targetWaypointId || undefined
        if (typeof payload.liftPosition === 'string' && ['top', 'movingUp', 'middle', 'movingDown', 'bottom', 'fault'].includes(payload.liftPosition)) device.controlState.liftPosition = payload.liftPosition as Device['controlState']['liftPosition']
        if (typeof payload.anchorEstablished === 'boolean') device.controlState.anchorEstablished = payload.anchorEstablished
        if (typeof payload.anchorOffsetForwardMeters === 'number') device.controlState.anchorOffsetForwardMeters = payload.anchorOffsetForwardMeters
        if (typeof payload.anchorOffsetStarboardMeters === 'number') device.controlState.anchorOffsetStarboardMeters = payload.anchorOffsetStarboardMeters
        if (typeof payload.controlPaused === 'boolean') device.controlState.controlPaused = payload.controlPaused
        if (typeof payload.steeringAngleDeg === 'number') device.controlState.steeringAngleDeg = Math.max(-130, Math.min(130, payload.steeringAngleDeg))
        if (typeof payload.steeringLimit === 'string' && ['none', 'left', 'right'].includes(payload.steeringLimit)) device.controlState.steeringLimit = payload.steeringLimit as Device['controlState']['steeringLimit']
        if (typeof payload.heading === 'number') device.telemetry.heading = ((payload.heading % 360) + 360) % 360
        if (typeof payload.targetHeading === 'number') device.telemetry.targetHeading = ((payload.targetHeading % 360) + 360) % 360
        if (typeof payload.offsetDistance === 'number') device.telemetry.offsetDistance = Math.max(0, payload.offsetDistance)
        device.updatedAt = timestamp
      }
      return item
    }, { action: command, entity: 'deviceCommands', entityId: deviceId, operator: context.accountId || 'guest', detail: isLocalDemoCapability('deviceControl') ? 'local-demo-device-command' : 'production-device-command', source: isLocalDemoCapability('deviceControl') ? 'local' : 'integration' })
  },

  async setWorkMode(deviceId: string, mode: Device['controlState']['activeMode'], context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    if (mode === 'anchor' && (!Number.isFinite(target.telemetry.gpsSignal) || Number(target.telemetry.gpsSignal) <= 0)) throw new Error('GPS_UNAVAILABLE')
    if (mode === 'anchor' && target.settings.arrivalProtectionEnabled && target.controlState.liftPosition !== 'bottom') throw new Error('LIFT_NOT_AT_BOTTOM')
    if (mode === 'crawl' && !target.controlState.anchorEstablished) throw new Error('ANCHOR_REQUIRED')
    const payload: DeviceCommand['payload'] = { activeMode: mode, targetWaypointId: '', controlPaused: false, powerOn: false, propellerOn: false, power: 0, direction: 'stop' }
    if (mode === 'anchor') Object.assign(payload, { anchorEstablished: true, anchorOffsetForwardMeters: 0, anchorOffsetStarboardMeters: 0, offsetDistance: 0 })
    return this.sendCommand(deviceId, `helm-mode-${mode}`, payload, context)
  },

  async navigateToWaypoint(deviceId: string, waypointId: string, context: AccessContext) {
    const snapshot = databaseService.snapshot()
    const target = snapshot.devices.find((item) => item.id === deviceId)
    const waypoint = snapshot.waypoints.find((item) => item.id === waypointId && item.deviceId === deviceId && item.ownerId === context.accountId)
    if (!target || !waypoint) throw new Error('WAYPOINT_NOT_FOUND')
    if (!Number.isFinite(target.telemetry.gpsSignal) || Number(target.telemetry.gpsSignal) <= 0) throw new Error('GPS_UNAVAILABLE')
    return this.sendCommand(deviceId, 'helm-waypoint-navigation', {
      activeMode: 'playback', targetWaypointId: waypoint.id,
      targetLatitude: waypoint.lat, targetLongitude: waypoint.lng,
      controlPaused: false, powerOn: false, propellerOn: false, power: 0, direction: 'stop',
    }, context)
  },

  async changeGear(deviceId: string, step: -1 | 1, context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    if (['anchor', 'side-thrust', 'playback'].includes(target.controlState.activeMode)) throw new Error('CONTROL_UNAVAILABLE_IN_MODE')
    const currentGear = target.controlState.propellerOn && target.controlState.powerOn ? Math.round(target.controlState.power / 10) : 0
    const gear = Math.max(0, Math.min(10, currentGear + step))
    if (gear === currentGear) return target
    const running = gear > 0
    return this.sendCommand(deviceId, step > 0 ? 'helm-gear-up' : 'helm-gear-down', {
      power: gear * 10,
      powerOn: running,
      propellerOn: running,
      direction: running ? (target.controlState.direction === 'stop' ? 'forward' : target.controlState.direction) : 'stop',
    }, context)
  },

  async directionalControl(deviceId: string, direction: 'up' | 'down' | 'left' | 'right', context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    const mode = target.controlState.activeMode
    if (direction === 'up' || direction === 'down') {
      if (mode === 'anchor') {
        const next = target.controlState.anchorOffsetForwardMeters + (direction === 'up' ? 1 : -1)
        return this.sendCommand(deviceId, `helm-anchor-${direction}`, { anchorOffsetForwardMeters: next, offsetDistance: Math.hypot(next, target.controlState.anchorOffsetStarboardMeters) }, context)
      }
      if (mode === 'side-thrust') throw new Error('CONTROL_UNAVAILABLE_IN_MODE')
      if (mode === 'playback') throw new Error('CONTROL_UNAVAILABLE_IN_MODE')
      return this.changeGear(deviceId, direction === 'up' ? 1 : -1, context)
    }
    if (mode === 'playback') throw new Error('CONTROL_UNAVAILABLE_IN_MODE')
    if (mode === 'anchor') {
      const next = target.controlState.anchorOffsetStarboardMeters + (direction === 'right' ? 1 : -1)
      return this.sendCommand(deviceId, `helm-anchor-${direction}`, { anchorOffsetStarboardMeters: next, offsetDistance: Math.hypot(target.controlState.anchorOffsetForwardMeters, next) }, context)
    }
    if (mode === 'drift' || mode === 'heading-lock') {
      const next = (target.telemetry.targetHeading ?? target.telemetry.heading ?? 0) + (direction === 'right' ? 1 : -1)
      return this.sendCommand(deviceId, `helm-heading-${direction}`, { targetHeading: next }, context)
    }
    if (mode === 'side-thrust') return this.sendCommand(deviceId, `helm-${mode}-${direction}`, { direction }, context)
    const steeringAngleDeg = Math.max(-130, Math.min(130, target.controlState.steeringAngleDeg + (direction === 'right' ? 10 : -10)))
    const steeringLimit = steeringAngleDeg <= -130 ? 'left' : steeringAngleDeg >= 130 ? 'right' : 'none'
    return this.sendCommand(deviceId, `helm-${mode}-${direction}`, {
      direction,
      steeringAngleDeg,
      steeringLimit,
    }, context)
  },

  async stopSideThrust(deviceId: string, context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target || target.controlState.activeMode !== 'side-thrust' || !['left', 'right'].includes(target.controlState.direction)) return target
    return this.sendCommand(deviceId, 'helm-side-thrust-stop', { direction: 'stop' }, context)
  },

  async togglePrimaryAction(deviceId: string, context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    if (['anchor', 'crawl', 'playback'].includes(target.controlState.activeMode)) {
      return this.sendCommand(deviceId, `helm-${target.controlState.activeMode}-${target.controlState.controlPaused ? 'resume' : 'pause'}`, { controlPaused: !target.controlState.controlPaused }, context)
    }
    const running = !target.controlState.propellerOn
    return this.sendCommand(deviceId, running ? 'helm-propeller-start' : 'helm-propeller-stop', {
      propellerOn: running,
      powerOn: running,
      power: running ? Math.max(10, target.controlState.power) : 0,
      direction: running ? (target.controlState.direction === 'stop' ? 'forward' : target.controlState.direction) : 'stop',
    }, context)
  },

  async moveLift(deviceId: string, lift: 'up' | 'down', context: AccessContext) {
    const target = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!target) throw new Error('ENTITY_NOT_FOUND')
    const previous = { lift: target.controlState.lift, liftPosition: target.controlState.liftPosition }
    const moving = lift === 'up' ? 'movingUp' : 'movingDown'
    const final = lift === 'up' ? 'top' : 'bottom'
    try {
      await this.sendCommand(deviceId, `helm-shaft-${lift}`, { lift, liftPosition: moving }, context)
      await wait(620)
      return databaseService.transact((db) => {
        const device = db.devices.find((item) => item.id === deviceId)
        if (!device) throw new Error('ENTITY_NOT_FOUND')
        device.controlState.lift = 'stop'
        device.controlState.liftPosition = final
        device.updatedAt = new Date().toISOString()
        return device
      }, { action: `helm-shaft-${lift}-readback`, entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest', detail: final })
    } catch (error) {
      databaseService.transact((db) => {
        const device = db.devices.find((item) => item.id === deviceId)
        if (device) Object.assign(device.controlState, previous)
      }, { action: `helm-shaft-${lift}-failed`, entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest', detail: 'restored-previous-position' })
      throw error
    }
  },

  setBowHeadingReference(deviceId: string, context: AccessContext) {
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      if (!Number.isFinite(device.telemetry.heading)) throw new Error('HEADING_UNAVAILABLE')
      device.settings.bowHeadingReferenceDeg = Number(device.telemetry.heading)
      device.settings.bowHeadingCalibratedAt = new Date().toISOString()
      device.updatedAt = device.settings.bowHeadingCalibratedAt
      return device
    }, { action: 'bow-heading-reference-set', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
  },

  async calibrateMagnetometer(deviceId: string, context: AccessContext) {
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      device.settings.magnetometerCalibrationStatus = 'calibrating'
      device.updatedAt = new Date().toISOString()
    }, { action: 'magnetometer-calibration-start', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
    try {
      await this.sendCommand(deviceId, 'helm-magnetometer-calibrate', {}, context)
      await wait(620)
      return databaseService.transact((db) => {
        const device = db.devices.find((item) => item.id === deviceId)
        if (!device) throw new Error('ENTITY_NOT_FOUND')
        device.settings.magnetometerCalibrationStatus = 'succeeded'
        device.settings.magnetometerCalibratedAt = new Date().toISOString()
        device.updatedAt = device.settings.magnetometerCalibratedAt
        return device
      }, { action: 'magnetometer-calibration-succeeded', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
    } catch (error) {
      databaseService.transact((db) => {
        const device = db.devices.find((item) => item.id === deviceId)
        if (device) { device.settings.magnetometerCalibrationStatus = 'failed'; device.updatedAt = new Date().toISOString() }
      }, { action: 'magnetometer-calibration-failed', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
      throw error
    }
  },

  async saveSettings(deviceId: string, settings: Partial<DeviceSettings>, context: AccessContext) {
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    if (settings.anchorDriftAlertDistanceMeters !== undefined && (!Number.isInteger(settings.anchorDriftAlertDistanceMeters) || settings.anchorDriftAlertDistanceMeters < 1 || settings.anchorDriftAlertDistanceMeters > 999)) throw new Error('INVALID_ANCHOR_DRIFT_DISTANCE')
    if (settings.crawlDistanceMeters !== undefined && !crawlDistanceOptions.has(settings.crawlDistanceMeters)) throw new Error('INVALID_CRAWL_DISTANCE')
    if (settings.linkedRole !== undefined && !['standalone', 'primary', 'secondary'].includes(settings.linkedRole)) throw new Error('INVALID_LINKED_ROLE')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      const linkedRoleChanged = settings.linkedRole !== undefined && settings.linkedRole !== device.settings.linkedRole
      device.settings = { ...device.settings, ...settings, linkedRolePendingRestart: linkedRoleChanged || device.settings.linkedRolePendingRestart }
      device.updatedAt = new Date().toISOString()
      return device
    }, { action: 'settings-save', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
  },

  async setConnection(deviceId: string, connection: 'bluetooth', connected: boolean, context: AccessContext) {
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      device.connectionState = connected ? 'connecting' : 'disconnected'
      if (!connected) device.bluetoothConnected = false
      device.updatedAt = new Date().toISOString()
      return device
    }, { action: connected ? 'bluetooth-connecting' : 'bluetooth-disconnect', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest' })
    if (connected) {
      try {
        if (!await bluetoothAdapter.requestPermission()) throw new Error('BLUETOOTH_PERMISSION_DENIED')
        if (!await bluetoothAdapter.connect(deviceId)) throw new Error('BLUETOOTH_CONNECT_FAILED')
      } catch (error) {
        databaseService.transact((db) => {
          const device = db.devices.find((item) => item.id === deviceId)
          if (!device) throw new Error('ENTITY_NOT_FOUND')
          device.connectionState = 'failed'
          device.bluetoothConnected = false
          device.updatedAt = new Date().toISOString()
          return device
        }, { action: 'bluetooth-failed', entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest', detail: error instanceof Error ? error.message : 'BLUETOOTH_CONNECT_FAILED' })
        throw error
      }
    }
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      device.bluetoothConnected = connected
      device.connectionState = connected ? 'connected' : 'disconnected'
      if (connected && isLocalDemoCapability('bluetooth')) {
        device.status = 'online'
        device.lastOnline = new Date().toISOString()
      }
      device.updatedAt = new Date().toISOString()
      return device
    }, { action: `${connection}-${connected ? 'connect' : 'disconnect'}`, entity: 'devices', entityId: deviceId, operator: context.accountId || 'guest', detail: isLocalDemoCapability('bluetooth') ? 'local-demo-connection' : 'production-connection', source: isLocalDemoCapability('bluetooth') ? 'local' : 'integration' })
  },

  async unbind(deviceId: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      for (const ticket of db.tickets) {
        if (ticket.deviceId === device.id) {
          ticket.customerVisible = false
          ticket.updatedAt = new Date().toISOString()
        }
      }
      delete device.ownerId
      device.activationStatus = 'unbound'
      device.bluetoothConnected = false
      device.connectionState = 'disconnected'
      device.updatedAt = new Date().toISOString()
      const registration = db.deviceRegistrations.find((item) => item.serialNumber === device.serialNumber)
      if (registration) {
        registration.status = 'available'
        delete registration.boundOwnerId
        registration.updatedAt = device.updatedAt
      } else {
        db.deviceRegistrations.push({
          id: makeId('registration'),
          createdAt: device.updatedAt,
          updatedAt: device.updatedAt,
          serialNumber: device.serialNumber,
          model: device.model,
          specification: device.specification,
          category: device.category,
          categoryEn: device.categoryEn,
          salesRegion: device.salesRegion,
          lastKnownRegion: device.location.label || device.salesRegion,
          projectId: device.projectId,
          dealerId: device.dealerId || context.dealerId || 'dealer-01',
          status: 'available',
        })
      }
      return device
    }, { action: 'unbind', entity: 'devices', entityId: deviceId, operator: context.accountId })
  },

  async replaceMainboard(deviceId: string, newBoardSerial: string, newFirmware: string, context: AccessContext, note = '') {
    if (!authorizationService.can(context, 'support.manage')) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === deviceId)
      if (!device) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
      const previous = db.mainboardReplacements.filter((item) => item.deviceId === deviceId).at(-1)?.newBoardSerial || `${device.serialNumber}-PCB`
      const timestamp = new Date().toISOString()
      const replacement = { id: makeId('board'), createdAt: timestamp, updatedAt: timestamp, deviceId, previousBoardSerial: previous, newBoardSerial, previousFirmware: device.firmware, newFirmware, inheritedRuntime: device.telemetry.runtime, operatorId: context.accountId || 'system', note }
      db.mainboardReplacements.push(replacement)
      device.firmware = newFirmware
      device.updatedAt = timestamp
      return replacement
    }, { action: 'mainboard-replace', entity: 'devices', entityId: deviceId, operator: context.accountId || 'system', detail: newBoardSerial })
  },
}

function requireIdentityFields(identity: DeviceIdentity) {
  if (!identity.communicationId.trim() || !identity.chipId.trim() || !identity.mainboardSerial.trim()) throw new Error('DEVICE_IDENTITY_REQUIRED')
}
