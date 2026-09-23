import type { AuthProvider, IntegrationCapability, LocaleCode, Region } from '@/types/models'

export interface IntegrationAvailability {
  ready: boolean
  reason?: string
  mode?: 'production' | 'local-demo' | 'unavailable'
}

export interface IntegrationAdapter {
  availability(): IntegrationAvailability
}

export interface AuthProviderResult {
  providerId: string
  identifier: string
  displayName: string
  displayNameEn: string
}

export interface AuthProviderAdapter extends IntegrationAdapter {
  authorize(provider: AuthProvider, region: Region): Promise<AuthProviderResult>
}

export interface MapAdapter extends IntegrationAdapter {
  readonly provider: 'local-offline'
  readonly supportsDrag: boolean
  readonly capabilities: { chartImport: boolean; measurement: boolean }
  moveCoordinate(lat: number, lng: number, deltaX: number, deltaY: number): Promise<{ lat: number; lng: number }>
  openLocation(location: { latitude: number; longitude: number; name: string; address?: string }): Promise<void>
}

export interface ScanAdapter extends IntegrationAdapter {
  scan(): Promise<string>
}

export interface BluetoothAdapter extends IntegrationAdapter {
  requestPermission(): Promise<boolean>
  scan(): Promise<Array<{ id: string; name: string; model: string; deviceType: string; deviceTypeEn: string; signal: number }>>
  connect(deviceId: string): Promise<boolean>
  send(deviceId: string, command: string, payload: Record<string, unknown>): Promise<'acknowledged' | 'timeout'>
}

export interface PaymentAdapter extends IntegrationAdapter {
  pay(orderNo: string, method: string, amount: number, currency: string): Promise<{ transactionId: string; status: 'paid' | 'failed'; demo?: boolean }>
}

export interface NotificationAdapter extends IntegrationAdapter {
  requestPermission(): Promise<'granted' | 'denied'>
  notify(title: string, body: string): Promise<void>
}

export interface UploadAsset {
  name: string
  localPath: string
  kind: 'image' | 'video' | 'file'
  size: number
  mimeType: string
  persisted: boolean
}

export interface UploadAdapter extends IntegrationAdapter {
  pick(kind: 'image' | 'video', remaining: number): Promise<UploadAsset[]>
  validate(asset: UploadAsset, options: { maxBytes: number; mimeTypes: string[] }): void
}

export const integrationAvailability: Record<IntegrationCapability, IntegrationAvailability> = {
  socialAuth: { ready: true, mode: 'local-demo', reason: '使用本机身份授权流程' },
  bluetooth: { ready: true, mode: 'local-demo', reason: '使用本机蓝牙设备列表与连接状态' },
  deviceTelemetry: { ready: true, mode: 'local-demo', reason: '使用本机保存的设备状态与遥测记录' },
  deviceControl: { ready: true, mode: 'local-demo', reason: '控制指令仅更新本机设备状态' },
  ota: { ready: true, mode: 'local-demo', reason: '固件升级流程与记录在本机完成' },
  payment: { ready: true, mode: 'local-demo', reason: '支付操作仅更新本机订单状态，不会产生真实扣款' },
  push: { ready: true, mode: 'local-demo', reason: '通知偏好与消息记录保存在本机' },
  cloudSync: { ready: true, mode: 'local-demo', reason: '上传状态在本机完成，不会发送到云端' },
}

export function isLocalDemoCapability(capability: IntegrationCapability) {
  return integrationAvailability[capability].mode === 'local-demo'
}

export const authProviderAdapter: AuthProviderAdapter = {
  availability: () => integrationAvailability.socialAuth,
  async authorize(provider, region) {
    await new Promise((resolve) => setTimeout(resolve, 420))
    const key = `${region}-${provider}`.toLocaleLowerCase()
    return {
      providerId: `local-demo-${key}`,
      identifier: provider === 'WeChat' ? `wx-${region.toLocaleLowerCase()}-user` : `${provider.toLocaleLowerCase()}.${region.toLocaleLowerCase()}@shark-sister.local`,
      displayName: `${provider} 用户`,
      displayNameEn: `${provider} User`,
    }
  },
}

export const mapAdapter: MapAdapter = {
  provider: 'local-offline',
  supportsDrag: true,
  capabilities: { chartImport: false, measurement: false },
  availability: () => ({ ready: true, mode: 'local-demo', reason: '使用本机离线地图预览' }),
  async moveCoordinate(lat, lng, deltaX, deltaY) {
    return { lat: Number((lat - deltaY * 0.00002).toFixed(6)), lng: Number((lng + deltaX * 0.00002).toFixed(6)) }
  },
  async openLocation() {
    await new Promise((resolve) => setTimeout(resolve, 280))
  },
}

export const scanAdapter: ScanAdapter = {
  availability: () => ({ ready: true, mode: 'local-demo', reason: '使用本机设备二维码结果' }),
  async scan() {
    await new Promise((resolve) => setTimeout(resolve, 420))
    return 'DL350020260810'
  },
}

export const bluetoothAdapter: BluetoothAdapter = {
  availability: () => integrationAvailability.bluetooth,
  async requestPermission() { await new Promise((resolve) => setTimeout(resolve, 260)); return true },
  async scan() {
    await new Promise((resolve) => setTimeout(resolve, 650))
    return [
      { id: 'DL350020260810', name: 'Shark DL-3500', model: 'DL-3500', deviceType: '顶流机/制冰机', deviceTypeEn: 'Surface jet / ice maker', signal: -38 },
      { id: 'DL350020260811', name: 'Shark DL-3500', model: 'DL-3500', deviceType: '顶流机/制冰机', deviceTypeEn: 'Surface jet / ice maker', signal: -57 },
      { id: 'DL350020260888', name: 'Shark DL-3500', model: 'DL-3500', deviceType: '顶流机/制冰机', deviceTypeEn: 'Surface jet / ice maker', signal: -71 },
    ]
  },
  async connect() { await new Promise((resolve) => setTimeout(resolve, 520)); return true },
  async send() { await new Promise((resolve) => setTimeout(resolve, 180)); return 'acknowledged' },
}

export const paymentAdapter: PaymentAdapter = {
  availability: () => integrationAvailability.payment,
  async pay(orderNo) {
    await new Promise((resolve) => setTimeout(resolve, 650))
    return { transactionId: `LOCAL-${orderNo}-${Date.now()}`, status: 'paid', demo: true }
  },
}

export const notificationAdapter: NotificationAdapter = {
  availability: () => integrationAvailability.push,
  async requestPermission() { return 'granted' },
  async notify(title, body) {
    if (typeof uni !== 'undefined' && typeof uni.showToast === 'function') uni.showToast({ title: `${title}: ${body}`.slice(0, 40), icon: 'none' })
  },
}

function fileToDataUrl(file: unknown, fallback: string): Promise<string> {
  if (typeof FileReader === 'undefined' || !(file instanceof Blob)) return Promise.resolve(fallback)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || fallback))
    reader.onerror = () => reject(new Error('FILE_PERSIST_FAILED'))
    reader.readAsDataURL(file)
  })
}

function chooseImage(count: number): Promise<UploadAsset[]> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      async success(result) {
        const rawFiles = Array.isArray(result.tempFiles) ? result.tempFiles : result.tempFiles ? [result.tempFiles] : []
        const paths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : []
        const files = await Promise.all(rawFiles.map(async (entry, index) => {
          const file = entry as { name?: string; path?: string; size?: number; type?: string; file?: Blob }
          const fallback = String(file.path || paths[index] || '')
          const localPath = await fileToDataUrl(file.file || entry, fallback)
          return { name: String(file.name || `image-${index + 1}.jpg`), localPath, kind: 'image' as const, size: Number(file.size || 0), mimeType: String(file.type || 'image/jpeg'), persisted: localPath.startsWith('data:') || !localPath.startsWith('blob:') }
        }))
        resolve(files)
      },
      fail() { resolve([]) },
    })
  })
}

function chooseVideo(): Promise<UploadAsset[]> {
  return new Promise((resolve) => {
    uni.chooseVideo({
      sourceType: ['album', 'camera'],
      compressed: true,
      success(result) {
        resolve([{ name: `video-${Date.now()}.mp4`, localPath: result.tempFilePath, kind: 'video', size: Number(result.size || 0), mimeType: 'video/mp4', persisted: !result.tempFilePath.startsWith('blob:') }])
      },
      fail() { resolve([]) },
    })
  })
}

export const uploadAdapter: UploadAdapter = {
  availability: () => ({ ready: true }),
  pick(kind, remaining) { return kind === 'video' ? chooseVideo() : chooseImage(Math.max(1, Math.min(remaining, 6))) },
  validate(asset, options) {
    if (asset.size > options.maxBytes) throw new Error('FILE_TOO_LARGE')
    if (!options.mimeTypes.includes(asset.mimeType)) throw new Error('FILE_TYPE_NOT_ALLOWED')
    if (!asset.localPath) throw new Error('FILE_PERSIST_FAILED')
  },
}

export function integrationReason(capability: IntegrationCapability, locale: LocaleCode = 'zh-Hans') {
  if (isLocalDemoCapability(capability)) {
    if (locale === 'zh-Hans') return integrationAvailability[capability].reason || '当前使用本机演示流程'
    return ({
      socialAuth: 'Uses an on-device authorization flow.', bluetooth: 'Uses an on-device Bluetooth device list and connection state.',
      deviceTelemetry: 'Uses device status and telemetry stored on this device.', deviceControl: 'Commands update the on-device state only.',
      ota: 'The firmware workflow and records are completed on this device.', payment: 'Only the local order status changes; no real charge is made.',
      push: 'Notification preferences and messages are stored on this device.', cloudSync: 'Upload status is completed locally and is not sent to the cloud.',
    } as Record<IntegrationCapability, string>)[capability]
  }
  if (locale === 'zh-Hans') return integrationAvailability[capability].reason || '该能力尚未配置'
  return ({
    socialAuth: 'The third-party sign-in provider is not configured.',
    bluetooth: 'The Bluetooth device protocol and service UUID are not configured.',
    deviceTelemetry: 'The live device status and telemetry service is not configured.',
    deviceControl: 'The production device control protocol is not configured.',
    ota: 'The firmware download source and Bluetooth transfer protocol are not configured.',
    payment: 'Payment merchant credentials and request signing are not configured.',
    push: 'The push notification service is not configured.',
    cloudSync: 'The cloud synchronization service is not configured.',
  } as Record<IntegrationCapability, string>)[capability]
}
