<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import { backgroundAssets } from '@/config/iconAssets'
import { entityConfigs, type EntityField } from '@/config/entities'
import { useAppStore } from '@/stores/app'
import { backOrFallback } from '@/utils/navigation'
import { projectService } from '@/services/project'
import { workflowService } from '@/services/workflow'
import { dealerService } from '@/services/dealer'
import { passwordValid } from '@/services/auth'
import { normalizeDeviceSerial } from '@/services/device'
import { scanAdapter } from '@/services/adapters'
import { routeService } from '@/services/routes'
import type { DealerOutlet, Employee, EntityCollection, MaterialRequest, Project, ReplacementMaterialLine, Ticket, Transfer, Waypoint } from '@/types/models'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const entityKey = ref<EntityCollection | 'profile'>('tickets')
const id = ref('')
const step = ref('')
const mode = ref('')
const type = ref('')
const originDeviceId = ref('')
const originProjectId = ref('')
const materialSource = ref<'standard' | 'serviceReplacement'>('standard')
const form = reactive<Record<string, any>>({})
const loadedItem = ref<Record<string, any> | null>(null)
const error = ref('')
const attachmentIds = ref<string[]>([])
const saving = ref(false)
const forbidden = ref(false)
const selectedCapabilities = ref<string[]>([])
const detailTab = ref('installation')
function projectRecordStatus(status: string, material = false) {
  const labels: Record<string, [string, string]> = {
    submitted: ['待受理', 'Submitted'], processing: ['处理中', 'Processing'], parts: ['待配件', 'Waiting for parts'],
    pending: [material ? '待审批' : '待处理', 'Pending'], approved: ['已通过', 'Approved'], shipping: ['运输中', 'Shipping'],
    received: ['已签收', 'Received'], installed: ['已安装', 'Installed'], completed: ['已完成', 'Completed'], rejected: ['已驳回', 'Rejected'],
  }
  const label = labels[status]
  return label ? l(label[0], label[1]) : status
}
const dealerTeam = computed(() => store.hasCapability('staff.manage') ? (store.db?.employees || []).filter(item => item.dealerId === loadedItem.value?.id) : [])
const dealerDevices = computed(() => store.hasCapability('project.manage') ? (store.db?.devices || []).filter(item => item.dealerId === loadedItem.value?.id) : [])
function businessCapabilityLabel(key: string) {
  const option = capabilityOptions.find(item => item[0] === key)
  if (option) return l(option[1],option[2])
  const grouped = employeePermissionGroups.value.flatMap(group => group.items).find(item => item.key === key)
  return grouped?.title || ({ 'dealer.manage':l('下级网点管理','Sub-dealer management'), 'device.control':l('设备控制','Device control'), 'project.view':l('项目查询','Project lookup'), 'map.edit':l('航点与航迹管理','Waypoints and tracks') } as Record<string,string>)[key] || l('其他业务权限','Additional business access')
}
const projectMenu = ref(false)
const pickerField = ref<EntityField | null>(null)
const pickerSearch = ref('')
const projectSerialMode = ref<'search' | 'manual'>('search')
const rodLengthMode = ref<'catalog' | 'manual'>('catalog')
const projectSerialBusy = ref(false)
const materialLineQuantities = reactive<Record<string, number>>({})
const replacementLines = ref<ReplacementMaterialLine[]>([])
const dealerPermissionState = reactive<Record<string, boolean>>({ project: true, support: true, purchase: true, transfer: true, price: false })
const imageAttachmentCount = computed(() => attachmentIds.value.filter((id) => store.db?.attachments.find((item) => item.id === id)?.kind === 'image').length)
const videoAttachmentCount = computed(() => attachmentIds.value.filter((id) => store.db?.attachments.find((item) => item.id === id)?.kind === 'video').length)
const isProjectDeviceForm = computed(() => entityKey.value === 'projects' && step.value === 'device' && !id.value)
const isProjectCustomerForm = computed(() => entityKey.value === 'projects' && step.value === 'customer' && !id.value)
const isMaterialRequestForm = computed(() => entityKey.value === 'materials' && !id.value)
const isDealerAssignmentForm = computed(() => entityKey.value === 'transfers' && mode.value === 'dealer-assignment' && !id.value)
const isAssignmentForm = computed(() => entityKey.value === 'transfers' && ['assignment', 'dealer-assignment'].includes(mode.value) && !id.value)
const isWaypointLocationForm = computed(() => entityKey.value === 'waypoints' && store.designCaseId === 'M03' && !id.value)
const waypointServerStorage = computed(() => store.db?.settings.waypointStorage === 'cloud')
const isDealerRepairForm = computed(() => entityKey.value === 'tickets' && form.category === 'repair' && store.isDealer && !id.value)
const isCurrentDeviceRepair = computed(() => entityKey.value === 'tickets' && form.category === 'repair' && Boolean(originDeviceId.value) && !id.value)
const fixedRepairDevice = computed(() => store.db?.devices.find((item) => item.id === originDeviceId.value))
const materialCatalog = computed(() => store.db?.materialCatalog || [])
const projectAttachments = computed(() => (loadedItem.value?.attachmentIds || []).map((attachmentId: string) => store.db?.attachments.find((item) => item.id === attachmentId)).filter(Boolean))
const currentDealer = computed(() => store.db?.dealers.find((item) => item.id === store.account?.dealerId))
const assignmentDevice = computed(() => store.db?.devices.find((item) => item.id === form.deviceId))
const assignmentTarget = computed(() => form.kind === 'reallocation' || isDealerAssignmentForm.value
  ? store.db?.dealers.find((item) => item.id === form.to)
  : store.db?.employees.find((item) => item.id === form.to))
const assignmentNotice = computed(() => form.kind === 'reallocation'
  ? l(`提交后将由后台审核调拨至${assignmentTarget.value?.name || '所选二级经销商'}，审核前设备归属不变。`, `After submission, the platform reviews the transfer to ${assignmentTarget.value?.name || 'the selected sub-dealer'}. Ownership remains unchanged until approval.`)
  : isDealerAssignmentForm.value
    ? l(`确认后设备归属将立即变更为${assignmentTarget.value?.name || '所选二级经销商'}，并保留分配记录。`, `The device will immediately belong to ${assignmentTarget.value?.name || 'the selected sub-dealer'}, and the assignment will be recorded.`)
    : l(`确认后设备将分配给${assignmentTarget.value?.name || '所选员工'}，并写入不可删除的分配记录。`, `The device will be assigned to ${assignmentTarget.value?.name || 'the selected staff member'} and recorded in the immutable assignment history.`))
const isEmployeePermissions = computed(() => entityKey.value === 'employees' && mode.value === 'permissions')
const projectDeviceCandidates = computed(() => {
  if (entityKey.value !== 'projects') return []
  const dealerIds = store.context.dealerScopeIds
  if (!dealerIds.length) return []
  const assignedSerials = new Set((store.db?.projects || []).filter((item) => item.id !== id.value).map((item) => item.serialNumber))
  const candidates = [
    ...(store.db?.deviceRegistrations || []).filter((item) => dealerIds.includes(item.dealerId) && item.status !== 'blocked' && !assignedSerials.has(item.serialNumber)).map((item) => ({
      serialNumber: item.serialNumber, model: item.model, type: item.category, typeEn: item.categoryEn,
      specification: item.specification, salesRegion: item.salesRegion, currentRegion: item.lastKnownRegion || item.salesRegion,
      name: item.category, nameEn: item.categoryEn,
    })),
    ...(store.db?.devices || []).filter((item) => Boolean(item.dealerId && dealerIds.includes(item.dealerId)) && !assignedSerials.has(item.serialNumber)).map((item) => ({
      serialNumber: item.serialNumber, model: item.model, type: item.category, typeEn: item.categoryEn,
      specification: item.specification, salesRegion: item.salesRegion, currentRegion: item.salesRegion,
      name: item.name, nameEn: item.nameEn,
    })),
  ].filter((item, index, list) => list.findIndex((entry) => entry.serialNumber === item.serialNumber) === index)
  return candidates.filter((item) => (!form.deviceType || item.type === form.deviceType) && (!form.deviceModel || item.model === form.deviceModel))
})
const selectedProjectCandidate = computed(() => projectDeviceCandidates.value.find((item) => item.serialNumber === form.serialNumber)
  || [...(store.db?.deviceRegistrations || []), ...(store.db?.devices || [])].find((item) => item.serialNumber === form.serialNumber))
const selectedProjectModel = computed(() => store.db?.deviceModels.find((item) => item.model === form.deviceModel))
const projectFactoryRegion = computed(() => {
  const selected = selectedProjectCandidate.value as { currentRegion?: string; lastKnownRegion?: string; salesRegion?: string } | undefined
  return String(selected?.lastKnownRegion || selected?.salesRegion || selected?.currentRegion || store.projectDraft.factoryRegion || '')
})
const projectNeedsRegionApproval = computed(() => {
  if (!isProjectCustomerForm.value || !form.region) return false
  const salesRegion = currentDealer.value?.region || ''
  return Boolean(salesRegion && (!regionCovered(String(form.region), salesRegion) || Boolean(projectFactoryRegion.value && !regionCovered(projectFactoryRegion.value, salesRegion))))
})
const employeePermissionGroups = computed(() => [
  { label:l('项目权限','Project permissions'), items:[
    { key:'project.view', icon:'folder-search', tone:'brand', skin:'', title:l('查询项目','Search projects'), copy:l('仅当前经销商负责范围','Current dealer scope only') },
    { key:'project.manage', icon:'folder-plus', tone:'brand', skin:'', title:l('创建安装项目','Create installation projects'), copy:'' },
    { key:'customer.edit', icon:'pencil', tone:'brand', skin:'', title:l('编辑客户资料','Edit customer profiles'), copy:'' },
  ]},
  { label:l('售后权限','Service permissions'), items:[
    { key:'support.manage', icon:'wrench', tone:'warning', skin:'warning', title:l('新建售后记录','Create service records'), copy:'' },
    { key:'material.apply', icon:'package-plus', tone:'brand', skin:'', title:l('提交物料申请','Submit parts requests'), copy:'' },
    { key:'price.view', icon:'badge-dollar-sign', tone:'brand', skin:'', title:l('查看采购价格','View purchase prices'), copy:'' },
  ]},
  { label:l('设备权限','Device permissions'), items:[
    { key:'device.view', icon:'cpu', tone:'brand', skin:'', title:l('查看设备信息','View device information'), copy:'' },
    { key:'device.assign', icon:'shuffle', tone:'accent', skin:'purple', title:l('分配与调货设备','Assign and transfer devices'), copy:'' },
  ]},
])
const supportDesignFields = computed(() => {
  const rows = {
    S02: [
      [l('问题描述','Issue description'),'',l('请描述遇到的问题或需要的帮助','Describe the issue or help needed'),'textarea',false],
      [l('处理对象','Destination'),'forward',l('所属经销商 · 厦门总代理','Assigned dealer · Xiamen agency'),'select',false],
      [l('联系电话','Phone'),'phone','138 0000 2861','',false], [l('联系邮箱','Email'),'mail','ca***@mail.com','',false],
    ],
    S03: [
      [l('报修设备','Device'),'fan',l('顶流机-01 · DL-3000','Surface jet-01 · DL-3000'),'select',false],
      [l('故障分类','Fault type'),'wrench',l('水下电机','Underwater motor'),'select',false],
      [l('故障描述','Description'),'',l('运行约 10 分钟后出现异响，停止并重启后仍然存在。','Noise appears after 10 minutes and remains after restart.'),'textarea',true],
      [l('联系电话','Phone'),'phone','138 0000 2861','',false], [l('联系邮箱','Email'),'mail','ca***@mail.com','',false],
    ],
    S06: [
      [l('投诉对象','Complaint target'),'building-2',l('厦门总代理','Xiamen agency'),'select',false],
      [l('关联内容','Related item'),'link-2',l('服务单 BX20260810001','Ticket BX20260810001'),'select',false],
      [l('投诉类型','Complaint type'),'message-square-warning',l('服务响应','Service response'),'select',false],
      [l('投诉说明','Description'),'',l('请描述具体情况、期望处理方式和可联系时间。','Describe the situation, expected resolution, and contact time.'),'textarea',false],
    ],
    S07: [
      [l('关联设备','Device'),'fan',l('顶流机-01 · DL-3000','Surface jet-01 · DL-3000'),'select',false],
      [l('原服务地区','Origin region'),'map-pin',l('福建省厦门市','Xiamen, Fujian'),'','false'],
      [l('目标服务地区','Target region'),'map-pinned',l('广东省深圳市','Shenzhen, Guangdong'),'select',false],
      [l('转移原因','Reason'),'',l('船只长期停靠地已变更','The vessel base has changed'),'textarea',false],
      [l('联系电话','Phone'),'phone','138 0000 2861','',false],
    ],
  } as Record<string, Array<[string,string,string,string,boolean | string]>>
  return rows[store.designCaseId] || []
})
const capabilityOptions = [
  ['project.manage', '安装项目', 'Installation projects'], ['support.manage', '售后工单', 'Service tickets'], ['material.apply', '物料申请', 'Parts requests'], ['material.approve', '物料审批', 'Parts approval'],
  ['device.assign', '设备分配', 'Device assignment'], ['purchase.create', '采购下单', 'Purchasing'], ['price.view', '价格查看', 'View prices'], ['staff.manage', '员工管理', 'Staff management'],
]
const profileFields: EntityField[] = [
  { key: 'displayName', label: '昵称 / 组织名称', labelEn: 'Display name', required: true },
  { key: 'phone', label: '手机号码', labelEn: 'Phone' }, { key: 'email', label: '邮箱', labelEn: 'Email' },
]
const config = computed(() => entityKey.value === 'profile' ? null : entityConfigs[entityKey.value])
const projectDevices = computed(() => {
  if (entityKey.value !== 'projects' || !loadedItem.value) return []
  return (store.db?.devices || []).filter((item) => item.serialNumber === loadedItem.value?.serialNumber)
})
const projectTickets = computed(() => entityKey.value === 'projects' && loadedItem.value
  ? (store.db?.tickets || []).filter((item) => item.deviceId
    ? projectDevices.value.some((device) => device.id === item.deviceId)
    : item.projectId === loadedItem.value?.id)
  : [])
const projectMaterials = computed(() => entityKey.value === 'projects' && loadedItem.value
  ? (store.db?.materials || []).filter((item) => item.projectId === loadedItem.value?.id)
  : [])
const projectDevice = computed(() => projectDevices.value[0])
const projectStatusLabel = computed(() => ({ pendingApproval: l('待跨区审核', 'Region review pending'), installing: l('安装中', 'Installing'), active: l('质保中', 'Under warranty'), aftersales: l('售后中', 'In service'), completed: l('已完成', 'Completed'), rejected: l('审核已拒绝', 'Review rejected') } as Record<string, string>)[String(loadedItem.value?.status)] || String(loadedItem.value?.status || ''))
const projectTimeline = computed(() => {
  if (!loadedItem.value) return []
  const project = loadedItem.value
  const device = projectDevice.value
  if (store.designCaseId === 'B06') return [
    { title:l('设备安装完成','Device installation completed'), text:l('安装人员：林工','Installer: Engineer Lin'), at:'2026-03-18T16:32:00.000Z' },
    { title:l('地区校验通过','Region verification passed'), text:l('福建省厦门市','Xiamen, Fujian'), at:'2026-03-18T16:40:00.000Z' },
    { title:l('设备绑定激活','Device bound and activated'), text:l('用户：陈先生','User: Mr. Chen'), at:'2026-03-18T16:43:00.000Z' },
  ]
  return [
    { title: l('安装项目已创建', 'Installation project created'), text: `${project.ownerName} · ${project.region}`, at: project.createdAt },
    ...(project.crossRegionRequired ? [{ title: project.crossRegionStatus === 'approved' ? l('跨区安装审核通过', 'Cross-region installation approved') : project.crossRegionStatus === 'rejected' ? l('跨区安装审核已拒绝', 'Cross-region installation rejected') : l('跨区安装已提交后台审核', 'Cross-region installation submitted for review'), text: `${project.factoryRegion} → ${project.region}`, at: project.updatedAt }] : []),
    { title: l('设备信息已关联', 'Device linked'), text: `${project.serialNumber} · ${project.deviceModel}`, at: project.updatedAt },
    ...(device?.activatedAt ? [{ title: l('设备绑定激活', 'Device activated'), text: store.locale !== 'zh-Hans' ? device.nameEn : device.name, at: device.activatedAt }] : []),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)))
})
const fields = computed<EntityField[]>(() => {
  if (entityKey.value === 'profile') return profileFields
  let result = [...(config.value?.fields || [])]
  if (id.value && (entityKey.value === 'employees' || entityKey.value === 'dealers')) result = result.filter((field) => field.key !== 'initialPassword')
  if (entityKey.value === 'projects' && step.value === 'device') result = result.filter((field) => ['deviceType', 'deviceModel', 'deviceSpecification', 'serialNumber', 'rodLength'].includes(field.key))
  if (entityKey.value === 'projects' && step.value === 'customer') result = result.filter((field) => ['vessel', 'ownerName', 'region', 'phone', 'email', 'warrantyEnd', 'description'].includes(field.key))
  if (entityKey.value === 'projects') result = result.map((field) => {
    const candidates = projectDeviceCandidates.value
    if (field.key === 'serialNumber') return { ...field, options: candidates.map((item) => ({ label: `${item.serialNumber} · ${item.name} · ${item.model}`, labelEn: `${item.serialNumber} · ${item.nameEn} · ${item.model}`, value: item.serialNumber })) }
    if (field.key === 'deviceType') {
      const types = [...(store.db?.deviceModels || []).map((item) => ({ value: item.category, label: item.category, labelEn: item.categoryEn })), ...candidates.map((item) => ({ value: item.type, label: item.type, labelEn: item.typeEn }))]
        .filter((item, index, list) => list.findIndex((entry) => entry.value === item.value) === index)
      return { ...field, options: types }
    }
    if (field.key === 'deviceModel') {
      const models = [...(store.db?.deviceModels || []).filter((item) => !form.deviceType || item.category === form.deviceType).map((item) => ({ model: item.model, name: item.name, nameEn: item.nameEn })), ...candidates.map((item) => ({ model: item.model, name: item.name, nameEn: item.nameEn }))].filter((item, index, list) => list.findIndex((entry) => entry.model === item.model) === index)
      return { ...field, options: models.map((item) => ({ label: `${item.name} · ${item.model}`, labelEn: `${item.nameEn} · ${item.model}`, value: item.model })) }
    }
    if (field.key === 'deviceSpecification') return { ...field, options: (selectedProjectModel.value?.specifications || []).map((value) => ({ label: value, value })) }
    if (field.key === 'rodLength') return { ...field, type: 'select' as const, options: (selectedProjectModel.value?.rodLengths || []).map((value) => ({ label: value, value })) }
    if (field.key === 'region') return { ...field, type: 'select' as const, options: ['福建省厦门市', '福建省泉州市', '福建省福州市', '广东省汕头市'].map((value) => ({ label: value, value })) }
    return field
  })
  if (entityKey.value === 'tickets') {
    const category = String(form.category || 'repair')
    const availableDevices = (store.db?.devices || []).filter((item) => store.isDealer ? Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) : item.ownerId === store.account?.id)
    result = result.filter((field) => field.key !== 'title').map((field) => field.key === 'deviceId' ? {
      ...field,
      label: category === 'repair' ? '报修设备' : '关联设备',
      labelEn: 'Service device',
      type: 'select' as const,
      required: ['repair', 'transfer'].includes(category),
      options: availableDevices.map((item) => ({ label: `${item.category} · ${item.model} · ${item.serialNumber}`, labelEn: `${item.categoryEn} · ${item.model} · ${item.serialNumber}`, value: item.id })),
    } : field)
    if (category === 'repair') {
      result.splice(1, 0, { key: 'faultCategory', label: '故障分类', labelEn: 'Fault category', type: 'select', required: true, options: [['水下电机','Underwater motor'],['提升','Lift'],['转向','Steering'],['接线盒','Junction box'],['其他','Other']].map(([label, labelEn]) => ({ label, labelEn, value: label })) })
      if (isCurrentDeviceRepair.value) result = result.filter((field) => !['category', 'deviceId'].includes(field.key))
      else if (['S03', 'B07'].includes(store.designCaseId)) result = result.filter((field) => field.key !== 'category')
    }
    if (category === 'complaint') {
      const orders = (store.db?.orders || []).filter((item) => item.ownerId === store.account?.id || Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)))
      result.splice(1, 0,
        { key: 'orderId', label: '关联订单', labelEn: 'Related order', type: 'select', required: true, options: orders.map((item) => ({ label: `${item.orderNo} · ${item.title}`, labelEn: `${item.orderNo} · ${item.titleEn}`, value: item.id })) },
        { key: 'serialNumber', label: '设备 SN', labelEn: 'Device serial', type: 'select', required: true, options: availableDevices.map((item) => ({ label: `${item.serialNumber} · ${item.name}`, labelEn: `${item.serialNumber} · ${item.nameEn}`, value: item.serialNumber })) },
      )
    }
    if (category === 'transfer') {
      const selected = availableDevices.find((item) => item.id === form.deviceId)
      const project = selected?.projectId ? store.db?.projects.find((item) => item.id === selected.projectId) : undefined
      const originRegion = project?.region || selected?.salesRegion || ''
      const regionOptions = ['福建省厦门市', '福建省泉州市', '福建省福州市', '广东省汕头市'].filter((value) => value !== originRegion).map((value) => ({ label: value, value }))
      result.splice(2, 0,
        { key: 'originRegion', label: '原服务地区', labelEn: 'Origin region', type: 'select', required: true, options: originRegion ? [{ label: originRegion, value: originRegion }] : [] },
        { key: 'targetRegion', label: '目标服务地区', labelEn: 'Target region', type: 'select', required: true, options: regionOptions },
      )
    }
  }
  if (entityKey.value === 'materials') result = result.filter((field) => !['catalogId', 'quantity'].includes(field.key)).map((field) => {
    if (field.key === 'projectId') return { ...field, options: (store.db?.projects || []).filter((item) => store.context.dealerScopeIds.includes(item.dealerId)).map((item) => ({ label: `${item.name} · ${item.vessel}`, labelEn: `${item.nameEn} · ${item.vessel}`, value: item.id })) }
    return field
  })
  if (entityKey.value === 'transfers') result = result.map((field) => {
    if (field.key === 'deviceId') return { ...field, options: (store.db?.devices || []).filter((item) => item.dealerId === store.account?.dealerId && (!isDealerAssignmentForm.value || (item.activationStatus === 'registered' && !item.ownerId && !item.projectId && !item.assignedTo))).map((item) => ({ label: `${item.category} · ${item.model} · ${item.serialNumber}`, labelEn: `${item.categoryEn} · ${item.model} · ${item.serialNumber}`, value: item.id })) }
    if (field.key === 'to') {
      const targets = form.kind === 'reallocation' || isDealerAssignmentForm.value
        ? (store.db?.dealers || []).filter((item) => item.parentId === store.account?.dealerId && item.status === 'enabled').map((item) => ({ label: item.name, labelEn: item.nameEn, value: item.id }))
        : (store.db?.employees || []).filter((item) => item.dealerId === store.account?.dealerId && item.status === 'enabled').map((item) => ({ label: `${item.name} · ${item.roleName}`, value: item.id }))
      return {
        ...field,
        ...(isDealerAssignmentForm.value ? { label: '接收二级经销商', labelEn: 'Receiving sub-dealer' } : {}),
        type: 'select' as const,
        options: targets,
      }
    }
    return field
  })
  return result
})
const visiblePickerOptions = computed(() => {
  const options = pickerField.value?.options || []
  const keyword = pickerSearch.value.trim().toLocaleLowerCase()
  if (!keyword) return options
  return options.filter((option) => `${option.label} ${option.labelEn || ''} ${option.value}`.toLocaleLowerCase().includes(keyword))
})
const singular = computed(() => entityKey.value === 'profile' ? l('个人资料', 'Profile') : store.locale !== 'zh-Hans' ? config.value?.singularEn : config.value?.singular)
const title = computed(() => {
  if (isWaypointLocationForm.value) return l('保存当前位置', 'Save current location')
  if (store.designCaseId === 'M04') return l('航点详情', 'Waypoint details')
  if (store.designCaseId === 'B07') return l('新建售后记录', 'New service record')
  if (isAssignmentForm.value) return l('确认设备分配', 'Confirm device assignment')
  if (isMaterialRequestForm.value) return l('物料申请', 'Parts request')
  if (mode.value === 'detail') return entityKey.value === 'projects' ? l('项目详情', 'Project details') : l(`${singular.value}详情`, `${singular.value} details`)
  if (mode.value === 'permissions') return l('员工权限', 'Staff permissions')
  if (mode.value === 'view') return l('个人资料', 'Profile')
  if (entityKey.value === 'tickets' && !id.value) return ({ repair: l('故障报修', 'Fault Repair'), complaint: l('提交投诉', 'Submit Complaint'), transfer: l('跨区售后转移', 'Cross-region Service'), message: l('客服留言', 'Customer Service Message') } as Record<string, string>)[String(form.category || 'repair')]
  if (entityKey.value === 'projects' && step.value) return l('新建安装项目', 'New installation project')
  return id.value ? l(`编辑${singular.value}`, `Edit ${singular.value}`) : l(`新建${singular.value}`, `New ${singular.value}`)
})
const fallbackUrl = computed(() => {
  if (entityKey.value === 'profile') return '/pages/shell/index?tab=profile'
  if (entityKey.value === 'projects' && step.value === 'customer' && !id.value) return '/pages/manage/form?entity=projects&step=device'
  if (entityKey.value === 'projects') return '/pages/manage/list?entity=projects&state=search'
  if (originDeviceId.value && ['tickets', 'transfers'].includes(entityKey.value)) return `/pages/device/detail?id=${encodeURIComponent(originDeviceId.value)}`
  return `/pages/manage/list?entity=${entityKey.value}`
})
const selectedMaterial = computed(() => store.db?.materialCatalog.find((item) => item.id === form.catalogId))
const materialPrice = computed(() => selectedMaterial.value?.dealerPrice)
const materialReserved = computed(() => (store.db?.materials || [])
  .filter((item) => item.catalogId === form.catalogId && ['pending', 'approved'].includes(item.status) && item.id !== id.value)
  .reduce((sum, item) => sum + Number(item.quantity || 0), 0))
const materialAvailable = computed(() => Math.max(0, Number(selectedMaterial.value?.stock || 0) - materialReserved.value))
const selectedMaterialProject = computed(() => store.db?.projects.find((item) => item.id === form.projectId))
const compatibleMaterialCatalog = computed(() => {
  const project = selectedMaterialProject.value
  if (!project) return []
  return materialCatalog.value.filter((item) => (!item.compatibleDeviceTypes?.length || item.compatibleDeviceTypes.includes(project.deviceType))
    && (!item.compatibleDeviceModels?.length || item.compatibleDeviceModels.includes(project.deviceModel)))
})
const selectedMaterialLines = computed(() => compatibleMaterialCatalog.value
  .filter((item) => Number(materialLineQuantities[item.id] || 0) > 0)
  .map((item) => ({ catalogId: item.id, quantity: Number(materialLineQuantities[item.id]), item })))
const materialRequestTotalCount = computed(() => selectedMaterialLines.value.reduce((sum, line) => sum + line.quantity, 0))
const materialRequestTotalAmount = computed(() => selectedMaterialLines.value.reduce((sum, line) => sum + line.quantity * line.item.dealerPrice, 0))
const submitLabel = computed(() => {
  if (saving.value) return l('提交中', 'Submitting')
  if (store.designCaseId === 'B07') return l('保存售后记录', 'Save service record')
  if (isAssignmentForm.value) return form.kind === 'reallocation' ? l('提交调拨申请', 'Submit transfer') : isDealerAssignmentForm.value ? l('确认分配给经销商', 'Assign to dealer') : l('确认分配设备', 'Confirm assignment')
  if (isMaterialRequestForm.value) return l('提交申请', 'Submit request')
  if (entityKey.value === 'projects' && step.value === 'device') return l('下一步：客户信息', 'Next: Customer information')
  if (entityKey.value === 'projects' && step.value === 'customer') return projectNeedsRegionApproval.value ? l('提交跨区安装审核', 'Submit cross-region review') : l('创建安装项目', 'Create installation project')
  if (entityKey.value !== 'tickets') return l('保存', 'Save')
  return ({ repair: l('提交报修', 'Submit Repair'), complaint: l('提交投诉', 'Submit Complaint'), transfer: l('提交转移申请', 'Submit Transfer'), message: l('提交留言', 'Submit Message') } as Record<string, string>)[String(form.category || 'repair')]
})

onLoad(async (query) => {
  await store.init()
  const requested = String(query?.entity || 'tickets')
  if (requested === 'profile') return uni.redirectTo({ url: `/pages/profile/detail?mode=${String(query?.mode || 'view')}` })
  if (requested === 'profile' || entityConfigs[requested as EntityCollection]) entityKey.value = requested as EntityCollection | 'profile'
  detailTab.value = requested === 'projects' ? 'installation' : 'overview'
  id.value = String(query?.id || '')
  step.value = String(query?.step || '')
  mode.value = String(query?.mode || '')
  type.value = String(query?.type || '')
  originDeviceId.value = String(query?.deviceId || '')
  originProjectId.value = String(query?.projectId || '')
  materialSource.value = query?.source === 'serviceReplacement' ? 'serviceReplacement' : 'standard'
  if (config.value?.requiredCapability && !store.hasCapability(config.value.requiredCapability)) forbidden.value = true
  if (isDealerAssignmentForm.value && currentDealer.value?.level !== 1) forbidden.value = true
  if (store.isGuest) forbidden.value = true
  if (entityKey.value === 'profile' && store.account) Object.assign(form, { displayName: store.locale !== 'zh-Hans' ? store.account.displayNameEn : store.account.displayName, phone: store.account.phone || '', email: store.account.email || '' })
  else if (id.value && config.value) {
    try {
      const item = await store.get<RecordEntity>(config.value.collection, id.value)
      if (item) {
        loadedItem.value = item as unknown as Record<string, any>
        for (const field of config.value.fields) form[field.key] = String((item as any)[field.key] ?? '')
        if (entityKey.value === 'tickets') {
          const legacyLine = (item as Ticket).originalMaterialId && (item as Ticket).replacementMaterialId
            ? [{ id: `replacement-${item.id}-legacy`, originalCatalogId: String((item as Ticket).originalMaterialId), replacementCatalogId: String((item as Ticket).replacementMaterialId), quantity: Number((item as Ticket).replacementQuantity || 1) }]
            : []
          replacementLines.value = Array.isArray((item as Ticket).replacementLines) && (item as Ticket).replacementLines!.length
            ? (item as Ticket).replacementLines!.map((line) => ({ ...line }))
            : legacyLine
        }
        if (entityKey.value === 'tickets' || entityKey.value === 'projects') attachmentIds.value = [...((item as any).attachmentIds || [])]
        if (entityKey.value === 'materials') for (const line of ((item as any).items || [])) materialLineQuantities[line.catalogId] = Number(line.quantity || 1)
        if (entityKey.value === 'employees' || entityKey.value === 'dealers') selectedCapabilities.value = [...((item as any).capabilities || [])]
      }
    } catch { forbidden.value = true }
  } else {
    setDefaults()
    if (query?.category && entityKey.value === 'tickets') form.category = String(query.category)
    if (query?.deviceId && entityKey.value === 'tickets') form.deviceId = String(query.deviceId)
    if (query?.projectId && entityKey.value === 'tickets') form.projectId = String(query.projectId)
    if (query?.deviceId && entityKey.value === 'transfers') form.deviceId = String(query.deviceId)
    applyDesignFixture()
    if (entityKey.value === 'tickets' && form.category === 'transfer' && form.deviceId) {
      const selectedDevice = store.db?.devices.find((item) => item.id === form.deviceId)
      const project = selectedDevice?.projectId ? store.db?.projects.find((item) => item.id === selectedDevice.projectId) : undefined
      form.originRegion = project?.region || selectedDevice?.salesRegion || ''
      if (form.targetRegion === form.originRegion) form.targetRegion = ''
    }
    if (isMaterialRequestForm.value && form.catalogId) materialLineQuantities[String(form.catalogId)] = Number(form.quantity || 1)
    if (isProjectCustomerForm.value && !form.region) {
      const registration = store.db?.deviceRegistrations.find((item) => item.serialNumber === form.serialNumber)
      form.region = registration?.salesRegion || '福建省厦门市'
    }
  }
})

type RecordEntity = { id: string; createdAt: string; updatedAt: string } & Record<string, any>
function setDefaults() {
  for (const field of config.value?.fields || []) form[field.key] = field.type === 'number' ? 1 : ''
  if (entityKey.value === 'waypoints') Object.assign(form, { lat: 24.4852, lng: 118.0921 })
  if (entityKey.value === 'projects') {
    Object.assign(form, store.projectDraft)
    if (!form.warrantyEnd) {
      const date = new Date()
      date.setFullYear(date.getFullYear() + (currentDealer.value?.defaultWarrantyYears || 2))
      form.warrantyEnd = date.toISOString().slice(0, 10)
    }
  }
  if (entityKey.value === 'employees') { form.status = 'enabled'; selectedCapabilities.value = ['project.manage', 'support.manage'] }
  if (entityKey.value === 'dealers') { form.initialPassword = ''; selectedCapabilities.value = ['project.manage', 'support.manage', 'material.apply'] }
  if (entityKey.value === 'employees') form.initialPassword = ''
  if (entityKey.value === 'tickets') {
    Object.assign(form, { category: 'repair', phone: store.account?.phone || '', email: store.account?.email || '', replacementRequired: false, replacementQuantity: 1, serviceCharge: 0 })
    replacementLines.value = []
  }
  if (entityKey.value === 'tickets' && !form.deviceId) form.deviceId = store.db?.devices.find((item) => store.isDealer ? Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) : item.ownerId === store.account?.id)?.id || ''
  if (entityKey.value === 'transfers') Object.assign(form, { kind: ['assignment', 'dealer-assignment'].includes(mode.value) ? 'assignment' : 'reallocation', from: l('厦门一级仓', 'Xiamen primary warehouse'), operator: store.locale !== 'zh-Hans' ? store.account?.displayNameEn || 'Administrator' : store.account?.displayName || '管理员' })
}
function applyDesignFixture() {
  const caseId = store.designCaseId
  if (entityKey.value === 'employees' && mode.value === 'permissions') selectedCapabilities.value = ['project.view','project.manage','support.manage','material.apply','device.view']
  if (entityKey.value === 'projects' && caseId === 'B04') Object.assign(form, {
    serialNumber: 'DL300020240101', deviceType: '顶流机/制冰机', deviceModel: 'DL-3000', deviceSpecification: '标准型', rodLength: '2.4m', factoryRegion: '福建省厦门市',
  })
  if (entityKey.value === 'projects' && caseId === 'B05') Object.assign(form, {
    vessel: '海风号', serialNumber: 'DL300020240101', deviceType: '顶流机/制冰机', deviceModel: 'DL-3000', deviceSpecification: '标准型', rodLength: '2.4m', factoryRegion: '福建省厦门市', ownerName: '陈先生', region: '福建省厦门市', phone: '138 0000 2861', email: 'chen@seawind.com', warrantyEnd: '2028-03-17', description: '安装于船尾 1 号机位',
  })
  if (entityKey.value === 'materials' && caseId === 'B08') Object.assign(form, {
    catalogId: 'catalog-04', projectId: 'pro-01', quantity: 1, reason: '设备故障更换，现场库存不足',
  })
  if (entityKey.value === 'waypoints' && caseId === 'M03') Object.assign(form, {
    name: '东侧钓点', lat: 24.496218, lng: 118.092833, note: '水深约 28m，避开北侧暗礁',
  })
  if (entityKey.value === 'tickets' && ['S03', 'B07'].includes(caseId)) Object.assign(form, {
    deviceId: 'dev-01', category: 'repair', faultCategory: '水下电机', description: '运行约 10 分钟后出现异响，停止并重启后仍然存在。', phone: '13800002861', email: 'ca***@mail.com',
  })
  if (entityKey.value === 'tickets' && caseId === 'S02') Object.assign(form, {
    deviceId: 'dev-01', category: 'message', description: '请协助确认离线航点同步规则。', phone: '13800002861', email: 'ca***@mail.com',
  })
  if (entityKey.value === 'tickets' && caseId === 'S06') Object.assign(form, {
    deviceId: 'dev-01', category: 'complaint', description: '售后处理进度长时间没有更新，请尽快联系。', phone: '13800002861', email: 'ca***@mail.com',
  })
  if (entityKey.value === 'tickets' && caseId === 'S07') Object.assign(form, {
    deviceId: 'dev-01', category: 'transfer', originRegion: '福建省厦门市', targetRegion: '广东省汕头市', description: '船只将前往广东作业', phone: '13800002861', email: 'ca***@mail.com',
  })
}
function optionLabel(option: NonNullable<EntityField['options']>[number]) {
  return store.locale !== 'zh-Hans' ? option.labelEn || option.label : option.label
}
function openPicker(field: EntityField) {
  if (field.options?.length || field.key === 'serialNumber') {
    pickerSearch.value = ''
    pickerField.value = field
  }
}
function openField(key: string) {
  const field = fields.value.find((item) => item.key === key)
  if (field) openPicker(field)
}
function setAssignmentKind(kind: 'assignment' | 'reallocation') {
  if (form.kind === kind) return
  form.kind = kind
  form.to = ''
}
function displayOption(key: string, fallback: string) {
  const field = fields.value.find((item) => item.key === key)
  return field ? selectedOptionLabel(field) : fallback
}
function supportFieldDefinition(label: string) {
  if (store.designCaseId !== 'S03') return undefined
  if (label === l('报修设备', 'Device')) return fields.value.find((item) => item.key === 'deviceId')
  if (label === l('故障分类', 'Fault type')) return fields.value.find((item) => item.key === 'faultCategory')
  return undefined
}
function openSupportField(label: string) {
  const field = supportFieldDefinition(label)
  if (field) openPicker(field)
}
function supportFieldValue(field: [string, string, string, string, boolean | string]) {
  const definition = supportFieldDefinition(field[0])
  return definition ? selectedOptionLabel(definition) : field[2]
}
function normalizeRegionLabel(value: string) {
  return String(value || '').replace(/[省市区县\s]/g, '')
}
function regionCovered(region: string, salesRegion: string) {
  const normalizedRegion = normalizeRegionLabel(region)
  const normalizedSalesRegion = normalizeRegionLabel(salesRegion)
  return Boolean(normalizedRegion && normalizedSalesRegion && (normalizedRegion.startsWith(normalizedSalesRegion) || normalizedSalesRegion.startsWith(normalizedRegion)))
}
async function prepareProjectSerial() {
  const entered = normalizeDeviceSerial(String(form.serialNumber || ''))
  const fuzzyMatch = projectDeviceCandidates.value.find((item) => item.serialNumber === entered)
    || (entered.length >= 4 ? projectDeviceCandidates.value.find((item) => item.serialNumber.includes(entered)) : undefined)
  const serialNumber = fuzzyMatch?.serialNumber || entered
  if (!serialNumber) throw new Error('INVALID_DEVICE_SERIAL')
  form.serialNumber = serialNumber
  const registration = store.db?.deviceRegistrations.find((item) => item.serialNumber === serialNumber)
  const device = store.db?.devices.find((item) => item.serialNumber === serialNumber)
  if (!registration && !device) throw new Error('DEVICE_SERIAL_NOT_FOUND')
  const dealerId = registration?.dealerId || device?.dealerId
  if (!dealerId || !store.context.dealerScopeIds.includes(dealerId)) throw new Error('FORBIDDEN')
  form.deviceType = registration?.category || device?.category || ''
  form.deviceModel = registration?.model || device?.model || ''
  form.deviceSpecification = registration?.specification || device?.specification || ''
  form.factoryRegion = registration?.lastKnownRegion || registration?.salesRegion || device?.salesRegion || ''
}
async function verifyManualProjectSerial() {
  if (projectSerialBusy.value) return
  projectSerialBusy.value = true
  error.value = ''
  try {
    await prepareProjectSerial()
    uni.showToast({ title: l('设备信息已匹配', 'Device matched'), icon: 'success' })
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    error.value = code === 'FORBIDDEN'
      ? l('该设备不在当前经销商名下', 'This device is not owned by the current dealer')
      : l('未找到可安装设备，请检查 SN 或改用模糊查询', 'No installable device found. Check the serial or use search')
  } finally { projectSerialBusy.value = false }
}
async function scanProjectSerial() {
  if (projectSerialBusy.value) return
  projectSerialBusy.value = true
  error.value = ''
  try {
    form.serialNumber = normalizeDeviceSerial(await scanAdapter.scan())
    projectSerialMode.value = 'manual'
    await prepareProjectSerial()
    uni.showToast({ title: l('已识别设备 SN', 'Device serial detected'), icon: 'success' })
  } catch {
    error.value = l('扫码结果未匹配当前经销商名下可安装设备，可改为手工输入', 'The scan did not match an installable dealer device. Enter it manually')
  } finally { projectSerialBusy.value = false }
}
function materialLineReserved(catalogId: string) {
  return (store.db?.materials || []).filter((item) => ['pending', 'approved'].includes(item.status) && item.id !== id.value)
    .reduce((sum, item) => sum + (item.items?.length ? item.items.filter((line) => line.catalogId === catalogId).reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0) : item.catalogId === catalogId ? Number(item.quantity || 0) : 0), 0)
}
function materialLineAvailable(catalogId: string) {
  const item = materialCatalog.value.find((entry) => entry.id === catalogId)
  return Math.max(0, Number(item?.stock || 0) - materialLineReserved(catalogId))
}
function changeMaterialLine(catalogId: string, delta: number) {
  materialLineQuantities[catalogId] = Math.min(materialLineAvailable(catalogId), Math.max(0, Number(materialLineQuantities[catalogId] || 0) + delta))
}
function changeWarranty(event: { detail: { value: string } }) {
  form.warrantyEnd = event.detail.value
}
function createReplacementLine(): ReplacementMaterialLine {
  return { id: `replacement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, originalCatalogId: '', replacementCatalogId: '', quantity: 1 }
}
function addReplacementLine() {
  replacementLines.value = [...replacementLines.value, createReplacementLine()]
}
function removeReplacementLine(index: number) {
  if (replacementLines.value.length <= 1) return
  replacementLines.value = replacementLines.value.filter((_, lineIndex) => lineIndex !== index)
}
function changeReplacementMaterial(index: number, field: 'originalCatalogId' | 'replacementCatalogId', event: { detail: { value: string | number } }) {
  const item = materialCatalog.value[Number(event.detail.value)]
  if (item && replacementLines.value[index]) replacementLines.value[index][field] = item.id
}
function toggleReplacement(event: any) {
  form.replacementRequired = event.detail.value
  if (form.replacementRequired && !replacementLines.value.length) replacementLines.value = [createReplacementLine()]
}
function replacementMaterialLabel(line: ReplacementMaterialLine, field: 'originalCatalogId' | 'replacementCatalogId') {
  const item = materialCatalog.value.find((entry) => entry.id === line[field])
  return item ? `${store.locale !== 'zh-Hans' ? item.nameEn : item.name} · ${item.sku}` : l('请选择物料', 'Select part')
}
function materialCatalogLabel(catalogId: string) {
  const item = materialCatalog.value.find((entry) => entry.id === catalogId)
  return item ? (store.locale !== 'zh-Hans' ? item.nameEn : item.name) : catalogId
}
function materialCatalogSku(catalogId: string) {
  return materialCatalog.value.find((entry) => entry.id === catalogId)?.sku || '--'
}
function chooseOption(option: NonNullable<EntityField['options']>[number]) {
  if (!pickerField.value) return
  const fieldKey = pickerField.value.key
  form[fieldKey] = option.value
  if (entityKey.value === 'tickets' && fieldKey === 'deviceId' && form.category === 'transfer') {
    const selectedDevice = store.db?.devices.find((item) => item.id === option.value)
    const project = selectedDevice?.projectId ? store.db?.projects.find((item) => item.id === selectedDevice.projectId) : undefined
    form.originRegion = project?.region || selectedDevice?.salesRegion || ''
    if (form.targetRegion === form.originRegion) form.targetRegion = ''
  }
  if (entityKey.value === 'materials' && fieldKey === 'projectId') {
    for (const key of Object.keys(materialLineQuantities)) delete materialLineQuantities[key]
  }
  if (entityKey.value === 'projects' && fieldKey === 'deviceType') {
    const selectedModel = store.db?.deviceModels.find((item) => item.model === form.deviceModel)
    if (selectedModel && selectedModel.category !== option.value) form.deviceModel = ''
    const selectedSerial = [...(store.db?.deviceRegistrations || []), ...(store.db?.devices || [])].find((item) => item.serialNumber === form.serialNumber)
    if (selectedSerial && selectedSerial.category !== option.value) form.serialNumber = ''
    form.deviceSpecification = ''
    form.rodLength = ''
  }
  if (entityKey.value === 'projects' && fieldKey === 'deviceModel') {
    const selectedSerial = [...(store.db?.deviceRegistrations || []), ...(store.db?.devices || [])].find((item) => item.serialNumber === form.serialNumber)
    if (selectedSerial && selectedSerial.model !== option.value) form.serialNumber = ''
    form.deviceSpecification = ''
    form.rodLength = ''
  }
  if (entityKey.value === 'projects' && fieldKey === 'serialNumber') {
    projectSerialMode.value = 'search'
    const registration = store.db?.deviceRegistrations.find((item) => item.serialNumber === option.value)
    const device = store.db?.devices.find((item) => item.serialNumber === option.value)
    form.deviceType = registration?.category || device?.category || ''
    form.deviceModel = registration?.model || device?.model || ''
    form.deviceSpecification = registration?.specification || device?.specification || ''
    form.factoryRegion = registration?.lastKnownRegion || registration?.salesRegion || device?.salesRegion || ''
  }
  if (entityKey.value === 'tickets' && fieldKey === 'orderId') {
    const order = store.db?.orders.find((item) => item.id === option.value)
    const device = store.db?.devices.find((item) => item.id === order?.deviceId)
    form.deviceId = device?.id || ''
    form.serialNumber = device?.serialNumber || ''
  }
  if (entityKey.value === 'tickets' && fieldKey === 'serialNumber') {
    const device = store.db?.devices.find((item) => item.serialNumber === option.value)
    form.deviceId = device?.id || ''
  }
  pickerField.value = null
}
function selectedOptionLabel(field: EntityField) {
  const option = field.options?.find((item) => item.value === form[field.key])
  return option ? store.locale !== 'zh-Hans' ? option.labelEn || option.label : option.label : l('请选择', 'Select')
}
function changeDate(field: EntityField, event: { detail?: { value?: string } }) {
  form[field.key] = String(event.detail?.value || '')
}
function fieldIcon(field: EntityField) {
  const semanticIcons: Record<string, string> = { vessel: 'ship', ownerName: 'user-round', region: 'map-pin', warrantyEnd: 'calendar-days', rodLength: 'ruler', deviceId: 'fan', serialNumber: 'hash', deviceType: 'boxes', deviceModel: 'cpu', deviceSpecification: 'settings-2', orderId: 'shopping-cart', faultCategory: 'wrench', category: 'list-filter', description: 'notebook-pen', phone: 'phone', email: 'mail' }
  return semanticIcons[field.key] || (field.type === 'number' ? 'hash' : field.type === 'textarea' ? 'notebook-pen' : field.type === 'date' ? 'calendar-days' : 'pencil')
}
function fieldPlaceholder(field: EntityField) {
  if (store.locale !== 'zh-Hans') return `Enter ${field.labelEn}`
  return field.placeholder || `请输入${field.label}`
}
function localizedValue(value: unknown) {
  if (store.locale === 'zh-Hans') return value
  const source = String(value ?? '')
  const dictionary: Record<string, string> = {
    '海风号设备安装': 'Sea Wind Installation', '海风号': 'Sea Wind', '林海': 'Hai Lin', '福建厦门': 'Xiamen, Fujian', '福建省厦门市': 'Xiamen, Fujian',
    '泉州远航服务网点': 'Quanzhou Voyage Service', '陈佳': 'Jia Chen', '福建省泉州市': 'Quanzhou, Fujian', '总部': 'Head Office',
  }
  return dictionary[source] || source
}
function toggleCapability(capability: string) {
  selectedCapabilities.value = selectedCapabilities.value.includes(capability) ? selectedCapabilities.value.filter((item) => item !== capability) : [...selectedCapabilities.value, capability]
}
function projectAction(action: 'edit' | 'service') {
  projectMenu.value = false
  if (!loadedItem.value) return
  if (action === 'edit') mode.value = 'edit'
  else uni.navigateTo({ url: `/pages/manage/form?entity=tickets&category=repair&projectId=${loadedItem.value.id}&deviceId=${projectDevice.value?.id || ''}` })
}
async function chooseAttachment(kind: 'image' | 'video' = 'image') {
  try {
    const attachments = await store.pickAttachments(kind, 6 - attachmentIds.value.length, String(entityKey.value))
    attachmentIds.value.push(...attachments.map((item) => item.id))
    if (attachments.length) uni.showToast({ title: l('附件已添加', 'Attachment added'), icon: 'success' })
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    uni.showToast({ title: code === 'FILE_TOO_LARGE' ? l('文件大小超出限制', 'File is too large') : l('仅支持 JPG、PNG 图片或 MP4 视频', 'Use JPG, PNG, or MP4 files'), icon: 'none' })
  }
}
async function chooseAvatar() {
  try {
    const [attachment] = await store.pickAttachments('image', 1, 'profile')
    if (!attachment) return
    await store.updateProfile({ avatar: attachment.localPath })
    uni.showToast({ title: l('头像已更新', 'Avatar updated'), icon: 'success' })
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error && cause.message === 'FILE_TOO_LARGE' ? l('头像不能超过 5MB', 'Avatar must be 5 MB or smaller') : l('请选择 JPG 或 PNG 图片', 'Choose a JPG or PNG image'), icon: 'none' })
  }
}
function validate() {
  const missing = fields.value.find((field) => field.required && String(form[field.key] ?? '').trim() === '')
  if (missing) return l(`请填写${missing.label}`, `Enter ${missing.labelEn}`)
  if ('quantity' in form && Number(form.quantity) <= 0) return l('数量必须大于 0', 'Quantity must be greater than 0')
  if (isMaterialRequestForm.value && !selectedMaterialProject.value) return l('请选择关联安装项目', 'Select an installation project')
  if (isMaterialRequestForm.value && !selectedMaterialLines.value.length) return l('请至少添加一种适配物料', 'Add at least one compatible part')
  if (form.phone && !/^\+?[\d\s-]{6,20}$/.test(String(form.phone))) return l('请输入 6–20 位联系电话', 'Enter a 6–20 digit contact number')
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.email))) return l('请输入有效邮箱地址', 'Enter a valid email address')
  if (entityKey.value === 'tickets' && !form.phone && !form.email) return l('联系电话和邮箱至少填写一项', 'Enter a phone number or email address')
  if (entityKey.value === 'tickets' && String(form.description || '').length > 500) return l('问题说明不能超过 500 字', 'Description cannot exceed 500 characters')
  if (isDealerRepairForm.value && form.replacementRequired) {
    if (!replacementLines.value.length) return l('请至少添加一组更换物料', 'Add at least one replacement line')
    if (replacementLines.value.some((line) => !line.originalCatalogId || !line.replacementCatalogId)) return l('请完整选择每组原物料和更换物料', 'Select both parts for every replacement line')
    if (replacementLines.value.some((line) => line.originalCatalogId === line.replacementCatalogId)) return l('更换物料不能与原物料相同', 'The replacement part must differ from the original part')
    if (replacementLines.value.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1)) return l('更换数量必须为大于 0 的整数', 'Replacement quantity must be a positive integer')
    if (new Set(replacementLines.value.map((line) => line.replacementCatalogId)).size !== replacementLines.value.length) return l('同一种更换物料请合并数量', 'Combine duplicate replacement parts into one line')
  }
  if (entityKey.value === 'tickets' && form.category === 'complaint') {
    const order = store.db?.orders.find((item) => item.id === form.orderId)
    const device = store.db?.devices.find((item) => item.serialNumber === form.serialNumber)
    if (!order || !device || order.deviceId !== device.id) return l('关联订单与设备 SN 不匹配', 'The selected order does not match the device serial.')
  }
  if (entityKey.value === 'projects') {
    if (isProjectCustomerForm.value && !id.value && attachmentIds.value.length === 0) return l('请上传至少一张安装照片或一段现场视频', 'Upload at least one installation photo or site video')
    const registration = store.db?.deviceRegistrations.find((item) => item.serialNumber === form.serialNumber)
    const device = store.db?.devices.find((item) => item.serialNumber === form.serialNumber)
    if (!registration && !device) return l('设备 SN 不存在，请从已登记设备中选择', 'The device serial does not exist. Select a registered device.')
    const dealerId = registration?.dealerId || device?.dealerId
    if (!dealerId || !store.context.dealerScopeIds.includes(dealerId)) return l('该设备不属于当前经销商负责范围', 'This device is outside the current dealer scope.')
    if ((registration?.category || device?.category) !== form.deviceType) return l('设备类型与 SN 登记信息不一致', 'The device type does not match the registered device serial.')
    if ((registration?.model || device?.model) !== form.deviceModel) return l('设备型号与 SN 登记信息不一致', 'The model does not match the registered device serial.')
    if ((registration?.specification || device?.specification) !== form.deviceSpecification) return l('设备规格与 SN 登记信息不一致', 'The specification does not match the registered device serial.')
    if (!['B04','B05'].includes(store.designCaseId) && store.db?.projects.some((item) => item.id !== id.value && item.serialNumber === form.serialNumber)) return l('该设备 SN 已关联其他项目', 'This device serial is already linked to another project.')
  }
  if (!id.value && (entityKey.value === 'employees' || entityKey.value === 'dealers') && !passwordValid(String(form.initialPassword || ''))) return l('初始密码需为 8–20 位，并同时包含字母和数字', 'The initial password must be 8–20 characters and contain letters and numbers')
  if (entityKey.value === 'profile' && String(form.displayName).trim().length < 2) return l('昵称至少 2 个字符', 'Display name must contain at least 2 characters')
  return ''
}

async function submit() {
  if (forbidden.value) return
  if (entityKey.value === 'projects' && step.value === 'device' && !id.value) {
    try {
      await prepareProjectSerial()
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : ''
      error.value = code === 'INVALID_DEVICE_SERIAL'
        ? l('请从当前经销商名下选择设备 SN', 'Select a device serial owned by the current dealer')
        : code === 'FORBIDDEN'
          ? l('该设备不属于当前经销商', 'This device is not owned by the current dealer')
          : l('未找到该设备，请重新搜索选择', 'The device was not found. Search and select again')
      return
    }
  }
  const validation = validate()
  if (validation) return error.value = validation
  if (entityKey.value === 'projects' && step.value === 'device' && !id.value) {
    Object.assign(store.projectDraft, form)
    return uni.redirectTo({ url: '/pages/manage/form?entity=projects&step=customer' })
  }
  saving.value = true
  error.value = ''
  let successTicketId = ''
  let savedProjectId = ''
  try {
    if (entityKey.value === 'profile') {
      await store.updateProfile({ displayName: String(form.displayName), displayNameEn: String(form.displayName), phone: String(form.phone || ''), email: String(form.email || '') })
    } else if (config.value) {
      const payload: Record<string, any> = { ...(entityKey.value === 'projects' ? store.projectDraft : {}), ...form }
      for (const field of fields.value.filter((item) => item.type === 'number')) payload[field.key] = Number(form[field.key])
      if (entityKey.value === 'waypoints') {
        const waypointInput = { name: String(form.name), nameEn: String(form.name), lat: Number(form.lat), lng: Number(form.lng), note: String(form.note || '') }
        if (id.value) await routeService.updateWaypoint(id.value, waypointInput, store.context)
        else await routeService.createWaypoint(waypointInput, store.context)
        store.refresh()
        uni.showToast({ title: id.value ? l('航点已更新', 'Waypoint updated') : store.db?.settings.waypointStorage === 'cloud' ? l('航点已保存，等待同步', 'Waypoint saved, awaiting sync') : l('航点已保存到本机', 'Waypoint saved locally'), icon: 'success' })
        setTimeout(() => backOrFallback(originDeviceId.value ? `/pages/device/detail?id=${encodeURIComponent(originDeviceId.value)}` : '/pages/shell/index?tab=profile'), 500)
        return
      }
      if (entityKey.value === 'projects') Object.assign(payload, { name: `${payload.vessel}设备安装`, nameEn: `${payload.vessel} installation`, customer: payload.ownerName, dealerId: store.account?.dealerId, attachmentIds: [...attachmentIds.value], factoryRegion: payload.factoryRegion || projectFactoryRegion.value, crossRegionRequired: projectNeedsRegionApproval.value, crossRegionStatus: projectNeedsRegionApproval.value ? 'pending' : 'notRequired', status: loadedItem.value?.status || (projectNeedsRegionApproval.value ? 'pendingApproval' : 'installing') })
      if (entityKey.value === 'tickets') {
        const selectedDevice = store.db?.devices.find((item) => item.id === payload.deviceId)
        const generatedTitle = `${store.locale !== 'zh-Hans' ? selectedDevice?.nameEn || 'Device' : selectedDevice?.name || '设备'} · ${payload.faultCategory || l('服务申请', 'Service request')}`
        const selectedOrder = store.db?.orders.find((item) => item.id === payload.orderId)
        const normalizedReplacementLines = form.replacementRequired ? replacementLines.value.map((line) => ({ ...line, quantity: Number(line.quantity) })) : []
        const firstReplacement = normalizedReplacementLines[0]
        Object.assign(payload, { title: payload.title || generatedTitle, titleEn: payload.titleEn || generatedTitle, projectId: payload.projectId || originProjectId.value || selectedDevice?.projectId, ownerId: loadedItem.value?.ownerId || store.account?.id, contact: form.phone || form.email, dealerId: loadedItem.value?.dealerId || selectedDevice?.dealerId || selectedOrder?.dealerId || store.account?.dealerId, escalationStatus: loadedItem.value?.escalationStatus || 'none', replacementLines: normalizedReplacementLines, originalMaterialId: firstReplacement?.originalCatalogId, replacementMaterialId: firstReplacement?.replacementCatalogId, replacementQuantity: firstReplacement?.quantity, attachmentIds: [...(loadedItem.value?.attachmentIds || []), ...attachmentIds.value], status: loadedItem.value?.status || 'submitted', history: loadedItem.value?.history || [{ id: `history-${Date.now()}`, status: 'submitted', label: '服务申请已提交', at: new Date().toISOString(), operator: store.account?.displayName || '用户' }] })
      }
      if (entityKey.value === 'employees') Object.assign(payload, { nameEn: form.name, dealerId: store.account?.dealerId, capabilities: selectedCapabilities.value })
      if (entityKey.value === 'dealers') Object.assign(payload, { nameEn: form.name, parentId: store.account?.dealerId, level: 2, status: loadedItem.value?.status || 'enabled', capabilities: selectedCapabilities.value })
      if (entityKey.value === 'materials') { const catalog = store.db?.materialCatalog.find((item) => item.id === form.catalogId); Object.assign(payload, { name: catalog?.name, nameEn: catalog?.nameEn, dealerId: store.account?.dealerId, requesterId: store.account?.id, status: loadedItem.value?.status || 'pending', history: loadedItem.value?.history || [{ id: `history-${Date.now()}`, status: 'pending', label: '物料申请已提交', at: new Date().toISOString(), operator: store.account?.displayName || '员工' }] }) }
      if (entityKey.value === 'transfers') { const employee = store.db?.employees.find((item) => item.id === form.to || item.name === form.to); const dealer = store.db?.dealers.find((item) => item.id === form.to || item.name === form.to); Object.assign(payload, { dealerId: store.account?.dealerId, targetEmployeeId: form.kind === 'assignment' && !isDealerAssignmentForm.value ? employee?.id : undefined, targetDealerId: form.kind === 'reallocation' || isDealerAssignmentForm.value ? dealer?.id : undefined, status: loadedItem.value?.status || 'pending', history: loadedItem.value?.history || [{ id: `history-${Date.now()}`, status: 'pending', label: '分配或调货申请已提交', at: new Date().toISOString(), operator: store.account?.displayName || '管理员' }] }) }
      if (entityKey.value === 'projects') {
        const saved = await projectService.save(payload as Omit<Project, 'id' | 'createdAt' | 'updatedAt'>, id.value || undefined, store.context)
        savedProjectId = saved.id
        store.refresh()
      }
      else if (entityKey.value === 'tickets' && !id.value) {
        const created = await workflowService.createTicket(payload as Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>, store.context)
        successTicketId = created.ticket.id
        store.refresh()
      }
      else if (entityKey.value === 'employees') {
        await dealerService.saveEmployee(payload as Employee & { initialPassword?: string }, id.value || undefined, store.context)
        store.refresh()
      }
      else if (entityKey.value === 'dealers') {
        await dealerService.saveDealer(payload as DealerOutlet & { initialPassword?: string }, id.value || undefined, store.context)
        store.refresh()
      }
      else if (entityKey.value === 'materials' && !id.value) {
        await workflowService.createMaterialRequest({ projectId: String(payload.projectId), reason: String(payload.reason || ''), source: materialSource.value, items: selectedMaterialLines.value.map((line) => ({ catalogId: line.catalogId, quantity: line.quantity })) }, store.context)
        store.refresh()
      }
      else if (entityKey.value === 'transfers' && !id.value) {
        await workflowService.createTransfer({ deviceId: String(payload.deviceId), kind: payload.kind, targetEmployeeId: payload.kind === 'assignment' && !isDealerAssignmentForm.value ? String(payload.to) : undefined, targetDealerId: payload.kind === 'reallocation' || isDealerAssignmentForm.value ? String(payload.to) : undefined }, store.context)
        store.refresh()
      }
      else if (id.value) {
        await store.update(config.value.collection, id.value, payload as never)
      }
      else {
        const created = await store.create(config.value.collection, payload as never)
        void created
      }
      if (entityKey.value === 'projects') store.projectDraft = {}
    }
    uni.showToast({ title: entityKey.value === 'projects' && projectNeedsRegionApproval.value ? l('已提交后台审核', 'Submitted for review') : l('保存成功', 'Saved'), icon: 'success' })
    setTimeout(() => entityKey.value === 'tickets'
      ? uni.redirectTo({ url: `/pages/manage/list?entity=tickets&state=success&id=${successTicketId || id.value}` })
      : entityKey.value === 'projects' && savedProjectId
        ? uni.redirectTo({ url: `/pages/manage/form?entity=projects&id=${savedProjectId}&mode=detail` })
        : backOrFallback(fallbackUrl.value), 450)
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    error.value = code === 'FORBIDDEN' ? l('当前账号无保存权限', 'This account cannot save changes')
      : code === 'DEVICE_ALREADY_ASSIGNED' ? l('该设备已关联其他项目', 'This device is already linked to another project.')
        : code === 'DEVICE_TYPE_MISMATCH' ? l('设备类型与 SN 登记信息不一致', 'The device type does not match the registered serial.')
          : code === 'DEVICE_MODEL_MISMATCH' ? l('设备型号与 SN 登记信息不一致', 'The model does not match the registered serial.')
            : code === 'DEVICE_SPECIFICATION_MISMATCH' ? l('设备规格与 SN 登记信息不一致', 'The specification does not match the registered serial.')
              : code === 'INSTALLATION_EVIDENCE_REQUIRED' ? l('请上传安装现场照片或视频', 'Upload installation site photos or video.')
                : code === 'INVALID_ATTACHMENT' ? l('安装附件无效，请重新选择', 'The installation attachment is invalid. Choose it again.')
            : code === 'REPLACEMENT_MUST_DIFFER' ? l('更换物料不能与原物料相同', 'The replacement part must differ from the original part.')
              : code === 'CATALOG_NOT_FOUND' ? l('所选物料不存在或已失效', 'The selected part is unavailable.')
                : code === 'DUPLICATE_MATERIAL' ? l('同一种更换物料请合并数量', 'Combine duplicate replacement parts into one line.')
                  : code === 'QUANTITY_INVALID' ? l('物料数量必须为大于 0 的整数', 'Part quantity must be a positive integer.')
                    : code === 'DEALER_NOT_ASSIGNABLE' ? l('请选择已启用的直属二级经销商', 'Select an enabled direct sub-dealer.')
                      : code === 'DEVICE_NOT_ASSIGNABLE' ? l('该设备已不属于当前经销商，请刷新列表', 'This device no longer belongs to the current dealer. Refresh the list.')
                : code === 'MATERIAL_INCOMPATIBLE' ? l('所选物料与项目设备类型或型号不匹配', 'A selected part is incompatible with the project device.')
                : code === 'INSUFFICIENT_STOCK' ? l('可用库存不足，请减少申请数量', 'Not enough available stock. Reduce the quantity.')
            : l('保存失败，请检查信息后重试', 'Save failed. Check the information and try again')
  } finally { saving.value = false }
}
</script>

<template>
  <view class="page form-page" :class="{ 'dealer-workspace': store.isDealer }" :data-business="entityKey">
    <SsAppBar :title="title" :fallback-url="fallbackUrl" :right-icon="store.designCaseId === 'M04' ? 'ellipsis' : mode === 'detail' && ['projects','dealers'].includes(entityKey) ? 'ellipsis' : ''" :right-text="isEmployeePermissions ? l('保存','Save') : isProjectDeviceForm ? '1/2' : isProjectCustomerForm ? '2/2' : ''" :right-label="mode === 'detail' || store.designCaseId === 'M04' ? l('更多操作','More actions') : ''" @right="isEmployeePermissions ? submit() : projectMenu = true" />
    <scroll-view scroll-y class="page-scroll" :class="{ 'with-cta': !isEmployeePermissions && !['detail','view'].includes(mode) && !supportDesignFields.length && !isProjectDeviceForm && !isProjectCustomerForm && !isMaterialRequestForm && !isAssignmentForm && !isWaypointLocationForm && store.designCaseId !== 'B07', 'service-project-scroll': store.designCaseId === 'B07', 'design-business-scroll': isProjectDeviceForm || isProjectCustomerForm || isMaterialRequestForm, 'waypoint-location-scroll':isWaypointLocationForm, 'project-detail-design':store.designCaseId === 'B06' }">
      <template v-if="isWaypointLocationForm">
        <view class="waypoint-location-map"><view class="waypoint-location-marker"><SsIcon name="ship-wheel" :size="19" tone="inverse" /></view></view>
        <view class="card waypoint-location-form">
          <view class="field"><text class="field-label">{{ l('航点名称','Waypoint name') }}</text><view class="field-control active"><SsIcon name="map-pin" :size="20" tone="muted" /><input v-model="form.name" /></view></view>
          <view class="field"><text class="field-label">{{ l('当前位置','Current location') }}</text><view class="field-control"><SsIcon name="crosshair" :size="20" tone="muted" /><text>{{ Number(form.lat).toFixed(6) }}°N, {{ Number(form.lng).toFixed(6) }}°E</text></view></view>
          <view class="field"><text class="field-label">{{ l('备注','Notes') }}</text><view class="field-control textarea"><SsIcon name="notebook-pen" :size="20" tone="muted" /><textarea v-model="form.note" /></view></view>
        </view>
        <view class="notice waypoint-location-notice" :class="waypointServerStorage ? 'success' : 'warning'"><SsIcon v-if="waypointServerStorage" name="cloud-upload" :size="19" tone="success" /><SsIcon v-else name="smartphone" :size="19" tone="brand" /><view><strong>{{ waypointServerStorage ? l('保存到服务器','Save to server') : l('仅保存在本机','Save on this device') }}</strong><text>{{ waypointServerStorage ? l('保存后会同步到当前账号，可在其他设备查看。','The waypoint will sync to your account and be available on other devices.') : l('该航点不会上传，可稍后在设置中更改保存方式。','This waypoint will not be uploaded. You can change the preference later.') }}</text></view></view>
        <text v-if="error" class="form-error">{{ error }}</text>
        <button class="btn primary waypoint-location-submit" :disabled="saving" @click="submit"><SsIcon name="save" :size="19" tone="inverse" />{{ waypointServerStorage ? l('保存并同步','Save and sync') : l('保存到本机','Save locally') }}</button>
      </template>

      <template v-else-if="store.designCaseId === 'M04'">
        <view class="waypoint-detail-map"><image :src="backgroundAssets.mapCanvas" mode="aspectFill" /><view class="waypoint-detail-marker"><SsIcon name="anchor" :size="20" tone="inverse" /></view></view>
        <view class="card waypoint-detail-summary"><view class="section-head"><view><strong>{{ l('避风锚地','Sheltered anchorage') }}</strong><text>24.488920°N, 118.126304°E</text></view><SsStatus status="offline" :label="l('仅本机','On device')" /></view><view class="waypoint-detail-metrics"><view><text>{{ l('保存时间','Saved') }}</text><strong>{{ l('08月10日 08:26','Aug 10 08:26') }}</strong></view><view><text>{{ l('定位精度','Accuracy') }}</text><strong>±7m</strong></view></view></view>
        <view class="section list-card waypoint-detail-actions"><view v-for="item in [{icon:'cloud-upload',tone:'brand',skin:'',title:l('上传到云端','Upload to cloud'),copy:l('随账号保存，可跨设备查看','Save with account and view across devices')},{icon:'route',tone:'brand',skin:'',title:l('从这里设置航迹','Create track from here'),copy:l('设置为航迹起点','Set as track origin')},{icon:'pencil',tone:'brand',skin:'',title:l('编辑名称与备注','Edit name and notes'),copy:''},{icon:'trash-2',tone:'danger',skin:'danger',title:l('删除航点','Delete waypoint'),copy:l('删除后无法恢复','This cannot be undone')}]" :key="item.title" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text v-if="item.copy">{{ item.copy }}</text></view><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view>
        <view class="notice waypoint-source"><SsIcon name="smartphone" :size="18" tone="brand-strong" /><view><strong>{{ l('航点来源','Waypoint source') }}</strong><text>{{ l('2026-08-10 由 iPhone 15 Pro 保存于本机。','Saved on this device by iPhone 15 Pro on 2026-08-10.') }}</text></view></view>
      </template>

      <view v-else-if="forbidden" class="forbidden-state"><SsIcon name="shield-alert" :size="44" tone="default" /><text>{{ l('当前账号无权访问','Access denied') }}</text><span>{{ l('请联系经销商管理员调整角色或数据范围。','Contact the dealer administrator to adjust the role or data scope.') }}</span></view>

      <template v-else-if="isEmployeePermissions">
        <view class="employee-permission-hero"><span><SsIcon name="user-round" :size="34" tone="inverse" /></span><view><strong>{{ store.designCaseId === 'B20' ? l('周海峰','Haifeng Zhou') : (store.locale !== 'zh-Hans' ? loadedItem?.nameEn : loadedItem?.name) }}</strong><text>{{ loadedItem?.roleName }} · {{ loadedItem?.phone }}</text></view><SsStatus :status="loadedItem?.status || 'disabled'" :label="loadedItem?.status === 'enabled' ? l('已启用','Enabled') : l('已停用','Disabled')" /></view>
        <view v-for="group in employeePermissionGroups" :key="group.label" class="employee-permission-group"><text>{{ group.label }}</text><view class="list-card"><view v-for="item in group.items" :key="item.key" class="list-row" @click="toggleCapability(item.key)"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="21" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text v-if="item.copy">{{ item.copy }}</text></view><view class="switch" :class="{on:selectedCapabilities.includes(item.key)}" /></view></view></view>
        <view class="notice employee-minimum-notice"><SsIcon name="shield-check" :size="19" tone="brand-strong" /><view><strong>{{ l('最小权限原则','Least privilege') }}</strong><text>{{ l('员工只能看到完成工作所需的数据和操作。','Staff can only access the data and actions required for their work.') }}</text></view></view>
      </template>

      <template v-else-if="mode === 'detail' && loadedItem">
        <template v-if="entityKey === 'projects'">
          <view class="project-hero card">
            <view class="project-heading"><view><strong>{{ localizedValue(loadedItem.vessel) }}</strong><text>{{ store.designCaseId === 'B06' ? 'XM202603180028' : loadedItem.id }} · {{ l('安装项目','Installation project') }}</text></view><SsStatus :status="loadedItem.status" :label="projectStatusLabel" /></view>
            <view class="project-metrics"><view><text>{{ l('船东','Owner') }}</text><strong>{{ localizedValue(loadedItem.ownerName) }}</strong></view><view><text>{{ l('联系电话','Phone') }}</text><strong>{{ store.designCaseId === 'B06' ? '138****2861' : loadedItem.phone }}</strong></view><view><text>{{ l('使用地区','Region') }}</text><strong>{{ store.designCaseId === 'B06' ? l('厦门市','Xiamen') : localizedValue(loadedItem.region) }}</strong></view><view><text>{{ l('质保到期','Warranty') }}</text><strong>{{ loadedItem.warrantyEnd || l('未设置','Not set') }}</strong></view></view>
          </view>

          <view v-if="loadedItem.status === 'pendingApproval'" class="section notice warning project-backend-review"><SsIcon name="shield-alert" :size="20" tone="warning" /><view><strong>{{ l('等待后台跨区安装审核','Waiting for backend cross-region review') }}</strong><text>{{ loadedItem.factoryRegion }} → {{ loadedItem.region }} · {{ l('总部审核节点仅在后台管理系统处理；审核结果会同步到此处，审核通过后设备才会关联当前项目。','Headquarters review is handled only in the administration system. The result appears here, and the device is linked only after approval.') }}</text></view></view>

          <view v-if="loadedItem.warrantyHistory?.length" class="section">
            <view class="section-head"><text class="section-title">{{ l('质保变更记录','Warranty history') }}</text><text class="section-meta">{{ loadedItem.warrantyHistory.length }} {{ l('条','records') }}</text></view>
            <view class="list-card warranty-history-list"><view v-for="entry in [...loadedItem.warrantyHistory].reverse()" :key="`${entry.changedAt}-${entry.newEnd}`" class="list-row"><view class="row-icon"><SsIcon name="calendar-days" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ entry.previousEnd ? `${entry.previousEnd} → ${entry.newEnd}` : l(`初始质保至 ${entry.newEnd}`, `Initial warranty until ${entry.newEnd}`) }}</strong><text>{{ String(entry.changedAt).slice(0,16).replace('T',' ') }} · {{ entry.operatorId }}</text></view></view></view>
          </view>

          <view class="section">
            <view class="section-head"><text class="section-title">{{ l('关联设备','Linked devices') }}</text><text class="section-link">{{ projectDevices.length }} {{ l('台','devices') }}</text></view>
            <view v-if="projectDevices.length" class="list-card">
              <view v-for="device in projectDevices" :key="device.id" class="list-row project-device" @click="uni.navigateTo({ url:`/pages/device/detail?id=${device.id}&mode=manage` })"><view class="icon-tile"><SsIcon name="fan" :size="25" tone="brand" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? device.nameEn : device.name }}</strong><text>{{ device.serialNumber }} · {{ device.model }} · {{ device.specification }} · {{ loadedItem.rodLength }}</text></view><SsStatus :status="device.status" :label="device.status === 'online' ? l('在线','Online') : device.status === 'warning' ? l('异常','Alert') : l('离线','Offline')" /><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
            </view>
            <view v-else class="linked-registration card"><view class="icon-tile"><SsIcon name="cpu" :size="25" tone="brand" /></view><view><strong>{{ loadedItem.deviceModel }}</strong><text>{{ loadedItem.serialNumber }} · {{ loadedItem.deviceSpecification }} · {{ loadedItem.rodLength }}</text></view><SsStatus status="pending" :label="l('待激活','Pending')" /></view>
          </view>

          <view class="section">
            <view class="segment project-tabs"><view v-for="tab in [['installation',l('安装记录','Installation')],['service',l('售后记录','Service')],['parts',l('物料','Parts')]]" :key="tab[0]" class="segment-item" :class="{ active:detailTab === tab[0] }" @click="detailTab = tab[0]">{{ tab[1] }}</view></view>
            <view v-if="detailTab === 'installation'" class="project-panel card timeline-card">
              <view class="evidence-head"><view><strong>{{ l('安装现场影像','Installation evidence') }}</strong><text>{{ l(`${projectAttachments.length} 个文件`,`${projectAttachments.length} files`) }}</text></view><SsIcon name="image-plus" :size="20" tone="brand" /></view>
              <view v-if="projectAttachments.length" class="evidence-list"><view v-for="attachment in projectAttachments" :key="attachment.id"><image v-if="attachment.kind === 'image'" :src="attachment.localPath" mode="aspectFill" /><span v-else><SsIcon name="video" :size="24" tone="default" /></span><text>{{ attachment.name }}</text></view></view>
              <view v-else class="evidence-empty"><SsIcon name="image-plus" :size="22" tone="default" /><text>{{ l('历史项目暂无现场影像','No site evidence for this legacy project') }}</text></view>
              <view class="project-timeline-list"><view v-for="(entry,index) in projectTimeline" :key="`${entry.title}-${entry.at}`" class="project-timeline"><i :class="{ last:index === projectTimeline.length - 1 }" /><view><strong>{{ entry.title }}</strong><text>{{ entry.text }}</text><span>{{ String(entry.at).slice(0,16).replace('T',' ') }}</span></view></view></view>
            </view>
            <view v-else-if="detailTab === 'service'" class="project-panel list-card"><view v-for="ticket in projectTickets" :key="ticket.id" class="list-row" @click="uni.navigateTo({url:`/pages/manage/list?entity=tickets&state=timeline&id=${ticket.id}`})"><view class="icon-tile warning"><SsIcon name="wrench" :size="22" tone="warning" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? ticket.titleEn : ticket.title }}</strong><text>{{ ({ repair:l('故障报修','Repair'), complaint:l('投诉','Complaint'), message:l('客服留言','Message'), transfer:l('跨区售后','Regional service') })[ticket.category] }} · {{ ticket.id }} · {{ String(ticket.updatedAt).slice(0,10) }}</text></view><SsStatus :status="ticket.status" :label="projectRecordStatus(ticket.status)" /><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view v-if="!projectTickets.length" class="tab-empty"><SsIcon name="wrench" :size="28" tone="muted" /><text>{{ l('暂无售后记录','No service records') }}</text></view></view>
            <view v-else class="project-panel list-card"><view v-for="material in projectMaterials" :key="material.id" class="list-row" @click="uni.navigateTo({url:store.isDealer ? `/pages/manage/list?entity=materials&state=record-detail&id=${material.id}` : '/pages/manage/list?entity=materials'})"><view class="icon-tile success"><SsIcon name="package" :size="22" tone="success" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? material.nameEn : material.name }}</strong><text>×{{ material.quantity }} · {{ material.reason }}</text></view><SsStatus :status="material.status" :label="projectRecordStatus(material.status,true)" /><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view v-for="material in loadedItem.installedMaterials || []" :key="material.id" class="list-row project-material-history"><view class="icon-tile" :class="material.status === 'removed' ? 'warning' : 'success'"><SsIcon name="package-check" :size="22" :tone="material.status === 'removed' ? 'warning' : 'success'" /></view><view class="list-copy"><strong>{{ materialCatalogLabel(material.catalogId) }}</strong><text>{{ l('物料编码','Part SKU') }} {{ materialCatalogSku(material.catalogId) }} · ×{{ material.quantity }}</text><text>{{ l('登记时间','Recorded') }} {{ String(material.at).slice(0,16).replace('T',' ') }}</text></view><SsStatus :status="material.status === 'removed' ? 'offline' : 'online'" :label="material.status === 'removed' ? l('已拆下','Removed') : l('当前安装','Installed')" /></view><view v-if="!projectMaterials.length && !(loadedItem.installedMaterials || []).length" class="tab-empty"><SsIcon name="package" :size="28" tone="muted" /><text>{{ l('暂无物料记录','No parts records') }}</text></view></view>
          </view>
          <view class="button-row project-actions"><button class="btn" @click="projectAction('edit')"><SsIcon name="pencil" :size="18" tone="brand" />{{ l('编辑项目','Edit project') }}</button><button class="btn primary" @click="projectAction('service')"><SsIcon name="plus" :size="18" tone="inverse" />{{ l('新建售后记录','New service record') }}</button></view>
        </template>

        <template v-else-if="entityKey === 'dealers' && store.designCaseId === 'B28'">
          <view class="dealer-detail-hero card"><view class="dealer-logo"><SsIcon name="store" :size="28" tone="inverse" /></view><view class="list-copy"><strong>{{ l('海沧服务点','Haicang Service Center') }}</strong><text>DLR-XM-HC01 · {{ l('负责人 王海','Manager Wang Hai') }}</text></view><SsStatus status="online" :label="l('正常','Active')" /></view>
          <view class="dealer-meta"><view><SsIcon name="map-pin" :size="16" tone="brand" /><text>{{ l('海沧区','Haicang') }}</text></view><view><SsIcon name="cpu" :size="16" tone="brand" /><text>68 {{ l('台设备','devices') }}</text></view><view><SsIcon name="users-round" :size="16" tone="brand" /><text>5 {{ l('个员工','employees') }}</text></view><view><SsIcon name="wrench" :size="16" tone="brand" /><text>7 {{ l('个本月工单','tickets this month') }}</text></view></view>
          <text class="dealer-group-label">{{ l('数据与业务权限','Data and business permissions') }}</text><view class="list-card dealer-permissions"><view v-for="item in [{key:'project',icon:'folder-search',tone:'brand',label:l('查询与创建项目','Search and create projects'),copy:l('仅海沧区和分配设备','Haicang and assigned devices only')},{key:'support',icon:'wrench',tone:'warning',label:l('售后与物料申请','Service and parts requests'),copy:''},{key:'purchase',icon:'shopping-cart',tone:'brand',label:l('向总代理采购','Purchase from general agency'),copy:''},{key:'transfer',icon:'shuffle',tone:'accent',label:l('跨网点设备调货','Cross-outlet device transfer'),copy:l('提交后需平台审核','Platform approval required')},{key:'price',icon:'badge-dollar-sign',tone:'brand',label:l('查看一级采购价','View primary purchase prices'),copy:l('敏感价格权限','Sensitive pricing permission')}]" :key="item.key" class="list-row" @click="dealerPermissionState[item.key] = !dealerPermissionState[item.key]"><view class="row-icon" :class="item.tone === 'warning' ? 'warning' : item.tone === 'accent' ? 'purple' : ''"><SsIcon :name="item.icon" :size="21" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.label }}</strong><text v-if="item.copy">{{ item.copy }}</text></view><view class="switch" :class="{ on:dealerPermissionState[item.key] }" /></view></view>
          <text class="dealer-group-label">{{ l('管理操作','Management') }}</text><view class="list-card dealer-actions"><view class="list-row" @click="uni.navigateTo({url:'/pages/shell/index?tab=device'})"><view class="row-icon"><SsIcon name="cpu" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('查看名下设备','View assigned devices') }}</strong><text>68 {{ l('台 · 在线 63 台','devices · 63 online') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="list-row" @click="uni.navigateTo({url:'/pages/manage/list?entity=employees'})"><view class="row-icon"><SsIcon name="users-round" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('查看员工账号','View staff accounts') }}</strong><text>5 {{ l('个账号 · 全部启用','accounts · all enabled') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="list-row" @click="uni.navigateTo({url:'/pages/auth/password?mode=reset'})"><view class="row-icon"><SsIcon name="key-round" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('重置负责人密码','Reset manager password') }}</strong></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="list-row dealer-stop" @click="uni.showModal({title:l('停用经销商账号','Disable dealer account'),content:l('停用后所有员工同时退出。','All staff will be signed out.'),showCancel:true})"><view class="row-icon danger"><SsIcon name="circle-pause" :size="21" tone="danger" /></view><view class="list-copy"><strong>{{ l('停用经销商账号','Disable dealer account') }}</strong><text>{{ l('停用后所有员工同时退出','All staff will be signed out') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view></view>
        </template>

        <template v-else>
          <view class="detail-hero card"><view class="detail-icon"><SsIcon :name="config?.icon || 'folder-kanban'" :size="34" tone="default" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? loadedItem.nameEn || localizedValue(loadedItem.name || loadedItem.title) : loadedItem.name || loadedItem.title }}</strong><text>{{ localizedValue(loadedItem.serialNumber || loadedItem.region) }}</text></view><SsStatus :status="loadedItem.status" :label="loadedItem.status === 'enabled' ? l('已启用','Enabled') : loadedItem.status === 'pending' ? l('待审核','Pending review') : l('已停用','Disabled')" /></view>
          <view class="segment detail-tabs"><view v-for="tab in [['overview',l('概览','Overview')],['scope',l('数据范围','Data scope')],['permissions',l('权限','Permissions')],['team',l('团队','Team')]]" :key="tab[0]" class="segment-item" :class="{ active:detailTab === tab[0] }" @click="detailTab = tab[0]">{{ tab[1] }}</view></view>
          <view v-if="detailTab === 'overview'" class="section list-card dealer-overview-facts"><view v-for="entry in [[l('负责人','Manager'),localizedValue(loadedItem.manager)],[l('服务地区','Service region'),localizedValue(loadedItem.region)],[l('联系电话','Phone'),loadedItem.phone],[l('组织层级','Organization tier'),store.locale !== 'zh-Hans' ? `Level ${loadedItem.level}` : `${loadedItem.level} 级`],[l('上级经销商','Parent dealer'),store.db?.dealers.find(item => item.id === loadedItem?.parentId)?.name || l('总部','Head Office')],[l('账号状态','Account status'),loadedItem.status === 'enabled' ? l('已启用','Enabled') : loadedItem.status === 'pending' ? l('待审核','Pending review') : l('已停用','Disabled')]]" :key="entry[0]" class="detail-row"><text>{{ entry[0] }}</text><strong>{{ entry[1] }}</strong></view></view>
          <view v-if="entityKey === 'dealers' && detailTab === 'permissions'" class="section dealer-access-list"><view class="business-section-heading"><strong>{{ l('已授权业务','Granted permissions') }}</strong><text>{{ loadedItem.capabilities?.length || 0 }}</text></view><view v-for="capability in loadedItem.capabilities" :key="capability" class="dealer-access-row"><SsIcon name="shield-check" :size="20" tone="success" /><text>{{ businessCapabilityLabel(capability) }}</text><SsIcon name="check" :size="16" tone="success" /></view></view>
          <view v-if="entityKey === 'dealers' && detailTab === 'scope'" class="section dealer-access-list"><view class="business-section-heading"><strong>{{ l('服务范围','Service scope') }}</strong><text>{{ loadedItem.region }}</text></view><view class="dealer-scope-total"><strong>{{ dealerDevices.length }}</strong><text>{{ l('台可查看设备','visible devices') }}</text></view><view v-for="device in dealerDevices" :key="device.id" class="dealer-access-row"><SsIcon name="cpu" :size="21" tone="brand" /><view><strong>{{ store.locale === 'zh-Hans' ? device.name : device.nameEn }}</strong><text>{{ device.model }} · {{ device.serialNumber }}</text></view></view><view v-if="!dealerDevices.length" class="business-inline-empty">{{ l('暂无可查看设备','No visible devices') }}</view></view>
          <view v-if="entityKey === 'dealers' && detailTab === 'team'" class="section dealer-access-list"><view class="business-section-heading"><strong>{{ l('网点团队','Outlet team') }}</strong><text>{{ dealerTeam.length }}</text></view><button v-for="employee in dealerTeam" :key="employee.id" class="dealer-access-row" @click="uni.navigateTo({url:`/pages/manage/form?entity=employees&id=${employee.id}&mode=permissions`})"><SsIcon name="user-round" :size="22" tone="brand" /><view><strong>{{ store.locale === 'zh-Hans' ? employee.name : employee.nameEn }}</strong><text>{{ employee.roleName }} · {{ employee.phone }}</text></view><SsIcon name="chevron-right" :size="16" tone="muted" /></button><view v-if="!dealerTeam.length" class="business-inline-empty">{{ l('暂无可查看员工','No visible staff') }}</view></view>
          <button class="btn primary detail-edit" @click="mode = 'edit'">{{ l(`编辑${singular}`,`Edit ${singular}`) }}</button>
        </template>
      </template>

      <template v-else-if="mode === 'view' && entityKey === 'profile'">
        <view class="avatar-editor"><view class="avatar"><image v-if="store.account?.avatar" :src="store.account.avatar" mode="aspectFit" /><SsIcon v-else name="user-round" :size="38" tone="default" /></view><text class="profile-name">{{ store.locale !== 'zh-Hans' ? store.account?.displayNameEn : store.account?.displayName }}</text><span>{{ store.account?.identifier }}</span></view>
        <view class="list-card"><view class="detail-row"><text>{{ l('昵称 / 组织名称','Display / organization name') }}</text><strong>{{ store.locale !== 'zh-Hans' ? store.account?.displayNameEn : store.account?.displayName }}</strong></view><view class="detail-row"><text>{{ l('手机号码','Phone') }}</text><strong>{{ store.account?.phone || l('未绑定','Not linked') }}</strong></view><view class="detail-row"><text>{{ l('邮箱','Email') }}</text><strong>{{ store.account?.email || l('未绑定','Not linked') }}</strong></view><view class="detail-row"><text>{{ l('账号状态','Account status') }}</text><strong class="green">{{ l('已验证','Verified') }}</strong></view></view>
        <button class="btn primary detail-edit" @click="mode = 'edit'">{{ l('编辑个人资料','Edit profile') }}</button>
      </template>

      <template v-else>
        <view v-if="store.designCaseId === 'B27'" class="notice dealer-create-notice"><SsIcon name="key-round" :size="19" tone="brand-strong" /><view><strong>{{ l('账号开通流程','Account activation') }}</strong><text>{{ l('保存后向负责人发送临时密码，首次登录必须修改密码。','A temporary password is sent to the manager, who must change it at first sign-in.') }}</text></view></view>
        <template v-if="isProjectDeviceForm">
          <view class="notice project-create-notice"><SsIcon name="info" :size="19" tone="brand" /><view><strong>{{ l('项目信息用于设备激活与售后归属','Project data controls activation and service ownership') }}</strong><text>{{ l('请确认设备 SN 与实际安装设备一致。','Confirm the serial matches the installed device.') }}</text></view></view>
          <view class="card design-business-form">
            <view class="field"><text class="field-label">{{ l('设备类型 *','Device type *') }}</text><view class="field-control" @click="openField('deviceType')"><SsIcon name="boxes" :size="20" tone="brand" /><text>{{ form.deviceType || displayOption('deviceType',l('请选择设备类型','Select device type')) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></view>
            <view class="field"><text class="field-label">{{ l('设备型号 *','Device model *') }}</text><view class="field-control" @click="openField('deviceModel')"><SsIcon name="cpu" :size="20" tone="muted" /><text>{{ form.deviceModel || displayOption('deviceModel',l('请选择设备型号','Select device model')) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></view>
            <view class="field"><text class="field-label">{{ l('设备规格 *','Device specification *') }}</text><view class="field-control" @click="openField('deviceSpecification')"><SsIcon name="settings-2" :size="20" tone="brand" /><text>{{ form.deviceSpecification || displayOption('deviceSpecification',l('请先选择型号','Select a model first')) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></view>
            <view class="field"><text class="field-label">{{ l('设备 SN 号 *','Device serial *') }}</text><view class="serial-methods"><button :class="{ active:projectSerialMode === 'search' }" @click="projectSerialMode = 'search'; openField('serialNumber')"><SsIcon name="search" :size="17" tone="default" />{{ l('模糊查询','Search') }}</button><button :class="{ active:projectSerialMode === 'manual' }" @click="projectSerialMode = 'manual'"><SsIcon name="keyboard" :size="17" tone="default" />{{ l('手工输入','Manual') }}</button><button :disabled="projectSerialBusy" @click="scanProjectSerial"><SsIcon name="scan-line" :size="17" tone="default" />{{ l('扫码','Scan') }}</button></view><view v-if="projectSerialMode === 'search'" class="field-control" @click="openField('serialNumber')"><SsIcon name="search" :size="20" tone="muted" /><text class="picker-value" :class="{ placeholder:!form.serialNumber }">{{ form.serialNumber || l('搜索当前经销商名下设备','Search dealer devices') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view><view v-else class="field-control serial-manual"><SsIcon name="hash" :size="20" tone="muted" /><input v-model="form.serialNumber" :placeholder="l('输入完整或至少 4 位连续 SN','Enter full SN or at least 4 consecutive characters')" @blur="verifyManualProjectSerial" /><button :disabled="projectSerialBusy" @click="verifyManualProjectSerial">{{ l('校验','Verify') }}</button></view><text class="field-hint">{{ l('支持 SN、设备名称或型号模糊查询，也可扫码或手工输入；仅匹配当前经销商负责范围内未关联项目的设备。','Search by SN, name, or model, scan, or enter manually. Only unassigned devices in the current dealer scope are matched.') }}</text></view>
            <view class="field"><view class="field-label split"><text>{{ l('杆长 *','Rod length *') }}</text><button class="inline-mode" @click="rodLengthMode = rodLengthMode === 'catalog' ? 'manual' : 'catalog'; form.rodLength = ''">{{ rodLengthMode === 'catalog' ? l('手工输入','Manual') : l('型号选项','Model options') }}</button></view><view v-if="rodLengthMode === 'catalog'" class="field-control" @click="openField('rodLength')"><SsIcon name="ruler" :size="20" tone="muted" /><text>{{ form.rodLength || displayOption('rodLength',l('请选择型号支持的杆长','Select supported rod length')) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view><view v-else class="field-control"><SsIcon name="ruler" :size="20" tone="muted" /><input v-model="form.rodLength" :placeholder="l('例如 2.8m','For example, 2.8m')" /></view></view>
            <view v-if="form.serialNumber" class="field"><view class="field-label split"><text>{{ l('设备登记销售地区','Registered sales region') }}</text><span>{{ l('系统核验','Verified') }}</span></view><view class="field-control muted"><SsIcon name="map-pin-check" :size="20" tone="success" /><text>{{ projectFactoryRegion || l('暂无登记地区','No registered region') }}</text><SsIcon name="lock-keyhole" :size="16" tone="muted" /></view><text class="field-hint">{{ l('此处读取设备登记信息；实际安装地区在下一步选择。','This value comes from device registration. Select the installation region on the next step.') }}</text></view>
          </view>
          <text v-if="error" class="form-error">{{ error }}</text>
          <button class="btn primary design-business-submit" :disabled="saving" @click="submit"><SsIcon name="arrow-right" :size="19" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else-if="isProjectCustomerForm">
          <view class="card design-business-form">
            <view class="field"><text class="field-label">{{ l('船只名称 *','Vessel name *') }}</text><view class="field-control active"><SsIcon name="ship" :size="20" tone="muted" /><input v-model="form.vessel" /></view></view>
            <view class="field"><text class="field-label">{{ l('船东姓名 *','Owner name *') }}</text><view class="field-control"><SsIcon name="user-round" :size="20" tone="muted" /><input v-model="form.ownerName" /></view></view>
            <view class="field"><text class="field-label">{{ l('安装地区（省/市） *','Installation region (province/city) *') }}</text><view class="field-control" @click="openField('region')"><SsIcon name="map-pin" :size="20" tone="muted" /><text>{{ form.region || displayOption('region',l('请选择','Select')) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></view>
            <view class="field"><text class="field-label">{{ l('联系电话 *','Phone *') }}</text><view class="field-control"><SsIcon name="phone" :size="20" tone="muted" /><input v-model="form.phone" /></view></view>
            <view class="field"><view class="field-label split"><text>{{ l('联系邮箱','Email') }}</text><span>{{ l('选填','Optional') }}</span></view><view class="field-control"><SsIcon name="mail" :size="20" tone="muted" /><input v-model="form.email" /></view></view>
            <view class="field"><text class="field-label">{{ l('质保到期 *','Warranty expiry *') }}</text><picker mode="date" :value="String(form.warrantyEnd || '')" @change="changeWarranty"><view class="field-control"><SsIcon name="calendar-days" :size="20" tone="muted" /><text>{{ form.warrantyEnd }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></picker><text class="field-hint">{{ l(`按当前经销商配置生成，国内默认 ${currentDealer?.defaultWarrantyYears || 2} 年`,`Generated from the dealer warranty setting: ${currentDealer?.defaultWarrantyYears || 2} years`) }}</text></view>
            <view class="field"><view class="field-label split"><text>{{ l('其他说明','Notes') }}</text><span>{{ l('选填','Optional') }}</span></view><view class="field-control textarea"><SsIcon name="notebook-pen" :size="20" tone="muted" /><textarea v-model="form.description" /></view></view>
          </view>
          <view class="section card project-evidence-upload"><view class="section-head"><view><text class="section-title">{{ l('安装现场影像 *','Installation evidence *') }}</text><text class="caption">{{ l('用于安装验收与售后追溯','For installation acceptance and service traceability') }}</text></view><text class="section-meta">{{ attachmentIds.length }}/6</text></view><view class="attachment-grid"><button class="attachment" :class="{ added:imageAttachmentCount }" :disabled="attachmentIds.length >= 6" @click="chooseAttachment('image')"><SsIcon name="image-plus" :size="26" tone="brand" /><text>{{ l(`照片 ${imageAttachmentCount} 张`,`Photos ${imageAttachmentCount}`) }}</text></button><button class="attachment" :class="{ added:videoAttachmentCount }" :disabled="attachmentIds.length >= 6" @click="chooseAttachment('video')"><SsIcon name="video" :size="26" tone="default" /><text>{{ l(`视频 ${videoAttachmentCount} 个`,`Videos ${videoAttachmentCount}`) }}</text></button></view><text class="attachment-tip">{{ l('至少上传一张现场照片或一段视频；提交后与安装项目一起保存。','Upload at least one site photo or video. It is saved with the project.') }}</text></view>
          <view v-if="projectNeedsRegionApproval" class="notice warning project-region-notice"><SsIcon name="shield-alert" :size="19" tone="warning" /><view><strong>{{ l('需要后台审核','Backend review required') }}</strong><text>{{ l(`经销商销售区域为 ${currentDealer?.region || '--'}，设备所在地区为 ${projectFactoryRegion}，安装地区为 ${String(form.region)}。提交后需后台审核通过才能完成设备关联。`,`Dealer sales region: ${currentDealer?.region || '--'}; device region: ${projectFactoryRegion}; installation region: ${String(form.region)}. The device is linked after backend approval.`) }}</text></view></view>
          <text v-if="error" class="form-error">{{ error }}</text>
          <button class="btn primary design-business-submit" :disabled="saving" @click="submit"><SsIcon name="check" :size="19" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else-if="isMaterialRequestForm">
          <view class="card design-business-form material-request-form">
            <view class="field"><text class="field-label">{{ l('关联安装项目 *','Installation project *') }}</text><view class="field-control" @click="openField('projectId')"><SsIcon name="folder-search" :size="20" tone="default" /><text>{{ form.projectId ? displayOption('projectId',l('请选择项目','Select project')) : l('请选择项目','Select project') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view><text v-if="selectedMaterialProject" class="field-hint">{{ selectedMaterialProject.deviceType }} · {{ selectedMaterialProject.deviceModel }} · {{ selectedMaterialProject.serialNumber }}</text></view>
            <view class="field material-lines-field"><view class="field-label split"><text>{{ l('申请物料 *','Requested parts *') }}</text><span>{{ l(`${selectedMaterialLines.length} 种，共 ${materialRequestTotalCount} 件`,`${selectedMaterialLines.length} types, ${materialRequestTotalCount} items`) }}</span></view><view v-if="compatibleMaterialCatalog.length" class="material-line-list"><view v-for="item in compatibleMaterialCatalog" :key="item.id" class="material-line"><view><strong>{{ store.locale !== 'zh-Hans' ? item.nameEn : item.name }}</strong><text>{{ item.sku }} · {{ l(`可申请 ${materialLineAvailable(item.id)} 件`,`Available ${materialLineAvailable(item.id)}`) }}</text></view><view class="quantity-stepper"><button :disabled="!materialLineQuantities[item.id]" @click="changeMaterialLine(item.id,-1)">-</button><strong>{{ materialLineQuantities[item.id] || 0 }}</strong><button :disabled="Number(materialLineQuantities[item.id] || 0) >= materialLineAvailable(item.id)" @click="changeMaterialLine(item.id,1)">+</button></view></view></view><view v-else class="material-empty"><SsIcon name="package" :size="24" tone="muted" /><text>{{ selectedMaterialProject ? l('该设备类型与型号暂无可申请物料','No parts match this device type and model') : l('选择项目后显示适配物料','Select a project to show compatible parts') }}</text></view></view>
            <view class="field"><view class="field-label split"><text>{{ l('申请原因','Reason') }}</text><span>{{ l('选填','Optional') }}</span></view><view class="field-control textarea"><SsIcon name="notebook-pen" :size="20" tone="muted" /><textarea v-model="form.reason" /></view></view>
          </view>
          <view v-if="selectedMaterialLines.length && store.hasCapability('price.view')" class="card material-price-design"><view><strong>{{ l('申请单预计金额','Estimated request amount') }}</strong><text>{{ l('按当前经销商采购价汇总','Based on current dealer prices') }}</text></view><strong><small>¥</small>{{ materialRequestTotalAmount.toFixed(2) }}</strong></view>
          <text v-if="error" class="form-error">{{ error }}</text>
          <button class="btn primary design-business-submit" :disabled="saving" @click="submit"><SsIcon name="send" :size="19" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else-if="isAssignmentForm">
          <view v-if="!isDealerAssignmentForm" class="segment assignment-kind-selector" role="tablist" :aria-label="l('分配方式','Assignment type')">
            <button :class="{ active:form.kind === 'assignment' }" @click="setAssignmentKind('assignment')">{{ l('分配给员工','Assign to staff') }}</button>
            <button :class="{ active:form.kind === 'reallocation' }" @click="setAssignmentKind('reallocation')">{{ l('调拨给二级经销商','Transfer to sub-dealer') }}</button>
          </view>
          <view class="card assignment-form">
            <view class="assignment-field">
              <view class="assignment-label"><strong>{{ l('设备','Device') }} *</strong></view>
              <button class="field-control assignment-select" data-assignment-field="device" @click="openField('deviceId')"><SsIcon name="cpu" :size="20" tone="brand" /><text :class="{ placeholder:!form.deviceId }">{{ form.deviceId ? displayOption('deviceId','') : l('请选择当前经销商名下设备','Select a device owned by this dealer') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></button>
            </view>
            <view class="assignment-field">
              <view class="assignment-label"><strong>{{ form.kind === 'reallocation' || isDealerAssignmentForm ? l('接收经销商','Receiving dealer') : l('负责员工','Responsible staff') }} *</strong></view>
              <button class="field-control assignment-select" data-assignment-field="target" @click="openField('to')"><SsIcon :name="form.kind === 'reallocation' || isDealerAssignmentForm ? 'store' : 'user-round'" :size="20" tone="brand" /><text :class="{ placeholder:!form.to }">{{ form.to ? displayOption('to','') : form.kind === 'reallocation' || isDealerAssignmentForm ? l('请选择直属二级经销商','Select a direct sub-dealer') : l('请选择当前经销商员工','Select a staff member') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></button>
            </view>
            <view class="assignment-field">
              <view class="assignment-label"><strong>{{ l('操作人','Operator') }}</strong></view>
              <view class="field-control assignment-readonly"><SsIcon name="shield-check" :size="20" tone="muted" /><text>{{ form.operator }}</text></view>
            </view>
          </view>
          <view v-if="assignmentDevice" class="section-head assignment-device-head"><text class="section-title">{{ l('本次设备','Selected device') }}</text><text class="caption">{{ l('1 台','1 device') }}</text></view>
          <view v-if="assignmentDevice" class="card assignment-devices">
            <view class="assignment-device"><view class="row-icon"><SsIcon name="cpu" :size="22" tone="brand" /></view><view><strong>{{ store.locale !== 'zh-Hans' ? assignmentDevice.nameEn : assignmentDevice.name }}</strong><text>{{ assignmentDevice.category }} · {{ assignmentDevice.model }} · {{ assignmentDevice.serialNumber }}</text></view></view>
          </view>
          <view class="notice warning assignment-notice"><SsIcon :name="isDealerAssignmentForm ? 'store' : 'shuffle'" :size="19" tone="warning-strong" /><view><strong>{{ form.kind === 'reallocation' ? l('调拨审核','Transfer review') : l('设备分配','Device assignment') }}</strong><text>{{ assignmentNotice }}</text></view></view>
          <text v-if="error" class="form-error">{{ error }}</text>
          <button class="btn primary support-design-submit assignment-submit" :disabled="saving" @click="submit"><SsIcon name="check" :size="19" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else-if="supportDesignFields.length">
          <view class="form-card card support-design-form"><view v-for="field in supportDesignFields" :key="field[0]" class="field"><view class="field-label"><text>{{ field[0] }}</text><span v-if="field[3] === 'textarea'">{{ field[4] ? '29/500' : '0/500' }}</span></view><view class="field-control" :class="{ textarea:field[3] === 'textarea', focus:field[3] === 'textarea' && !field[4], 'select-control':Boolean(supportFieldDefinition(field[0])) }" @click="openSupportField(field[0])"><SsIcon v-if="field[1]" :name="field[1]" :size="20" tone="muted" /><text class="support-design-value">{{ supportFieldValue(field) }}</text><SsIcon v-if="field[3] === 'select'" name="chevron-down" :size="18" tone="muted" /></view></view></view>
          <view v-if="store.designCaseId === 'S03'" class="support-attachment"><view class="section-head"><text class="section-title">{{ l('故障附件','Fault attachments') }}</text><text class="caption">{{ l('最多 6 张','Up to 6') }}</text></view><view class="button-row"><button class="btn subtle"><SsIcon name="image-plus" :size="18" tone="brand" />{{ l('添加照片','Add photos') }}</button><button class="btn"><SsIcon name="video" :size="18" tone="default" />{{ l('拍摄视频','Record video') }}</button></view></view>
          <view v-else-if="store.designCaseId === 'S06'" class="support-attachment complaint-attachment"><button class="btn subtle"><SsIcon name="image-plus" :size="18" tone="brand" />{{ l('添加图片','Add image') }}</button><button class="btn"><SsIcon name="paperclip" :size="18" tone="default" />{{ l('添加文件','Add file') }}</button></view>
          <view v-if="store.designCaseId === 'S02'" class="notice support-design-notice"><SsIcon name="info" :size="18" tone="brand-strong" /><view><strong>{{ l('联系方式','Contact details') }}</strong><text>{{ l('电话和邮箱至少填写一项，客服会在 1 个工作日内联系。','Provide phone or email. Support responds within one business day.') }}</text></view></view>
          <view v-else-if="store.designCaseId === 'S06'" class="notice support-design-notice"><SsIcon name="shield-check" :size="18" tone="brand-strong" /><view><strong>{{ l('处理范围','Handling scope') }}</strong><text>{{ l('投诉将提交至总部管理员，不会直接转给被投诉对象。','Complaints go to headquarters, not directly to the target.') }}</text></view></view>
          <view v-else-if="store.designCaseId === 'S07'" class="notice warning support-design-notice"><SsIcon name="refresh-ccw-dot" :size="18" tone="warning" /><view><strong>{{ l('转移流程','Transfer process') }}</strong><text>{{ l('申请需原代理商确认，再由目标代理商接收；期间服务关系保持有效。','The origin confirms before the destination accepts; service remains active.') }}</text></view></view>
          <button class="btn primary support-design-submit" :disabled="saving" @click="submit"><SsIcon name="send" :size="18" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else-if="store.designCaseId === 'B07'">
          <view class="form-card card service-project-form"><view v-for="field in [{label:l('基于安装项目','Installation project'),icon:'folder-check',value:l('海风号 · XM202603180028','Sea Wind · XM202603180028'),select:false},{label:l('故障原因','Failure reason'),icon:'triangle-alert',value:l('水下电机轴承磨损','Underwater motor bearing wear'),select:false},{label:l('原物料','Original part'),icon:'package-search',value:l('水下电机组件 · MTR-3000-A','Motor assembly · MTR-3000-A'),select:true},{label:l('更换物料','Replacement part'),icon:'package-plus',value:l('水下电机组件 · MTR-3000-B','Motor assembly · MTR-3000-B'),select:true},{label:l('收费情况','Charge'),icon:'badge-dollar-sign',value:l('收费 ¥680.00','Charged ¥680.00'),select:true},{label:l('处理说明','Service notes'),icon:'notebook-pen',value:l('更换组件并完成 30 分钟运行测试','Replace the assembly and complete a 30-minute test'),select:false}]" :key="field.label" class="field"><text class="field-label">{{ field.label }}</text><view class="field-control" :class="{ textarea:field.icon === 'triangle-alert' || field.icon === 'notebook-pen' }"><SsIcon :name="field.icon" :size="20" tone="muted" /><text class="service-project-value">{{ field.value }}</text><SsIcon v-if="field.select" name="chevron-down" :size="18" tone="muted" /></view></view></view>
          <view class="notice warning service-project-notice"><SsIcon name="package-check" :size="19" tone="warning" /><view><strong>{{ l('物料有效性','Part validity') }}</strong><text>{{ l('原物料保留在项目历史中，新物料将成为当前有效物料。','The original part remains in project history; the replacement becomes current.') }}</text></view></view>
          <button class="btn primary support-design-submit" :disabled="saving" @click="submit"><SsIcon name="save" :size="18" tone="inverse" />{{ submitLabel }}</button>
        </template>
        <template v-else>
        <view v-if="entityKey === 'projects' && step && !['B04','B05'].includes(store.designCaseId)" class="project-stepper">
          <view :class="{ active:step === 'device', done:step === 'customer' }"><span>{{ step === 'customer' ? '✓' : '1' }}</span><text>{{ l('设备信息','Device') }}</text></view><i /><view :class="{ active:step === 'customer' }"><span>2</span><text>{{ l('客户与质保','Customer') }}</text></view>
        </view>
        <view v-if="entityKey === 'profile'" class="avatar-editor"><view class="avatar"><image v-if="store.account?.avatar" :src="store.account.avatar" mode="aspectFill" /><SsIcon v-else name="user-round" :size="38" tone="default" /></view><button class="btn small subtle" @click="chooseAvatar"><SsIcon name="camera" :size="17" tone="default" />{{ l('更换头像','Change avatar') }}</button><text class="caption">{{ l('JPG / PNG，最大 5MB','JPG / PNG, up to 5 MB') }}</text></view>
        <view v-else-if="(!store.isDealer || entityKey === 'projects') && entityKey !== 'tickets' && !['B04','B05'].includes(store.designCaseId)" class="form-intro" :class="{ 'project-intro': entityKey === 'projects' }"><view class="icon-tile"><SsIcon :name="entityKey === 'projects' ? step === 'customer' ? 'user-round' : 'folder-plus' : config?.icon || 'notebook-pen'" :size="26" tone="default" /></view><view><text>{{ entityKey === 'projects' ? step === 'customer' ? l('客户与质保信息','Customer and warranty') : l('船只与设备信息','Vessel and device') : title }}</text><span v-if="!store.isDealer">{{ entityKey === 'projects' ? step === 'customer' ? l('设备信息已暂存，完成本页后创建安装项目。','Device information is saved. Complete this page to create the project.') : l('项目信息用于设备关联与后续售后，请选择已登记设备。','Project data links the registered device to future service records.') : l('带 * 的字段为必填项，保存后按当前角色隔离数据。','Fields marked * are required. Saved data is isolated by the current role.') }}</span></view></view>

        <view v-if="entityKey === 'projects' && step === 'device' && store.designCaseId !== 'B04'" class="notice project-notice"><SsIcon name="info" :size="19" tone="brand" /><text>{{ l('设备 SN、型号和经销商归属将自动校验。','Device serial, model, and dealer ownership are validated automatically.') }}</text></view>

        <view v-if="isCurrentDeviceRepair && fixedRepairDevice" class="fixed-repair-device card" data-fixed-repair-device>
          <span><SsIcon name="fan" :size="24" tone="brand" /></span>
          <view><text>{{ l('报修设备','Repair device') }}</text><strong>{{ store.locale !== 'zh-Hans' ? fixedRepairDevice.nameEn : fixedRepairDevice.name }}</strong><small>{{ fixedRepairDevice.model }} · {{ fixedRepairDevice.serialNumber }}</small></view>
          <em><SsIcon name="lock-keyhole" :size="14" tone="muted" />{{ l('当前设备','Current') }}</em>
        </view>
        <view class="form-card card" :class="{ 'employee-account-form': entityKey === 'employees', 'dealer-account-form': entityKey === 'dealers' }">
          <view v-for="field in fields" :key="field.key" class="field">
            <text class="field-label">{{ store.locale !== 'zh-Hans' ? field.labelEn : field.label }}{{ field.required ? ' *' : '' }}</text>
            <view v-if="field.type === 'select'" class="field-control select-control" @click="openPicker(field)"><SsIcon :name="fieldIcon(field)" :size="20" tone="default" /><text class="picker-value" :class="{ placeholder: !form[field.key] }">{{ selectedOptionLabel(field) }}</text><SsIcon name="chevron-down" :size="18" tone="default" /></view>
            <picker v-else-if="field.type === 'date'" mode="date" :value="String(form[field.key] || '')" @change="changeDate(field, $event)"><view class="field-control date-control"><SsIcon :name="fieldIcon(field)" :size="20" tone="default" /><text :class="{ placeholder:!form[field.key] }">{{ form[field.key] || fieldPlaceholder(field) }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></picker>
            <view v-else class="field-control" :class="{ textarea:field.type === 'textarea' }"><SsIcon :name="fieldIcon(field)" :size="20" tone="default" /><textarea v-if="field.type === 'textarea'" v-model="form[field.key]" :maxlength="entityKey === 'tickets' && field.key === 'description' ? 500 : -1" :placeholder="fieldPlaceholder(field)" /><input v-else v-model="form[field.key]" :password="field.type === 'password'" :type="field.type === 'number' ? 'digit' : field.type === 'password' ? 'password' : 'text'" :placeholder="fieldPlaceholder(field)" /></view><text v-if="entityKey === 'tickets' && field.key === 'description'" class="field-counter">{{ String(form[field.key] || '').length }}/500</text>
          </view>
        </view>

        <view v-if="isDealerRepairForm" class="section card replacement-card">
          <view class="replacement-head"><view><text class="card-title">{{ l('更换物料','Replacement parts') }}</text><span>{{ l('需要换料时同步生成物料审批申请','Creates a linked parts approval request') }}</span></view><switch :checked="Boolean(form.replacementRequired)" color="#2568df" @change="toggleReplacement" /></view>
          <template v-if="form.replacementRequired">
            <view class="replacement-list">
              <view v-for="(line,index) in replacementLines" :key="line.id" class="replacement-line">
                <view class="replacement-line-head"><view><strong>{{ l(`更换物料 ${index + 1}`,`Replacement ${index + 1}`) }}</strong><text>{{ l('原件与新件一一对应','Original and replacement paired') }}</text></view><button v-if="replacementLines.length > 1" data-action="remove-replacement-line" :aria-label="l('删除本组物料','Remove replacement line')" @click="removeReplacementLine(index)"><SsIcon name="trash-2" :size="18" tone="danger" /></button></view>
                <view class="field"><text class="field-label">{{ l('原物料','Original part') }} *</text><picker :range="materialCatalog" range-key="name" @change="changeReplacementMaterial(index,'originalCatalogId',$event)"><view class="field-control select-control"><SsIcon name="package-search" :size="20" tone="muted" /><text :class="{ placeholder:!line.originalCatalogId }">{{ replacementMaterialLabel(line,'originalCatalogId') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></picker></view>
                <view class="field"><text class="field-label">{{ l('更换物料','Replacement part') }} *</text><picker :range="materialCatalog" range-key="name" @change="changeReplacementMaterial(index,'replacementCatalogId',$event)"><view class="field-control select-control"><SsIcon name="package-plus" :size="20" tone="brand" /><text :class="{ placeholder:!line.replacementCatalogId }">{{ replacementMaterialLabel(line,'replacementCatalogId') }}</text><SsIcon name="chevron-down" :size="18" tone="muted" /></view></picker></view>
                <view class="field replacement-quantity"><text class="field-label">{{ l('更换数量','Quantity') }} *</text><view class="quantity-stepper"><button :disabled="line.quantity <= 1" @click="line.quantity--">-</button><strong>{{ line.quantity }}</strong><button @click="line.quantity++">+</button></view></view>
              </view>
            </view>
            <button class="add-replacement-line" @click="addReplacementLine"><SsIcon name="plus" :size="18" tone="brand" />{{ l('添加一组更换物料','Add replacement line') }}</button>
            <view class="field replacement-service-charge"><text class="field-label">{{ l('人工服务费（元）','Labor fee') }}</text><view class="field-control"><SsIcon name="badge-dollar-sign" :size="20" tone="muted" /><input v-model="form.serviceCharge" type="digit" /></view></view>
            <view class="notice warning replacement-notice"><SsIcon name="info" :size="18" tone="warning" /><text>{{ l('原物料记录保留；更换物料审批通过并完成发货后进入更换处理。','The original part remains in history. Replacement proceeds after approval and shipment.') }}</text></view>
          </template>
        </view>

        <view v-if="entityKey === 'tickets'" class="section card"><view class="section-head"><text class="section-title">{{ form.category === 'repair' ? l('故障附件','Fault attachments') : l('图片 / 视频附件','Image / video attachments') }}</text><text class="caption">{{ attachmentIds.length }}/6</text></view><view class="attachment-grid"><button class="attachment" :class="{ added:imageAttachmentCount }" :disabled="attachmentIds.length >= 6" @click="chooseAttachment('image')"><SsIcon name="image-plus" :size="28" tone="default" /><text>{{ l(`照片 ${imageAttachmentCount} 张`,`Photos ${imageAttachmentCount}`) }}</text></button><button class="attachment" :class="{ added:videoAttachmentCount }" :disabled="attachmentIds.length >= 6" @click="chooseAttachment('video')"><SsIcon name="video" :size="28" tone="default" /><text>{{ l(`视频 ${videoAttachmentCount} 个`,`Videos ${videoAttachmentCount}`) }}</text></button></view><text class="attachment-tip">{{ l('图片支持 JPG/PNG，单张不超过 5MB；视频支持 MP4。','Images: JPG/PNG up to 5 MB each. Videos: MP4.') }}</text></view>
        <view v-if="entityKey === 'employees' || entityKey === 'dealers'" class="section card account-permission-card"><view class="account-permission-head"><view><text class="card-title">{{ entityKey === 'employees' ? l('账号权限','Account permissions') : l('初始业务权限','Initial business permissions') }}</text><span>{{ l('按岗位勾选可访问的业务模块','Select the modules available to this role') }}</span></view><SsIcon name="shield-check" :size="21" tone="brand" /></view><view class="capability-list"><view v-for="item in capabilityOptions" :key="item[0]" @click="toggleCapability(item[0])"><view class="check" :class="{ checked:selectedCapabilities.includes(item[0]) }"><SsIcon v-if="selectedCapabilities.includes(item[0])" name="check" :size="13" tone="default" /></view><SsIcon v-if="store.designCaseId === 'B27'" :name="item[0].includes('project') ? 'folder-kanban' : item[0].includes('support') ? 'wrench' : item[0].includes('material') ? 'package' : 'shield-check'" :size="18" tone="brand" /><text>{{ store.locale !== 'zh-Hans' ? item[2] : item[1] }}</text><SsIcon v-if="selectedCapabilities.includes(item[0])" name="check" :size="16" tone="success" /></view></view></view>
        <view v-if="entityKey === 'materials' && materialPrice && store.hasCapability('price.view')" class="price-card card section"><text>{{ l('经销商采购价','Dealer price') }}</text><strong>{{ store.db?.settings.region === 'GLOBAL' ? '$' : '¥' }}{{ materialPrice.toLocaleString() }}</strong><span>{{ l('仅拥有价格权限的账号可见','Visible only to accounts with price permission') }}</span></view>
        <view v-if="entityKey === 'transfers'" class="notice warning section"><SsIcon name="info" :size="20" tone="default" /><text>{{ l('调拨完成后设备归属立即变更，并写入不可删除的操作记录。','Device ownership changes immediately after transfer and is recorded in an immutable audit log.') }}</text></view>
        <text v-if="error" class="form-error">{{ error }}</text>
        </template>
      </template>
    </scroll-view>
    <view v-if="!forbidden && !isEmployeePermissions && !['M03','M04','B07'].includes(store.designCaseId) && !supportDesignFields.length && !isProjectDeviceForm && !isProjectCustomerForm && !isMaterialRequestForm && !isAssignmentForm && !['detail','view'].includes(mode)" class="fixed-cta"><button class="btn primary" :disabled="saving" @click="submit"><SsIcon :name="saving ? 'loader-circle' : entityKey === 'projects' && step === 'device' ? 'chevron-right' : entityKey === 'tickets' ? 'send' : 'save'" :size="20" tone="inverse" />{{ submitLabel }}</button></view>
    <view v-if="pickerField" class="select-overlay" @click.self="pickerField = null">
      <view class="select-sheet">
        <view class="select-handle" />
        <view class="select-head">
          <view><text>{{ store.locale !== 'zh-Hans' ? pickerField.labelEn : pickerField.label }}</text><span>{{ ['serialNumber','deviceId'].includes(pickerField.key) ? l('仅查询当前经销商名下可用设备','Only available devices owned by this dealer') : l('请选择一个选项','Choose one option') }}</span></view>
          <button class="icon-button select-close" :aria-label="l('关闭','Close')" @click="pickerField = null"><SsIcon name="x" :size="20" tone="default" /></button>
        </view>
        <view v-if="['serialNumber','deviceId'].includes(pickerField.key)" class="select-search"><SsIcon name="search" :size="18" tone="muted" /><input v-model="pickerSearch" :placeholder="l('输入设备类型、型号、名称或 SN','Enter type, model, name, or serial')" /></view>
        <scroll-view scroll-y class="select-options">
          <button v-for="option in visiblePickerOptions" :key="String(option.value)" class="select-option" :class="{ selected: form[pickerField.key] === option.value }" @click="chooseOption(option)">
            <text>{{ optionLabel(option) }}</text>
            <SsIcon v-if="form[pickerField.key] === option.value" name="check" :size="18" tone="default" />
          </button>
          <view v-if="!visiblePickerOptions.length" class="select-empty"><SsIcon name="search" :size="30" tone="muted" /><text>{{ l('没有匹配的可安装设备','No matching installable devices') }}</text><span>{{ l('请检查设备归属、类型、型号或项目关联状态','Check ownership, type, model, or project assignment') }}</span></view>
        </scroll-view>
        <button class="btn subtle select-cancel" @click="pickerField = null">{{ l('取消','Cancel') }}</button>
      </view>
    </view>
    <view v-if="projectMenu" class="select-overlay" @click.self="projectMenu = false"><view class="project-menu-sheet"><view class="select-handle" /><button @click="projectAction('edit')"><SsIcon name="pencil" :size="21" tone="brand" /><view><strong>{{ l(`编辑${singular}`,`Edit ${singular}`) }}</strong><text>{{ entityKey === 'projects' ? l('船只、客户与质保信息','Vessel, customer and warranty') : l('网点资料与业务授权','Outlet details and access') }}</text></view></button><button v-if="entityKey === 'projects'" @click="projectAction('service')"><SsIcon name="wrench" :size="21" tone="warning" /><view><strong>{{ l('新建售后记录','New service record') }}</strong><text>{{ l('自动关联当前项目和设备','Link this project and its device') }}</text></view></button><button class="cancel-menu" @click="projectMenu = false">{{ l('取消','Cancel') }}</button></view></view>
  </view>
</template>

<style scoped>
.avatar { overflow:hidden; }
.fixed-repair-device{display:flex;align-items:center;gap:18rpx;margin-bottom:18rpx;padding:22rpx 24rpx;border:2rpx solid var(--ss-blue-200);border-left:7rpx solid var(--color-action-primary);box-shadow:none}.fixed-repair-device>span{display:flex;width:62rpx;height:62rpx;flex:0 0 62rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:var(--radius-sm)}.fixed-repair-device>view{min-width:0;flex:1}.fixed-repair-device text,.fixed-repair-device strong,.fixed-repair-device small{display:block}.fixed-repair-device text{color:var(--color-text-secondary);font-size:19rpx}.fixed-repair-device strong{margin-top:3rpx;overflow:hidden;font-size:25rpx;text-overflow:ellipsis;white-space:nowrap}.fixed-repair-device small{margin-top:3rpx;color:var(--color-text-secondary);font-size:19rpx;overflow-wrap:anywhere}.fixed-repair-device>em{display:flex;flex:0 0 auto;align-items:center;gap:5rpx;padding:7rpx 10rpx;color:var(--color-text-secondary);background:var(--color-bg-canvas);border-radius:99rpx;font-size:17rpx;font-style:normal}
.serial-methods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10rpx;margin-bottom:12rpx}.serial-methods button{display:flex;min-width:0;height:66rpx;align-items:center;justify-content:center;gap:6rpx;color:var(--color-text-secondary);background:var(--color-bg-subtle);border:2rpx solid transparent;border-radius:11rpx;font-size:19rpx}.serial-methods button.active{color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-color:var(--ss-blue-200)}.serial-methods button:disabled{opacity:.5}.serial-manual>button{min-width:88rpx;height:58rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:0;border-radius:9rpx;font-size:19rpx;font-weight:700}.serial-manual>button:disabled{opacity:.5}
.inline-mode{height:auto;padding:0;color:var(--color-action-primary);background:transparent;border:0;font-size:20rpx;font-weight:600;line-height:1.4}.inline-mode::after{display:none}
.dealer-create-notice { margin-bottom:28rpx; }.dealer-create-notice strong,.dealer-create-notice text { display:block; }.dealer-create-notice text { margin-top:4rpx; }
.service-project-scroll { padding-top:20rpx; }.service-project-form { padding:28rpx 28rpx 4rpx;box-shadow:none; }.service-project-form .field { margin-bottom:22rpx; }.service-project-form .field-label { margin-bottom:9rpx; }.service-project-form .field-control { min-height:86rpx; }.service-project-form .field-control.textarea { min-height:158rpx;align-items:flex-start;padding-top:28rpx; }.service-project-value { min-width:0;flex:1;color:var(--color-text-primary);font-size:25rpx;line-height:36rpx; }.service-project-notice { margin-top:16rpx; }.service-project-notice strong,.service-project-notice text { display:block; }.service-project-notice text { margin-top:4rpx; }.service-project-cta { padding-bottom:50rpx;border-top:0;background:transparent;box-shadow:none; }
.waypoint-detail-map { position:relative;height:240rpx;overflow:hidden;border-radius:16rpx; }.waypoint-detail-map > image { width:100%;height:100%; }.waypoint-detail-marker { position:absolute;top:82rpx;left:calc(64% - 30rpx);display:flex;width:60rpx;height:60rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50% 50% 50% 10rpx;box-shadow:0 8rpx 18rpx rgba(15,23,42,.24);transform:rotate(-45deg); }.waypoint-detail-marker .ss-icon { transform:rotate(45deg); }.waypoint-detail-summary { margin-top:20rpx;padding:28rpx;box-shadow:none; }.waypoint-detail-summary .section-head strong,.waypoint-detail-summary .section-head text { display:block; }.waypoint-detail-summary .section-head strong { font-size:30rpx; }.waypoint-detail-summary .section-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.waypoint-detail-metrics { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:24rpx; }.waypoint-detail-metrics > view { padding:20rpx 24rpx;background:var(--color-bg-canvas);border-radius:12rpx; }.waypoint-detail-metrics text,.waypoint-detail-metrics strong { display:block; }.waypoint-detail-metrics text { color:var(--color-text-secondary);font-size:21rpx; }.waypoint-detail-metrics strong { margin-top:8rpx;font-size:27rpx; }.waypoint-detail-actions .list-row { min-height:100rpx; }.waypoint-source { margin-top:30rpx; }.waypoint-source strong,.waypoint-source text { display:block; }.waypoint-source text { margin-top:5rpx; }
.waypoint-location-scroll { padding-top:0; }.waypoint-location-map { position:relative;height:240rpx;overflow:hidden;background:#e2f0fc;border-radius:16rpx; }.waypoint-location-map::before { position:absolute;top:-48rpx;left:-36rpx;width:300rpx;height:340rpx;content:'';background:#dce8d7;border-radius:48%;transform:rotate(20deg); }.waypoint-location-marker { position:absolute;top:80rpx;left:58%;display:flex;width:60rpx;height:60rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50% 50% 50% 10rpx;box-shadow:0 8rpx 18rpx rgba(15,23,42,.24);transform:rotate(-45deg); }.waypoint-location-marker .ss-icon { transform:rotate(45deg); }.waypoint-location-form { margin-top:20rpx;padding:28rpx 28rpx 4rpx;box-shadow:none; }.waypoint-location-form .field { margin-bottom:24rpx; }.waypoint-location-form .field-label { margin-bottom:10rpx; }.waypoint-location-form .field-control { min-height:86rpx;border-radius:14rpx; }.waypoint-location-form .field-control.active { border-color:var(--color-action-primary);box-shadow:0 0 0 5rpx rgba(40,114,248,.08); }.waypoint-location-form .field-control > input,.waypoint-location-form .field-control > text,.waypoint-location-form .field-control > textarea { min-width:0;flex:1;color:var(--color-text-primary);font-size:25rpx; }.waypoint-location-form .field-control.textarea { min-height:158rpx;align-items:flex-start;padding-top:26rpx; }.waypoint-location-form textarea { height:110rpx;padding:0;line-height:36rpx; }.waypoint-location-notice { margin-top:26rpx; }.waypoint-location-notice strong,.waypoint-location-notice text { display:block; }.waypoint-location-notice text { margin-top:4rpx; }.waypoint-location-submit { width:100%;margin-top:36rpx;margin-bottom:80rpx; }
.avatar image { width:100%;height:100%;padding:0;box-sizing:border-box; }
.avatar-editor .caption { margin-top:12rpx; }.field-counter { display:block;margin-top:8rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:right; }.attachment-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14rpx; }.attachment { width:100%;padding:12rpx;box-sizing:border-box; }.attachment::after { display:none; }.attachment-tip { display:block;margin-top:14rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:30rpx; }
.field-hint { display:block;margin-top:8rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:30rpx; }.replacement-card { padding:26rpx;box-shadow:none; }.replacement-head { display:flex;align-items:center;justify-content:space-between;gap:24rpx; }.replacement-head > view { min-width:0;flex:1; }.replacement-head .card-title,.replacement-head span { display:block; }.replacement-head span { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:29rpx; }.replacement-head switch { transform:scale(.82);transform-origin:right center; }.replacement-list { display:grid;gap:20rpx;margin-top:22rpx; }.replacement-line { padding:22rpx;background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }.replacement-line .field { margin-top:20rpx; }.replacement-line-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding-bottom:2rpx; }.replacement-line-head > view { min-width:0;flex:1; }.replacement-line-head strong,.replacement-line-head text { display:block; }.replacement-line-head strong { color:var(--color-text-primary);font-size:24rpx; }.replacement-line-head text { margin-top:3rpx;color:var(--color-text-secondary);font-size:19rpx; }.replacement-line-head button { display:flex;width:64rpx;height:64rpx;flex:0 0 64rpx;align-items:center;justify-content:center;background:var(--ss-red-50);border:0;border-radius:var(--radius-sm); }.replacement-quantity { display:flex;align-items:center;justify-content:space-between;gap:18rpx; }.replacement-quantity .field-label { margin:0; }.replacement-quantity .quantity-stepper { width:210rpx;height:68rpx; }.add-replacement-line { display:flex;width:100%;height:76rpx;align-items:center;justify-content:center;gap:10rpx;margin-top:18rpx;color:var(--color-action-primary);background:#fff;border:2rpx dashed #9ebce4;border-radius:var(--radius-md);font-size:22rpx;font-weight:600; }.replacement-service-charge { margin-top:24rpx; }.replacement-notice { margin-top:24rpx; }
.select-overlay { position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:0 max(0rpx,env(safe-area-inset-right)) 0 max(0rpx,env(safe-area-inset-left));background:rgba(15,23,42,.38); }
.select-sheet { width:100%;max-width:780rpx;padding:12rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));background:var(--color-bg-surface);border-radius:28rpx 28rpx 0 0;box-shadow:0 -16rpx 50rpx rgba(15,23,42,.14);box-sizing:border-box; }
.select-handle { width:72rpx;height:8rpx;margin:0 auto 18rpx;background:var(--ss-neutral-300);border-radius:999rpx; }
.select-head { display:flex;min-height:96rpx;align-items:center;justify-content:space-between;gap:20rpx;padding:0 0 8rpx;border-bottom:2rpx solid var(--color-divider); }
.select-head > view { min-width:0; }
.select-head text,.select-head span { display:block; }
.select-head text { color:var(--color-text-primary);font-size:30rpx;font-weight:600; }
.select-head span { margin-top:4rpx;color:var(--color-text-secondary);font-size:21rpx; }
.select-close { display:flex;width:88rpx;height:88rpx;flex:0 0 88rpx;align-items:center;justify-content:center;color:var(--color-text-secondary); }
.select-search { display:flex;height:78rpx;align-items:center;gap:14rpx;margin:18rpx 0 4rpx;padding:0 20rpx;background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:14rpx;box-sizing:border-box; }
.select-search input { min-width:0;flex:1;font-size:24rpx; }
.select-options { max-height:min(620rpx,46vh); }
.select-option { display:flex;width:100%;min-height:92rpx;align-items:center;justify-content:space-between;padding:0 20rpx;color:var(--color-text-body);background:transparent;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;font-size:26rpx;text-align:left;box-sizing:border-box; }
.select-option::after { display:none; }
.select-option.selected { color:var(--color-action-primary);font-weight:600; }
.select-empty { display:flex;min-height:220rpx;flex-direction:column;align-items:center;justify-content:center;gap:10rpx;color:var(--color-text-secondary);text-align:center; }
.select-empty text { font-size:24rpx;font-weight:600; }.select-empty span { max-width:560rpx;font-size:20rpx;line-height:30rpx; }
.select-cancel { width:100%;margin-top:20rpx; }
.project-stepper { display:grid;grid-template-columns:1fr 90rpx 1fr;align-items:start;margin:0 18rpx 28rpx; }.project-stepper > view { display:flex;flex-direction:column;align-items:center;gap:8rpx;color:var(--color-text-secondary);font-size:21rpx; }.project-stepper span { display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;background:var(--color-bg-subtle);border-radius:50%;font-size:21rpx;font-weight:600; }.project-stepper i { height:4rpx;margin-top:22rpx;background:var(--color-border-subtle); }.project-stepper .active,.project-stepper .done { color:var(--color-action-primary); }.project-stepper .active span,.project-stepper .done span { color:#fff;background:var(--color-action-primary); }.project-intro { margin-bottom:18rpx; }.project-notice { margin:0 0 18rpx;align-items:center;font-size:21rpx; }.picker-value,.date-control text { min-width:0;flex:1;color:var(--color-text-primary);font-size:26rpx; }.picker-value.placeholder,.date-control .placeholder { color:var(--color-text-secondary); }.date-control { width:100%; }
.project-hero { padding:26rpx;box-shadow:none; }.project-heading { display:flex;align-items:flex-start;justify-content:space-between;gap:18rpx; }.project-heading > view:first-child { min-width:0;flex:1; }.project-heading strong,.project-heading text { display:block; }.project-heading strong { overflow:hidden;font-size:32rpx;text-overflow:ellipsis;white-space:nowrap; }.project-heading text { margin-top:5rpx;color:var(--color-text-secondary);font-size:21rpx; }.project-metrics { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20rpx 16rpx;margin-top:24rpx;padding-top:22rpx;border-top:2rpx solid var(--color-divider); }.project-metrics text,.project-metrics strong { display:block; }.project-metrics text { color:var(--color-text-secondary);font-size:20rpx; }.project-metrics strong { margin-top:5rpx;overflow-wrap:anywhere;font-size:23rpx; }.project-device { min-height:116rpx; }.linked-registration { display:flex;align-items:center;gap:18rpx;padding:20rpx;box-shadow:none; }.linked-registration > view:nth-child(2) { min-width:0;flex:1; }.linked-registration strong,.linked-registration text { display:block; }.linked-registration text { margin-top:5rpx;color:var(--color-text-secondary);font-size:21rpx; }.project-tabs .segment-item { min-width:0;padding:0 10rpx; }.project-panel { margin-top:16rpx;box-shadow:none; }.timeline-card { padding:24rpx; }.project-timeline { position:relative;display:flex;gap:18rpx;padding-bottom:30rpx; }.project-timeline::before { position:absolute;top:18rpx;bottom:0;left:8rpx;width:2rpx;content:'';background:var(--color-divider); }.project-timeline:last-child { padding-bottom:0; }.project-timeline:last-child::before { display:none; }.project-timeline i { position:relative;z-index:1;width:18rpx;height:18rpx;flex:0 0 18rpx;margin-top:4rpx;background:var(--ss-green-500);border:4rpx solid #fff;border-radius:50%;box-shadow:0 0 0 2rpx var(--ss-green-500); }.project-timeline strong,.project-timeline text,.project-timeline span { display:block; }.project-timeline strong { font-size:24rpx; }.project-timeline text,.project-timeline span { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.tab-empty { display:flex;min-height:210rpx;flex-direction:column;align-items:center;justify-content:center;gap:14rpx;color:var(--color-text-secondary);font-size:22rpx; }.project-actions { margin-top:24rpx; }.project-actions .btn { min-width:0;padding:0 16rpx;font-size:23rpx; }
.project-backend-review { align-items:flex-start; }.project-backend-review > view { min-width:0;flex:1; }.project-backend-review strong,.project-backend-review text { display:block; }.project-backend-review text { margin-top:6rpx; }
.project-detail-design .project-hero { padding:26rpx 30rpx 30rpx; }.project-detail-design .project-metrics { gap:16rpx;margin-top:24rpx;padding-top:0;border-top:0; }.project-detail-design .project-metrics > view { min-height:136rpx;padding:22rpx 24rpx;background:var(--color-bg-canvas);border-radius:12rpx;box-sizing:border-box; }.project-detail-design .project-metrics text { font-size:21rpx; }.project-detail-design .project-metrics strong { margin-top:9rpx;font-size:29rpx; }.project-detail-design .project-hero + .section { margin-top:50rpx; }.project-detail-design .project-device { min-height:148rpx; }.project-detail-design .timeline-card { min-height:420rpx;box-sizing:border-box; }
.project-menu-sheet { width:100%;max-width:780rpx;padding:12rpx 24rpx calc(24rpx + env(safe-area-inset-bottom));background:#fff;border-radius:28rpx 28rpx 0 0; }.project-menu-sheet > button { display:flex;width:100%;min-height:102rpx;align-items:center;gap:18rpx;padding:0 20rpx;background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left; }.project-menu-sheet button > view { min-width:0;flex:1; }.project-menu-sheet strong,.project-menu-sheet text { display:block; }.project-menu-sheet strong { color:var(--color-text-primary);font-size:25rpx; }.project-menu-sheet text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.project-menu-sheet .cancel-menu { display:block;margin-top:12rpx;color:var(--color-text-secondary);border:0;text-align:center; }
.dealer-detail-hero { display:flex;align-items:center;gap:20rpx;padding:28rpx;box-shadow:none; }.dealer-logo { display:flex;width:88rpx;height:88rpx;flex:0 0 88rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border-radius:14rpx; }.dealer-detail-hero .list-copy strong { font-size:28rpx; }.dealer-meta { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18rpx;margin:0 28rpx;padding:22rpx 0;border-top:2rpx solid var(--color-divider); }.dealer-meta > view { display:flex;align-items:center;gap:10rpx;color:var(--color-text-body);font-size:21rpx; }.dealer-group-label { display:block;margin:26rpx 0 12rpx;color:var(--color-text-secondary);font-size:21rpx;font-weight:600; }.dealer-permissions .list-row,.dealer-actions .list-row { min-height:112rpx;padding:14rpx 24rpx; }.dealer-permissions .row-icon,.dealer-actions .row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.dealer-permissions .row-icon.warning { background:var(--ss-orange-50); }.dealer-permissions .row-icon.purple { background:var(--ss-purple-50); }.dealer-actions .row-icon.danger { background:var(--ss-red-50); }.dealer-stop strong { color:var(--ss-red-700); }
.service-project-cta { padding-bottom:84rpx; }
.support-design-form { padding:28rpx 28rpx 4rpx;box-shadow:none; }.support-design-form .field { margin-bottom:24rpx; }.support-design-form .field-control { min-height:86rpx; }.support-design-form .field-control.textarea { min-height:158rpx;align-items:flex-start;padding-top:26rpx; }.support-design-form .field-control.focus { border-color:var(--color-action-primary);box-shadow:0 0 0 6rpx rgba(40,114,248,.08); }.support-design-value { min-width:0;flex:1;color:var(--color-text-primary);font-size:25rpx;line-height:36rpx; }.support-design-form .field-label span { color:var(--color-text-secondary);font-size:20rpx;font-weight:400; }.support-attachment { margin-top:28rpx; }.support-attachment .btn { min-width:0; }.complaint-attachment { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx; }.support-design-notice { margin-top:28rpx; }.support-design-notice strong,.support-design-notice text { display:block; }.support-design-notice text { margin-top:4rpx; }
.support-design-submit { width:100%;margin-top:32rpx; }
.design-business-scroll { padding-top:0; }.project-create-notice { margin-bottom:24rpx; }.project-create-notice strong,.project-create-notice text { display:block; }.project-create-notice text { margin-top:4rpx; }
.design-business-form { padding:26rpx 28rpx 4rpx;box-shadow:none; }.design-business-form .field { margin-bottom:22rpx; }.design-business-form .field-label { margin-bottom:10rpx; }.design-business-form .field-label.split { display:flex;align-items:center;justify-content:space-between; }.design-business-form .field-label.split span { color:var(--color-text-secondary);font-size:20rpx;font-weight:400; }.design-business-form .field-control { min-height:84rpx;border-radius:14rpx; }.design-business-form .field-control.active { border-color:var(--color-action-primary);box-shadow:0 0 0 5rpx rgba(40,114,248,.08); }.design-business-form .field-control.muted { color:var(--color-text-secondary);background:var(--color-bg-subtle); }.design-business-form .field-control > input,.design-business-form .field-control > text,.design-business-form .field-control > textarea { min-width:0;flex:1;color:var(--color-text-primary);font-size:25rpx; }.design-business-form .field-control.textarea { min-height:158rpx;align-items:flex-start;padding-top:26rpx; }.design-business-form .field-control textarea { height:112rpx;padding:0;line-height:36rpx; }.field-action { min-width:92rpx;height:64rpx;padding:0;color:var(--color-action-primary);background:transparent;border:0;font-size:21rpx;font-weight:600; }.design-business-submit { width:100%;margin-top:36rpx;margin-bottom:70rpx; }
.material-request-form { margin-top:0; }.quantity-row { display:flex;min-height:76rpx;align-items:center;justify-content:space-between;gap:20rpx; }.quantity-row > text { color:var(--color-text-secondary);font-size:21rpx; }.quantity-stepper { display:grid;width:222rpx;height:76rpx;grid-template-columns:1fr 1fr 1fr;overflow:hidden;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.quantity-stepper button,.quantity-stepper strong { display:flex;align-items:center;justify-content:center;background:#fff;border:0;border-right:2rpx solid var(--color-divider);font-size:24rpx;font-weight:500; }.quantity-stepper strong { color:var(--color-text-primary); }.quantity-stepper button:last-child { border-right:0; }.material-price-design { display:flex;align-items:center;justify-content:space-between;margin-top:30rpx;padding:28rpx;box-shadow:none; }.material-price-design > view strong,.material-price-design > view text { display:block; }.material-price-design > view strong { font-size:25rpx; }.material-price-design > view text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.material-price-design > strong { font-size:42rpx;font-weight:600; }.material-price-design small { margin-right:4rpx;font-size:22rpx; }
.assignment-form { padding:24rpx 28rpx 4rpx;box-shadow:none; }
.assignment-kind-selector { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:20rpx; }
.assignment-kind-selector button { min-width:0;height:72rpx;color:var(--color-text-secondary);background:transparent;border:0;font-size:22rpx; }
.assignment-kind-selector button.active { color:#fff;background:var(--color-action-primary);font-weight:600; }
.assignment-field { margin-bottom:22rpx; }.assignment-label { display:flex;align-items:center;justify-content:space-between;margin-bottom:14rpx; }.assignment-label strong { font-size:23rpx; }.assignment-label text { color:var(--color-text-secondary);font-size:20rpx; }.assignment-field .field-control { min-height:84rpx; }.assignment-field .field-control.textarea { min-height:158rpx;align-items:flex-start;padding-top:26rpx; }.assignment-field .field-control text { min-width:0;flex:1;font-size:25rpx;line-height:34rpx; }
.assignment-select { width:100%;color:var(--color-text-primary);text-align:left;box-sizing:border-box; }
.assignment-select .placeholder { color:var(--color-text-secondary); }
.assignment-readonly { color:var(--color-text-secondary);background:var(--color-bg-subtle); }
.assignment-device-head { margin:48rpx 0 18rpx; }.assignment-devices { padding:0 26rpx;box-shadow:none; }.assignment-device { display:flex;min-height:112rpx;align-items:center;gap:22rpx;border-bottom:2rpx solid var(--color-divider); }.assignment-device:last-child { border-bottom:0; }.assignment-device .row-icon { display:flex;width:72rpx;height:72rpx;flex:0 0 72rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.assignment-device .row-icon.warning { background:var(--ss-orange-50); }.assignment-device strong,.assignment-device text { display:block; }.assignment-device strong { font-size:27rpx; }.assignment-device text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }
.assignment-notice { margin-top:28rpx;align-items:flex-start; }.assignment-notice strong,.assignment-notice text { display:block; }.assignment-notice text { margin-top:5rpx; }.assignment-submit { margin-bottom:70rpx; }
.employee-permission-hero { display:flex;align-items:center;gap:52rpx;padding:34rpx;background:#e4efff;border:2rpx solid #c7ddff;border-radius:16rpx; }.employee-permission-hero > span { display:flex;width:92rpx;height:92rpx;flex:0 0 92rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50%;box-shadow:0 5rpx 16rpx rgba(31,96,217,.18); }.employee-permission-hero > view:nth-child(2) { min-width:0;flex:1; }.employee-permission-hero strong,.employee-permission-hero text { display:block; }.employee-permission-hero strong { font-size:29rpx; }.employee-permission-hero text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.employee-permission-group { margin-top:32rpx; }.employee-permission-group > text { display:block;margin-bottom:12rpx;color:var(--color-text-secondary);font-size:21rpx;font-weight:600; }.employee-permission-group .list-row { min-height:112rpx;padding:14rpx 24rpx; }.employee-permission-group .row-icon { display:flex;width:68rpx;height:68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.employee-permission-group .row-icon.warning { background:var(--ss-orange-50); }.employee-permission-group .row-icon.purple { background:var(--ss-purple-50); }.employee-minimum-notice { margin-top:30rpx;align-items:flex-start; }.employee-minimum-notice > view { min-width:0;flex:1; }.employee-minimum-notice strong,.employee-minimum-notice text { display:block; }.employee-minimum-notice text { margin-top:5rpx; }
.project-region-notice { margin-top:24rpx;align-items:flex-start; }.project-region-notice strong,.project-region-notice text { display:block; }.project-region-notice text { margin-top:5rpx; }
.project-evidence-upload { padding:24rpx;box-shadow:none; }.project-evidence-upload .section-head > view text { display:block; }.evidence-head { display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding-bottom:18rpx;border-bottom:2rpx solid var(--color-divider); }.evidence-head strong,.evidence-head text { display:block; }.evidence-head strong { font-size:23rpx; }.evidence-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.evidence-list { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12rpx;margin:18rpx 0 24rpx; }.evidence-list > view { min-width:0; }.evidence-list image,.evidence-list span { display:flex;width:100%;height:116rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:var(--radius-sm); }.evidence-list text { display:block;margin-top:6rpx;overflow:hidden;color:var(--color-text-secondary);font-size:18rpx;text-overflow:ellipsis;white-space:nowrap; }.evidence-empty { display:flex;min-height:112rpx;align-items:center;justify-content:center;gap:10rpx;color:var(--color-text-secondary);font-size:20rpx; }.project-timeline-list { padding-top:22rpx;border-top:2rpx solid var(--color-divider); }
.material-lines-field { margin-top:28rpx; }.material-line-list { overflow:hidden;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }.material-line { display:flex;min-height:108rpx;align-items:center;justify-content:space-between;gap:18rpx;padding:16rpx 18rpx;border-bottom:2rpx solid var(--color-divider);box-sizing:border-box; }.material-line:last-child { border-bottom:0; }.material-line > view:first-child { min-width:0;flex:1; }.material-line strong,.material-line text { display:block; }.material-line strong { overflow:hidden;font-size:23rpx;text-overflow:ellipsis;white-space:nowrap; }.material-line text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.material-line .quantity-stepper { width:190rpx;height:66rpx;flex:0 0 190rpx; }.material-line .quantity-stepper button,.material-line .quantity-stepper strong { font-size:22rpx; }.material-empty { display:flex;min-height:150rpx;flex-direction:column;align-items:center;justify-content:center;gap:12rpx;color:var(--color-text-secondary);background:var(--color-bg-canvas);border:2rpx dashed var(--color-border-subtle);border-radius:var(--radius-md);font-size:21rpx; }
/* Forms stay dense and native-looking while retaining all business fields. */
.select-sheet,.project-menu-sheet { border-radius:16rpx 16rpx 0 0; }
.select-search { border-radius:var(--radius-md); }
.design-business-form,.support-design-form,.assignment-form { padding:22rpx 24rpx 2rpx;border-radius:var(--radius-md); }
.design-business-form .field-control,.support-design-form .field-control { border-radius:var(--radius-md); }
.project-hero,.project-panel,.timeline-card,.material-price-design { border-radius:var(--radius-md);box-shadow:none; }
.assignment-device .row-icon,.assignment-device .row-icon.warning,.employee-permission-group .row-icon,.employee-permission-group .row-icon.warning,.employee-permission-group .row-icon.purple,.dealer-permissions .row-icon,.dealer-actions .row-icon { width:52rpx;height:52rpx;flex-basis:52rpx;background:transparent;border-radius:var(--radius-sm); }
.employee-permission-hero { gap:24rpx;padding:24rpx;background:#fff;border-color:var(--color-border-subtle);border-left:8rpx solid var(--color-action-primary);border-radius:var(--radius-md); }
.employee-permission-hero > span { width:64rpx;height:64rpx;flex-basis:64rpx;color:var(--color-action-primary);background:transparent;border:0;border-radius:var(--radius-sm);box-shadow:none; }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
