import type { DeviceControlState, DeviceIdentity, DeviceSettings } from '@/types/models'

export const createDefaultDeviceIdentity = (serialNumber: string): DeviceIdentity => {
  const serial = String(serialNumber || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const suffix = serial.slice(-8).padStart(8, '0')
  return {
    communicationId: `COMM-${suffix}`,
    chipId: `CHIP-${suffix}`,
    mainboardSerial: `PCB-${serial.slice(0, 4)}-${suffix}`,
    componentSerials: {},
  }
}

const firmwareByModel: Record<string, string> = {
  'DL-3000': '3.2.1',
  'DL-3500': '3.2.1',
  'SW-2000': '2.8.4',
  'BT-5000': '1.9.0',
  'BT-6000': '2.0.1',
  'NET-100': '4.0.2',
  'IC-1500': '2.1.8',
}

export const defaultFirmwareForModel = (model: string) => firmwareByModel[model] || '1.0.0'

export const createDefaultDeviceSettings = (): DeviceSettings => ({
  power: 45,
  bowHeadingReferenceDeg: null,
  anchorDriftAlertDistanceMeters: 10,
  linkedRole: 'standalone',
  linkedRolePendingRestart: false,
  magnetometerCalibrationStatus: 'idle',
  crawlDistanceMeters: 10,
  limitSwitchBypassEnabled: false,
  arrivalProtectionEnabled: true,
})

export const createDefaultDeviceControlState = (): DeviceControlState => ({
  powerOn: false,
  power: 45,
  direction: 'stop',
  lift: 'stop',
  liftPosition: 'middle',
  propellerOn: false,
  activeMode: 'manual',
  anchorEstablished: false,
  anchorOffsetForwardMeters: 0,
  anchorOffsetStarboardMeters: 0,
  controlPaused: false,
  steeringAngleDeg: 0,
  steeringLimit: 'none',
})
