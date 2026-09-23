export type Region = 'CN' | 'GLOBAL'
export type LocaleCode = 'zh-Hans' | 'en' | 'ko' | 'ja' | 'tr' | 'ar' | 'pt' | 'es' | 'fr' | 'de' | 'it' | 'nl' | 'ru'
export type UnitSystem = 'metric' | 'imperial'
export type Role = 'guest' | 'user' | 'dealerAdmin' | 'dealerStaff'
export type Status = 'online' | 'offline' | 'warning' | 'pending' | 'completed' | 'disabled'
export type AuthProvider = 'WeChat' | 'Google' | 'Apple'
export type IntegrationCapability = 'socialAuth' | 'bluetooth' | 'deviceTelemetry' | 'deviceControl' | 'ota' | 'payment' | 'push' | 'cloudSync'

export interface BaseEntity {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Account extends BaseEntity {
  identifier: string
  password: string
  displayName: string
  displayNameEn: string
  role: Role
  dealerId?: string
  firstLogin?: boolean
  phone?: string
  email?: string
  avatar?: string
  verified: boolean
  failedAttempts: number
  lockedUntil?: string
  capabilities: string[]
  providerLinks?: Partial<Record<AuthProvider, string>>
  active?: boolean
}

export interface VerificationSession extends BaseEntity {
  target: string
  purpose: 'login' | 'register' | 'forgot' | 'wechat' | 'profile-phone' | 'profile-email'
  code: string
  expiresAt: string
  verified: boolean
  attempts: number
  maxAttempts: number
  consumedAt?: string
  payload?: { password?: string; region?: Region; provider?: string }
}

export interface DealerOutlet extends BaseEntity {
  name: string
  nameEn: string
  parentId?: string
  level: 1 | 2
  manager: string
  phone: string
  email?: string
  region: string
  status: 'pending' | 'enabled' | 'disabled'
  defaultWarrantyYears: number
  capabilities: string[]
}

export type LinkedRole = 'standalone' | 'primary' | 'secondary'
export type MagnetometerCalibrationStatus = 'idle' | 'calibrating' | 'succeeded' | 'failed'
export type CrawlDistanceMeters = 6 | 10 | 15 | 20 | 30
export type DeviceWorkMode = 'manual' | 'anchor' | 'drift' | 'crawl' | 'side-thrust' | 'heading-lock' | 'playback'

export interface DeviceSettings {
  power: number
  bowHeadingReferenceDeg: number | null
  bowHeadingCalibratedAt?: string
  anchorDriftAlertDistanceMeters: number
  linkedRole: LinkedRole
  linkedRolePendingRestart: boolean
  magnetometerCalibrationStatus: MagnetometerCalibrationStatus
  magnetometerCalibratedAt?: string
  crawlDistanceMeters: CrawlDistanceMeters
  limitSwitchBypassEnabled: boolean
  arrivalProtectionEnabled: boolean
}

export interface DeviceControlState {
  powerOn: boolean
  power: number
  direction: 'forward' | 'reverse' | 'left' | 'right' | 'stop'
  lift: 'up' | 'down' | 'stop'
  liftPosition: 'top' | 'movingUp' | 'middle' | 'movingDown' | 'bottom' | 'fault'
  propellerOn: boolean
  activeMode: DeviceWorkMode
  targetWaypointId?: string
  anchorEstablished: boolean
  anchorOffsetForwardMeters: number
  anchorOffsetStarboardMeters: number
  controlPaused: boolean
  steeringAngleDeg: number
  steeringLimit: 'none' | 'left' | 'right'
}

export interface DeviceIdentity {
  communicationId: string
  chipId: string
  mainboardSerial: string
  componentSerials: Record<string, string>
}

export interface Device extends BaseEntity {
  name: string
  nameEn: string
  category: string
  categoryEn: string
  model: string
  specification: string
  serialNumber: string
  status: 'online' | 'offline' | 'warning'
  ownerId?: string
  bindingId?: string
  dealerId?: string
  projectId?: string
  assignedTo?: string
  firmware: string
  salesRegion: string
  activationStatus: 'registered' | 'active' | 'unbound'
  activatedAt?: string
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'failed'
  bluetoothConnected: boolean
  controllerConnected?: boolean
  networkStatus?: 'online' | 'offline'
  ipAddress?: string
  location: { lat: number; lng: number; label: string; labelEn: string }
  telemetry: {
    voltage: number
    current: number
    power: number
    temperature: number
    runtime: number
    output: number
    gpsSignal?: number
    heading?: number
    targetHeading?: number
    offsetDistance?: number
    controllerBattery?: number
  }
  identity?: DeviceIdentity
  settings: DeviceSettings
  controlState: DeviceControlState
  lastOnline: string
  guestVisible?: boolean
}

export interface TelemetryRecord extends BaseEntity {
  deviceId: string
  capturedAt: string
  runtime: number
  output: number
  power: number
  current: number
  temperature: number
  alertCount: number
}

export interface DeviceModelCatalogItem extends BaseEntity {
  model: string
  name: string
  nameEn: string
  category: string
  categoryEn: string
  supportsLift: boolean
  supportsDirection: boolean
  supportsPropeller: boolean
  supportsHelmSettings: boolean
  specifications: string[]
  rodLengths: string[]
  stock: number
  dealerPrice: number
  currency: 'CNY' | 'USD'
}

export interface MainboardReplacement extends BaseEntity {
  deviceId: string
  previousBoardSerial: string
  newBoardSerial: string
  previousFirmware: string
  newFirmware: string
  inheritedRuntime: number
  operatorId: string
  note?: string
}

export interface DeviceRegistration extends BaseEntity {
  serialNumber: string
  model: string
  specification?: string
  category: string
  categoryEn: string
  salesRegion: string
  projectId?: string
  boundOwnerId?: string
  dealerId: string
  lastKnownRegion?: string
  status: 'available' | 'bound' | 'blocked'
}

export interface DeviceCommand extends BaseEntity {
  deviceId: string
  accountId: string
  command: string
  payload: Record<string, string | number | boolean>
  status: 'sent' | 'acknowledged' | 'timeout' | 'failed'
}

export interface Waypoint extends BaseEntity {
  name: string
  nameEn: string
  lat: number
  lng: number
  note: string
  source: 'local' | 'cloud'
  storageTarget?: 'local' | 'server'
  syncStatus: 'synced' | 'pending' | 'failed'
  syncAttempts: number
  ownerId: string
  deviceId?: string
}

export interface RoutePlan extends BaseEntity {
  name: string
  nameEn: string
  ownerId: string
  deviceId?: string
  waypointIds: string[]
  distanceKm: number
  estimatedMinutes: number
  status: 'draft' | 'ready' | 'navigating' | 'paused' | 'completed'
  syncStatus?: 'pending' | 'synced' | 'failed'
  syncAttempts?: number
}

export interface InstalledProjectMaterial {
  id: string
  catalogId: string
  quantity: number
  status: 'installed' | 'removed'
  ticketId: string
  relatedCatalogId?: string
  at: string
}

export interface Project extends BaseEntity {
  name: string
  nameEn: string
  vessel: string
  serialNumber: string
  customer: string
  ownerName: string
  deviceType: string
  deviceModel: string
  deviceSpecification: string
  rodLength: string
  region: string
  factoryRegion: string
  crossRegionRequired: boolean
  crossRegionStatus: 'notRequired' | 'pending' | 'approved' | 'rejected'
  phone: string
  email?: string
  warrantyEnd?: string
  warrantyHistory?: Array<{
    previousEnd?: string
    newEnd: string
    changedAt: string
    operatorId: string
  }>
  description?: string
  dealerId: string
  attachmentIds?: string[]
  installedMaterials: InstalledProjectMaterial[]
  status: 'pendingApproval' | 'installing' | 'active' | 'aftersales' | 'completed' | 'rejected'
}

export interface FaqDocument extends BaseEntity {
  key: string
  title: string
  titleEn: string
  summary: string
  summaryEn: string
  fileName: string
  fileUrl: string
  deviceCategories: string[]
  deviceModels: string[]
  revision: string
  sort: number
  status: 'published' | 'disabled'
}

export interface WorkflowHistoryItem {
  id: string
  status: string
  label: string
  at: string
  operator: string
  note?: string
}

export interface TicketChargeLine {
  id: string
  type: 'labor' | 'material' | 'adjustment'
  label: string
  amount: number
  catalogId?: string
  quantity?: number
  unitPrice?: number
}

export interface ReplacementMaterialLine {
  id: string
  originalCatalogId: string
  replacementCatalogId: string
  quantity: number
}

export interface Ticket extends BaseEntity {
  title: string
  titleEn: string
  ownerId?: string
  deviceId?: string
  deviceBindingId?: string
  customerVisible?: boolean
  projectId?: string
  orderId?: string
  serialNumber?: string
  category: 'repair' | 'complaint' | 'transfer' | 'message'
  faultCategory?: string
  description: string
  phone?: string
  email?: string
  contact: string
  originRegion?: string
  targetRegion?: string
  targetDealerId?: string
  dealerId?: string
  assignmentTarget?: 'dealer' | 'headquarters'
  assignedDealerId?: string
  assignedLabel?: string
  escalationStatus?: 'none' | 'pending' | 'transferred'
  replacementRequired?: boolean
  replacementLines?: ReplacementMaterialLine[]
  originalMaterialId?: string
  replacementMaterialId?: string
  replacementMaterialRequestId?: string
  replacementMaterialRequestIds?: string[]
  replacementQuantity?: number
  replacementCompletedAt?: string
  removedMaterialDisposition?: 'returnPending' | 'returned' | 'customerRetained'
  serviceCharge?: number
  chargeLines?: TicketChargeLine[]
  attachmentIds: string[]
  status: 'submitted' | 'processing' | 'parts' | 'completed' | 'rejected'
  history: WorkflowHistoryItem[]
}

export interface ServiceTransfer extends BaseEntity {
  ticketId: string
  requesterId: string
  originDealerId: string
  targetDealerId: string
  reason: string
  platformApprovalId?: string
  status: 'pendingOrigin' | 'pendingTarget' | 'platformReview' | 'completed' | 'rejected'
  history: WorkflowHistoryItem[]
}

export interface Attachment extends BaseEntity {
  ownerId: string
  entity: string
  entityId?: string
  name: string
  kind: 'image' | 'video' | 'file'
  localPath: string
  size: number
  mimeType: string
  persisted: boolean
}

export interface Employee extends BaseEntity {
  name: string
  nameEn: string
  phone: string
  roleName: string
  dealerId: string
  status: 'enabled' | 'disabled'
  capabilities: string[]
}

export interface MaterialCatalogItem extends BaseEntity {
  name: string
  nameEn: string
  sku: string
  category: string
  compatibleDeviceTypes?: string[]
  compatibleDeviceModels?: string[]
  stock: number
  dealerPrice: number
  currency: 'CNY' | 'USD'
}

export interface MaterialRequestLine {
  id: string
  catalogId: string
  originalCatalogId?: string
  name: string
  nameEn: string
  sku: string
  quantity: number
}

export interface MaterialRequest extends BaseEntity {
  name: string
  nameEn: string
  catalogId?: string
  items?: MaterialRequestLine[]
  projectId: string
  quantity: number
  reason: string
  dealerId: string
  requesterId?: string
  source?: 'standard' | 'serviceReplacement'
  ticketId?: string
  originalCatalogId?: string
  status: 'pending' | 'approved' | 'shipping' | 'received' | 'installed' | 'rejected'
  trackingNumber?: string
  history: WorkflowHistoryItem[]
}

export interface ApprovalEvent extends BaseEntity {
  entity: 'material' | 'purchase' | 'order' | 'transfer' | 'dealer' | 'serviceTransfer'
  entityId: string
  action: 'submit' | 'approve' | 'reject' | 'ship' | 'receive'
  operator: string
  note?: string
}

export interface Shipment extends BaseEntity {
  orderNo: string
  materialRequestId?: string
  dealerId: string
  carrier: string
  trackingNumber: string
  items: Array<{ id: string; catalogId?: string; name: string; sku?: string; quantity: number; itemType?: 'material' | 'device'; deviceModel?: string; specification?: string }>
  dispatchAttachmentIds: string[]
  dispatchedBy?: string
  dispatchedAt?: string
  receivedBy?: string
  receivedAt?: string
  estimatedAt: string
  status: 'pending' | 'shipping' | 'received' | 'exception'
  events: Array<{ id: string; status: string; description: string; at: string }>
}

export interface Transfer extends BaseEntity {
  deviceId: string
  from: string
  to: string
  operator: string
  dealerId: string
  targetDealerId?: string
  targetEmployeeId?: string
  kind: 'assignment' | 'reallocation'
  status: 'pending' | 'approved' | 'completed' | 'rejected'
  history: WorkflowHistoryItem[]
}

export interface Purchase extends BaseEntity {
  orderNo: string
  title: string
  titleEn: string
  catalogId?: string
  quantity: number
  amount: number
  items: PurchaseLine[]
  dealerId: string
  address?: string
  purchaseType: 'materials' | 'devices' | 'mixed'
  paidAmount: number
  remainingAmount: number
  paymentCount: number
  status: 'cart' | 'pendingApproval' | 'salesConfirmed' | 'rdConfirmed' | 'production' | 'approved' | 'pendingPayment' | 'partiallyPaid' | 'paid' | 'rejected' | 'refunded'
  paymentStatus: 'notCreated' | 'pending' | 'partial' | 'paid' | 'refunded'
  settlementMode: 'onlinePending' | 'offlineFx'
  history: WorkflowHistoryItem[]
}

export interface PurchaseLine {
  id: string
  catalogId: string
  name: string
  nameEn: string
  sku: string
  quantity: number
  unitPrice: number
  amount: number
  currency: 'CNY' | 'USD'
  itemType: 'material' | 'device'
  deviceModel?: string
  specification?: string
}

export interface Payment extends BaseEntity {
  orderNo: string
  paymentNo?: string
  title: string
  titleEn: string
  amount: number
  currency: 'CNY' | 'USD'
  accountId: string
  dealerId?: string
  purchaseId?: string
  installmentNumber?: number
  method?: 'wechat' | 'alipay' | 'paypal' | 'applePay' | 'googlePay' | 'scanQr'
  transactionId?: string
  proofAttachmentId?: string
  submittedAt?: string
  verifiedAt?: string
  status: 'pending' | 'verifying' | 'verified' | 'paid' | 'refunded' | 'failed'
}

export interface CustomerOrder extends BaseEntity {
  orderNo: string
  ownerId: string
  dealerId?: string
  deviceId?: string
  title: string
  titleEn: string
  amount: number
  currency: 'CNY' | 'USD'
  status: 'submitted' | 'salesConfirmed' | 'rdConfirmed' | 'production' | 'financeConfirmed' | 'shipped' | 'completed' | 'rejected' | 'cancelled'
  specialRequirements?: string
  history: WorkflowHistoryItem[]
}

export interface FirmwareJob extends BaseEntity {
  deviceId: string
  fromVersion: string
  toVersion: string
  stage: 'checking' | 'downloading' | 'transferring' | 'installing' | 'completed' | 'failed'
  progress: number
  errorCode?: string
}

export interface Message extends BaseEntity {
  title: string
  titleEn: string
  body: string
  type: 'device' | 'service' | 'system' | 'approval'
  accountId?: string
  dealerId?: string
  ticketId?: string
  transferId?: string
  assignmentTarget?: 'dealer' | 'headquarters'
  read: boolean
}

export interface MessageTransfer extends BaseEntity {
  ticketId: string
  requesterId: string
  fromDealerId?: string
  target: 'dealer' | 'headquarters'
  targetDealerId?: string
  targetLabel: string
  reason: string
  status: 'pending' | 'accepted' | 'completed' | 'rejected'
  history: WorkflowHistoryItem[]
}

export interface PlatformApproval extends BaseEntity {
  entity: 'serviceTransfer' | 'deviceTransfer' | 'installationTransfer' | 'deviceActivation' | 'headquartersMessage'
  entityId: string
  requestedBy: string
  dealerId?: string
  serialNumber?: string
  originRegion?: string
  targetRegion?: string
  status: 'pending' | 'approved' | 'rejected'
  decisionAt?: string
  decisionNote?: string
  reviewEtaAt?: string
  temporaryOperationUntil?: string
  source: 'integration' | 'demo-exception'
}

export interface AuditEvent extends BaseEntity {
  action: string
  entity: string
  entityId: string
  operator: string
  detail: string
  source: 'local' | 'integration' | 'demo-exception' | 'migration'
  operationId?: string
}

export interface ExportRecord extends BaseEntity {
  ownerId: string
  deviceId?: string
  name: string
  mimeType: 'text/csv'
  localPath: string
  size: number
}

export interface AppSettings {
  locale: LocaleCode
  unitSystem: UnitSystem
  region: Region
  autoFirmware: boolean
  waypointStorage: 'local' | 'cloud'
  chartPreferences: ChartPreferences
  notifications: { device: boolean; ota: boolean; service: boolean; sync: boolean; product: boolean }
  agreements: Array<{
    policy: 'user-agreement' | 'privacy-policy'
    version: string
    acceptedAt: string
    accountId: string
    source: 'login' | 'register' | 'guest' | 'social'
  }>
  permissions: Record<'bluetooth' | 'location' | 'camera' | 'notifications', {
    state: 'unknown' | 'granted' | 'denied'
    decidedAt?: string
    accountId?: string
  }>
}

export interface ChartPreferences {
  displayMode: 'basic' | 'standard' | 'all'
  theme: 'day' | 'dusk' | 'night'
  boundaryStyle: 'simple' | 'symbolized'
  pointSymbol: 'simple' | 'paper'
  depthColors: 2 | 4
  zoomLevel: 1 | 2 | 3 | 4 | 5
}

export interface AppDatabase {
  schemaVersion: 15
  session: { accountId: string | null; guest: boolean }
  settings: AppSettings
  accounts: Account[]
  verificationSessions: VerificationSession[]
  dealers: DealerOutlet[]
  deviceRegistrations: DeviceRegistration[]
  deviceModels: DeviceModelCatalogItem[]
  devices: Device[]
  telemetryRecords: TelemetryRecord[]
  mainboardReplacements: MainboardReplacement[]
  deviceCommands: DeviceCommand[]
  firmwareJobs: FirmwareJob[]
  waypoints: Waypoint[]
  routes: RoutePlan[]
  faqDocuments: FaqDocument[]
  projects: Project[]
  tickets: Ticket[]
  serviceTransfers: ServiceTransfer[]
  messageTransfers: MessageTransfer[]
  platformApprovals: PlatformApproval[]
  attachments: Attachment[]
  employees: Employee[]
  materialCatalog: MaterialCatalogItem[]
  materials: MaterialRequest[]
  approvals: ApprovalEvent[]
  shipments: Shipment[]
  transfers: Transfer[]
  purchases: Purchase[]
  payments: Payment[]
  orders: CustomerOrder[]
  messages: Message[]
  auditEvents: AuditEvent[]
  exports: ExportRecord[]
  operationKeys: string[]
}

export type EntityCollection =
  | 'devices' | 'waypoints' | 'routes' | 'projects' | 'tickets' | 'dealers' | 'employees'
  | 'materials' | 'shipments' | 'transfers' | 'purchases' | 'payments' | 'orders' | 'messages'

export interface AccessContext {
  accountId: string | null
  role: Role
  dealerId?: string
  employeeId?: string
  dealerScopeIds: string[]
  capabilities: string[]
}

export interface Query {
  search?: string
  status?: string
  category?: string
  page?: number
  pageSize?: number
  dealerId?: string
  ownerId?: string
  sort?: 'newest' | 'oldest'
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
