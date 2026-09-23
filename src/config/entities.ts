import type { EntityCollection } from '@/types/models'

export interface EntityField {
  key: string
  label: string
  labelEn: string
  type?: 'text' | 'number' | 'password' | 'textarea' | 'select' | 'date'
  required?: boolean
  placeholder?: string
  options?: Array<{ label: string; labelEn?: string; value: string }>
}

export interface EntityConfig {
  collection: EntityCollection
  title: string
  titleEn: string
  singular: string
  singularEn: string
  icon: string
  canCreate: boolean
  canDelete: boolean
  requiredCapability?: string
  fields: EntityField[]
}

export const entityConfigs: Record<EntityCollection, EntityConfig> = {
  devices: { collection: 'devices', title: '设备', titleEn: 'Devices', singular: '设备', singularEn: 'Device', icon: 'cpu', canCreate: false, canDelete: false, fields: [] },
  waypoints: { collection: 'waypoints', title: '航点列表', titleEn: 'Waypoints', singular: '航点', singularEn: 'Waypoint', icon: 'map-pin', canCreate: true, canDelete: true, requiredCapability: 'map.edit', fields: [
    { key: 'name', label: '航点名称', labelEn: 'Waypoint name', required: true, placeholder: '例如：返航检查点' },
    { key: 'lat', label: '纬度', labelEn: 'Latitude', type: 'number', required: true }, { key: 'lng', label: '经度', labelEn: 'Longitude', type: 'number', required: true },
    { key: 'note', label: '备注', labelEn: 'Notes', type: 'textarea', placeholder: '记录水深、作业时间等信息' },
  ] },
  routes: { collection: 'routes', title: '航迹设置', titleEn: 'Track settings', singular: '航迹', singularEn: 'Track', icon: 'route', canCreate: true, canDelete: true, requiredCapability: 'map.edit', fields: [
    { key: 'name', label: '航迹名称', labelEn: 'Track name', required: true },
  ] },
  projects: { collection: 'projects', title: '安装管理', titleEn: 'Installation management', singular: '安装项目', singularEn: 'Installation', icon: 'folder-kanban', canCreate: true, canDelete: false, requiredCapability: 'project.manage', fields: [
    { key: 'name', label: '项目名称', labelEn: 'Project name', required: true },
    { key: 'deviceType', label: '设备类型', labelEn: 'Device type', type: 'select', required: true, options: [] },
    { key: 'deviceModel', label: '设备型号', labelEn: 'Device model', type: 'select', required: true, options: [] },
    { key: 'deviceSpecification', label: '设备规格', labelEn: 'Device specification', type: 'select', required: true, options: [] },
    { key: 'serialNumber', label: '设备 SN 号', labelEn: 'Device serial', type: 'select', required: true, options: [] },
    { key: 'rodLength', label: '杆长', labelEn: 'Rod length', required: true },
    { key: 'vessel', label: '船名', labelEn: 'Vessel', required: true }, { key: 'ownerName', label: '船东姓名', labelEn: 'Owner name', required: true },
    { key: 'region', label: '使用地区', labelEn: 'Region', required: true }, { key: 'phone', label: '联系电话', labelEn: 'Phone', required: true },
    { key: 'email', label: '联系邮箱', labelEn: 'Email' }, { key: 'warrantyEnd', label: '质保截止', labelEn: 'Warranty end', type: 'date', required: true },
    { key: 'description', label: '项目说明', labelEn: 'Description', type: 'textarea' },
  ] },
  tickets: { collection: 'tickets', title: '售后管理', titleEn: 'Service management', singular: '售后记录', singularEn: 'Service record', icon: 'wrench', canCreate: true, canDelete: false, fields: [
    { key: 'title', label: '问题标题', labelEn: 'Issue title', required: true },
    { key: 'deviceId', label: '关联设备 ID', labelEn: 'Device ID' },
    { key: 'category', label: '服务类型', labelEn: 'Service type', type: 'select', required: true, options: [{ label: '故障报修', labelEn: 'Repair', value: 'repair' }, { label: '投诉', labelEn: 'Complaint', value: 'complaint' }, { label: '跨区转移', labelEn: 'Cross-region transfer', value: 'transfer' }, { label: '客服留言', labelEn: 'Message', value: 'message' }] },
    { key: 'description', label: '问题说明', labelEn: 'Description', type: 'textarea', placeholder: '选填，最多 500 字' }, { key: 'phone', label: '联系电话', labelEn: 'Phone' }, { key: 'email', label: '联系邮箱', labelEn: 'Email' },
  ] },
  dealers: { collection: 'dealers', title: '二级经销商管理', titleEn: 'Sub-dealers', singular: '二级经销商', singularEn: 'Sub-dealer', icon: 'store', canCreate: true, canDelete: false, requiredCapability: 'dealer.manage', fields: [
    { key: 'name', label: '网点名称', labelEn: 'Outlet name', required: true }, { key: 'manager', label: '负责人', labelEn: 'Manager', required: true },
    { key: 'phone', label: '登录手机号', labelEn: 'Login phone', required: true }, { key: 'email', label: '联系邮箱', labelEn: 'Email' }, { key: 'region', label: '服务地区', labelEn: 'Service region', required: true },
    { key: 'initialPassword', label: '初始登录密码', labelEn: 'Initial password', type: 'password', required: true },
  ] },
  employees: { collection: 'employees', title: '员工账号管理', titleEn: 'Staff accounts', singular: '员工账号', singularEn: 'Staff account', icon: 'users-round', canCreate: true, canDelete: false, requiredCapability: 'staff.manage', fields: [
    { key: 'name', label: '员工姓名', labelEn: 'Name', required: true }, { key: 'phone', label: '手机号码', labelEn: 'Phone', required: true },
    { key: 'roleName', label: '岗位角色', labelEn: 'Role', required: true }, { key: 'status', label: '账号状态', labelEn: 'Status', type: 'select', options: [{ label: '启用', labelEn: 'Enabled', value: 'enabled' }, { label: '停用', labelEn: 'Disabled', value: 'disabled' }] },
    { key: 'initialPassword', label: '初始登录密码', labelEn: 'Initial password', type: 'password', required: true },
  ] },
  materials: { collection: 'materials', title: '物料申请与审批', titleEn: 'Parts requests and approvals', singular: '物料申请', singularEn: 'Parts request', icon: 'package-plus', canCreate: true, canDelete: false, requiredCapability: 'material.apply', fields: [
    { key: 'catalogId', label: '物料', labelEn: 'Part', type: 'select', required: true, options: [] }, { key: 'projectId', label: '关联项目', labelEn: 'Project', type: 'select', required: true, options: [] },
    { key: 'quantity', label: '申请数量', labelEn: 'Quantity', type: 'number', required: true }, { key: 'reason', label: '申请原因', labelEn: 'Reason', type: 'textarea' },
  ] },
  shipments: { collection: 'shipments', title: '物流订单', titleEn: 'Shipments', singular: '物流订单', singularEn: 'Shipment', icon: 'truck', canCreate: false, canDelete: false, requiredCapability: 'material.apply', fields: [] },
  transfers: { collection: 'transfers', title: '设备分配与调拨', titleEn: 'Device assignment & transfer', singular: '调拨申请', singularEn: 'Transfer request', icon: 'shuffle', canCreate: true, canDelete: false, requiredCapability: 'device.assign', fields: [
    { key: 'deviceId', label: '设备', labelEn: 'Device', type: 'select', required: true, options: [] },
    { key: 'kind', label: '操作类型', labelEn: 'Type', type: 'select', required: true, options: [{ label: '分配给员工', labelEn: 'Assign to staff', value: 'assignment' }, { label: '调拨给经销商', labelEn: 'Transfer to dealer', value: 'reallocation' }] },
    { key: 'to', label: '目标员工 / 经销商', labelEn: 'Destination', required: true }, { key: 'operator', label: '操作人', labelEn: 'Operator', required: true },
  ] },
  purchases: { collection: 'purchases', title: '设备与配件采购', titleEn: 'Purchasing', singular: '采购单', singularEn: 'Purchase', icon: 'shopping-cart', canCreate: true, canDelete: false, requiredCapability: 'purchase.create', fields: [
    { key: 'catalogId', label: '商品', labelEn: 'Product', type: 'select', required: true, options: [] }, { key: 'quantity', label: '数量', labelEn: 'Quantity', type: 'number', required: true },
    { key: 'address', label: '收货地址', labelEn: 'Delivery address', type: 'textarea', required: true },
  ] },
  payments: { collection: 'payments', title: '支付记录', titleEn: 'Payments', singular: '支付记录', singularEn: 'Payment', icon: 'wallet-cards', canCreate: false, canDelete: false, fields: [] },
  orders: { collection: 'orders', title: '客户订单', titleEn: 'Customer Orders', singular: '客户订单', singularEn: 'Customer Order', icon: 'receipt-text', canCreate: false, canDelete: false, requiredCapability: 'price.view', fields: [] },
  messages: { collection: 'messages', title: '消息中心', titleEn: 'Messages', singular: '消息', singularEn: 'Message', icon: 'bell', canCreate: false, canDelete: true, fields: [] },
}

export function entityPrimary(item: Record<string, unknown>, locale: string) {
  if (locale !== 'zh-Hans') return String(item.nameEn || item.titleEn || item.orderNo || item.serialNumber || item.id)
  return String(item.name || item.title || item.orderNo || item.serialNumber || item.id)
}

export function localizedEntityText(value: unknown, locale: string) {
  const source = String(value ?? '')
  if (locale === 'zh-Hans') return source
  const dictionary: Record<string, string> = {
    '顶流机/制冰机': 'Surface jet / ice maker', '海水淡化器': 'Desalinator', '电池组': 'Battery bank',
    '海风号': 'Sea Wind', '林海': 'Hai Lin', '周工': 'Engineer Zhou', '陈佳': 'Jia Chen', '林经理': 'Manager Lin',
    '福建厦门': 'Xiamen, Fujian', '福建省': 'Fujian, China', '福建省泉州市': 'Quanzhou, Fujian', '福建省厦门市': 'Xiamen, Fujian',
    '厦门一级仓': 'Xiamen primary warehouse', '泉州远航服务网点': 'Quanzhou Voyage Service',
    '顺丰速运': 'SF Express', '京东物流': 'JD Logistics',
    '故障更换': 'Fault replacement', '安装备件': 'Installation spare', '安装工程师': 'Installation engineer', '售后专员': 'Service specialist',
    '顶流机-01 已恢复设备网络连接': 'Surface Jet-01 restored its device network connection', '顶流机-01 当前固件为 3.2.1': 'Surface Jet-01 is currently running firmware 3.2.1',
    '顺丰 SF1438265102，预计明日送达': 'SF Express SF1438265102 is expected tomorrow',
    '运行 30 分钟后温度升高': 'Temperature rises after 30 minutes of operation', '船只将前往广东作业': 'The vessel will operate in Guangdong',
    '用户提交报修': 'Repair request submitted', '经销商已受理': 'Accepted by dealer',
    '运输中': 'In transit', '已揽收': 'Collected', '已出库': 'Dispatched',
    '快件已到达厦门集散中心': 'Shipment arrived at the Xiamen distribution center', '厦门湖里营业点已揽收': 'Collected by the Xiamen Huli branch', '物料审核通过并完成出库': 'Parts approved and dispatched',
  }
  return dictionary[source] || source
}

export function entitySecondary(item: Record<string, unknown>, locale = 'zh-Hans') {
  if (item.model) return [localizedEntityText(item.category || item.deviceType, locale), item.model, item.serialNumber].filter(Boolean).join(' · ')
  if (item.manager) return `${localizedEntityText(item.manager, locale)} · ${localizedEntityText(item.region, locale)}`
  if (item.vessel) return `${localizedEntityText(item.vessel, locale)} · ${localizedEntityText(item.ownerName || item.customer, locale)}`
  if (item.carrier) return `${localizedEntityText(item.carrier, locale)} · ${item.trackingNumber || ''}`
  if (item.description) return localizedEntityText(item.description, locale)
  if (item.roleName) return `${localizedEntityText(item.roleName, locale)} · ${item.phone || ''}`
  if (item.quantity) return `${item.quantity} × ${localizedEntityText(item.reason || item.amount, locale)}`
  if (item.from) return `${localizedEntityText(item.from, locale)} → ${localizedEntityText(item.to, locale)}`
  if (item.amount) return `${item.currency || 'CNY'} ${item.amount}`
  if (item.body) return localizedEntityText(item.body, locale)
  if (item.lat) return `${Number(item.lat).toFixed(4)}, ${Number(item.lng).toFixed(4)}`
  if (Array.isArray(item.waypointIds)) return locale !== 'zh-Hans' ? `${item.waypointIds.length} waypoints · ${item.distanceKm || 0} km` : `${item.waypointIds.length} 个航点 · ${item.distanceKm || 0} km`
  return String(item.updatedAt || '')
}
