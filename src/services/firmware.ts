import { authorizationService } from './authorization'
import { databaseService, makeId } from './database'
import { integrationAvailability, integrationReason, isLocalDemoCapability } from './adapters'
import { storage } from './storage'
import type { AccessContext, FirmwareJob } from '@/types/models'

function isNewerVersion(candidate: string, current: string) {
  const next = candidate.split('.').map(Number)
  const installed = current.split('.').map(Number)
  if (next.some((part) => !Number.isInteger(part)) || installed.some((part) => !Number.isInteger(part))) return false
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] || 0) !== (installed[index] || 0)) return (next[index] || 0) > (installed[index] || 0)
  }
  return false
}

export const firmwareService = {
  deferReminder(deviceId: string, accountId: string) {
    storage.set(`shark-sister-ota-reminder-${accountId}-${deviceId}`, true)
  },

  takeReminder(deviceId: string, accountId: string) {
    const key = `shark-sister-ota-reminder-${accountId}-${deviceId}`
    if (!storage.get<boolean>(key)) return false
    storage.remove(key)
    return true
  },

  latestVersion(deviceId: string) {
    const device = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!device) throw new Error('ENTITY_NOT_FOUND')
    return { current: device.firmware, latest: '3.3.0', available: isNewerVersion('3.3.0', device.firmware), supported: !device.category.includes('驱动器') }
  },

  eligibility(deviceId: string) {
    const device = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!device) throw new Error('ENTITY_NOT_FOUND')
    const version = this.latestVersion(deviceId)
    const connected = device.connectionState === 'connected' && device.bluetoothConnected
    const batteryPercent = device.telemetry.voltage >= 100 ? 100 : Math.max(0, Math.min(100, Math.round(device.telemetry.voltage / 0.52)))
    const reasons: string[] = []
    if (!connected) reasons.push('DEVICE_NOT_CONNECTED')
    if (batteryPercent < 30) reasons.push('BATTERY_TOO_LOW')
    if (!version.supported) reasons.push('FIRMWARE_NOT_SUPPORTED')
    if (!version.available) reasons.push('NO_FIRMWARE_UPDATE')
    return { ...version, connected, batteryPercent, eligible: reasons.length === 0, reasons }
  },

  async start(deviceId: string, context: AccessContext) {
    if (!integrationAvailability.ota.ready) throw new Error(`INTEGRATION_NOT_CONFIGURED:ota:${integrationReason('ota')}`)
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    const device = databaseService.snapshot().devices.find((item) => item.id === deviceId)
    if (!device) throw new Error('ENTITY_NOT_FOUND')
    authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
    const eligibility = this.eligibility(deviceId)
    if (!eligibility.eligible) throw new Error(`FIRMWARE_PRECHECK_FAILED:${eligibility.reasons.join(',')}`)
    const timestamp = new Date().toISOString()
    const job: FirmwareJob = { id: makeId('firmware'), createdAt: timestamp, updatedAt: timestamp, deviceId, fromVersion: device.firmware, toVersion: '3.3.0', stage: 'checking', progress: 0 }
    return databaseService.transact((db) => { db.firmwareJobs.unshift(job); return job }, { action: 'firmware-start', entity: 'firmwareJobs', entityId: job.id, operator: context.accountId || 'guest', detail: isLocalDemoCapability('ota') ? 'local-demo-firmware-job' : 'production-firmware-job', source: isLocalDemoCapability('ota') ? 'local' : 'integration' })
  },

  async update(jobId: string, stage: FirmwareJob['stage'], progress: number, context: AccessContext, errorCode?: string) {
    if (!authorizationService.can(context, 'device.control')) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const job = db.firmwareJobs.find((item) => item.id === jobId)
      if (!job) throw new Error('ENTITY_NOT_FOUND')
      const targetDevice = db.devices.find((item) => item.id === job.deviceId)
      if (!targetDevice) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'devices', targetDevice as unknown as Record<string, unknown>)
      job.stage = stage
      job.progress = Math.max(0, Math.min(100, progress))
      job.errorCode = errorCode
      job.updatedAt = new Date().toISOString()
      if (stage === 'completed') {
        targetDevice.firmware = job.toVersion
        targetDevice.bluetoothConnected = true
        targetDevice.connectionState = 'connected'
        targetDevice.updatedAt = new Date().toISOString()
      }
      return job
    }, { action: `firmware-${stage}`, entity: 'firmwareJobs', entityId: jobId, operator: context.accountId || 'guest', detail: errorCode || (isLocalDemoCapability('ota') ? 'local-demo-firmware-stage' : ''), source: isLocalDemoCapability('ota') ? 'local' : 'integration' })
  },
}
