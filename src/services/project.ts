import { authorizationService } from './authorization'
import { databaseService, makeId } from './database'
import { isDeviceSerialLike, normalizeDeviceSerial } from './device'
import type { AccessContext, DeviceRegistration, Project } from '@/types/models'

type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'installedMaterials' | 'warrantyHistory'> & Partial<Pick<Project, 'installedMaterials' | 'warrantyHistory'>>

function validateInDatabase(db: ReturnType<typeof databaseService.snapshot>, serialNumber: string, model: string, projectId: string | undefined, context: AccessContext, deviceType?: string, specification?: string) {
  const registration = db.deviceRegistrations.find((item) => item.serialNumber === serialNumber)
  const device = db.devices.find((item) => item.serialNumber === serialNumber)
  if (!registration && !device) throw new Error('DEVICE_SERIAL_NOT_FOUND')
  if ((registration?.model || device?.model) !== model) throw new Error('DEVICE_MODEL_MISMATCH')
  if (deviceType && (registration?.category || device?.category) !== deviceType) throw new Error('DEVICE_TYPE_MISMATCH')
  if (specification && (registration?.specification || device?.specification) !== specification) throw new Error('DEVICE_SPECIFICATION_MISMATCH')
  if (registration && !context.dealerScopeIds.includes(registration.dealerId)) throw new Error('FORBIDDEN')
  if (device?.dealerId && !context.dealerScopeIds.includes(device.dealerId)) throw new Error('FORBIDDEN')
  if (db.projects.some((item) => item.id !== projectId && item.serialNumber === serialNumber)) throw new Error('DEVICE_ALREADY_ASSIGNED')
  return { registration, device }
}

function normalizeRegion(value: string) {
  return value.replace(/[省市区县\s]/g, '')
}

function regionCovered(region: string, salesRegion: string) {
  const normalizedRegion = normalizeRegion(region)
  const normalizedSalesRegion = normalizeRegion(salesRegion)
  return Boolean(normalizedRegion && normalizedSalesRegion && (normalizedRegion.startsWith(normalizedSalesRegion) || normalizedSalesRegion.startsWith(normalizedRegion)))
}

function addWarrantyYears(value: string, years: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  date.setFullYear(date.getFullYear() + Math.max(1, years))
  return date.toISOString().slice(0, 10)
}

export const projectService = {
  registerDeviceForProject(serialNumber: string, model: string, salesRegion: string, context: AccessContext, specification?: string) {
    if (!authorizationService.can(context, 'project.manage')) throw new Error('FORBIDDEN')
    const normalized = normalizeDeviceSerial(serialNumber)
    if (!isDeviceSerialLike(normalized)) throw new Error('INVALID_DEVICE_SERIAL')
    const snapshot = databaseService.snapshot()
    const existingRegistration = snapshot.deviceRegistrations.find((item) => item.serialNumber === normalized)
    const existingDevice = snapshot.devices.find((item) => item.serialNumber === normalized)
    if (existingRegistration || existingDevice) return existingRegistration || existingDevice
    const catalog = snapshot.deviceModels.find((item) => item.model === model)
    if (!catalog) throw new Error('DEVICE_MODEL_MISMATCH')
    const dealerId = context.dealerId || context.dealerScopeIds[0]
    if (!dealerId) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const now = new Date().toISOString()
      const registration: DeviceRegistration = {
        id: makeId('registration'), createdAt: now, updatedAt: now, serialNumber: normalized, model,
        category: catalog.category, categoryEn: catalog.categoryEn, specification: specification || catalog.specifications[0] || model,
        salesRegion, lastKnownRegion: salesRegion, dealerId, status: 'available',
      }
      db.deviceRegistrations.unshift(registration)
      return registration
    }, { action: 'project-device-register', entity: 'deviceRegistrations', entityId: normalized, operator: context.accountId || 'system', detail: model, source: 'local' })
  },

  validateDevice(serialNumber: string, model: string, projectId: string | undefined, context: AccessContext, deviceType?: string, specification?: string) {
    if (!authorizationService.can(context, 'project.manage')) throw new Error('FORBIDDEN')
    return validateInDatabase(databaseService.snapshot(), serialNumber, model, projectId, context, deviceType, specification)
  },

  save(input: ProjectInput, projectId: string | undefined, context: AccessContext) {
    if (!authorizationService.can(context, 'project.manage')) throw new Error('FORBIDDEN')
    const now = new Date().toISOString()
    return databaseService.transact((db) => {
      const linked = validateInDatabase(db, input.serialNumber, input.deviceModel, projectId, context, input.deviceType, input.deviceSpecification)
      const deviceRegion = linked.registration?.lastKnownRegion || linked.device?.location?.label || linked.registration?.salesRegion || linked.device?.salesRegion
      const dealer = db.dealers.find((item) => item.id === input.dealerId)
      const dealerSalesRegion = dealer?.region || linked.registration?.salesRegion || linked.device?.salesRegion || ''
      const crossRegionRequired = Boolean(dealerSalesRegion && (!regionCovered(input.region, dealerSalesRegion) || Boolean(deviceRegion && !regionCovered(deviceRegion, dealerSalesRegion))))
      const warrantyBase = linked.device?.activatedAt || now
      const warrantyEnd = input.warrantyEnd || addWarrantyYears(warrantyBase, dealer?.defaultWarrantyYears || 2)
      const installedMaterials = input.installedMaterials || db.projects.find((item) => item.id === projectId)?.installedMaterials || []
      const existingProject = projectId ? db.projects.find((item) => item.id === projectId) : undefined
      const attachmentIds = [...new Set(input.attachmentIds || existingProject?.attachmentIds || [])]
      if (!existingProject && attachmentIds.length === 0) throw new Error('INSTALLATION_EVIDENCE_REQUIRED')
      const attachments = attachmentIds.map((id) => db.attachments.find((item) => item.id === id))
      if (attachments.some((item) => !item || item.ownerId !== context.accountId || !['image', 'video'].includes(item.kind))) throw new Error('INVALID_ATTACHMENT')
      const warrantyHistory = [...(input.warrantyHistory || existingProject?.warrantyHistory || [])]
      if (warrantyEnd && existingProject?.warrantyEnd !== warrantyEnd) warrantyHistory.push({ previousEnd: existingProject?.warrantyEnd, newEnd: warrantyEnd, changedAt: now, operatorId: context.accountId || 'system' })
      if (warrantyEnd && !existingProject && warrantyHistory.length === 0) warrantyHistory.push({ newEnd: warrantyEnd, changedAt: now, operatorId: context.accountId || 'system' })
      const normalizedInput: Omit<Project, 'id' | 'createdAt' | 'updatedAt'> = {
        ...input,
        attachmentIds,
        installedMaterials,
        warrantyHistory,
        warrantyEnd,
        factoryRegion: deviceRegion || input.factoryRegion || input.region,
        crossRegionRequired,
        crossRegionStatus: crossRegionRequired ? 'pending' : 'notRequired',
        status: crossRegionRequired ? 'pendingApproval' : input.status === 'pendingApproval' ? 'installing' : input.status,
      }
      let project = existingProject
      if (projectId && !project) throw new Error('ENTITY_NOT_FOUND')
      if (project && project.serialNumber !== input.serialNumber) {
        const previousRegistration = db.deviceRegistrations.find((item) => item.serialNumber === project?.serialNumber && item.projectId === projectId)
        const previousDevice = db.devices.find((item) => item.serialNumber === project?.serialNumber && item.projectId === projectId)
        if (previousRegistration) { previousRegistration.projectId = undefined; previousRegistration.updatedAt = now }
        if (previousDevice) { previousDevice.projectId = undefined; previousDevice.updatedAt = now }
      }
      if (project) Object.assign(project, normalizedInput, { id: projectId, updatedAt: now })
      else {
        project = { ...normalizedInput, id: makeId('project'), createdAt: now, updatedAt: now }
        db.projects.unshift(project)
      }
      for (const attachment of attachments) {
        if (!attachment) continue
        attachment.entity = 'projects'
        attachment.entityId = project.id
        attachment.persisted = true
        attachment.updatedAt = now
      }
      if (crossRegionRequired) {
        const previous = db.platformApprovals.find((item) => item.entity === 'installationTransfer' && item.entityId === project?.id && item.status === 'pending')
        if (!previous) db.platformApprovals.unshift({
          id: makeId('approval'), createdAt: now, updatedAt: now, entity: 'installationTransfer', entityId: project.id,
          requestedBy: context.accountId || 'system', dealerId: project.dealerId, serialNumber: project.serialNumber,
          originRegion: project.factoryRegion, targetRegion: project.region, status: 'pending', source: 'integration',
        })
      } else {
        if (linked.registration) { linked.registration.projectId = project.id; linked.registration.updatedAt = now }
        if (linked.device) { linked.device.projectId = project.id; linked.device.updatedAt = now }
      }
      return project
    }, { action: projectId ? 'project-update' : 'project-create', entity: 'projects', entityId: projectId || input.serialNumber, operator: context.accountId || 'system', detail: input.serialNumber, source: 'local' })
  },

  async linkDevice(projectId: string, serialNumber: string, model: string, context: AccessContext) {
    this.validateDevice(serialNumber, model, projectId, context)
    return databaseService.transact((db) => {
      const project = db.projects.find((item) => item.id === projectId)
      if (!project) throw new Error('ENTITY_NOT_FOUND')
      const registration = db.deviceRegistrations.find((item) => item.serialNumber === serialNumber)
      const device = db.devices.find((item) => item.serialNumber === serialNumber)
      if (registration) { registration.projectId = projectId; registration.updatedAt = new Date().toISOString() }
      if (device) { device.projectId = projectId; device.updatedAt = new Date().toISOString() }
      return project
    }, { action: 'project-device-link', entity: 'projects', entityId: projectId, operator: context.accountId || 'system', detail: serialNumber })
  },
}
