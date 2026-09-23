import type { AppDatabase, BaseEntity, Device, WorkflowHistoryItem } from '@/types/models'
import { createDefaultDeviceControlState, createDefaultDeviceSettings } from '@/config/deviceDefaults'

const now = '2026-08-10T09:41:00.000Z'
const base = (id: string): BaseEntity => ({ id, createdAt: now, updatedAt: now })
const history = (id: string, status: string, label: string, operator = '系统'): WorkflowHistoryItem => ({ id, status, label, at: now, operator })
const defaultSettings = (): Device['settings'] => createDefaultDeviceSettings()
const defaultControlState = (): Device['controlState'] => createDefaultDeviceControlState()

export function createSeedDatabase(region: 'CN' | 'GLOBAL' = 'CN'): AppDatabase {
  const database = {
    schemaVersion: 15,
    session: { accountId: null, guest: false },
    settings: {
      locale: region === 'CN' ? 'zh-Hans' : 'en',
      unitSystem: region === 'CN' ? 'metric' : 'imperial',
      region,
      autoFirmware: false,
      waypointStorage: 'local',
      chartPreferences: { displayMode: 'standard', theme: 'day', boundaryStyle: 'simple', pointSymbol: 'simple', depthColors: 2, zoomLevel: 2 },
      notifications: { device: true, ota: true, service: true, sync: false, product: false },
      agreements: [],
      permissions: {
        bluetooth: { state: 'unknown' }, location: { state: 'unknown' }, camera: { state: 'unknown' }, notifications: { state: 'unknown' },
      },
    },
    accounts: [
      { ...base('acc-guest'), identifier: 'guest', password: '', displayName: '游客', displayNameEn: 'Guest', role: 'guest', verified: false, failedAttempts: 0, capabilities: [] },
      { ...base('acc-user'), identifier: '13800002861', password: '123456', displayName: '林海', displayNameEn: 'Hai Lin', role: 'user', phone: '13800002861', email: 'captain@seawind.com', verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create'] },
      { ...base('acc-global'), identifier: 'captain@seawind.com', password: '123456', displayName: '林海', displayNameEn: 'Hai Lin', role: 'user', phone: '13800002861', email: 'captain@seawind.com', verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create'] },
      { ...base('acc-dealer'), identifier: '13800000028', password: '123456', displayName: '海创智能设备', displayNameEn: 'Hichain Marine Systems', role: 'dealerAdmin', dealerId: 'dealer-01', phone: '13800000028', email: 'dealer@hichain.example', verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create', 'dealer.manage', 'project.manage', 'support.manage', 'staff.manage', 'material.apply', 'material.approve', 'device.assign', 'purchase.create', 'price.view'] },
      { ...base('acc-staff'), identifier: '13800000268', password: '123456', displayName: '周工', displayNameEn: 'Engineer Zhou', role: 'dealerStaff', dealerId: 'dealer-01', phone: '13800000268', verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create', 'project.manage', 'support.manage', 'material.apply'] },
      { ...base('acc-first'), identifier: 'DLR-SH-0028', password: '123456', displayName: '新经销商账号', displayNameEn: 'New Dealer Account', role: 'dealerAdmin', dealerId: 'dealer-02', firstLogin: true, verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create', 'project.manage', 'support.manage', 'staff.manage', 'material.apply'] },
    ],
    verificationSessions: [],
    dealers: [
      { ...base('dealer-01'), name: '厦门海创一级经销商', nameEn: 'Xiamen Hichain Primary Dealer', level: 1, manager: '林经理', phone: '13800000028', email: 'dealer@hichain.example', region: '福建省', status: 'enabled', defaultWarrantyYears: 2, capabilities: ['dealer.manage', 'project.manage', 'staff.manage', 'material.approve', 'device.assign', 'price.view'] },
      { ...base('dealer-02'), name: '泉州远航服务网点', nameEn: 'Quanzhou Voyage Service', parentId: 'dealer-01', level: 2, manager: '陈佳', phone: '13800000668', email: 'quanzhou@hichain.example', region: '福建省泉州市', status: 'pending', defaultWarrantyYears: 2, capabilities: ['project.manage', 'support.manage', 'material.apply'] },
      { ...base('dealer-03'), name: '海沧服务网点', nameEn: 'Haicang Service Outlet', parentId: 'dealer-01', level: 2, manager: '王海', phone: '13800000686', email: 'haicang@hichain.example', region: '福建省厦门市海沧区', status: 'enabled', defaultWarrantyYears: 2, capabilities: ['project.manage', 'support.manage', 'material.apply'] },
    ],
    deviceRegistrations: [
      { ...base('reg-01'), serialNumber: 'DL350020260810', model: 'DL-3500', specification: '标准型', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', salesRegion: '福建省厦门市', lastKnownRegion: '福建省厦门市', projectId: 'pro-03', dealerId: 'dealer-01', status: 'available' },
      { ...base('reg-02'), serialNumber: 'DL350020260811', model: 'DL-3500', specification: '标准型', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', salesRegion: '福建省厦门市', lastKnownRegion: '福建省厦门市', projectId: 'pro-01', boundOwnerId: 'acc-user', dealerId: 'dealer-01', status: 'bound' },
      { ...base('reg-03'), serialNumber: 'DL350020260888', model: 'DL-3500', specification: '加长型', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', salesRegion: '广东省汕头市', lastKnownRegion: '广东省汕头市', projectId: 'pro-04', dealerId: 'dealer-01', status: 'available' },
    ],
    deviceModels: [
      { ...base('model-dl3000'), model: 'DL-3000', name: '顶流机', nameEn: 'Surface Jet', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', supportsLift: true, supportsDirection: true, supportsPropeller: true, supportsHelmSettings: true, specifications: ['标准型', '加长型'], rodLengths: ['2.4m', '2.8m', '3.0m'], stock: 8, dealerPrice: 36800, currency: 'CNY' },
      { ...base('model-dl3500'), model: 'DL-3500', name: '顶流机', nameEn: 'Surface Jet', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', supportsLift: true, supportsDirection: true, supportsPropeller: true, supportsHelmSettings: true, specifications: ['标准型', '加长型'], rodLengths: ['2.8m', '3.0m', '3.2m'], stock: 6, dealerPrice: 42800, currency: 'CNY' },
      { ...base('model-sw2000'), model: 'SW-2000', name: '海水淡化器', nameEn: 'Desalinator', category: '海水淡化器', categoryEn: 'Desalinator', supportsLift: false, supportsDirection: false, supportsPropeller: false, supportsHelmSettings: false, specifications: ['标准型'], rodLengths: [], stock: 10, dealerPrice: 28600, currency: 'CNY' },
      { ...base('model-bt5000'), model: 'BT-5000', name: '电池组', nameEn: 'Battery Bank', category: '电池组', categoryEn: 'Battery bank', supportsLift: false, supportsDirection: false, supportsPropeller: false, supportsHelmSettings: false, specifications: ['标准型'], rodLengths: [], stock: 12, dealerPrice: 12800, currency: 'CNY' },
    ],
    devices: [
      { ...base('dev-01'), name: '顶流机-01', nameEn: 'Surface Jet-01', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', model: 'DL-3000', serialNumber: 'DL300020240101', status: 'online', ownerId: 'acc-user', dealerId: 'dealer-01', projectId: 'pro-01', assignedTo: 'emp-01', firmware: '3.2.1', salesRegion: '福建省厦门市', activationStatus: 'active', activatedAt: '2026-01-18T08:00:00.000Z', bluetoothConnected: true, controllerConnected: true, location: { lat: 24.4852, lng: 118.0921, label: '1号机房', labelEn: 'Engine room 1' }, telemetry: { voltage: 220, current: 3.2, power: 704, temperature: 18, runtime: 120, output: 256, gpsSignal: 82, heading: 130, targetHeading: 90, offsetDistance: 0.2, controllerBattery: 76 }, identity: { communicationId: 'COMM-DL3-0240101', chipId: 'CHIP-DL3-8A4101', mainboardSerial: 'PCB-DL3-20260718', componentSerials: { underwaterMotor: 'MTR-DL3-240101', controller: 'CTRL-DL3-240101' } }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: now, guestVisible: true },
      { ...base('dev-02'), name: '海水淡化器-02', nameEn: 'Desalinator-02', category: '海水淡化器', categoryEn: 'Desalinator', model: 'SW-2000', serialNumber: 'SW200020240202', status: 'online', ownerId: 'acc-user', dealerId: 'dealer-01', projectId: 'pro-01', assignedTo: 'emp-01', firmware: '2.8.4', salesRegion: '福建省厦门市', activationStatus: 'active', activatedAt: '2026-02-06T08:00:00.000Z', bluetoothConnected: false, controllerConnected: true, location: { lat: 24.4865, lng: 118.0952, label: '甲板设备区', labelEn: 'Deck equipment zone' }, telemetry: { voltage: 220, current: 2.7, power: 594, temperature: 21, runtime: 88, output: 180 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: now, guestVisible: true },
      { ...base('dev-03'), name: '电池组-03', nameEn: 'Battery Bank-03', category: '电池组', categoryEn: 'Battery bank', model: 'BT-5000', serialNumber: 'BT500020240303', status: 'offline', ownerId: 'acc-user', dealerId: 'dealer-01', firmware: '1.9.0', salesRegion: '福建省厦门市', activationStatus: 'active', activatedAt: '2026-03-12T08:00:00.000Z', bluetoothConnected: false, controllerConnected: false, location: { lat: 24.48, lng: 118.1, label: '船艉舱', labelEn: 'Aft cabin' }, telemetry: { voltage: 48, current: 0, power: 0, temperature: 20, runtime: 32, output: 0 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: '2026-08-09T18:20:00.000Z' },
      { ...base('dev-04'), name: '网络检测仪-04', nameEn: 'Network Monitor-04', category: '网络检测仪', categoryEn: 'Network monitor', model: 'NET-100', serialNumber: 'NET10020240404', status: 'online', dealerId: 'dealer-01', projectId: 'pro-02', assignedTo: 'emp-02', firmware: '4.0.2', salesRegion: '福建省福州市', activationStatus: 'active', activatedAt: '2026-04-10T08:00:00.000Z', bluetoothConnected: true, controllerConnected: false, location: { lat: 24.49, lng: 118.11, label: '驾驶舱', labelEn: 'Bridge' }, telemetry: { voltage: 12, current: 0.8, power: 9.6, temperature: 25, runtime: 240, output: 98 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: now },
      { ...base('dev-05'), name: '制冰机-05', nameEn: 'Ice Maker-05', category: '制冰机', categoryEn: 'Ice maker', model: 'IC-1500', serialNumber: 'IC150020240505', status: 'offline', dealerId: 'dealer-01', firmware: '2.1.8', salesRegion: '福建省厦门市', activationStatus: 'registered', bluetoothConnected: false, controllerConnected: false, location: { lat: 24.5, lng: 118.12, label: '待分配仓库', labelEn: 'Unassigned warehouse' }, telemetry: { voltage: 220, current: 0, power: 0, temperature: 24, runtime: 60, output: 0 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: '2026-08-08T11:10:00.000Z' },
      { ...base('dev-06'), name: '电池组-06', nameEn: 'Battery Bank-06', category: '电池组', categoryEn: 'Battery bank', model: 'BT-6000', serialNumber: 'BT600020240606', status: 'online', dealerId: 'dealer-01', firmware: '2.0.1', salesRegion: '福建省厦门市', activationStatus: 'registered', bluetoothConnected: true, controllerConnected: false, location: { lat: 24.51, lng: 118.13, label: '待分配仓库', labelEn: 'Unassigned warehouse' }, telemetry: { voltage: 48, current: 8.2, power: 394, temperature: 23, runtime: 12, output: 84 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: now },
      { ...base('dev-07'), name: '顶流机-07', nameEn: 'Surface Jet-07', category: '顶流机/制冰机', categoryEn: 'Surface jet / ice maker', model: 'DL-3500', serialNumber: 'DL350020240707', status: 'warning', dealerId: 'dealer-01', projectId: 'pro-02', firmware: '3.1.9', salesRegion: '福建省福州市', activationStatus: 'active', activatedAt: '2026-05-20T08:00:00.000Z', bluetoothConnected: true, controllerConnected: true, location: { lat: 24.52, lng: 118.14, label: '2号机房', labelEn: 'Engine room 2' }, telemetry: { voltage: 208, current: 4.1, power: 853, temperature: 39, runtime: 170, output: 210 }, settings: defaultSettings(), controlState: defaultControlState(), lastOnline: now },
    ],
    telemetryRecords: Array.from({ length: 48 }, (_, index) => {
      const capturedAt = new Date(Date.now() - (47 - index) * 6 * 60 * 60 * 1000).toISOString()
      const power = 620 + ((index * 37) % 150)
      return { ...base(`telemetry-dev01-${index + 1}`), capturedAt, createdAt: capturedAt, updatedAt: capturedAt, deviceId: 'dev-01', runtime: 73 + index, output: 42 + ((index * 11) % 24), power, current: Number((power / 220).toFixed(2)), temperature: Number((17.2 + ((index * 3) % 18) / 10).toFixed(1)), alertCount: index === 19 || index === 41 ? 1 : 0 }
    }),
    mainboardReplacements: [
      { ...base('board-01'), deviceId: 'dev-01', previousBoardSerial: 'PCB-DL3-20240101', newBoardSerial: 'PCB-DL3-20260718', previousFirmware: '3.1.9', newFirmware: '3.2.1', inheritedRuntime: 108, operatorId: 'acc-staff', note: '保留设备累计运行时长' },
    ],
    deviceCommands: [],
    firmwareJobs: [],
    waypoints: [
      { ...base('wp-01'), name: '鼓浪屿东锚点', nameEn: 'Gulangyu East Anchorage', lat: 24.448, lng: 118.082, note: '避开浅滩', source: 'cloud', syncStatus: 'synced', syncAttempts: 1, ownerId: 'acc-user', deviceId: 'dev-01' },
      { ...base('wp-02'), name: '返航检查点', nameEn: 'Return Checkpoint', lat: 24.472, lng: 118.103, note: '本机离线保存', source: 'local', syncStatus: 'pending', syncAttempts: 0, ownerId: 'acc-user', deviceId: 'dev-01' },
      { ...base('wp-03'), name: '作业区 A', nameEn: 'Work Zone A', lat: 24.501, lng: 118.132, note: '每日 08:00 到达', source: 'local', syncStatus: 'failed', syncAttempts: 1, ownerId: 'acc-user', deviceId: 'dev-01' },
    ],
    routes: [
      { ...base('route-01'), name: '海风号日常作业航线', nameEn: 'Sea Wind Daily Route', ownerId: 'acc-user', deviceId: 'dev-01', waypointIds: ['wp-01', 'wp-02', 'wp-03'], distanceKm: 12.6, estimatedMinutes: 48, status: 'ready', syncStatus: 'synced', syncAttempts: 1 },
    ],
    faqDocuments: [
      { ...base('faq-topflow-manual'), key: 'topflow-manual', title: '顶流机使用与故障排查手册', titleEn: 'Surface Jet User and Troubleshooting Manual', summary: '遥控器、安装、操作和常见故障处理说明', summaryEn: 'Remote control, installation, operation, and troubleshooting', fileName: '鲨鱼妹妹顶流机中文.pdf', fileUrl: '/static/documents/topflow-machine-manual-zh.pdf', deviceCategories: ['顶流机/制冰机'], deviceModels: ['DL-3000', 'DL-3500'], revision: '2026.08', sort: 1, status: 'published' },
    ],
    projects: [
      { ...base('pro-01'), name: '海风号设备安装', nameEn: 'Sea Wind Installation', vessel: '海风号', serialNumber: 'DL300020240101', customer: '陈先生', ownerName: '陈先生', deviceType: '顶流机/制冰机', deviceModel: 'DL-3000', deviceSpecification: '标准型', rodLength: '2.4m', region: '福建省厦门市', factoryRegion: '福建省厦门市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13800002861', email: 'captain@seawind.com', warrantyEnd: '2028-03-17', description: '安装于船尾 1 号机位', dealerId: 'dealer-01', attachmentIds: [], installedMaterials: [], status: 'active' },
      { ...base('pro-02'), name: '远洋 08 改造', nameEn: 'Ocean 08 Retrofit', vessel: '远洋08', serialNumber: 'DL350020240707', customer: '远洋渔业', ownerName: '陈先生', deviceType: '顶流机/制冰机', deviceModel: 'DL-3500', deviceSpecification: '加长型', rodLength: '3.2m', region: '福建省福州市', factoryRegion: '福建省福州市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13900000108', warrantyEnd: '2028-03-01', description: '旧船设备改造', dealerId: 'dealer-02', attachmentIds: [], installedMaterials: [], status: 'installing' },
      { ...base('pro-03'), name: '待激活设备安装', nameEn: 'Pending Device Installation', vessel: '试航 26', serialNumber: 'DL350020260810', customer: '海域工程服务', ownerName: '林海', deviceType: '顶流机/制冰机', deviceModel: 'DL-3500', deviceSpecification: '标准型', rodLength: '3.0m', region: '福建省厦门市', factoryRegion: '福建省厦门市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13800002861', dealerId: 'dealer-01', attachmentIds: [], installedMaterials: [], status: 'installing' },
      { ...base('pro-04'), name: '跨区待激活设备安装', nameEn: 'Cross-region Pending Installation', vessel: '远航 88', serialNumber: 'DL350020260888', customer: '远航船东', ownerName: '远航船东', deviceType: '顶流机/制冰机', deviceModel: 'DL-3500', deviceSpecification: '加长型', rodLength: '3.2m', region: '广东省汕头市', factoryRegion: '广东省汕头市', crossRegionRequired: false, crossRegionStatus: 'notRequired', phone: '13800002861', dealerId: 'dealer-01', attachmentIds: [], installedMaterials: [], status: 'installing' },
    ],
    tickets: [
      { ...base('ticket-01'), title: '顶流机温度异常', titleEn: 'Surface jet temperature alert', ownerId: 'acc-user', deviceId: 'dev-07', projectId: 'pro-02', category: 'repair', faultCategory: '水下电机', description: '运行 30 分钟后温度升高', phone: '13800002861', email: 'captain@seawind.com', contact: '13800002861', dealerId: 'dealer-01', attachmentIds: [], status: 'processing', history: [history('th-01', 'submitted', '用户提交报修', '林海'), history('th-02', 'processing', '经销商已受理', '周工')] },
      { ...base('ticket-02'), title: '申请跨区服务', titleEn: 'Cross-region service request', ownerId: 'acc-user', deviceId: 'dev-02', projectId: 'pro-01', category: 'transfer', description: '船只将前往广东作业', phone: '13800002861', contact: 'captain@seawind.com', originRegion: '福建省厦门市', targetRegion: '广东省汕头市', targetDealerId: 'dealer-02', dealerId: 'dealer-01', attachmentIds: [], status: 'submitted', history: [history('th-03', 'submitted', '跨区服务申请已提交', '林海')] },
      { ...base('ticket-03'), title: '服务体验投诉', titleEn: 'Service experience complaint', ownerId: 'acc-user', deviceId: 'dev-01', orderId: 'order-01', serialNumber: 'DL300020240101', projectId: 'pro-01', category: 'complaint', description: '预约时间变更后未及时通知', phone: '13800002861', contact: '13800002861', dealerId: 'dealer-01', attachmentIds: [], status: 'submitted', history: [history('th-04', 'submitted', '投诉已提交', '林海')] },
      { ...base('ticket-04'), title: '咨询离线航点同步', titleEn: 'Offline waypoint sync question', ownerId: 'acc-user', deviceId: 'dev-01', category: 'message', description: '需要协助确认离线航点上传方式', email: 'captain@seawind.com', contact: 'captain@seawind.com', dealerId: 'dealer-01', assignmentTarget: 'dealer', assignedDealerId: 'dealer-01', assignedLabel: '厦门海创一级经销商', escalationStatus: 'none', attachmentIds: [], status: 'processing', history: [history('th-05', 'submitted', '客服留言已提交', '林海'), history('th-06', 'processing', '经销商客服已受理', '周工')] },
    ],
    serviceTransfers: [
      { ...base('st-01'), ticketId: 'ticket-02', requesterId: 'acc-user', originDealerId: 'dealer-01', targetDealerId: 'dealer-02', reason: '船只跨区作业', status: 'pendingOrigin', history: [history('sth-01', 'pendingOrigin', '等待原经销商确认', '林海')] },
    ],
    messageTransfers: [],
    platformApprovals: [],
    attachments: [],
    employees: [
      { ...base('emp-01'), name: '周海峰', nameEn: 'Haifeng Zhou', phone: '13800000268', roleName: '安装售后', dealerId: 'dealer-01', status: 'enabled', capabilities: ['project.view', 'project.manage', 'support.manage', 'material.apply', 'device.view'] },
      { ...base('emp-02'), name: '陈佳', nameEn: 'Jia Chen', phone: '13800000668', roleName: '售后专员', dealerId: 'dealer-01', status: 'enabled', capabilities: ['support.manage', 'material.apply'] },
    ],
    materialCatalog: [
      { ...base('catalog-01'), name: '主控板 DL-3', nameEn: 'Controller board DL-3', sku: 'PCB-DL3', category: '主板', compatibleDeviceTypes: ['顶流机/制冰机'], compatibleDeviceModels: ['DL-3000', 'DL-3500'], stock: 16, dealerPrice: 1680, currency: 'CNY' },
      { ...base('catalog-02'), name: '防水连接器', nameEn: 'Waterproof connector', sku: 'CON-IP68', category: '连接器', compatibleDeviceTypes: ['顶流机/制冰机', '海水淡化器', '电池组'], compatibleDeviceModels: [], stock: 84, dealerPrice: 320, currency: 'CNY' },
      { ...base('catalog-03'), name: '提升电机组件', nameEn: 'Lift motor assembly', sku: 'MOTOR-LIFT', category: '电机', compatibleDeviceTypes: ['顶流机/制冰机'], compatibleDeviceModels: ['DL-3000', 'DL-3500'], stock: 8, dealerPrice: 2860, currency: 'CNY' },
      { ...base('catalog-04'), name: '水下电机组件', nameEn: 'Underwater motor assembly', sku: 'MTR-3000-B', category: '电机', compatibleDeviceTypes: ['顶流机/制冰机'], compatibleDeviceModels: ['DL-3000'], stock: 2, dealerPrice: 580, currency: 'CNY' },
    ],
    materials: [
      { ...base('mat-01'), name: '主控板 DL-3', nameEn: 'Controller board DL-3', catalogId: 'catalog-01', items: [{ id: 'material-line-01', catalogId: 'catalog-01', name: '主控板 DL-3', nameEn: 'Controller board DL-3', sku: 'PCB-DL3', quantity: 1 }], projectId: 'pro-01', quantity: 1, reason: '故障更换', dealerId: 'dealer-01', requesterId: 'acc-staff', source: 'standard', status: 'shipping', trackingNumber: 'SF1438265102', history: [history('mh-01', 'pending', '物料申请已提交', '周工'), history('mh-02', 'approved', '申请已批准', '林经理'), history('mh-03', 'shipping', '物料已发货', '仓库')] },
      { ...base('mat-02'), name: '防水连接器', nameEn: 'Waterproof connector', catalogId: 'catalog-02', items: [{ id: 'material-line-02', catalogId: 'catalog-02', name: '防水连接器', nameEn: 'Waterproof connector', sku: 'CON-IP68', quantity: 4 }], projectId: 'pro-02', quantity: 4, reason: '安装备件', dealerId: 'dealer-01', requesterId: 'acc-staff', source: 'standard', status: 'pending', history: [history('mh-04', 'pending', '物料申请已提交', '周工')] },
    ],
    approvals: [],
    shipments: [
      { ...base('ship-01'), orderNo: 'SH202608090028', materialRequestId: 'mat-01', dealerId: 'dealer-01', carrier: '顺丰速运', trackingNumber: 'SF1438265102', items: [{ id: 'ship-line-01', catalogId: 'catalog-01', name: '主控板 DL-3', sku: 'PCB-DL3', quantity: 1 }], dispatchAttachmentIds: ['attachment-ship-01'], dispatchedBy: '仓库员', dispatchedAt: '2026-08-09T11:18:00.000Z', estimatedAt: '2026-08-11T18:00:00.000Z', status: 'shipping', events: [
        { id: 'se-03', status: '已出库', description: '物料审核通过并完成出库', at: '2026-08-09T11:18:00.000Z' },
        { id: 'se-02', status: '已揽收', description: '厦门湖里营业点已揽收', at: '2026-08-09T16:42:00.000Z' },
        { id: 'se-01', status: '运输中', description: '快件已到达厦门集散中心', at: '2026-08-10T08:26:00.000Z' },
      ] },
      { ...base('ship-02'), orderNo: 'SH202608010016', dealerId: 'dealer-01', carrier: '京东物流', trackingNumber: 'JDVA20260801016', items: [{ id: 'ship-line-02', name: '安装物料包', quantity: 1 }], dispatchAttachmentIds: ['attachment-ship-02'], dispatchedBy: '仓库员', dispatchedAt: '2026-08-01T09:10:00.000Z', receivedBy: '林经理', receivedAt: '2026-08-05T15:20:00.000Z', estimatedAt: '2026-08-06T18:00:00.000Z', status: 'received', events: [{ id: 'se-04', status: '已签收', description: '客户已签收', at: '2026-08-05T15:20:00.000Z' }] },
    ],
    transfers: [
      { ...base('tr-01'), deviceId: 'dev-06', from: '厦门一级仓', to: '周工', operator: '管理员', dealerId: 'dealer-01', targetEmployeeId: 'emp-01', kind: 'assignment', status: 'completed', history: [history('trh-01', 'completed', '设备已分配给周工', '管理员')] },
      { ...base('tr-02'), deviceId: 'dev-05', from: '厦门一级仓', to: '泉州远航服务网点', operator: '管理员', dealerId: 'dealer-01', targetDealerId: 'dealer-02', kind: 'reallocation', status: 'pending', history: [history('trh-02', 'pending', '调货申请待审核', '管理员')] },
    ],
    purchases: [
      { ...base('buy-01'), orderNo: 'PO202608100028', title: '防水连接器套装', titleEn: 'Waterproof connector kit', catalogId: 'catalog-02', quantity: 2, amount: 1280, purchaseType: 'materials', paidAmount: 0, remainingAmount: 1280, paymentCount: 0, items: [{ id: 'purchase-line-01', catalogId: 'catalog-02', name: '防水连接器', nameEn: 'Waterproof connector', sku: 'CON-IP68', quantity: 2, unitPrice: 640, amount: 1280, currency: 'CNY', itemType: 'material' }], dealerId: 'dealer-01', address: '福建省厦门市湖里区海沧大道 286 号', status: 'pendingApproval', paymentStatus: 'notCreated', settlementMode: 'onlinePending', history: [history('buy-history-01', 'pendingApproval', '采购单已提交，等待审批', '林经理')] },
    ],
    payments: [
      { ...base('pay-01'), orderNo: 'PO202608100028', paymentNo: 'PO202608100028-P01', purchaseId: 'buy-01', installmentNumber: 1, title: '设备与配件采购', titleEn: 'Equipment and parts purchase', amount: 1280, currency: 'CNY', accountId: 'acc-dealer', dealerId: 'dealer-01', status: 'pending' },
      { ...base('pay-02'), orderNo: '202608100018', title: '售后物料订单', titleEn: 'Service parts order', amount: 680, currency: 'CNY', accountId: 'acc-user', status: 'verified', method: 'scanQr', submittedAt:'2026-08-10T09:12:00.000Z', verifiedAt:'2026-08-10T10:06:00.000Z', createdAt:'2026-08-10T09:12:00.000Z', updatedAt:'2026-08-10T10:06:00.000Z' },
      { ...base('pay-03'), orderNo: '202607280082', title: '设备延保服务', titleEn: 'Extended device warranty', amount: 1280, currency: 'CNY', accountId: 'acc-user', status: 'pending', createdAt:'2026-07-28T10:30:00.000Z', updatedAt:'2026-07-28T10:30:00.000Z' },
      { ...base('pay-04'), orderNo: '202607120031', title: '固件技术服务', titleEn: 'Firmware technical service', amount: 299, currency: 'CNY', accountId: 'acc-user', status: 'refunded', method:'scanQr', createdAt:'2026-07-12T14:20:00.000Z', updatedAt:'2026-07-12T14:20:00.000Z' },
      { ...base('pay-05'), orderNo: 'SR202608080116', title: '跨区售后服务', titleEn: 'Cross-region service', amount: 600, currency: 'CNY', accountId: 'acc-user', status: 'verified', method:'scanQr', transactionId:'WX2026080810182861', submittedAt:'2026-08-08T09:41:00.000Z', verifiedAt:'2026-08-08T10:18:00.000Z', createdAt:'2026-08-08T09:41:00.000Z', updatedAt:'2026-08-08T10:18:00.000Z' },
    ],
    orders: [
      { ...base('order-01'), orderNo: 'SO202601180028', ownerId: 'acc-user', dealerId: 'dealer-01', deviceId: 'dev-01', title: '顶流机 DL-3000 安装订单', titleEn: 'Surface Jet DL-3000 Installation', amount: 36800, currency: 'CNY', status: 'completed', specialRequirements: '按标准安装方案执行', history: [history('order-h-01', 'submitted', '经销商提单', '林经理'), history('order-h-02', 'salesConfirmed', '销售确认', '销售部'), history('order-h-03', 'rdConfirmed', '研发确认定制要求', '研发部'), history('order-h-04', 'production', '导入生产', '生产部'), history('order-h-05', 'financeConfirmed', '财务确认回款', '财务部'), history('order-h-06', 'shipped', '仓库发货', '仓库'), history('order-h-07', 'completed', '订单完成', '系统')] },
      { ...base('order-02'), orderNo: 'SO202602060016', ownerId: 'acc-user', dealerId: 'dealer-01', deviceId: 'dev-02', title: '海水淡化器 SW-2000', titleEn: 'Desalinator SW-2000', amount: 28600, currency: 'CNY', status: 'production', specialRequirements: '确认淡化水量和安装空间', history: [history('order2-h-01', 'submitted', '经销商提单', '林经理'), history('order2-h-02', 'salesConfirmed', '销售确认', '销售部'), history('order2-h-03', 'rdConfirmed', '研发确认特别注意事项', '研发部'), history('order2-h-04', 'production', '已导入生产', '生产部')] },
    ],
    messages: [
      { ...base('msg-01'), title: '设备恢复在线', titleEn: 'Device is back online', body: '顶流机-01 已恢复设备网络连接', type: 'device', accountId: 'acc-user', read: false },
      { ...base('msg-02'), title: '物料已经发货', titleEn: 'Parts have shipped', body: '顺丰 SF1438265102，预计明日送达', type: 'approval', dealerId: 'dealer-01', read: false },
      { ...base('msg-03'), title: '当前固件版本', titleEn: 'Current firmware version', body: '顶流机-01 当前固件为 3.2.1', type: 'system', accountId: 'acc-user', read: true },
    ],
    auditEvents: [],
    exports: [],
    operationKeys: [],
  } as unknown as AppDatabase
  database.devices = database.devices.map((item) => ({
    ...item,
    specification: item.specification || database.deviceModels.find((model) => model.model === item.model)?.specifications[0] || '标准型',
    connectionState: item.connectionState || (item.bluetoothConnected ? 'connected' : 'disconnected'),
  }))
  database.projects = database.projects.map((item) => ({
    ...item,
    deviceSpecification: item.deviceSpecification || database.deviceRegistrations.find((entry) => entry.serialNumber === item.serialNumber)?.specification || database.devices.find((device) => device.serialNumber === item.serialNumber)?.specification || '标准型',
  }))
  return database
}
