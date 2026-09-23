<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsEmpty from '@/components/SsEmpty.vue'
import SsModal from '@/components/SsModal.vue'
import SsActionSheet from '@/components/SsActionSheet.vue'
import { entityConfigs, entityPrimary, entitySecondary, localizedEntityText } from '@/config/entities'
import { routeService } from '@/services/routes'
import { integrationAvailability } from '@/services/adapters'
import { dealerService } from '@/services/dealer'
import { workflowService } from '@/services/workflow'
import { useAppStore } from '@/stores/app'
import type { BaseEntity, EntityCollection, Message, Query } from '@/types/models'
import type { WorkflowAction, WorkflowEntity } from '@/services/workflow'

type Row = BaseEntity & Record<string, any>

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const cloudSyncConnected = integrationAvailability.cloudSync.ready && integrationAvailability.cloudSync.mode === 'production'
const entity = ref<EntityCollection>('tickets')
const state = ref('')
const type = ref('')
const mode = ref('')
const detailId = ref('')
const originDeviceId = ref('')
const items = ref<Row[]>([])
const loading = ref(false)
const forbidden = ref(false)
const search = ref('')
const searchPerformed = ref(false)
const activeStatus = ref('all')
const showAdvancedFilter = ref(false)
const sortNewest = ref(true)
const scopeCurrent = ref(true)
const projectDealerFilter = ref('all')
const projectStatusFilter = ref('all')
const projectDateFrom = ref('')
const projectDateTo = ref('')
const purchaseQuantities = ref<Record<string, number>>({})
const materialCategory = ref('all')
const purchaseSaving = ref(false)
const purchaseCartOpen = ref(false)
const deleteTarget = ref<Row | null>(null)
const transitionTarget = ref<{ item: Row; action: WorkflowAction; workflowEntity?: WorkflowEntity; workflowId?: string } | null>(null)
const transferTarget = ref<'dealer' | 'headquarters'>('dealer')
const transferDealerId = ref('')
const transferReason = ref('')
const transferSaving = ref(false)
const transferPicker = ref<'target' | 'dealer' | null>(null)
const showSupplement = ref(false)
const supplementText = ref('')
const supplementSaving = ref(false)
const supportSearch = ref('')
const dealerMessageRows = computed(() => [
  { icon:'clipboard-check', tone:'warning' as const, skin:'warning', title:l('3 项物料申请待审批','3 parts requests awaiting approval'), copy:l('来自海沧服务点 · 5 分钟前','From Haicang Service · 5 min ago'), side:l('待处理','Pending') },
  { icon:'circle-alert', tone:'danger' as const, skin:'danger', title:l('设备已激活但未建立项目','Device activated without project'), copy:'DL300020240206 · 需补录安装项目', side:l('1 台','1') },
  { icon:'shuffle', tone:'accent' as const, skin:'purple', title:l('设备调货申请','Device transfer request'), copy:l('集美服务点 → 海沧服务点','Jimei Service → Haicang Service'), side:l('待审核','Review') },
  { icon:'truck', tone:'success' as const, skin:'success', title:l('售后物料等待签收','Service parts awaiting receipt'), copy:l('顺丰 SF1482904820 · 今天送达','SF Express SF1482904820 · Arrives today'), side:l('查看','View') },
  { icon:'user-plus', tone:'brand' as const, skin:'', title:l('二级经销商账号待审核','Sub-dealer account awaiting review'), copy:l('思明服务点 · 昨天 16:32','Siming Service · Yesterday 16:32'), side:l('查看','View') },
])

const config = computed(() => entityConfigs[entity.value])
const title = computed(() => {
  if (state.value === 'todo') return l('待办中心', 'To-do center')
  if (state.value === 'approval') return l('审批中心', 'Approval center')
  if (state.value === 'record-detail') return l(`${config.value.singular}详情`, `${config.value.singularEn} details`)
  if (entity.value === 'tickets' && type.value === 'repair') return l('报修记录', 'Repair records')
  if (entity.value === 'tickets' && type.value === 'transfer') return l('跨区转移', 'Cross-region transfer')
  return store.locale !== 'zh-Hans' ? config.value.titleEn : config.value.title
})
const fallbackUrl = computed(() => {
  if (state.value === 'record-detail') return `/pages/manage/list?entity=${entity.value}`
  if (entity.value === 'tickets' && ['success', 'timeline', 'message-detail'].includes(state.value)) return '/pages/manage/list?entity=tickets'
  if (entity.value === 'tickets' && state.value.startsWith('faq-')) return '/pages/manage/list?entity=tickets&mode=hub'
  if (entity.value === 'tickets' && state.value === 'transfer-selector') return `/pages/manage/list?entity=tickets&state=message-detail&id=${detailId.value}`
  if (entity.value === 'tickets' && state.value === 'message-progress') return `/pages/manage/list?entity=tickets&state=message-detail&id=${detailId.value}`
  if (entity.value === 'payments' && state.value === 'detail') return '/pages/manage/list?entity=payments'
  if (entity.value === 'projects' && state.value === 'result') return '/pages/manage/list?entity=projects&state=search'
  if (['waypoints', 'routes'].includes(entity.value)) return originDeviceId.value ? `/pages/device/detail?id=${encodeURIComponent(originDeviceId.value)}` : '/pages/shell/index?tab=profile'
  if (entity.value === 'messages') return '/pages/shell/index?tab=home'
  if (['tickets', 'payments'].includes(entity.value)) return `/pages/shell/index?tab=${store.isDealer ? 'workbench' : 'profile'}`
  return '/pages/shell/index?tab=workbench'
})
const canCreate = computed(() => state.value !== 'record-detail' && config.value.canCreate && (!config.value.requiredCapability || store.hasCapability(config.value.requiredCapability)))
const businessRecord = computed(() => items.value.find(item => item.id === detailId.value))
const businessDetailEntities = ['materials', 'transfers', 'purchases', 'orders']
const businessSummary = computed(() => {
  const rows = items.value
  const accounts = ['employees', 'dealers'].includes(entity.value)
  return [
    { label: l('记录总数', 'Total records'), value: rows.length, tone: '' },
    { label: accounts ? l('已启用', 'Enabled') : l('待处理', 'Pending'), value: rows.filter(item => accounts ? item.status === 'enabled' : ['pending','submitted','processing','parts','approved','pendingPayment','pendingApproval','salesConfirmed','rdConfirmed','production','partiallyPaid','shipping','installing'].includes(item.status)).length, tone: accounts ? 'success' : 'warning' },
    { label: accounts ? l('已停用', 'Disabled') : l('已完成', 'Completed'), value: rows.filter(item => accounts ? item.status === 'disabled' : ['completed','received','installed','paid','active'].includes(item.status)).length, tone: accounts ? '' : 'success' },
  ]
})
function businessDate(value: unknown) {
  if (!value) return '--'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString(store.locale === 'zh-Hans' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function businessName(value: { name?: string; nameEn?: string } | undefined) { return value ? (store.locale === 'zh-Hans' ? value.name : value.nameEn || value.name) || '--' : '--' }
function waitsForPlatform(item: Row) { return entity.value === 'transfers' && item.kind === 'reallocation' && item.status === 'pending' }
function businessRecordTitle(item: Row) { return entity.value === 'transfers' ? `${item.kind === 'assignment' ? l('设备分配','Device assignment') : l('设备调拨','Device transfer')} · ${businessName(store.db?.devices.find(device => device.id === item.deviceId))}` : entityPrimary(item, store.locale) }
function businessMoney(amount: unknown, currency = 'CNY') { return `${currency === 'USD' ? 'US$ ' : '¥'}${Number(amount || 0).toLocaleString(store.locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}` }
function purchaseCurrency(item: Row) { return item.items?.[0]?.currency || store.db?.payments.find(payment => payment.orderNo === item.orderNo)?.currency || 'CNY' }
function businessListFields(item: Row) { return businessFields(item).slice(0, entity.value === 'transfers' ? 4 : 2) }
function businessFields(item: Row) {
  const project = store.db?.projects.find(row => row.id === item.projectId)
  const dealer = store.db?.dealers.find(row => row.id === item.dealerId)
  const device = store.db?.devices.find(row => row.id === item.deviceId)
  const pairs: Array<[string,string,unknown]> = entity.value === 'materials' ? [
    ['关联项目','Project',project?.vessel || project?.name || '--'], ['申请数量','Quantity', `${item.quantity || 0} ${l('件','items')}`],
    ['申请网点','Requesting outlet',businessName(dealer)], ['申请原因','Reason',localizedEntityText(item.reason || '--',store.locale)],
  ] : entity.value === 'transfers' ? [
    ['设备','Device',businessName(device)], ['设备类型','Device type',localizedEntityText(device?.category || '--',store.locale)],
    ['设备型号','Model',device?.model || '--'], ['序列号','Serial',device?.serialNumber || '--'],
    ['原归属','From',localizedEntityText(item.from,store.locale)], ['接收方','To',localizedEntityText(item.to,store.locale)],
  ] : entity.value === 'employees' ? [
    ['岗位','Role',localizedEntityText(item.roleName,store.locale)], ['联系电话','Phone',item.phone],
    ['所属网点','Outlet',businessName(dealer)], ['授权业务','Permissions',`${item.capabilities?.length || 0} ${l('项','items')}`],
  ] : entity.value === 'dealers' ? [
    ['负责人','Manager',localizedEntityText(item.manager,store.locale)], ['联系电话','Phone',item.phone], ['服务地区','Region',localizedEntityText(item.region,store.locale)],
  ] : entity.value === 'tickets' ? [
    ['关联设备','Device',businessName(device)], ['服务网点','Service outlet',businessName(dealer)], ['联系人','Contact',item.contact || item.phone || '--'],
  ] : entity.value === 'purchases' ? [
    ['采购网点','Outlet',businessName(dealer)], ['采购内容','Products',item.purchaseType === 'devices' ? l('设备','Equipment') : item.purchaseType === 'mixed' ? l('设备与配件','Equipment and parts') : l('配件','Parts')],
    ['采购数量','Quantity',`${item.quantity || 0} ${l('件','items')}`], ['审批状态','Approval',statusLabel(item.status)],
    ['累计已付','Paid',businessMoney(item.paidAmount || 0,purchaseCurrency(item))], ['待付金额','Remaining',businessMoney(item.remainingAmount ?? item.amount,purchaseCurrency(item))],
    ['付款笔数','Installments',`${item.paymentCount || 0} ${l('笔','payments')}`], ['结算方式','Settlement',item.settlementMode === 'offlineFx' ? l('线下外汇结算','Offline FX settlement') : l('支持分次付款','Installments supported')],
  ] : entity.value === 'orders' ? [
    ['客户订单','Customer order',item.orderNo], ['关联设备','Device',businessName(device)], ['订单金额','Amount',businessMoney(item.amount,item.currency)], ['当前阶段','Current stage',statusLabel(item.status)], ['特别注意事项','Special requirements',item.specialRequirements || '--'],
  ] : []
  return pairs.map(([zh,en,value]) => ({ label:l(zh,en), value:String(value || '--') }))
}
function businessSubtitle(item: Row) {
  if (state.value === 'catalog' || state.value === 'price-search') return `SKU ${item.sku || '--'}`
  return `${item.orderNo || item.id} · ${businessDate(item.createdAt)}`
}
const businessHistory = computed(() => {
  const record = businessRecord.value
  if (!record) return []
  return Array.isArray(record.history) && record.history.length ? record.history : [{ id: 'created', label:l('记录已创建','Record created'), at:record.createdAt, operator:'', note:'' }]
})
function openBusinessLogistics(item: Row) {
  const shipment = store.db?.shipments.find(row => row.materialRequestId === item.id || Boolean(item.orderNo && row.orderNo === item.orderNo))
  if (shipment) uni.navigateTo({ url:`/pages/process/index?scenario=logistics&shipmentId=${shipment.id}` })
}
function hasBusinessLogistics(item: Row) { return Boolean(store.db?.shipments.some(row => row.materialRequestId === item.id || Boolean(item.orderNo && row.orderNo === item.orderNo))) }
const detailItem = computed(() => items.value.find((item) => item.id === detailId.value) || items.value[0])
const detailTransfer = computed(() => detailItem.value ? serviceTransferFor(detailItem.value) : undefined)
const detailMessageTransfer = computed(() => store.db?.messageTransfers.find((item) => item.ticketId === detailItem.value?.id))
const canActOnMessageTransfer = computed(() => Boolean(detailMessageTransfer.value?.target === 'dealer' && detailMessageTransfer.value.targetDealerId === store.account?.dealerId && store.hasCapability('support.manage')))
const supplementNotes = computed(() => (Array.isArray(detailItem.value?.history) ? detailItem.value.history : [])
  .filter((entry: Row) => String(entry.label || '').includes('补充') || String(entry.label || '').toLowerCase().includes('note'))
  .slice().reverse())
const serviceReplies = computed(() => (Array.isArray(detailItem.value?.history) ? detailItem.value.history : [])
  .filter((entry: Row) => Boolean(entry.note) && (String(entry.label || '').includes('回复') || String(entry.label || '').toLowerCase().includes('reply')))
  .slice().reverse())
const transferPickerItems = computed(() => {
  if (transferPicker.value === 'target') return [
    { key: 'target:dealer', label: l('指定经销商', 'Specified dealer'), description: l('从服务范围内选择接收网点', 'Choose an outlet in the service scope'), icon: 'store' },
    { key: 'target:headquarters', label: l('总部客服', 'Headquarters support'), description: l('由平台总部统一协调处理', 'Coordinated by headquarters'), icon: 'headphones' },
  ]
  return (store.db?.dealers || []).filter((item) => item.status === 'enabled' && item.id !== store.account?.dealerId).map((item) => ({
    key: `dealer:${item.id}`,
    label: store.locale !== 'zh-Hans' ? item.nameEn : item.name,
    description: [localizedEntityText(item.region, store.locale), l(`${item.level} 级服务网点`, `Level ${item.level} service outlet`)].filter(Boolean).join(' · '),
    icon: 'store',
  }))
})
const projectDealerOptions = computed(() => [
  { id: 'all', label: l('全部经销商', 'All dealers') },
  ...(store.db?.dealers || [])
    .filter((item) => store.context.dealerScopeIds.includes(item.id))
    .map((item) => ({ id: item.id, label: store.locale !== 'zh-Hans' ? item.nameEn : item.name })),
])
const projectStatusOptions = computed(() => [
  { id: 'all', label: l('全部状态', 'All statuses') },
  { id: 'pendingApproval', label: l('待跨区审核', 'Pending regional review') },
  { id: 'installing', label: l('安装中', 'Installing') },
  { id: 'active', label: l('使用中', 'Active') },
  { id: 'aftersales', label: l('售后中', 'In service') },
  { id: 'completed', label: l('已完成', 'Completed') },
  { id: 'rejected', label: l('已驳回', 'Rejected') },
])
const selectedProjectDealer = computed(() => projectDealerOptions.value.find((item) => item.id === projectDealerFilter.value)?.label || projectDealerOptions.value[0].label)
const selectedProjectStatus = computed(() => projectStatusOptions.value.find((item) => item.id === projectStatusFilter.value)?.label || projectStatusOptions.value[0].label)
const purchaseCartCount = computed(() => Object.values(purchaseQuantities.value).reduce((sum, quantity) => sum + Number(quantity || 0), 0))
const purchaseCatalogItems = computed(() => [
  ...(store.db?.deviceModels || []).map((item) => ({ ...item, sku:item.model, category:l('设备','Equipment'), productCategory:item.category, itemType:'device' as const, specification:item.specifications[0] || l('标准型','Standard') })),
  ...(store.db?.materialCatalog || []).map((item) => ({ ...item, itemType:'material' as const, productCategory:item.category })),
])
const purchaseCartAmount = computed(() => purchaseCatalogItems.value.reduce((sum, item) => sum + Number(purchaseQuantities.value[item.id] || 0) * item.dealerPrice, 0))
const selectedPurchaseItems = computed(() => purchaseCatalogItems.value.filter((item) => Number(purchaseQuantities.value[item.id] || 0) > 0).map((item) => ({ ...item, quantity: Number(purchaseQuantities.value[item.id] || 0) })))
const purchaseRecordCount = computed(() => store.db?.purchases.filter((item) => !store.account?.dealerId || store.context.dealerScopeIds.includes(item.dealerId)).length || 0)
const recentPurchases = computed(() => (store.db?.purchases || [])
  .filter((item) => !store.account?.dealerId || store.context.dealerScopeIds.includes(item.dealerId))
  .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  .slice(0, 2))
const approvalRows = computed(() => [
  ...(store.db?.materials || [])
    .filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'pending')
    .map((record) => ({ key: `materials:${record.id}`, entity: 'materials' as EntityCollection, record, icon: 'package-plus', title: record.name, kind: l('物料申请', 'Parts request') })),
  ...(store.db?.purchases || [])
    .filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'pendingApproval')
    .map((record) => ({ key: `purchases:${record.id}`, entity: 'purchases' as EntityCollection, record, icon: 'shopping-cart', title: record.title, kind: l('采购审批', 'Purchase approval') })),
].sort((a, b) => String(b.record.updatedAt).localeCompare(String(a.record.updatedAt))))
const todoCenterRows = computed(() => [
  { key:'materials', title:l('物料申请审批','Parts approvals'), count:(store.db?.materials || []).filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'pending').length, status:l('待审批','Pending approval'), icon:'clipboard-check', tone:'warning', capability:'material.approve', url:'/pages/manage/list?entity=materials' },
  { key:'purchases', title:l('采购审批','Purchase approvals'), count:(store.db?.purchases || []).filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'pendingApproval').length, status:l('待审批','Pending approval'), icon:'shopping-cart', tone:'warning', capability:'material.approve', url:'/pages/manage/list?entity=purchases&status=pendingApproval' },
  { key:'shipments', title:l('物流签收','Shipment receipts'), count:(store.db?.shipments || []).filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'shipping').length, status:l('运输中','Shipping'), icon:'truck', tone:'success', capability:'material.apply', url:'/pages/manage/list?entity=shipments' },
  { key:'tickets', title:l('售后工单','Service tickets'), count:(store.db?.tickets || []).filter((item) => Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) && !['completed','rejected'].includes(item.status)).length, status:l('待处理','Pending'), icon:'wrench', tone:'brand', capability:'support.manage', url:'/pages/manage/list?entity=tickets' },
  { key:'transfers', title:l('调拨进度','Transfer progress'), count:(store.db?.transfers || []).filter((item) => store.context.dealerScopeIds.includes(item.dealerId) && item.status === 'pending').length, status:l('审核中','In review'), icon:'shuffle', tone:'purple', capability:'device.assign', url:'/pages/manage/list?entity=transfers' },
].filter((item) => item.count > 0 && store.hasCapability(item.capability)))
const todoCenterCount = computed(() => todoCenterRows.value.reduce((sum, item) => sum + item.count, 0))
const materialCategories = computed(() => Array.from(new Set(purchaseCatalogItems.value.map((item) => item.category))))
const filtered = computed(() => items.value.filter((item) => {
  if (state.value === 'unassigned' && entity.value === 'devices' && (item.dealerId !== store.account?.dealerId || item.activationStatus !== 'registered' || item.ownerId || item.projectId || item.assignedTo)) return false
  if (type.value === 'transfer' && entity.value === 'tickets' && item.category !== 'transfer') return false
  const query = search.value.toLocaleLowerCase().trim()
  if (query && !JSON.stringify(item).toLocaleLowerCase().includes(query)) return false
  if (entity.value === 'projects') {
    if (projectDealerFilter.value !== 'all' && item.dealerId !== projectDealerFilter.value) return false
    if (projectStatusFilter.value !== 'all' && item.status !== projectStatusFilter.value) return false
    const createdDate = String(item.createdAt || '').slice(0, 10)
    if (projectDateFrom.value && createdDate < projectDateFrom.value) return false
    if (projectDateTo.value && createdDate > projectDateTo.value) return false
  }
  if (entity.value === 'waypoints') {
    if (activeStatus.value === 'local') return (item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) === 'local'
    if (activeStatus.value === 'cloud') return (item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) === 'server'
    if (['pending', 'failed'].includes(activeStatus.value)) return item.syncStatus === activeStatus.value
  }
  if (activeStatus.value === 'unread') return item.read === false
  if (activeStatus.value !== 'all' && entity.value !== 'waypoints' && String(item.status || item.type) !== activeStatus.value) return false
  if (scopeCurrent.value && store.account) {
    const accountValues = [item.ownerId, item.accountId, item.requesterId].filter(Boolean).map(String)
    const dealerValues = [item.dealerId, item.originDealerId, item.targetDealerId].filter(Boolean).map(String)
    const matchesAccount = accountValues.includes(store.account.id)
    const matchesDealerScope = dealerValues.some((dealerId) => store.context.dealerScopeIds.includes(dealerId))
    if ((accountValues.length || dealerValues.length) && !matchesAccount && !matchesDealerScope) return false
  }
  return true
}))
const visibleItems = computed<Row[]>(() => {
  if (state.value === 'price-search' && entity.value === 'materials') return (store.db?.materialCatalog || []).filter((item) => !search.value || JSON.stringify(item).toLocaleLowerCase().includes(search.value.toLocaleLowerCase())).map((item) => ({ ...item, status: item.stock > 0 ? 'online' : 'offline' }))
  if (state.value === 'catalog' && entity.value === 'purchases') return purchaseCatalogItems.value.filter((item) => (materialCategory.value === 'all' || item.category === materialCategory.value) && (!search.value || JSON.stringify(item).toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))).map((item) => ({ ...item, status: item.stock > 0 ? 'online' : 'offline', quantity: Number(purchaseQuantities.value[item.id] || 0) }))
  const result = state.value === 'search' && !searchPerformed.value
    ? []
    : filtered.value.filter((item) => store.designCaseId !== 'P08' || ['pay-02','pay-03','pay-04'].includes(item.id))
  return result.sort((left, right) => {
    const leftTime = Date.parse(String(left.updatedAt || left.createdAt || '')) || 0
    const rightTime = Date.parse(String(right.updatedAt || right.createdAt || '')) || 0
    return sortNewest.value ? rightTime - leftTime : leftTime - rightTime
  })
})
const statuses = computed(() => {
  if (entity.value === 'messages') return [['all', l('全部','All')], ['unread', l('未读','Unread')], ['device', l('设备','Device')], ['service', l('售后','Service')], ['approval', l('审批','Approval')], ['system', l('系统','System')]]
  if (entity.value === 'payments') return [['all', l('全部','All')], ['pending', l('待支付','Pending')], ['verifying', l('待财务核实','Finance review')], ['verified', l('已核实','Verified')]]
  if (entity.value === 'tickets') return [['all', l('全部','All')], ['submitted', l('待受理','Submitted')], ['processing', l('处理中','Processing')], ['parts', l('待配件','Waiting for parts')], ['completed', l('已完成','Completed')], ['rejected', l('已驳回','Rejected')]]
  if (entity.value === 'materials') return [['all', l('全部','All')], ['pending', l('待审批','Pending')], ['approved', l('待发货','Approved')], ['shipping', l('运输中','Shipping')], ['received', l('已签收','Received')], ['installed', l('已安装','Installed')], ['rejected', l('已拒绝','Rejected')]]
  if (entity.value === 'transfers') return [['all', l('全部','All')], ['pending', l('待审批','Pending')], ['approved', l('待执行','Approved')], ['completed', l('已完成','Completed')], ['rejected', l('已拒绝','Rejected')]]
  if (entity.value === 'shipments') return [['all', l('全部','All')], ['shipping', l('运输中','Shipping')], ['received', l('已签收','Received')], ['exception', l('异常','Exception')]]
  if (entity.value === 'purchases') return [['all', l('全部','All')], ['pendingApproval', l('待销售确认','Sales review')], ['salesConfirmed', l('待研发确认','R&D review')], ['rdConfirmed', l('待生产','Production queue')], ['production', l('生产中','In production')], ['approved', l('待付款','Awaiting payment')], ['partiallyPaid', l('部分付款','Partially paid')], ['paid', l('待收货','Awaiting receipt')], ['rejected', l('已驳回','Rejected')]]
  if (entity.value === 'orders') return [['all', l('全部','All')], ['submitted', l('已提单','Submitted')], ['salesConfirmed', l('销售确认','Sales')], ['rdConfirmed', l('研发确认','R&D')], ['production', l('生产中','Production')], ['financeConfirmed', l('财务确认','Finance')], ['shipped', l('已发货','Shipped')], ['completed', l('已完成','Completed')]]
  if (entity.value === 'waypoints') return [['all', l('全部','All')], ['local', l('本机存储','Local')], ['cloud', l('服务器存储','Server')], ['pending', l('待上传','Pending')], ['failed', l('失败','Failed')]]
  return []
})
const paymentTabs = computed(() => store.designCaseId === 'B18'
  ? [['all', l('全部','All')], ['paid', l('采购','Purchases')], ['pending', l('售后','Service')], ['refunded', l('退款','Refunds')]]
  : store.designCaseId === 'P08'
    ? [['all', l('全部','All')], ['pending', l('待支付','Pending')], ['verifying', l('待财务核实','Finance review')], ['verified', l('已核实','Verified')]]
    : statuses.value)
const serviceTimelineEntries = computed(() => {
  if (store.designCaseId === 'S05') return [
    { title:l('报修申请已提交','Repair request submitted'), copy:l('系统已通知厦门总代理','Xiamen general agent notified'), time:l('08月10日 09:41','Aug 10 09:41'), state:'done' },
    { title:l('代理商已受理','Dealer accepted'), copy:l('联系人：林工 138****0032','Contact: Lin 138****0032'), time:l('08月10日 10:06','Aug 10 10:06'), state:'done' },
    { title:l('等待上门检查','Waiting for onsite inspection'), copy:l('预计 08月11日 14:00-16:00','Estimated Aug 11 14:00-16:00'), time:l('当前状态','Current'), state:'active' },
    { title:l('故障处理','Repair in progress'), copy:l('完成后记录原因、物料与费用','Record cause, parts, and cost'), time:'', state:'' },
    { title:l('服务完成','Service completed'), copy:l('处理结果将在记录中显示','The result appears in the activity record'), time:'', state:'' },
  ]
  const item = detailItem.value
  if (!item) return []
  const history = Array.isArray(item.history) ? item.history : []
  const historyTime = (index: number) => history[index]?.at ? String(history[index].at).slice(5, 16).replace('T', ' ') : ''
  const status = String(item.status || 'submitted')
  const activeIndex = ({ submitted:1, processing:2, parts:3, completed:4, rejected:1 } as Record<string, number>)[status] ?? 1
  const entries = [
    { title:l('服务申请已提交','Service request submitted'), copy:history[0]?.operator ? l(`提交人：${history[0].operator}`, `Submitted by ${history[0].operator}`) : l('服务申请已写入系统','Request saved to the system'), time:historyTime(0) },
    { title:status === 'submitted' ? l('等待代理商受理','Awaiting dealer acceptance') : l('代理商已受理','Dealer accepted'), copy:history[1]?.operator ? l(`处理人：${history[1].operator}`, `Handled by ${history[1].operator}`) : l('所属服务网点将尽快处理','The assigned service outlet will respond'), time:historyTime(1) },
    { title:l('等待上门检查','Waiting for onsite inspection'), copy:l('受理后将确认联系人和预约时间','Contact and appointment are confirmed after acceptance'), time:'' },
    { title:status === 'parts' ? l('等待配件处理','Waiting for parts') : l('故障处理','Repair in progress'), copy:l('记录故障原因、所用物料与费用','Cause, parts, and costs are recorded'), time:'' },
    { title:l('服务完成','Service completed'), copy:l('处理结果将在记录中显示','The result appears in the activity record'), time:'' },
  ]
  return entries.map((entry, index) => ({ ...entry, state: status === 'completed' || index < activeIndex ? 'done' : index === activeIndex ? 'active' : '' }))
})
const serviceHeading = computed(() => store.designCaseId === 'S05' ? 'BX20260810001' : detailItem.value?.id || '')
const serviceDevice = computed(() => {
  if (store.designCaseId === 'S05') return l('顶流机-01 · 水下电机','Surface jet-01 · Underwater motor')
  const item = detailItem.value
  const device = store.db?.devices.find((entry) => entry.id === item?.deviceId)
  const deviceName = device ? (store.locale !== 'zh-Hans' ? device.nameEn : device.name) : entityPrimary(item || {}, store.locale)
  return [deviceName, localizedEntityText(item?.faultCategory, store.locale)].filter(Boolean).join(' · ')
})
const supportDeviceScope = computed(() => {
  const devices = store.db?.devices || []
  if (store.isGuest) return devices.filter((item) => item.guestVisible)
  if (store.isDealer) return devices.filter((item) => Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)))
  return devices.filter((item) => item.ownerId === store.account?.id)
})
const activeSupportTickets = computed(() => (store.db?.tickets || [])
  .filter((item) => item.ownerId === store.account?.id && !['completed', 'rejected'].includes(item.status))
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  .slice(0, 3))
const supportFaqItems = computed(() => (store.db?.faqDocuments || [])
  .filter((item) => item.status === 'published')
  .filter((item) => {
    if (!item.deviceCategories.length && !item.deviceModels.length) return true
    return supportDeviceScope.value.some((device) => item.deviceCategories.includes(device.category) || item.deviceModels.includes(device.model))
  })
  .sort((a, b) => a.sort - b.sort)
  .map((item) => ({
    ...item,
    icon: 'file-text',
    title: store.locale !== 'zh-Hans' ? item.titleEn : item.title,
    summary: store.locale !== 'zh-Hans' ? item.summaryEn : item.summary,
  })))
const filteredSupportFaqs = computed(() => {
  const query = supportSearch.value.trim().toLocaleLowerCase()
  return query ? supportFaqItems.value.filter((item) => `${item.title} ${item.summary}`.toLocaleLowerCase().includes(query)) : supportFaqItems.value
})

function statusLabel(value: unknown) {
  const key = String(value || '')
  if (entity.value === 'materials' && key === 'pending') return l('待审批','Awaiting approval')
  if (entity.value === 'waypoints') {
    const waypointLabels: Record<string, [string, string]> = {
      synced: ['已同步', 'Synced'], pending: ['待上传', 'Pending upload'], failed: ['上传失败', 'Upload failed'],
    }
    const waypointLabel = waypointLabels[key]
    if (waypointLabel) return l(waypointLabel[0], waypointLabel[1])
  }
  const labels: Record<string, [string, string]> = {
    pendingApproval:[entity.value === 'purchases' ? '待销售确认' : '待审批',entity.value === 'purchases' ? 'Sales review' : 'Awaiting approval'], pendingPayment:['待支付','Awaiting payment'], partiallyPaid:['部分付款','Partially paid'], cart:['待提交','Draft'],
    salesConfirmed:['销售已确认','Sales confirmed'], rdConfirmed:['研发已确认','R&D confirmed'], production:['生产中','In production'], financeConfirmed:['财务已确认','Finance confirmed'], shipped:['已发货','Shipped'], cancelled:['已取消','Cancelled'],
    submitted:['待受理','Submitted'], processing:['处理中','Processing'], parts:['待配件','Waiting for parts'], completed:['已完成','Completed'], rejected:['已驳回','Rejected'],
    pending:['待处理','Pending'], verifying:['待财务核实','Finance review'], verified:['已核实','Verified'], paid:['已核实','Verified'], refunded:['已退款','Refunded'], failed:['失败','Failed'], online:['在线','Online'], offline:['离线','Offline'],
    approved:['已通过','Approved'], shipping:['运输中','Shipping'], received:['已签收','Received'], installed:['已安装','Installed'], active:['进行中','Active'], installing:['安装中','Installing'], enabled:['已启用','Enabled'], disabled:['已停用','Disabled'],
  }
  const label = labels[key]
  return label ? l(label[0], label[1]) : localizedEntityText(value, store.locale)
}

function waypointStatusLabel(item: Row) {
  const target = item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')
  if (target === 'local') return l('仅本机', 'Local only')
  return statusLabel(item.syncStatus)
}
function paymentMethodLabel(item: Row) {
  return item.status === 'pending' ? l('扫码支付','Scan QR payment') : l('扫码支付 · 人工核实','Scan QR · manual review')
}
function paymentTime(item: Row) {
  const value = String(item.updatedAt || '')
  return value ? value.slice(5, 16).replace('T', ' ') : '--'
}
function paymentReference(item: Row) {
  if (item.proofAttachmentId) return l('付款凭证已关联订单','Payment proof linked')
  if (['verified','paid','refunded'].includes(String(item.status))) return l('历史记录已核实','Historical record verified')
  return l('等待上传付款凭证','Awaiting payment proof')
}
function paymentAccount(item: Row) {
  const account = store.db?.accounts.find((entry) => entry.id === item.accountId)
  if (!account) return l('当前账号', 'Current account')
  if (account.phone) return account.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  return account.email || (store.locale !== 'zh-Hans' ? account.displayNameEn : account.displayName)
}
function paymentPurchaseFor(item: Row) { return store.db?.purchases.find((entry) => entry.id === item.purchaseId || entry.orderNo === item.orderNo) }
function paymentChildNo(item: Row) { return item.paymentNo || `${item.orderNo}-P${String(Number(item.installmentNumber || 1)).padStart(2,'0')}` }
function paymentPaidBefore(item: Row) {
  if (!paymentPurchaseFor(item)) return 0
  const installment = Number(item.installmentNumber || 1)
  return (store.db?.payments || []).filter((entry) => entry.orderNo === item.orderNo && ['verified','paid'].includes(entry.status) && Number(entry.installmentNumber || 1) < installment).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
}
function paymentRemaining(item: Row) {
  const purchase = paymentPurchaseFor(item)
  if (!purchase) return 0
  const confirmedCurrent = ['verified','paid'].includes(String(item.status)) ? Number(item.amount || 0) : 0
  return Math.max(0, Number(purchase.amount || 0) - paymentPaidBefore(item) - confirmedCurrent)
}

onLoad(async (query) => {
  await store.init()
  const requested = String(query?.entity || 'tickets') as EntityCollection
  if (entityConfigs[requested]) entity.value = requested
  state.value = String(query?.state || '')
  type.value = String(query?.type || '')
  mode.value = String(query?.mode || '')
  detailId.value = String(query?.id || '')
  originDeviceId.value = String(query?.deviceId || '')
  if (query?.status) activeStatus.value = String(query.status)
  scopeCurrent.value = !((entity.value === 'projects' && store.account?.role === 'dealerAdmin')
    || (entity.value === 'materials' && store.hasCapability('material.approve'))
    || (entity.value === 'tickets' && Boolean(originDeviceId.value)))
  if (state.value === 'price-search' && !store.hasCapability('price.view')) forbidden.value = true
  if (state.value === 'result') { search.value = l('海风', 'Sea Wind'); searchPerformed.value = true }
  await load()
  if (state.value === 'transfer-selector') {
    selectTransferDealer()
    transferReason.value = l('当前船只长期停靠泉州，请由当地服务网点继续处理。', 'The vessel is now based in Quanzhou. Please transfer to the local service outlet.')
  }
})
onShow(() => { if (store.ready) load() })

async function load() {
  loading.value = true
  forbidden.value = false
  try {
    if (state.value === 'price-search' && !store.hasCapability('price.view')) throw new Error('FORBIDDEN')
    if (state.value === 'unassigned' && entity.value === 'devices') {
      const currentDealer = store.db?.dealers.find((item) => item.id === store.account?.dealerId)
      if (!store.hasCapability('device.assign') || currentDealer?.level !== 1) throw new Error('FORBIDDEN')
    }
    const query: Query = {}
    if (entity.value === 'tickets' && type.value) query.category = type.value
    const result = await store.list<Row>(entity.value, query)
    items.value = entity.value === 'tickets' && originDeviceId.value
      ? result.items.filter((item) => item.deviceId === originDeviceId.value && item.category !== 'message')
      : result.items
  } catch (cause) {
    forbidden.value = cause instanceof Error && cause.message === 'FORBIDDEN'
    items.value = []
  } finally { loading.value = false }
}
function switchPurchaseView(next: 'catalog' | 'records') {
  uni.redirectTo({ url: next === 'catalog' ? '/pages/manage/list?entity=purchases&state=catalog' : '/pages/manage/list?entity=purchases' })
}
function openTodo(row: typeof todoCenterRows.value[number]) { uni.navigateTo({ url: row.url }) }
function openApproval(row: typeof approvalRows.value[number]) {
  uni.navigateTo({ url: `/pages/manage/list?entity=${row.entity}&state=record-detail&id=${encodeURIComponent(row.record.id)}` })
}
function purchasePaymentLabel(item: Row) {
  if (['pendingApproval','salesConfirmed','rdConfirmed','production'].includes(String(item.status))) return l('业务确认完成后生成付款单', 'Payment starts after business review')
  if (item.settlementMode === 'offlineFx') return l('线下外汇结算', 'Offline FX settlement')
  if (item.paymentStatus === 'partial' || item.status === 'partiallyPaid') return l(`已付 ¥${Number(item.paidAmount || 0).toFixed(2)}，待付 ¥${Number(item.remainingAmount || 0).toFixed(2)}`, `Paid ¥${Number(item.paidAmount || 0).toFixed(2)}, remaining ¥${Number(item.remainingAmount || 0).toFixed(2)}`)
  if (item.paymentStatus === 'paid' || item.status === 'paid') return l(`已付清 · ${Number(item.paymentCount || 1)} 笔`, `Paid in ${Number(item.paymentCount || 1)} installment(s)`)
  const payment = store.db?.payments.find((entry) => entry.orderNo === item.orderNo && entry.status === 'pending')
  return payment ? l('待支付', 'Pending') : l('付款节点待确认', 'Payment step pending confirmation')
}
function purchaseShippingLabel(item: Row) {
  const shipment = store.db?.shipments.find((entry) => entry.orderNo === item.orderNo)
  if (shipment) return ({ pending: l('待发货', 'Pending shipment'), shipping: l('运输中', 'Shipping'), received: l('已签收', 'Received'), exception: l('物流异常', 'Exception') } as Record<string, string>)[shipment.status]
  if (['pendingApproval','salesConfirmed','rdConfirmed','production'].includes(String(item.status))) return l('业务流转中', 'Business review')
  if (item.status === 'paid') return l('待仓库发货', 'Awaiting warehouse dispatch')
  if (item.status === 'partiallyPaid') return l('付清后发货', 'Ships after full payment')
  return item.status === 'refunded' ? l('已关闭', 'Closed') : l('付款后发货', 'Ships after payment')
}
function add() {
  if (!canCreate.value) return
  if (entity.value === 'routes') return uni.navigateTo({ url: '/pages/process/index?scenario=route' })
  const suffix = entity.value === 'projects' ? '&step=device' : entity.value === 'dealers' ? '&type=dealer' : ''
  uni.navigateTo({ url: `/pages/manage/form?entity=${entity.value}${suffix}` })
}
async function open(item: Row) {
  if (state.value === 'price-search') return
  if (store.isDealer && businessDetailEntities.includes(entity.value) && state.value !== 'catalog') return uni.navigateTo({ url:`/pages/manage/list?entity=${entity.value}&state=record-detail&id=${encodeURIComponent(item.id)}` })
  if (entity.value === 'payments') return item.status === 'pending'
    ? uni.navigateTo({ url: `/pages/process/index?scenario=payment&paymentId=${item.id}` })
    : uni.navigateTo({ url: `/pages/manage/list?entity=payments&state=detail&id=${item.id}` })
  if (entity.value === 'shipments') return uni.navigateTo({ url: `/pages/process/index?scenario=logistics&shipmentId=${item.id}` })
  if (entity.value === 'materials' && ['shipping', 'received'].includes(String(item.status))) {
    const shipment = store.db?.shipments.find((entry) => entry.materialRequestId === item.id)
    return uni.navigateTo({ url: `/pages/process/index?scenario=logistics&shipmentId=${shipment?.id || ''}` })
  }
  if (entity.value === 'messages' && !item.read) {
    await store.update<Message>('messages', item.id, { read: true }); await load(); return
  }
  if (entity.value === 'tickets') return uni.navigateTo({ url: `/pages/manage/list?entity=tickets&state=${item.category === 'message' ? 'message-detail' : 'timeline'}&id=${item.id}` })
  if (entity.value === 'projects') return uni.navigateTo({ url: `/pages/manage/form?entity=projects&id=${item.id}&mode=detail` })
  if (entity.value === 'dealers') return uni.navigateTo({ url: `/pages/manage/form?entity=dealers&id=${item.id}&mode=detail` })
  if (entity.value === 'employees') return uni.navigateTo({ url: `/pages/manage/form?entity=employees&id=${item.id}&mode=permissions` })
  if (['materials', 'transfers', 'purchases', 'shipments'].includes(entity.value)) return
  if (entity.value === 'routes') return uni.navigateTo({ url: `/pages/process/index?scenario=route&routeId=${item.id}` })
  if (config.value.fields.length) uni.navigateTo({ url: `/pages/manage/form?entity=${entity.value}&id=${item.id}` })
}
function primaryAction(item: Row): { label: string; action?: WorkflowAction } | null {
  if (entity.value === 'employees') return { label: item.status === 'enabled' ? l('停用','Disable') : l('启用','Enable') }
  if (entity.value === 'purchases' && item.status === 'pendingApproval' && store.hasCapability('material.approve')) return { label: l('销售确认','Sales confirm'), action: 'approve' }
  if (entity.value === 'purchases' && item.status === 'salesConfirmed' && store.hasCapability('material.approve')) return { label: l('研发确认','R&D confirm'), action: 'confirmRd' }
  if (entity.value === 'purchases' && item.status === 'rdConfirmed' && store.hasCapability('material.approve')) return { label: l('导入生产','Start production'), action: 'startProduction' }
  if (entity.value === 'purchases' && item.status === 'production' && store.hasCapability('material.approve')) return { label: l('完成生产','Finish production'), action: 'finishProduction' }
  if (entity.value === 'purchases' && ['approved', 'pendingPayment', 'partiallyPaid'].includes(String(item.status))) return { label: item.status === 'partiallyPaid' ? l('继续分次付款','Continue installment') : l('开始付款','Start payment') }
  if (entity.value === 'purchases' && item.status === 'paid') return { label: l('查看物流','Track shipment') }
  if (entity.value === 'payments') return item.status === 'pending' ? { label: l('去支付','Pay now') } : null
  if (entity.value === 'materials') {
    if (item.status === 'pending' && store.hasCapability('material.approve')) return { label: l('审批通过','Approve'), action: 'approve' }
    if (item.status === 'approved' && store.hasCapability('material.approve')) return { label: l('确认发货','Ship'), action: 'ship' }
    if (item.status === 'shipping' && (store.hasCapability('material.apply') || store.hasCapability('material.approve'))) return { label: l('确认签收','Confirm receipt'), action: 'receive' }
    return null
  }
  if (entity.value === 'tickets' && item.category === 'transfer') {
    const transfer = serviceTransferFor(item)
    if (transfer?.status === 'pendingOrigin' && store.account?.dealerId === transfer.originDealerId) return { label: l('原经销商确认','Origin dealer confirms'), action: 'confirmOrigin' }
    if (transfer?.status === 'pendingTarget' && store.account?.dealerId === transfer.targetDealerId) return { label: l('目标经销商接收','Target dealer accepts'), action: 'acceptTarget' }
    if (transfer?.status === 'platformReview') return null
    return null
  }
  if (entity.value === 'tickets') return store.hasCapability('support.manage') ? item.status === 'submitted' ? { label: l('受理工单','Accept ticket'), action: 'accept' } : item.status === 'processing' ? { label: l('标记完成','Mark complete'), action: 'complete' } : item.status === 'parts' ? { label: l('完成维修','Complete repair'), action: 'complete' } : null : null
  if (entity.value === 'transfers') return null
  if (entity.value === 'shipments' && item.status === 'shipping') return { label: l('确认签收','Confirm receipt'), action: 'receive' }
  return null
}
function serviceTransferFor(item: Row) { return store.db?.serviceTransfers.find((entry) => entry.ticketId === item.id) }
function transferProgress(status?: string) { return ({ pendingOrigin: 0, pendingTarget: 1, platformReview: 2, completed: 4, rejected: -1 } as Record<string, number>)[status || ''] ?? 0 }
function canReject(item: Row) {
  if (waitsForPlatform(item)) return false
  if (entity.value === 'transfers' && !store.hasCapability('device.assign')) return false
  if (entity.value === 'materials' && !store.hasCapability('material.approve')) return false
  if (entity.value === 'tickets' && !store.hasCapability('support.manage')) return false
  if (entity.value === 'tickets' && item.category === 'transfer') return Boolean(serviceTransferFor(item) && !['platformReview', 'completed', 'rejected'].includes(serviceTransferFor(item)!.status))
  if (entity.value === 'purchases') return store.hasCapability('material.approve') && ['pendingApproval','salesConfirmed','rdConfirmed','production'].includes(String(item.status))
  return ['tickets', 'materials', 'purchases', 'transfers'].includes(entity.value) && ['submitted', 'processing', 'pending', 'pendingApproval', 'approved'].includes(String(item.status))
}
function contactService() {
  const number = String(detailItem.value?.contact || detailItem.value?.phone || '').replace(/[^\d+]/g, '')
  if (number.length >= 7) return uni.makePhoneCall({ phoneNumber:number })
  uni.showToast({ title:l('暂无可用联系电话','No phone number available'), icon:'none' })
}
function resetFilters() {
  activeStatus.value = 'all'
  sortNewest.value = true
  scopeCurrent.value = !((entity.value === 'projects' && store.account?.role === 'dealerAdmin')
    || (entity.value === 'materials' && store.hasCapability('material.approve'))
    || (entity.value === 'tickets' && Boolean(originDeviceId.value)))
  projectDealerFilter.value = 'all'
  projectStatusFilter.value = 'all'
  projectDateFrom.value = ''
  projectDateTo.value = ''
}
function changeProjectDealer(event: any) {
  projectDealerFilter.value = projectDealerOptions.value[Number(event.detail.value)]?.id || 'all'
}
function changeProjectStatus(event: any) {
  projectStatusFilter.value = projectStatusOptions.value[Number(event.detail.value)]?.id || 'all'
}
function changePurchaseQuantity(item: Row, delta: number) {
  const current = Number(purchaseQuantities.value[item.id] || 0)
  const quantity = Math.min(Number(item.stock || 0), Math.max(0, current + delta))
  purchaseQuantities.value = { ...purchaseQuantities.value, [item.id]: quantity }
}
function repeatPurchase(item: Row) {
  const next = { ...purchaseQuantities.value }
  for (const line of item.items || []) {
    const catalog = purchaseCatalogItems.value.find((entry) => entry.id === line.catalogId)
    if (catalog?.stock) next[line.catalogId] = Math.min(Number(line.quantity || 1), Number(catalog.stock))
  }
  purchaseQuantities.value = next
  uni.showToast({ title: l('已加入最近采购商品', 'Recent items added'), icon: 'success' })
}
async function submitPurchaseCart() {
  if (purchaseSaving.value) return
  const selected = Object.entries(purchaseQuantities.value).filter(([, quantity]) => Number(quantity) > 0).map(([catalogId, quantity]) => ({ catalogId, quantity: Number(quantity) }))
  if (!selected.length) return uni.showToast({ title: l('请先选择采购数量', 'Select at least one item'), icon: 'none' })
  purchaseSaving.value = true
  try {
    const dealer = store.db?.dealers.find((item) => item.id === store.account?.dealerId)
    await workflowService.createPurchaseWithPayment({
      orderNo: `PO${Date.now()}`,
      title: `${selected.length} 种设备/配件采购`,
      titleEn: `${selected.length} equipment/part items`,
      address: dealer ? `${dealer.region} · ${dealer.name}` : undefined,
      items: selected,
    }, store.context, store.db?.settings.region === 'GLOBAL' ? 'USD' : 'CNY')
    purchaseQuantities.value = {}
    purchaseCartOpen.value = false
    store.refresh()
    uni.showToast({ title: l('采购单已提交审批', 'Purchase submitted for approval'), icon: 'success' })
    setTimeout(() => uni.redirectTo({ url: '/pages/manage/list?entity=purchases' }), 300)
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    uni.showToast({ title: code === 'PURCHASE_INVALID' ? l('数量超出库存或商品已失效', 'Invalid quantity or unavailable product') : l('采购单创建失败', 'Could not create purchase'), icon: 'none' })
  } finally { purchaseSaving.value = false }
}
async function handleRight() {
  if (store.designCaseId === 'B03') return uni.redirectTo({ url: '/pages/manage/list?entity=projects&state=search' })
  if (state.value === 'timeline') return contactService()
  if (entity.value === 'payments' && state.value !== 'detail') { showAdvancedFilter.value = !showAdvancedFilter.value; return }
  if (state.value === 'catalog') return submitPurchaseCart()
  if (mode.value === 'hub') return uni.navigateTo({ url: '/pages/manage/form?entity=tickets&category=message' })
  if (entity.value === 'messages' && ['dealer', 'user'].includes(mode.value)) {
    await Promise.all(visibleItems.value.filter((item) => !item.read).map((item) => store.update<Message>('messages', item.id, { read: true })))
    await load()
    return
  }
  add()
}
function openSupplement() {
  supplementText.value = ''
  showSupplement.value = true
}
async function saveSupplement() {
  const note = supplementText.value.trim()
  if (!detailItem.value || !note) return uni.showToast({ title: l('请填写补充说明', 'Enter a note'), icon: 'none' })
  supplementSaving.value = true
  try {
    const now = new Date().toISOString()
    await store.update<Row>('tickets', detailItem.value.id, {
      history: [...(Array.isArray(detailItem.value.history) ? detailItem.value.history : []), {
        id: `history-note-${Date.now()}`,
        status: String(detailItem.value.status || 'submitted'),
        label: l('用户补充说明', 'User add note'),
        at: now,
        operator: store.account?.displayName || l('当前用户', 'Current user'),
        note,
      }],
      updatedAt: now,
    })
    await load()
    showSupplement.value = false
    uni.showToast({ title: l('补充说明已保存', 'Note saved'), icon: 'success' })
  } catch {
    uni.showToast({ title: l('保存失败，请检查数据权限', 'Save failed. Check data access.'), icon: 'none' })
  } finally { supplementSaving.value = false }
}
function selectTransferOption(key: string) {
  if (key === 'target:dealer') selectTransferDealer()
  else if (key === 'target:headquarters') selectTransferHeadquarters()
  else if (key.startsWith('dealer:')) {
    transferTarget.value = 'dealer'
    transferDealerId.value = key.slice('dealer:'.length)
  }
  transferPicker.value = null
}
async function requestPrimary(item: Row) {
  if (entity.value === 'employees') { await dealerService.setEmployeeStatus(item.id, item.status === 'enabled' ? 'disabled' : 'enabled', store.context); store.refresh(); return load() }
  if (entity.value === 'purchases' && ['approved', 'pendingPayment', 'partiallyPaid'].includes(String(item.status))) {
    const payment = store.db?.payments.find((entry) => entry.orderNo === item.orderNo && entry.status === 'pending')
    if (!payment) return uni.showToast({ title: l('付款单生成中，请稍后刷新', 'Payment record is being prepared'), icon: 'none' })
    return uni.navigateTo({ url: '/pages/process/index?scenario=payment&paymentId=' + payment.id })
  }
  if (entity.value === 'purchases' && item.status === 'paid') {
    const shipment = store.db?.shipments.find((entry) => entry.orderNo === item.orderNo)
    if (!shipment) return uni.showToast({ title: l('仓库正在生成发货任务', 'The warehouse is preparing shipment'), icon: 'none' })
    return uni.navigateTo({ url: '/pages/process/index?scenario=logistics&shipmentId=' + shipment.id })
  }
  if (entity.value === 'payments' && item.status === 'pending') return uni.navigateTo({ url: `/pages/process/index?scenario=payment&paymentId=${item.id}` })
  const primary = primaryAction(item)
  const action = primary?.action
  const transfer = item.category === 'transfer' ? serviceTransferFor(item) : undefined
  if (action) transitionTarget.value = { item, action, workflowEntity: transfer ? 'serviceTransfers' : undefined, workflowId: transfer?.id }
}
async function submitMessageTransfer() {
  if (!detailItem.value || !transferReason.value.trim() || (transferTarget.value === 'dealer' && !transferDealerId.value)) return uni.showToast({ title: l('请选择转单对象并填写原因','Choose a destination and enter a reason'), icon: 'none' })
  transferSaving.value = true
  try {
    await store.escalateMessage(detailItem.value.id, transferTarget.value, transferTarget.value === 'dealer' ? transferDealerId.value : undefined, transferReason.value.trim())
    uni.redirectTo({ url: `/pages/manage/list?entity=tickets&state=message-progress&id=${detailItem.value.id}` })
  } catch { uni.showToast({ title: l('转单失败，请检查数据权限','Transfer failed. Check data access.'), icon: 'none' }) }
  finally { transferSaving.value = false }
}
async function actOnMessageTransfer(action: 'accept' | 'reject' | 'complete') {
  if (!detailMessageTransfer.value) return
  try {
    await store.transitionMessageTransfer(detailMessageTransfer.value.id, action)
    await load()
    uni.showToast({ title: action === 'accept' ? l('转单已接收','Transfer accepted') : action === 'reject' ? l('转单已拒绝','Transfer rejected') : l('处理已完成','Completed'), icon: 'success' })
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    uni.showToast({ title: code === 'WRONG_WORKFLOW_ACTOR' ? l('仅接收方可以操作','Only the destination can act') : code === 'PLATFORM_ACTION_REQUIRED' ? l('总部转单需由后台接收','Headquarters must accept this transfer in the platform') : l('当前状态不能执行该操作','The action is not allowed in this state'), icon: 'none' })
  }
}
function selectTransferDealer() {
  transferTarget.value = 'dealer'
  transferDealerId.value = store.db?.dealers.find((item) => item.id === 'dealer-02')?.id
    || store.db?.dealers.find((item) => item.id !== store.account?.dealerId && item.status === 'enabled')?.id
    || ''
}
function selectTransferHeadquarters() {
  transferTarget.value = 'headquarters'
  transferDealerId.value = ''
}
async function confirmTransition() {
  if (!transitionTarget.value) return
  try {
    await store.transition(transitionTarget.value.workflowEntity || entity.value as WorkflowEntity, transitionTarget.value.workflowId || transitionTarget.value.item.id, transitionTarget.value.action)
    uni.showToast({ title: l('状态已更新', 'Status updated'), icon: 'success' })
    transitionTarget.value = null
    await load()
  } catch (cause) {
    transitionTarget.value = null
    const code = cause instanceof Error ? cause.message : ''
    uni.showToast({ title: code === 'FORBIDDEN'
      ? l('当前账号无操作权限', 'This account cannot perform the action')
      : code === 'REPLACEMENT_NOT_RECEIVED'
        ? l('更换物料尚未签收，不能完成维修', 'The replacement part must be received before completion')
        : l('当前状态不能执行该操作', 'The action is not allowed in the current state'), icon: 'none' })
  }
}
function reject(item: Row) {
  const transfer = item.category === 'transfer' ? serviceTransferFor(item) : undefined
  transitionTarget.value = { item, action: 'reject', workflowEntity: transfer ? 'serviceTransfers' : undefined, workflowId: transfer?.id }
}
async function uploadWaypoint(item: Row) {
  try {
    const result = await routeService.syncWaypoint(item.id, store.context)
    store.refresh(); await load()
    uni.showToast({ title: result.syncStatus === 'synced' ? l('航点已同步', 'Waypoint synced') : l('上传失败，请重试', 'Upload failed. Try again'), icon: result.syncStatus === 'synced' ? 'success' : 'none' })
  } catch {
    uni.showToast({ title: l('状态更新失败，请重试', 'Update failed. Try again'), icon: 'none' })
  }
}
async function uploadRoute(item: Row) {
  try {
    const result = await routeService.uploadRoute(item.id, store.context)
    store.refresh(); await load()
    uni.showToast({ title: result.syncStatus === 'synced' ? l('航迹已上传', 'Track uploaded') : l('上传失败，请重试', 'Upload failed. Try again'), icon: result.syncStatus === 'synced' ? 'success' : 'none' })
  } catch {
    uni.showToast({ title: l('航迹上传失败，请重试', 'Track upload failed. Try again'), icon: 'none' })
  }
}
async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    if (entity.value === 'waypoints') await routeService.deleteWaypoint(deleteTarget.value.id, store.context)
    else await store.remove(entity.value, deleteTarget.value.id)
    deleteTarget.value = null
    await load()
    uni.showToast({ title: l('已删除', 'Deleted'), icon: 'success' })
  } catch (cause) {
    deleteTarget.value = null
    uni.showToast({ title: cause instanceof Error && cause.message === 'WAYPOINT_IN_ROUTE' ? l('该航点正在被航迹使用，请先调整航迹', 'This waypoint is used by a track. Update the track first.') : l('删除失败', 'Delete failed'), icon: 'none' })
  }
}
</script>

<template>
  <view class="page entity-page" :class="{ 'dealer-workspace': store.isDealer }" :data-business="entity">
    <SsAppBar :title="store.designCaseId === 'B03' ? l('查询结果','Search result') : state.startsWith('faq-') ? l('问题解答','Help article') : entity === 'payments' && state === 'detail' ? l('支付详情','Payment details') : mode === 'hub' ? l('售后与清单','Service & records') : state === 'search' || state === 'result' ? l('项目查询','Project search') : state === 'timeline' && store.designCaseId === 'S05' ? l('服务单详情','Service request') : state === 'timeline' ? l('处理进度','Progress') : state === 'message-detail' ? l('留言详情','Message Details') : state === 'transfer-selector' ? l('升级转单','Escalate') : state === 'message-progress' ? l('转单进度','Transfer Progress') : state === 'price-search' ? l('采购价查询','Purchase Price Search') : state === 'catalog' ? l('采购','Purchasing') : state === 'success' ? l('提交成功','Submitted') : state === 'unassigned' ? l('未分配设备','Unassigned devices') : title" :fallback-url="fallbackUrl" :right-icon="state === 'timeline' ? 'phone' : entity === 'payments' && state !== 'detail' ? 'list-filter' : mode === 'hub' ? 'message-circle' : entity !== 'materials' && visibleItems.length && !state.startsWith('faq-') && canCreate && !['todo','approval','success','unassigned','message-detail','transfer-selector','message-progress','price-search','catalog'].includes(state) ? 'plus' : state === 'catalog' ? 'shopping-cart' : ''" :right-text="store.designCaseId === 'B03' ? l('重新查询','Search again') : entity === 'messages' && ['dealer','user'].includes(mode) ? l('全部已读','Read all') : state === 'catalog' && purchaseCartCount ? String(purchaseCartCount) : ''" @right="handleRight" />

    <scroll-view v-if="store.designCaseId === 'B03'" scroll-y class="entity-scroll project-result-scroll"><view class="card project-result-summary"><view class="section-head"><view><strong>{{ l('海风号','Sea Wind') }}</strong><text>{{ l('安装项目 · XM202603180028','Installation · XM202603180028') }}</text></view><SsStatus status="online" :label="l('质保中','In warranty')" /></view><view class="project-result-grid"><view><text>{{ l('设备','Device') }}</text><strong>{{ l('顶流机 DL-3000','Surface jet DL-3000') }}</strong></view><view><text>{{ l('设备 SN','Device SN') }}</text><strong>DL300020240101</strong></view><view><text>{{ l('船东','Owner') }}</text><strong>{{ l('陈先生','Mr. Chen') }}</strong></view><view><text>{{ l('使用地区','Region') }}</text><strong>{{ l('福建省厦门市','Xiamen, Fujian') }}</strong></view><view><text>{{ l('安装日期','Installed') }}</text><strong>2026-03-18</strong></view><view><text>{{ l('质保到期','Warranty') }}</text><strong>2028-03-17</strong></view></view></view><text class="project-record-label">{{ l('关联记录','Related records') }}</text><view class="list-card project-result-records"><view v-for="item in [{icon:'wrench',tone:'warning',skin:'warning',title:l('售后记录','Service records'),copy:l('2 条 · 最近 2026-07-12','2 · latest 2026-07-12')},{icon:'package',tone:'success',skin:'success',title:l('更换物料','Replacement parts'),copy:l('水下电机组件 ×1','Underwater motor kit ×1')},{icon:'credit-card',tone:'brand',skin:'',title:l('收费记录','Payment records'),copy:l('已收款 ¥680.00','Paid ¥680.00')}]" :key="item.title" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view><view class="button-row project-result-actions"><button class="btn"><SsIcon name="plus" :size="18" tone="brand" />{{ l('新建售后记录','New service record') }}</button><button class="btn primary"><SsIcon name="arrow-right" :size="18" tone="inverse" />{{ l('查看完整项目','View full project') }}</button></view></scroll-view>

    <scroll-view v-else-if="state === 'todo'" scroll-y class="entity-scroll todo-center-scroll">
      <view class="todo-center-summary"><view><text>{{ l('当前待处理','Pending now') }}</text><strong>{{ todoCenterCount }}</strong></view><span>{{ l('按业务类型汇总，进入后查看具体任务','Grouped by business type') }}</span></view>
      <view v-if="todoCenterRows.length" class="todo-center-list"><button v-for="row in todoCenterRows" :key="row.key" class="todo-center-row" @click="openTodo(row)"><view class="todo-center-icon" :class="row.tone"><SsIcon :name="row.icon" :size="22" tone="default" /></view><view><strong>{{ row.title }}</strong><text>{{ row.status }}</text></view><b>{{ row.count }}</b><SsIcon name="chevron-right" :size="17" tone="muted" /></button></view>
      <SsEmpty v-else :title="l('暂无待办','No pending tasks')" :description="l('当前没有需要处理的业务。','There are no tasks requiring action.')" icon="circle-check" />
    </scroll-view>
    <scroll-view v-else-if="state === 'approval'" scroll-y class="entity-scroll approval-center-scroll">
      <view class="approval-overview"><view><text>{{ l('待审批总数','Pending approvals') }}</text><strong>{{ approvalRows.length }}</strong></view><view><text>{{ l('物料申请','Parts requests') }}</text><strong>{{ approvalRows.filter(item => item.entity === 'materials').length }}</strong></view><view><text>{{ l('采购审批','Purchases') }}</text><strong>{{ approvalRows.filter(item => item.entity === 'purchases').length }}</strong></view></view>
      <view class="approval-note"><SsIcon name="clipboard-check" :size="20" tone="warning" /><view><strong>{{ l('统一审批队列','Unified approval queue') }}</strong><text>{{ l('所有流转到当前账号的物料和采购申请都在这里处理。','All parts and purchase requests assigned to this account appear here.') }}</text></view></view>
      <view v-if="approvalRows.length" class="approval-list"><button v-for="row in approvalRows" :key="row.key" class="approval-row" @click="openApproval(row)"><span><SsIcon :name="row.icon" :size="21" tone="brand" /></span><view><text>{{ row.kind }}</text><strong>{{ row.title }}</strong><small>{{ (row.record as Row).orderNo || row.record.id }} · {{ businessDate(row.record.updatedAt) }}</small></view><SsStatus status="pending" :label="l('待审批','Pending')" /><SsIcon name="chevron-right" :size="16" tone="muted" /></button></view>
      <SsEmpty v-else :title="l('暂无待审批事项','No pending approvals')" :description="l('新的物料或采购申请会自动进入这里。','New parts and purchase requests will appear here automatically.')" icon="clipboard-check" />
    </scroll-view>

    <scroll-view v-else-if="mode === 'hub'" scroll-y class="entity-scroll hub-scroll design-support-hub">
      <view class="support-search"><SsIcon name="search" :size="18" tone="muted" /><input v-model="supportSearch" :placeholder="l('搜索常见问题','Search FAQs')" /><button v-if="supportSearch" aria-label="clear" @click="supportSearch = ''"><SsIcon name="x" :size="17" tone="muted" /></button></view><view class="support-operations"><button v-for="item in [{icon:'wrench',tone:'warning',skin:'orange',label:l('故障报修','Request repair'),url:'/pages/manage/form?entity=tickets&category=repair'},{icon:'message-square-warning',tone:'danger',skin:'danger',label:l('提交投诉','Submit complaint'),url:'/pages/manage/form?entity=tickets&category=complaint'},{icon:'messages-square',tone:'brand',skin:'',label:l('客服留言','Contact support'),url:'/pages/manage/form?entity=tickets&category=message'},{icon:'refresh-ccw-dot',tone:'accent',skin:'purple',label:l('跨区转移','Cross-region transfer'),url:'/pages/manage/form?entity=tickets&category=transfer'}]" :key="item.label" @click="uni.navigateTo({url:item.url})"><i :class="item.skin"><SsIcon :name="item.icon" :size="21" :tone="item.tone as any" /></i><text>{{ item.label }}</text></button></view>
      <view class="section"><view class="section-head"><text class="section-title">{{ l('处理中','In progress') }}</text><text class="section-meta">{{ activeSupportTickets.length }} {{ l('项','items') }}</text></view><view v-if="activeSupportTickets.length" class="list-card support-progress"><view v-for="ticket in activeSupportTickets" :key="ticket.id" class="list-row" data-support-action="ticket-progress" @click="uni.navigateTo({url:`/pages/manage/list?entity=tickets&state=timeline&id=${ticket.id}`})"><view class="row-icon warning"><SsIcon name="wrench" :size="21" tone="warning" /></view><view class="list-copy"><strong>{{ ticket.title }}</strong><text>{{ l('服务单','Ticket') }} {{ ticket.id }}</text></view><SsStatus :status="ticket.status" :label="statusLabel(ticket.status)"/><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view><SsEmpty v-else :title="l('暂无处理中服务单','No active service requests')" icon="circle-check" /></view>
      <view class="section"><view class="section-head"><text class="section-title">{{ l('常见问题','FAQs') }}</text></view><view v-if="filteredSupportFaqs.length" class="list-card support-faq"><view v-for="item in filteredSupportFaqs" :key="item.key" class="list-row" :data-faq="item.key" @click="uni.navigateTo({url:`/pages/document/pdf?id=${encodeURIComponent(item.id)}`})"><view class="row-icon"><SsIcon :name="item.icon" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.summary }}</text></view><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view><SsEmpty v-else :title="l('未找到相关问题','No matching questions')" :description="l('换一个关键词，或直接联系售后。','Try another keyword or contact support.')" icon="messages-square" /></view>
    </scroll-view>

    <scroll-view v-else-if="state === 'success'" scroll-y class="entity-scroll"><view class="success-page"><view class="success-mark"><SsIcon name="check-circle-2" :size="52" tone="default" /></view><text>{{ l('服务申请已提交','Service request submitted') }}</text><span>{{ detailItem ? l(`工单 ${detailItem.id} 已写入本机，并进入经销商待受理列表。`,`Ticket ${detailItem.id} is stored on this device and is awaiting dealer acceptance.`) : l('未找到刚提交的工单，请返回工单列表核对。','The submitted ticket was not found. Return to the ticket list to verify it.') }}</span><view class="card success-next"><view><text>{{ l('当前状态','Current status') }}</text><strong>{{ detailItem?.status === 'submitted' ? l('等待受理','Awaiting acceptance') : detailItem?.status || '--' }}</strong></view><view><text>{{ l('通知记录','Notification record') }}</text><strong>{{ l('本机消息','Local message') }}</strong></view></view><button class="btn primary" @click="uni.redirectTo({ url: '/pages/manage/list?entity=tickets' })">{{ l('查看处理进度','View progress') }}</button></view></scroll-view>

    <scroll-view v-else-if="state === 'timeline' && detailItem" scroll-y class="entity-scroll service-detail-scroll">
      <view class="card service-detail-head"><view><strong>{{ serviceHeading }}</strong><text>{{ ({ repair:l('故障报修','Repair'), complaint:l('投诉','Complaint'), message:l('客服留言','Message'), transfer:l('跨区售后','Regional service') })[detailItem.category as 'repair' | 'complaint' | 'message' | 'transfer'] }} · {{ serviceDevice }}</text></view><SsStatus :status="detailItem.status" :label="statusLabel(detailItem.status)" /></view>
      <view class="card service-design-timeline"><view v-for="entry in serviceTimelineEntries" :key="entry.title" class="service-design-step" :class="entry.state"><i/><view><strong>{{ entry.title }}</strong><text>{{ entry.copy }}</text><span v-if="entry.time">{{ entry.time }}</span></view></view></view>
      <view v-if="detailItem.chargeLines?.length" class="card service-billing"><view class="section-head"><text class="card-title">{{ l('费用明细','Billing details') }}</text><strong>¥{{ Number(detailItem.serviceCharge || 0).toFixed(2) }}</strong></view><view v-for="line in detailItem.chargeLines" :key="line.id" class="billing-line"><view><strong>{{ line.label }}</strong><text v-if="line.quantity">{{ line.quantity }} × ¥{{ Number(line.unitPrice || 0).toFixed(2) }}</text></view><span>¥{{ Number(line.amount).toFixed(2) }}</span></view></view>
      <view v-if="detailItem.replacementCompletedAt" class="notice success service-contact"><SsIcon name="package-check" :size="19" tone="success" /><view><strong>{{ l('物料更换已完成','Part replacement completed') }}</strong><text>{{ l('新物料已关联项目，拆下物料待返还。','The replacement is linked to the project; the removed part is awaiting return.') }}</text></view></view>
      <view class="notice service-contact"><SsIcon name="phone" :size="19" tone="brand-strong" /><view><strong>{{ l('服务联系人','Service contact') }}</strong><text>{{ store.designCaseId === 'S05' ? l('厦门总代理 · 林工 · 138****0032','Xiamen general agent · Lin · 138****0032') : detailItem.contact || l('所属服务网点正在分配联系人','The service outlet is assigning a contact') }}</text></view></view>
      <view v-if="supplementNotes.length" class="card service-notes"><view class="section-head"><text class="card-title">{{ l('补充说明','Additional notes') }}</text><text class="caption">{{ supplementNotes.length }}</text></view><view v-for="entry in supplementNotes" :key="entry.id" class="service-note"><strong>{{ entry.operator }}</strong><text>{{ entry.note }}</text><span>{{ String(entry.at).slice(0,16).replace('T',' ') }}</span></view></view>
      <view v-if="serviceReplies.length" class="card service-notes"><view class="section-head"><text class="card-title">{{ l('处理回复','Service replies') }}</text><text class="caption">{{ serviceReplies.length }}</text></view><view v-for="entry in serviceReplies" :key="entry.id" class="service-note"><strong>{{ entry.operator }} · {{ localizedEntityText(entry.label, store.locale) }}</strong><text>{{ entry.note }}</text><span>{{ String(entry.at).slice(0,16).replace('T',' ') }}</span></view></view>
      <view class="button-row service-detail-actions"><button class="btn" data-action="add-note" @click="openSupplement"><SsIcon name="message-square-plus" :size="18" tone="default" />{{ l('补充说明','Add note') }}</button><button class="btn primary" @click="contactService"><SsIcon name="phone" :size="18" tone="inverse" />{{ l('联系代理商','Call dealer') }}</button></view>
      <view v-if="detailItem?.category === 'transfer'" class="section card transfer-steps"><text class="card-title">{{ l('跨区转移流程','Cross-region transfer') }}</text><view v-for="(item,index) in [l('原经销商确认','Origin dealer confirms'),l('目标经销商接收','Target dealer accepts'),l('平台复核','Platform review'),l('转移完成','Transfer complete')]" :key="item" :class="{ done:index < transferProgress(detailTransfer?.status) }"><span>{{ index + 1 }}</span><text>{{ item }}</text></view><view v-if="detailTransfer"><span><SsIcon name="arrow-right" :size="16" tone="default" /></span><text>{{ localizedEntityText(detailTransfer.reason, store.locale) }}</text></view></view>
    </scroll-view>

    <scroll-view v-else-if="state === 'message-detail'" scroll-y class="entity-scroll">
      <view v-if="detailItem" class="message-detail-card card"><view class="message-detail-head"><view class="icon-tile"><SsIcon name="message-square-text" :size="25" tone="default" /></view><view class="list-copy"><strong>{{ entityPrimary(detailItem, store.locale) }}</strong><text>{{ detailItem.id }} · {{ String(detailItem.updatedAt).slice(0,16).replace('T',' ') }}</text></view><SsStatus :status="detailItem.status" :label="statusLabel(detailItem.status)" /></view><view class="message-body">{{ detailItem.description }}</view><view class="message-fields"><view><text>{{ l('联系人','Contact') }}</text><strong>{{ detailItem.contact }}</strong></view><view><text>{{ l('关联设备','Device') }}</text><strong>{{ store.db?.devices.find(item=>item.id===detailItem.deviceId)?.name || l('未关联','Not linked') }}</strong></view><view><text>{{ l('当前归属','Assigned to') }}</text><strong>{{ detailItem.escalationStatus === 'pending' ? (store.db?.dealers.find(item=>item.id===detailItem.dealerId)?.name || l('原处理方','Current handler')) : detailItem.assignedLabel || store.db?.dealers.find(item=>item.id===detailItem.dealerId)?.name || l('待分配','Unassigned') }}</strong></view><view><text>{{ l('转单状态','Transfer') }}</text><strong>{{ detailItem.escalationStatus === 'pending' ? l('等待接收','Awaiting acceptance') : detailItem.escalationStatus === 'transferred' ? l('已转单','Transferred') : l('未转单','Not transferred') }}</strong></view></view></view>
      <view v-if="detailItem" class="section list-card"><view class="list-row" @click="uni.navigateTo({url:`/pages/manage/list?entity=tickets&state=timeline&id=${detailItem.id}`})"><view class="row-icon"><SsIcon name="history" :size="22" tone="default" /></view><view class="list-copy"><strong>{{ l('查看处理记录','View Activity') }}</strong><text>{{ l('受理、回复与状态变化','Acceptance, replies, and status changes') }}</text></view><SsIcon name="chevron-right" :size="18" tone="default" /></view><view class="list-row" @click="uni.navigateTo({url:`/pages/manage/list?entity=tickets&state=transfer-selector&id=${detailItem.id}`})"><view class="row-icon warning"><SsIcon name="forward" :size="22" tone="default" /></view><view class="list-copy"><strong>{{ l('升级或转单','Escalate or Transfer') }}</strong><text>{{ l('转给指定经销商或平台总部客服','Send to a dealer or headquarters support') }}</text></view><SsIcon name="chevron-right" :size="18" tone="default" /></view><view v-if="detailMessageTransfer" class="list-row" @click="uni.navigateTo({url:`/pages/manage/list?entity=tickets&state=message-progress&id=${detailItem.id}`})"><view class="row-icon success"><SsIcon name="clipboard-check" :size="22" tone="default" /></view><view class="list-copy"><strong>{{ l('查看转单进度','View Transfer Progress') }}</strong><text>{{ detailMessageTransfer.targetLabel }}</text></view><SsIcon name="chevron-right" :size="18" tone="default" /></view></view>
    </scroll-view>

    <scroll-view v-else-if="state === 'transfer-selector'" scroll-y class="entity-scroll transfer-design">
      <view class="notice warning"><SsIcon name="refresh-cw" :size="20" tone="warning-strong" /><view><strong>{{ l('升级说明','Escalation note') }}</strong><text>{{ l('转单后原处理方只保留历史记录，新的处理方将收到通知。','The original handler keeps history only. The new destination receives a notification.') }}</text></view></view>
      <view class="transfer-form card section">
        <view class="field"><text class="field-label">{{ l('转单对象','Destination type') }}</text><button class="field-control transfer-picker-control" data-picker="target" @click="transferPicker = 'target'"><SsIcon name="building-2" :size="19" tone="muted" /><text class="grow">{{ transferTarget === 'dealer' ? l('指定经销商','Specified dealer') : l('总部客服','Headquarters support') }}</text><SsIcon name="chevron-down" :size="17" tone="muted" /></button></view>
        <view class="field"><text class="field-label">{{ l('接收经销商','Receiving dealer') }}</text><button class="field-control transfer-picker-control" :disabled="transferTarget === 'headquarters'" data-picker="dealer" @click="transferPicker = 'dealer'"><SsIcon name="store" :size="19" tone="muted" /><text class="grow">{{ transferTarget === 'headquarters' ? l('无需选择','Not required') : transferDealerId ? (store.locale !== 'zh-Hans' ? store.db?.dealers.find(item=>item.id===transferDealerId)?.nameEn : store.db?.dealers.find(item=>item.id===transferDealerId)?.name) : l('请选择接收网点','Choose an outlet') }}</text><SsIcon name="chevron-down" :size="17" tone="muted" /></button></view>
        <view class="field"><text class="field-label">{{ l('转单原因','Transfer reason') }} <small>{{ transferReason.length }}/300</small></text><view class="field-control textarea"><textarea v-model="transferReason" maxlength="300" :placeholder="l('请说明升级或转单原因','Describe why this request should be transferred')" /></view></view>
      </view>
      <view class="section list-card transfer-choices"><view class="list-row" @click="selectTransferDealer"><view class="row-icon"><SsIcon name="store" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('指定经销商','Specified dealer') }}</strong><text>{{ l('从服务范围内选择接收网点','Choose an outlet in the service scope') }}</text></view><SsStatus v-if="transferTarget === 'dealer'" status="online" :label="l('已选择','Selected')"/><SsIcon name="chevron-right" :size="16" tone="muted" /></view><view class="list-row" @click="selectTransferHeadquarters"><view class="row-icon purple"><SsIcon name="headphones" :size="21" tone="accent" /></view><view class="list-copy"><strong>{{ l('总部客服','Headquarters support') }}</strong><text>{{ l('由平台总部统一协调处理','Coordinated by headquarters') }}</text></view><SsStatus v-if="transferTarget === 'headquarters'" status="online" :label="l('已选择','Selected')"/><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view>
      <button class="btn primary full-button" :disabled="transferSaving" @click="submitMessageTransfer"><SsIcon name="send" :size="18" tone="inverse" />{{ transferSaving ? l('正在转单','Transferring') : l('确认升级并转单','Confirm escalation') }}</button>
    </scroll-view>

    <scroll-view v-else-if="state === 'message-progress' && store.designCaseId === 'S11'" scroll-y class="entity-scroll transfer-progress-design">
      <view class="card transfer-progress-head"><view><strong>LY20260811004</strong><text>{{ l('厦门海创 → 泉州远航','Xiamen Haichuang → Quanzhou Voyage') }}</text></view><SsStatus status="online" :label="l('已转单','Transferred')" /></view>
      <view class="card transfer-progress-timeline"><view v-for="(entry,index) in [{title:l('用户发起升级','User requested escalation'),copy:l('原因：服务地点已变更','Reason: service location changed'),time:l('08月11日 10:06','Aug 11 10:06')},{title:l('归属已变更','Ownership changed'),copy:l('接收方：泉州远航服务网点','Destination: Quanzhou Voyage Service'),time:l('08月11日 10:07','Aug 11 10:07')},{title:l('通知发送成功','Notifications sent'),copy:l('用户、原经销商和接收方均已收到消息','User, origin dealer, and destination notified'),time:l('08月11日 10:07','Aug 11 10:07')},{title:l('接收方处理中','Destination processing'),copy:l('处理人：陈佳','Handler: Chen Jia'),time:l('当前状态','Current status')},{title:l('处理完成','Completed'),copy:l('结果将回写原留言并通知用户','Result will update the message and notify the user'),time:''}]" :key="entry.title" class="transfer-progress-step" :class="{ done:index < 3,current:index === 3 }"><i/><view><strong>{{ entry.title }}</strong><text>{{ entry.copy }}</text><span v-if="entry.time">{{ entry.time }}</span></view></view></view>
      <view class="transfer-progress-metrics"><view v-for="metric in [[l('原处理方','Origin'),'厦门海创'],[l('当前处理方','Current'),'泉州远航'],[l('处理人','Handler'),'陈佳'],[l('通知记录','Notifications'),l('3 条','3')]]" :key="metric[0]"><text>{{ metric[0] }}</text><strong>{{ metric[1] }}</strong></view></view>
      <button class="btn transfer-progress-contact"><SsIcon name="phone" :size="18" tone="brand" />{{ l('联系当前处理人','Contact current handler') }}</button>
    </scroll-view>

    <scroll-view v-else-if="state === 'message-progress'" scroll-y class="entity-scroll">
      <view v-if="detailMessageTransfer" class="card timeline-card"><view class="section-head"><view><text class="card-title">{{ l('留言转单','Message Transfer') }}</text><text class="caption">{{ detailMessageTransfer.id }} · {{ detailMessageTransfer.targetLabel }}</text></view><SsStatus :status="detailMessageTransfer.status" :label="({pending:l('待接收','Pending'),accepted:l('处理中','In progress'),completed:l('已完成','Completed'),rejected:l('已拒绝','Rejected')} as Record<string,string>)[detailMessageTransfer.status]" /></view><view class="transfer-summary"><text>{{ l('接收方','Destination') }}</text><strong>{{ detailMessageTransfer.targetLabel }}</strong><span>{{ detailMessageTransfer.reason }}</span></view><view class="timeline"><view v-for="(entry,index) in detailMessageTransfer.history" :key="entry.id" class="timeline-item" :class="{active:index===detailMessageTransfer.history.length-1}"><i/><view><strong>{{ localizedEntityText(entry.label,store.locale) }}</strong><text>{{ entry.operator }} · {{ String(entry.at).slice(0,16).replace('T',' ') }}</text><span v-if="entry.note">{{ entry.note }}</span></view></view></view><view v-if="canActOnMessageTransfer && detailMessageTransfer.status === 'pending'" class="button-row transfer-progress-actions"><button class="btn" @click="actOnMessageTransfer('reject')">{{ l('拒绝接收','Reject') }}</button><button class="btn primary" @click="actOnMessageTransfer('accept')">{{ l('确认接收','Accept') }}</button></view><button v-else-if="canActOnMessageTransfer && detailMessageTransfer.status === 'accepted'" class="btn primary full-button" @click="actOnMessageTransfer('complete')">{{ l('完成处理','Complete') }}</button><view v-else-if="detailMessageTransfer.target === 'headquarters' && ['pending','accepted'].includes(detailMessageTransfer.status)" class="backend-flow-panel"><view class="notice warning"><SsIcon name="info" :size="18" tone="warning" /><text>{{ detailMessageTransfer.status === 'pending' ? l('当前等待后台总部客服接收，APP 仅展示进度。','Waiting for headquarters support. The APP shows progress only.') : l('总部客服正在后台处理，结果会同步到此处。','Headquarters is processing this request in the administration system. The result will appear here.') }}</text></view></view></view>
    </scroll-view>

    <template v-else-if="entity === 'messages' && mode === 'user'">
      <view class="user-message-tabs segment"><view class="segment-item active">{{ l('全部','All') }}</view><view class="segment-item">{{ l('设备','Devices') }}</view><view class="segment-item">{{ l('售后','Service') }}</view><view class="segment-item">{{ l('系统','System') }}</view></view>
      <scroll-view scroll-y class="entity-scroll user-message-scroll"><view class="list-card user-message-list"><view v-for="item in [{icon:'triangle-alert',tone:'danger',skin:'danger',title:l('电池组-03 已离线','Battery bank-03 is offline'),copy:l('最后在线 07:32，请检查设备供电','Last online 07:32. Check device power'),side:l('2小时前','2h ago')},{icon:'package-check',tone:'success',skin:'success',title:l('售后物料已发货','Service parts shipped'),copy:l('顺丰速运 SF1482904820','SF Express SF1482904820'),side:l('昨天','Yesterday')},{icon:'download',tone:'brand',skin:'',title:l('顶流机有可用固件','Firmware available for surface jet'),copy:l('版本 V2.4.1，预计需要 8 分钟','V2.4.1 · about 8 minutes'),side:l('周六','Sat')},{icon:'shield-check',tone:'accent',skin:'purple',title:l('登录密码已更新','Sign-in password updated'),copy:l('如非本人操作，请立即联系客服','Contact support if this was not you'),side:l('8月2日','Aug 2')}]" :key="item.title" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><text class="row-value">{{ item.side }}</text><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view><view class="notice user-message-notice"><SsIcon name="info" :size="18" tone="brand-strong" /><view><strong>{{ l('通知保留 90 天','Notifications retained for 90 days') }}</strong><text>{{ l('重要设备告警和售后进度会同时保留在对应详情页。','Important alerts and service updates are also kept on their detail pages.') }}</text></view></view></scroll-view>
    </template>

    <template v-else-if="entity === 'messages' && mode === 'dealer'">
      <view class="dealer-message-tabs segment"><view class="segment-item active">{{ l('业务待办','Tasks') }}</view><view class="segment-item">{{ l('设备','Devices') }}</view><view class="segment-item">{{ l('售后','Service') }}</view><view class="segment-item">{{ l('系统','System') }}</view></view><scroll-view scroll-y class="entity-scroll dealer-message-scroll"><view class="list-card dealer-message-list"><view v-for="item in dealerMessageRows" :key="item.title" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><SsStatus v-if="item.side === l('待处理','Pending') || item.side === l('待审核','Review')" status="pending" :label="item.side"/><text v-else class="row-value">{{ item.side }}</text><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view><view class="notice dealer-message-notice"><SsIcon name="history" :size="19" tone="brand-strong" /><view><strong>{{ l('通知留痕','Notification history') }}</strong><text>{{ l('审批、分配、调货和权限变更会保留操作记录，无法手动删除。','Approvals, assignments, transfers, and permission changes keep immutable records.') }}</text></view></view></scroll-view>
    </template>

    <template v-else-if="store.designCaseId === 'B25'">
      <scroll-view scroll-y class="entity-scroll dealer-ticket-design">
        <view class="segment dealer-ticket-tabs"><view class="segment-item active">{{ l('全部','All') }}</view><view class="segment-item">{{ l('处理中','Processing') }}</view><view class="segment-item">{{ l('待配件','Parts') }}</view><view class="segment-item">{{ l('已完成','Completed') }}</view></view>
        <view class="dealer-ticket-search"><SsIcon name="search" :size="18" tone="muted" /><text>{{ l('服务单 / 项目 / 设备 SN / 船名','Ticket / project / device SN / vessel') }}</text><SsIcon name="list-filter" :size="18" tone="muted" /></view>
        <view class="dealer-ticket-stats"><view v-for="item in [{icon:'wrench',tone:'warning',skin:'warning',label:l('本月工单','This month'),value:'26',note:l('较上月 +4','+4 vs last month')},{icon:'clock-3',tone:'brand',skin:'',label:l('待处理','Pending'),value:'6',note:l('平均 1.8 天','Avg 1.8 days')},{icon:'package-search',tone:'accent',skin:'accent',label:l('待配件','Parts'),value:'3',note:l('需跟进','Follow up')},{icon:'triangle-alert',tone:'warning',skin:'warning',label:l('已超时','Overdue'),value:'2',note:l('立即处理','Act now')}]" :key="item.label" class="dealer-ticket-stat"><i :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></i><view><text>{{ item.label }}</text><strong>{{ item.value }}</strong><span>{{ item.note }}</span></view></view></view>
        <view class="dealer-ticket-list"><view v-for="item in [{title:l('BX20260810001 · 海风号','BX20260810001 · Sea Wind'),copy:l('顶流机 DL-3000 · 厦门总代理','Surface jet DL-3000 · Xiamen agency'),status:l('待配件','Parts'),statusKey:'pending',summary:l('水下电机轴承磨损，物料申请已审批，等待仓库发货。','Bearing wear; parts approved and awaiting shipment.'),meta:l('负责人 周工 · 2 小时前','Owner Zhou · 2h ago'),action:l('查看进度','View progress'),icon:'arrow-right'},{title:l('BX20260809018 · 蓝鲸号','BX20260809018 · Blue Whale'),copy:l('海水淡化器 SW-2500 · 海沧服务点','Desalinator SW-2500 · Haicang'),status:l('处理中','Processing'),statusKey:'online',summary:l('产水量下降，已预约今天 15:00 上门检测。','Output dropped; inspection booked for 15:00.'),meta:l('负责人 陈工 · 昨天','Owner Chen · Yesterday'),action:l('联系人员','Contact'),icon:'phone'},{title:l('BX20260807009 · 远洋号','BX20260807009 · Ocean'),copy:l('电池组 BT-6000 · 集美服务点','Battery BT-6000 · Jimei'),status:l('已完成','Completed'),statusKey:'online',summary:l('更换主保险组件，运行测试通过，客户已确认。','Fuse assembly replaced; test passed and confirmed.'),meta:l('完成于 08月09日 18:36','Completed Aug 9 18:36'),action:'',icon:''}]" :key="item.title" class="card dealer-ticket-card"><view class="dealer-ticket-head"><view><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><SsStatus :status="item.statusKey" :label="item.status" /></view><text class="dealer-ticket-summary">{{ item.summary }}</text><view class="dealer-ticket-footer"><text>{{ item.meta }}</text><button v-if="item.action" class="btn"><SsIcon :name="item.icon" :size="18" tone="brand" />{{ item.action }}</button></view></view></view>
      </scroll-view>
    </template>

    <scroll-view v-else-if="entity === 'payments' && state === 'detail' && detailItem" scroll-y class="entity-scroll payment-detail-scroll">
      <view class="card payment-detail-hero"><view class="payment-detail-icon"><SsIcon name="credit-card" :size="30" :tone="detailItem.status === 'paid' ? 'success' : 'brand'" /></view><SsStatus :status="detailItem.status" :label="statusLabel(detailItem.status)" /><text>{{ entityPrimary(detailItem, store.locale) }}</text><strong>{{ detailItem.currency === 'USD' ? '$' : '¥' }}{{ Number(detailItem.amount).toLocaleString() }}</strong><span>{{ paymentChildNo(detailItem) }}</span></view>
      <view v-if="paymentPurchaseFor(detailItem)" class="card payment-relation-card"><view><text>{{ l('采购母订单','Parent order') }}</text><strong>{{ detailItem.orderNo }}</strong></view><view><text>{{ l('本次支付子单','Payment order') }}</text><strong>{{ paymentChildNo(detailItem) }}</strong></view><span>{{ l(`第 ${detailItem.installmentNumber || 1} 笔付款`,`Installment ${detailItem.installmentNumber || 1}`) }}</span><view class="payment-relation-summary"><view><text>{{ l('订单总额','Order total') }}</text><strong>{{ businessMoney(paymentPurchaseFor(detailItem)?.amount,detailItem.currency) }}</strong></view><view><text>{{ l('此前已付','Paid before') }}</text><strong>{{ businessMoney(paymentPaidBefore(detailItem),detailItem.currency) }}</strong></view><view><text>{{ ['verified','paid'].includes(detailItem.status) ? l('核实后剩余','Remaining after review') : l('当前待付','Outstanding') }}</text><strong>{{ businessMoney(paymentRemaining(detailItem),detailItem.currency) }}</strong></view></view></view>
      <view class="card payment-detail-card"><text class="card-title">{{ l('付款核实信息','Payment review') }}</text><view class="payment-detail-row"><text>{{ l('付款方式','Payment method') }}</text><strong>{{ paymentMethodLabel(detailItem) }}</strong></view><view class="payment-detail-row"><text>{{ l('交易流水号','Transaction ID') }}</text><strong>{{ detailItem.transactionId || l('人工核实，无平台流水','Manual review, no platform ID') }}</strong></view><view class="payment-detail-row"><text>{{ l('付款凭证','Payment proof') }}</text><strong>{{ paymentReference(detailItem) }}</strong></view><view class="payment-detail-row"><text>{{ detailItem.status === 'verifying' ? l('提交时间','Submitted') : l('核实时间','Verified') }}</text><strong>{{ paymentTime(detailItem) }}</strong></view><view class="payment-detail-row"><text>{{ l('提交账号','Submitted by') }}</text><strong>{{ paymentAccount(detailItem) }}</strong></view><view class="payment-detail-row"><text>{{ l('币种','Currency') }}</text><strong>{{ detailItem.currency === 'USD' ? 'USD' : l('人民币 CNY','CNY') }}</strong></view></view>
      <view class="notice payment-related"><SsIcon name="shield-check" :size="20" tone="brand-strong" /><view><strong>{{ l('人工核实','Manual review') }}</strong><text>{{ l('固定收款二维码不会自动匹配订单或金额，当前状态以财务核实结果为准。','The fixed QR code does not match orders or amounts automatically. Finance review determines the status.') }}</text></view></view>
      <view class="button-row payment-detail-actions"><button class="btn" @click="uni.redirectTo({url:'/pages/manage/list?entity=payments'})">{{ l('返回记录','Back to records') }}</button><button v-if="detailItem.status === 'verifying'" class="btn primary" @click="uni.navigateTo({url:`/pages/process/index?scenario=payment&paymentId=${detailItem.id}`})"><SsIcon name="shield-check" :size="18" tone="inverse" />{{ l('查看核实进度','Review status') }}</button><button v-else class="btn primary" @click="uni.navigateTo({url:'/pages/manage/list?entity=tickets&mode=hub'})"><SsIcon name="messages-square" :size="18" tone="inverse" />{{ l('售后与清单','Service & records') }}</button></view>
    </scroll-view>

    <template v-else-if="state === 'record-detail'">
      <scroll-view scroll-y class="entity-scroll record-detail-scroll">
        <template v-if="store.isDealer && businessRecord && !forbidden">
          <view class="business-detail-heading"><view class="business-detail-symbol"><SsIcon :name="config.icon" :size="26" tone="default" /></view><SsStatus :status="businessRecord.status" :label="waitsForPlatform(businessRecord) ? l('待后台审核','Platform review') : statusLabel(businessRecord.status)" /><strong>{{ businessRecordTitle(businessRecord) }}</strong><text>{{ businessRecord.orderNo || businessRecord.id }}</text></view>
          <view v-if="entity === 'purchases'" class="business-detail-section purchase-detail-total"><text>{{ l('订单总额','Order total') }}</text><strong>{{ businessMoney(businessRecord.amount,purchaseCurrency(businessRecord)) }}</strong><view class="purchase-payment-progress"><span>{{ l('累计已付','Paid') }} {{ businessMoney(businessRecord.paidAmount || 0,purchaseCurrency(businessRecord)) }}</span><span>{{ l('剩余待付','Remaining') }} {{ businessMoney(businessRecord.remainingAmount ?? businessRecord.amount,purchaseCurrency(businessRecord)) }}</span><i><b :style="{width:`${Math.min(100, Number(businessRecord.paidAmount || 0) / Math.max(1, Number(businessRecord.amount || 0)) * 100)}%`}" /></i></view></view>
          <view v-if="waitsForPlatform(businessRecord)" class="business-detail-section platform-review-notice"><SsIcon name="clock-3" :size="22" tone="brand" /><view><strong>{{ l('等待后台审核','Awaiting platform review') }}</strong><text>{{ l('审核完成前设备归属不变。','Device ownership remains unchanged until review is complete.') }}</text></view></view>
          <view class="business-detail-section"><strong class="business-section-title">{{ l('业务信息','Record information') }}</strong><view class="business-detail-facts"><view v-for="field in businessFields(businessRecord)" :key="field.label"><text>{{ field.label }}</text><strong>{{ field.value }}</strong></view><view><text>{{ l('提交时间','Created') }}</text><strong>{{ businessDate(businessRecord.createdAt) }}</strong></view></view></view>
          <view v-if="businessRecord.items?.length" class="business-detail-section"><strong class="business-section-title">{{ entity === 'purchases' ? l('商品明细','Products') : l('物料明细','Items') }}</strong><view v-for="line in businessRecord.items" :key="line.id" class="business-line-item"><view><strong>{{ store.locale === 'zh-Hans' ? line.name : line.nameEn }}</strong><text>{{ line.itemType === 'device' ? l('设备','Equipment') : l('配件','Part') }} · {{ line.sku }} · × {{ line.quantity }}</text><text v-if="entity === 'purchases'">{{ l('单价','Unit price') }} {{ businessMoney(line.unitPrice,line.currency) }}</text></view><strong>{{ entity === 'purchases' ? businessMoney(line.amount,line.currency) : '× ' + line.quantity }}</strong></view></view>
          <view v-if="hasBusinessLogistics(businessRecord)" class="business-detail-section"><button class="business-related" @click="openBusinessLogistics(businessRecord)"><SsIcon name="truck" :size="22" tone="success" /><view><strong>{{ l('物流轨迹','Shipment tracking') }}</strong><text>{{ businessRecord.trackingNumber || l('查看配送与签收进度','Delivery and receipt history') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button></view>
          <view class="business-detail-section"><strong class="business-section-title">{{ l('流转记录','Activity') }}</strong><view class="business-history"><view v-for="(entry,index) in businessHistory" :key="entry.id" :class="{ latest:index === businessHistory.length - 1 }"><i /><view><strong>{{ localizedEntityText(entry.label || statusLabel(entry.status),store.locale) }}</strong><text v-if="entry.operator">{{ localizedEntityText(entry.operator,store.locale) }}</text><text v-if="entry.note">{{ localizedEntityText(entry.note,store.locale) }}</text><span>{{ businessDate(entry.at) }}</span></view></view></view></view>
        </template>
        <SsEmpty v-else :title="l('记录不可用','Record unavailable')" :description="l('记录不存在或不在当前账号权限范围内。','This record is missing or outside your account scope.')" icon="shield-alert" />
      </scroll-view>
      <view v-if="store.isDealer && businessRecord && !forbidden" class="business-detail-actions"><button v-if="canReject(businessRecord)" class="btn danger" @click="reject(businessRecord)">{{ l('驳回申请','Reject request') }}</button><button v-if="primaryAction(businessRecord)" class="btn primary" @click="requestPrimary(businessRecord)">{{ primaryAction(businessRecord)?.label }}</button><button v-if="!canReject(businessRecord) && !primaryAction(businessRecord)" class="btn" @click="uni.navigateBack({ fail:() => uni.redirectTo({url:fallbackUrl}) })">{{ l('返回列表','Back to records') }}</button></view>
    </template>

    <template v-else-if="entity === 'payments'">
      <scroll-view scroll-y class="entity-scroll payment-scroll" :class="{ 'payment-design':store.designCaseId === 'P08' }">
        <view class="segment payment-tabs"><view v-for="item in paymentTabs" :key="item[0]" class="segment-item" :class="{ active:activeStatus === item[0] }" @click="activeStatus = item[0]">{{ item[1] }}</view></view>
        <view v-if="showAdvancedFilter" class="payment-filter-card">
          <view class="payment-filter-head"><view><strong>{{ l('筛选条件','Filter options') }}</strong></view><button @click="resetFilters">{{ l('重置','Reset') }}</button></view>
          <button class="payment-filter-option" :class="{selected:sortNewest}" @click="sortNewest = !sortNewest"><span><SsIcon name="clock-3" :size="18" tone="brand" /></span><view><strong>{{ sortNewest ? l('最近更新优先','Newest first') : l('较早更新优先','Oldest first') }}</strong></view><SsIcon :name="sortNewest ? 'check' : 'clock-3'" :size="17" :tone="sortNewest ? 'success' : 'muted'" /></button>
          <button class="payment-filter-option" :class="{selected:scopeCurrent}" @click="scopeCurrent = !scopeCurrent"><span><SsIcon name="shield-check" :size="18" tone="brand" /></span><view><strong>{{ l('仅显示当前账号数据','Current account only') }}</strong><text>{{ scopeCurrent ? l('已启用账号范围筛选','Account scope filter is enabled') : l('显示当前权限内全部数据','Show all data within current permissions') }}</text></view><SsIcon :name="scopeCurrent ? 'check' : 'shield-check'" :size="17" :tone="scopeCurrent ? 'success' : 'muted'" /></button>
        </view>
        <view v-if="loading" class="loading-state"><SsIcon name="loader-circle" :size="28" tone="brand" /><text>{{ $t('common.loading') }}</text></view>
        <SsEmpty v-else-if="forbidden" :title="l('当前账号无权访问','Access denied')" :description="l('请联系管理员开通支付记录查看权限。','Contact an administrator to grant payment access.')" icon="shield-alert" />
        <view v-else-if="visibleItems.length" class="payment-list">
          <view v-for="item in visibleItems" :key="item.id" class="card payment-card" @click="open(item)">
            <view class="payment-card-head"><view><strong>{{ store.isDealer ? businessRecordTitle(item) : entityPrimary(item, store.locale) }}</strong><text>{{ paymentPurchaseFor(item) ? l(`第 ${item.installmentNumber || 1} 笔付款`,`Installment ${item.installmentNumber || 1}`) : l('独立支付单','Standalone payment') }}</text></view><SsStatus :status="item.status" :label="item.status === 'pending' ? l('待支付','Pending') : item.status === 'verifying' ? l('待财务核实','Finance review') : ['verified','paid'].includes(item.status) ? l('已核实','Verified') : statusLabel(item.status)" /></view>
            <view class="payment-order-links"><view><text>{{ paymentPurchaseFor(item) ? l('母订单','Parent') : l('业务订单','Order') }}</text><strong>{{ item.orderNo }}</strong></view><SsIcon name="arrow-right" :size="15" tone="muted" /><view><text>{{ l('支付子单','Payment') }}</text><strong>{{ paymentChildNo(item) }}</strong></view></view>
            <view v-if="paymentPurchaseFor(item)" class="payment-card-progress"><view><text>{{ l('本次付款','This payment') }}</text><strong>{{ businessMoney(item.amount,item.currency) }}</strong></view><view><text>{{ l('此前已付','Paid before') }}</text><strong>{{ businessMoney(paymentPaidBefore(item),item.currency) }}</strong></view><view><text>{{ ['verified','paid'].includes(item.status) ? l('核实后剩余','Remaining after review') : l('当前待付','Outstanding') }}</text><strong>{{ businessMoney(paymentRemaining(item),item.currency) }}</strong></view></view>
            <view class="payment-card-foot"><text>{{ item.status === 'pending' ? l('扫码付款后上传与本子单对应的凭证','Upload proof for this payment order') : paymentMethodLabel(item) + ' · ' + paymentTime(item) }}</text><strong v-if="!paymentPurchaseFor(item)">{{ item.currency === 'USD' ? '$' : '¥' }}{{ Number(item.amount).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) }}</strong></view>
            <view v-if="item.status === 'pending'" class="button-row payment-card-actions" @click.stop><button class="btn primary" @click="requestPrimary(item)"><SsIcon name="credit-card" :size="17" tone="inverse" />{{ l('核对并继续支付','Review and pay') }}</button></view>
          </view>
        </view>
        <SsEmpty v-else :title="l('暂无支付记录','No payment records')" :description="l('符合当前状态的支付记录会显示在这里。','Payments matching this status will appear here.')" icon="wallet-cards" />
        <view class="safe-bottom" />
      </scroll-view>
    </template>

    <template v-else>
      <view v-if="state === 'unassigned' && entity === 'devices'" class="unassigned-overview">
        <view><text>{{ l('当前未分配','Currently unassigned') }}</text><strong>{{ visibleItems.length }}</strong><span>{{ l('台设备','devices') }}</span></view>
        <view><text>{{ l('设备归属','Device owner') }}</text><strong>{{ store.db?.dealers.find(item => item.id === store.account?.dealerId)?.name || '--' }}</strong><span>{{ l('仅展示采购后未关联客户、项目或员工的设备','Purchased devices without a customer, project, or staff assignment') }}</span></view>
      </view>
      <view v-if="store.isDealer && !forbidden && !['catalog','price-search','search','result','unassigned'].includes(state)" class="business-summary"><view v-for="metric in businessSummary" :key="metric.label" :class="metric.tone"><text>{{ metric.label }}</text><strong>{{ metric.value }}</strong></view></view>
      <view v-if="entity === 'purchases'" class="purchase-view-tabs">
        <button :class="{ active: state === 'catalog' }" @click="switchPurchaseView('catalog')"><SsIcon name="shopping-cart" :size="18" :tone="store.isDealer ? 'brand' : state === 'catalog' ? 'inverse' : 'brand'" />{{ l('采购商品','Purchase') }}</button>
        <button :class="{ active: state !== 'catalog' }" @click="switchPurchaseView('records')"><SsIcon name="shopping-cart" :size="18" :tone="store.isDealer ? 'brand' : state !== 'catalog' ? 'inverse' : 'brand'" />{{ l('采购记录','Orders') }}<text>{{ purchaseRecordCount }}</text></button>
      </view>
      <view v-if="entity === 'purchases' && state === 'catalog'" class="purchase-purpose-grid">
        <button class="active"><span><SsIcon name="package-plus" :size="21" tone="brand" /></span><view><strong>{{ l('新品与新物料采购','New products and parts') }}</strong><text>{{ l('采购整机设备与常规配件','Equipment and standard parts') }}</text></view><SsIcon name="circle-check" :size="18" tone="success" /></button>
        <button @click="uni.navigateTo({url:'/pages/manage/form?entity=materials&source=serviceReplacement'})"><span class="service"><SsIcon name="wrench" :size="21" tone="warning" /></span><view><strong>{{ l('售后物料','Service parts') }}</strong><text>{{ l('按安装项目申请维修更换物料','Replacement parts by installation project') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button>
      </view>
      <view class="list-toolbar" :class="{ 'project-search-toolbar': entity === 'projects' && (state === 'search' || state === 'result') }"><view class="search-box"><SsIcon name="search" :size="20" tone="default" /><input v-model="search" :placeholder="state === 'search' || state === 'result' ? l('输入船名 / SN / 客户姓名','Vessel / SN / customer') : state === 'price-search' ? l('输入物料名称 / SKU','Part name / SKU') : entity === 'materials' ? l('申请单、物料、项目或设备 SN','Request, part, project, or device SN') : entity === 'devices' ? l('设备类型 / 型号 / SN','Device type / model / SN') : `${$t('common.search')} ${title}`" /><SsIcon v-if="search" name="x" :size="17" @click="search = ''; searchPerformed = false" tone="default" /></view><button v-if="state === 'search' || state === 'result'" class="filter search-submit" @click="searchPerformed = true"><SsIcon name="search" :size="20" tone="default" /></button><button v-if="entity === 'projects' && (state === 'search' || state === 'result')" class="filter" :class="{ active: showAdvancedFilter }" @click="showAdvancedFilter = !showAdvancedFilter"><SsIcon name="list-filter" :size="20" tone="default" /></button><button v-else-if="state !== 'search' && state !== 'result'" class="filter" :class="{ active: showAdvancedFilter }" @click="showAdvancedFilter = !showAdvancedFilter"><SsIcon name="list-filter" :size="20" tone="default" /></button></view>
      <scroll-view v-if="entity === 'purchases' && state === 'catalog'" scroll-x class="category-scroll"><view class="category-chips"><button :class="{active:materialCategory === 'all'}" @click="materialCategory='all'">{{ l('全部分类','All categories') }}</button><button v-for="categoryName in materialCategories" :key="categoryName" :class="{active:materialCategory === categoryName}" @click="materialCategory=categoryName">{{ localizedEntityText(categoryName,store.locale) }}</button></view></scroll-view>
      <view v-if="entity === 'purchases' && state === 'catalog' && recentPurchases.length" class="recent-purchase-section">
        <view class="recent-purchase-head"><view><strong>{{ l('最近采购','Recent purchases') }}</strong><text>{{ l('快速复用上次采购清单','Reuse a previous order') }}</text></view><button @click="switchPurchaseView('records')">{{ l('全部记录','All orders') }}<SsIcon name="chevron-right" :size="15" tone="brand" /></button></view>
        <scroll-view scroll-x class="recent-purchase-scroll"><view class="recent-purchase-list"><view v-for="item in recentPurchases" :key="item.id" class="recent-purchase-card"><view @click="uni.navigateTo({url:`/pages/manage/list?entity=purchases&state=record-detail&id=${item.id}`})"><strong>{{ item.orderNo }}</strong><text>{{ item.items?.map((line:any) => `${store.locale === 'zh-Hans' ? line.name : line.nameEn} ×${line.quantity}`).join('、') }}</text><span>{{ businessMoney(item.amount,purchaseCurrency(item)) }} · {{ statusLabel(item.status) }}</span></view><button @click="repeatPurchase(item)"><SsIcon name="refresh-cw" :size="16" tone="brand" />{{ l('再次采购','Buy again') }}</button></view></view></scroll-view>
      </view>
      <view v-if="showAdvancedFilter" class="advanced-filter" :class="{ 'project-advanced-filter': entity === 'projects' }">
        <button class="advanced-reset" @click="resetFilters"><SsIcon name="refresh-cw" :size="16" tone="brand" />{{ l('重置筛选','Reset filters') }}</button>
        <template v-if="entity === 'projects'">
          <picker :range="projectDealerOptions" range-key="label" @change="changeProjectDealer"><view class="advanced-picker"><text>{{ l('经销商','Dealer') }}</text><strong>{{ selectedProjectDealer }}</strong><SsIcon name="chevron-down" :size="15" tone="muted" /></view></picker>
          <picker :range="projectStatusOptions" range-key="label" @change="changeProjectStatus"><view class="advanced-picker"><text>{{ l('项目状态','Status') }}</text><strong>{{ selectedProjectStatus }}</strong><SsIcon name="chevron-down" :size="15" tone="muted" /></view></picker>
          <picker mode="date" :value="projectDateFrom" @change="projectDateFrom = $event.detail.value"><view class="advanced-picker"><text>{{ l('开始日期','From') }}</text><strong>{{ projectDateFrom || l('不限','Any') }}</strong></view></picker>
          <picker mode="date" :value="projectDateTo" @change="projectDateTo = $event.detail.value"><view class="advanced-picker"><text>{{ l('结束日期','To') }}</text><strong>{{ projectDateTo || l('不限','Any') }}</strong></view></picker>
        </template>
        <template v-else>
          <button class="advanced-option" :class="{selected:sortNewest}" @click="sortNewest = !sortNewest"><SsIcon name="clock-3" :size="16" :tone="sortNewest ? 'brand' : 'muted'" /><text>{{ sortNewest ? l('更新时间：新到旧','Updated: newest first') : l('更新时间：旧到新','Updated: oldest first') }}</text></button>
          <button class="advanced-option" :class="{selected:scopeCurrent}" @click="scopeCurrent = !scopeCurrent"><SsIcon name="shield-check" :size="16" :tone="scopeCurrent ? 'brand' : 'muted'" /><text>{{ scopeCurrent ? l('仅当前账号','Current account only') : l('权限内全部数据','All permitted data') }}</text></button>
        </template>
      </view>
      <scroll-view v-if="statuses.length && state !== 'price-search' && state !== 'catalog'" scroll-x class="status-scroll"><view class="segment status-tabs"><view v-for="item in statuses" :key="item[0]" class="segment-item" :class="{ active: activeStatus === item[0] }" @click="activeStatus = item[0]">{{ item[1] }}</view></view></scroll-view>
      <view v-if="store.designCaseId === 'M02'" class="notice warning list-design-notice"><SsIcon name="cloud-upload" :size="19" tone="warning" /><view><strong>{{ l('2 个航点等待上传','2 waypoints awaiting upload') }}</strong><text>{{ l('连接网络后可在上传队列中手动同步。','Connect to the network and sync them from the upload queue.') }}</text></view></view>
      <view v-if="state === 'search' && !searchPerformed" class="search-guidance"><SsIcon name="folder-search" :size="42" tone="default" /><text>{{ l('输入信息查询项目','Search for a project') }}</text><span>{{ l('为保护客户信息，本页不提供项目列表浏览。','To protect customer information, projects cannot be browsed without a search.') }}</span></view>
      <scroll-view v-else scroll-y class="entity-scroll">
        <view v-if="loading" class="loading-state"><SsIcon name="loader-circle" :size="28" tone="default" /><text>{{ $t('common.loading') }}</text></view>
        <SsEmpty v-else-if="forbidden" :title="l('当前账号无权访问','Access denied')" :description="l('请联系经销商管理员开通对应权限。','Contact the dealer administrator to grant this permission.')" icon="shield-alert" />
        <view v-else-if="visibleItems.length" class="entity-list">
          <view v-for="item in visibleItems" :key="item.id" class="entity-card card" @click="open(item)">
            <view class="entity-head"><view class="icon-tile" :class="String(item.status) === 'pending' ? 'warning' : ''"><SsIcon :name="config.icon" :size="24" tone="default" /></view><view class="list-copy"><strong>{{ store.isDealer ? businessRecordTitle(item) : entityPrimary(item, store.locale) }}</strong><text>{{ store.isDealer ? businessSubtitle(item) : entitySecondary(item, store.locale) }}</text></view><SsStatus v-if="state !== 'catalog' && (item.status || item.syncStatus)" :status="entity === 'waypoints' && (item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) === 'local' ? 'completed' : String(item.status || item.syncStatus)" :label="waitsForPlatform(item) ? l('待后台审核','Platform review') : entity === 'waypoints' ? waypointStatusLabel(item) : statusLabel(item.status || item.syncStatus)" /><view v-else-if="entity === 'messages'" class="read-dot" :class="{ read:item.read }" /></view>
            <view v-if="store.isDealer && state !== 'catalog' && businessFields(item).length" class="business-record-facts"><view v-for="field in businessListFields(item)" :key="field.label"><text>{{ field.label }}</text><strong>{{ field.value }}</strong></view></view>
            <view v-if="store.isDealer && state === 'catalog'" class="business-stock"><SsIcon :name="item.itemType === 'device' ? 'cpu' : 'package'" :size="15" tone="muted" /><text>{{ item.itemType === 'device' ? l('整机设备','Equipment') : l('配件','Part') }} · {{ l('可采购','Available') }} {{ item.stock }}</text></view>
            <view v-if="entity === 'projects'" class="entity-meta"><text>{{ l('设备','Devices') }} {{ store.db?.devices.filter(d => d.projectId === item.id).length || 0 }}</text><text>{{ localizedEntityText(item.region, store.locale) }}</text><text>{{ localizedEntityText(item.ownerName, store.locale) }}</text></view>
            <view v-if="entity === 'dealers'" class="entity-meta"><text>{{ l(`${item.level} 级网点`,`Level ${item.level} outlet`) }}</text><text>{{ l('设备','Devices') }} {{ store.db?.devices.filter(d => d.dealerId === item.id).length || 0 }}</text><text>{{ localizedEntityText(item.manager, store.locale) }}</text></view>
            <view v-if="entity === 'shipments'" class="entity-meta"><text>{{ localizedEntityText(item.carrier, store.locale) }}</text><text>{{ item.trackingNumber }}</text><text>{{ String(item.estimatedAt).slice(5,10) }}</text></view>
            <view v-if="entity === 'purchases' && item.items?.length" class="purchase-line-list"><view v-for="line in item.items" :key="line.id"><text>{{ store.locale !== 'zh-Hans' ? line.nameEn : line.name }} ×{{ line.quantity }}</text><strong>{{ line.currency === 'USD' ? '$' : '¥' }}{{ Number(line.amount).toFixed(2) }}</strong></view></view>
            <view v-if="entity === 'purchases' && state !== 'catalog'" class="purchase-record-meta"><view><text>{{ l('订单金额','Order amount') }}</text><strong>¥{{ Number(item.amount || 0).toFixed(2) }}</strong></view><view><text>{{ l('付款状态','Payment') }}</text><strong>{{ purchasePaymentLabel(item) }}</strong></view><view><text>{{ l('物流状态','Shipment') }}</text><strong>{{ purchaseShippingLabel(item) }}</strong></view></view>
            <view v-if="entity === 'messages'" class="message-meta"><text>{{ String(item.type).toUpperCase() }}</text><span>{{ String(item.updatedAt).slice(0,10) }}</span></view>
            <view v-if="state === 'price-search'" class="price-result"><view><text>SKU</text><strong>{{ item.sku }}</strong></view><view><text>{{ l('库存','Stock') }}</text><strong>{{ item.stock }}</strong></view><view><text>{{ l('采购价','Purchase price') }}</text><strong>{{ item.currency === 'USD' ? '$' : '¥' }}{{ Number(item.dealerPrice).toLocaleString() }}</strong></view></view>
            <view v-if="state === 'catalog'" class="catalog-result" @click.stop><view><text>{{ l('一级经销商采购价','Primary dealer price') }}</text><strong>{{ item.currency === 'USD' ? '$' : '¥' }}{{ Number(item.dealerPrice).toLocaleString() }}</strong></view><view class="stepper"><button :disabled="item.quantity <= 0" @click="changePurchaseQuantity(item,-1)">-</button><text>{{ item.quantity }}</text><button :disabled="item.quantity >= item.stock" @click="changePurchaseQuantity(item,1)">+</button></view></view>
            <view v-if="state === 'unassigned' && entity === 'devices'" class="entity-actions" @click.stop><button class="action-button primary" @click="uni.navigateTo({ url: `/pages/manage/form?entity=transfers&mode=dealer-assignment&deviceId=${item.id}` })"><SsIcon name="store" :size="17" tone="inverse" />{{ l('分配给二级经销商','Assign to sub-dealer') }}</button></view>
            <view v-else-if="entity === 'waypoints' && cloudSyncConnected && (item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) === 'server' && item.syncStatus !== 'synced'" class="entity-actions" @click.stop><button class="action-button primary" @click="uploadWaypoint(item)"><SsIcon name="upload-cloud" :size="17" tone="default" />{{ item.syncStatus === 'failed' ? l('重试上传','Retry upload') : l('立即上传','Upload now') }}</button></view>
            <view v-else-if="entity === 'routes' && item.syncStatus !== 'synced'" class="entity-actions" @click.stop><button class="action-button primary" @click="uploadRoute(item)"><SsIcon name="upload-cloud" :size="17" tone="default" />{{ l('上传航迹','Upload track') }}</button></view>
            <view v-else-if="!(store.isDealer && businessDetailEntities.includes(entity)) && (primaryAction(item) || canReject(item) || (config.canDelete && canCreate))" class="entity-actions" @click.stop>
              <button v-if="config.canDelete && canCreate" class="action-button danger" @click="deleteTarget = item"><SsIcon name="trash-2" :size="17" tone="default" />{{ $t('common.delete') }}</button>
              <button v-if="canReject(item)" class="action-button danger" @click="reject(item)">{{ l('驳回','Reject') }}</button>
              <button v-if="primaryAction(item)" class="action-button" :class="entity === 'employees' ? (item.status === 'enabled' ? 'danger' : 'success') : 'primary'" @click="requestPrimary(item)">{{ primaryAction(item)?.label }}</button>
              <button v-else-if="config.fields.length" class="action-button" @click="open(item)"><SsIcon name="pencil" :size="16" tone="default" />{{ $t('common.edit') }}</button>
            </view>
            <view v-if="store.isDealer && businessDetailEntities.includes(entity) && state !== 'catalog'" class="business-record-actions" @click.stop>
              <button class="business-record-link" @click="open(item)">{{ l('查看详情','View details') }}<SsIcon name="arrow-right" :size="16" tone="brand" /></button>
              <button v-if="canReject(item)" class="action-button danger" @click="reject(item)">{{ l('驳回','Reject') }}</button>
              <button v-if="primaryAction(item)" class="action-button primary" @click="requestPrimary(item)">{{ primaryAction(item)?.label }}</button>
            </view>
          </view>
        </view>
        <SsEmpty v-else :title="state === 'search' || state === 'result' ? l('未找到匹配项目','No matching projects') : l(`暂无${title}`,`No ${title.toLowerCase()}`)" :description="state === 'search' || state === 'result' ? l('请检查船名、设备 SN 或客户姓名。','Check the vessel, device SN, or customer name.') : l('相关记录会显示在这里。','Related records will appear here.')" :icon="config.icon" :action="canCreate ? `${$t('common.add')} ${store.locale !== 'zh-Hans' ? config.singularEn : config.singular}` : ''" @action="add" />
        <view class="safe-bottom" />
      </scroll-view>
      <view v-if="state === 'catalog' && purchaseCartOpen" class="purchase-selection-layer" @click.self="purchaseCartOpen = false"><view class="purchase-selection-sheet"><view class="purchase-selection-head"><view><strong>{{ l('已选商品','Selected products') }}</strong><text>{{ l(`${selectedPurchaseItems.length} 种 · ${purchaseCartCount} 件`, `${selectedPurchaseItems.length} types · ${purchaseCartCount} items`) }}</text></view><button @click="purchaseCartOpen = false"><SsIcon name="x" :size="20" tone="muted" /></button></view><scroll-view scroll-y class="purchase-selection-list"><view v-for="item in selectedPurchaseItems" :key="item.id" class="purchase-selection-row"><view><strong>{{ localizedEntityText(item.name,store.locale) }} {{ item.itemType === 'device' ? item.model : '' }}</strong><text>{{ item.itemType === 'device' ? l('设备','Equipment') : 'SKU' }} {{ item.sku }} · {{ l('可用库存','Available') }} {{ item.stock }}</text></view><view class="stepper"><button @click="changePurchaseQuantity(item,-1)">-</button><text>{{ item.quantity }}</text><button :disabled="item.quantity >= item.stock" @click="changePurchaseQuantity(item,1)">+</button></view><button class="purchase-remove" :aria-label="l('移除商品','Remove item')" @click="purchaseQuantities = { ...purchaseQuantities, [item.id]: 0 }"><SsIcon name="trash-2" :size="18" tone="danger" /></button></view></scroll-view></view></view>
      <view v-if="state === 'catalog'" class="purchase-cart-bar"><button class="purchase-cart-summary" :disabled="!purchaseCartCount" @click="purchaseCartOpen = true"><view><text>{{ l('已选商品','Selected') }} {{ selectedPurchaseItems.length }} {{ l('种','types') }} / {{ purchaseCartCount }} {{ l('件','items') }}</text><strong>¥{{ purchaseCartAmount.toFixed(2) }}</strong></view><span class="cart-expand-icon"><SsIcon name="chevron-right" :size="18" tone="brand" /></span></button><button class="btn primary" :disabled="!purchaseCartCount || purchaseSaving" @click="submitPurchaseCart"><SsIcon name="shopping-cart" :size="18" tone="inverse" />{{ purchaseSaving ? l('提交中','Submitting') : l('提交采购单','Submit order') }}</button></view>
      <view v-if="store.isDealer && entity === 'materials' && canCreate && visibleItems.length && !['search','result','unassigned','price-search','catalog'].includes(state)" class="business-create-footer"><button class="btn primary floating-add" @click="add"><SsIcon name="plus" :size="20" tone="inverse" />{{ l('申请物料','Request materials') }}</button></view>
      <button v-if="!store.isDealer && entity === 'materials' && canCreate && visibleItems.length && !['search','result','unassigned','price-search','catalog'].includes(state)" class="floating-add" @click="add"><SsIcon name="plus" :size="25" tone="default" /></button>
    </template>

    <SsActionSheet :show="Boolean(transferPicker)" :title="transferPicker === 'target' ? l('选择转单对象','Choose destination type') : l('选择接收经销商','Choose receiving dealer')" :items="transferPickerItems" @cancel="transferPicker = null" @select="selectTransferOption" />
    <view v-if="showSupplement" class="supplement-layer" @click.self="showSupplement = false">
      <view class="supplement-sheet" role="dialog" :aria-label="l('补充说明','Add note')">
        <view class="supplement-handle" />
        <view class="supplement-head"><view><strong>{{ l('补充说明','Add note') }}</strong><text>{{ l('说明会写入工单处理记录','The note is added to the ticket history') }}</text></view><button class="icon-button" @click="showSupplement = false"><SsIcon name="x" :size="20" tone="muted" /></button></view>
        <view class="supplement-input"><textarea v-model="supplementText" maxlength="300" :placeholder="l('请补充故障现象、可联系时间或现场情况','Add symptoms, availability, or field details')" /><text>{{ supplementText.length }}/300</text></view>
        <view class="button-row supplement-actions"><button class="btn" @click="showSupplement = false">{{ l('取消','Cancel') }}</button><button class="btn primary" :disabled="supplementSaving" @click="saveSupplement"><SsIcon name="check" :size="18" tone="inverse" />{{ supplementSaving ? l('保存中','Saving') : l('保存说明','Save note') }}</button></view>
      </view>
    </view>
    <SsModal :show="Boolean(deleteTarget)" :title="l(`删除${config.singular}`,`Delete ${config.singularEn}`)" :description="l(`“${deleteTarget ? entityPrimary(deleteTarget, store.locale) : ''}”删除后无法恢复。`,`Deleting “${deleteTarget ? entityPrimary(deleteTarget, store.locale) : ''}” cannot be undone.`)" icon="trash-2" tone="danger" @cancel="deleteTarget = null" @confirm="confirmDelete" />
    <SsModal :show="Boolean(transitionTarget)" :title="transitionTarget?.action === 'reject' ? l('确认驳回','Confirm rejection') : l('确认状态变更','Confirm status change')" :description="transitionTarget?.action === 'reject' ? l('驳回后会记录操作人和时间，历史记录不可删除。','The rejection, operator, and time are recorded permanently.') : l('系统会记录本次操作，并按照业务规则进入下一状态。','The action is recorded and advances according to the workflow rules.')" :icon="transitionTarget?.action === 'reject' ? 'circle-x' : 'clipboard-check'" :tone="transitionTarget?.action === 'reject' ? 'danger' : 'warning'" :confirm-text="transitionTarget?.action === 'reject' ? l('确认驳回','Reject') : l('确认执行','Confirm')" @cancel="transitionTarget = null" @confirm="confirmTransition"><view v-if="store.isDealer && transitionTarget" class="business-confirmation"><strong>{{ entityPrimary(transitionTarget.item,store.locale) }}</strong><text>{{ transitionTarget.item.orderNo || transitionTarget.item.id }}</text><view v-for="field in businessFields(transitionTarget.item).slice(0,2)" :key="field.label"><text>{{ field.label }}</text><strong>{{ field.value }}</strong></view></view></SsModal>
  </view>
</template>

<style scoped>
.entity-page { display:flex;height:100vh;flex-direction:column;overflow:hidden; }.list-toolbar { display:grid;grid-template-columns:1fr 88rpx;gap:14rpx;padding:16rpx 32rpx 0; }.search-box { display:flex;height:88rpx;align-items:center;gap:14rpx;padding:0 22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.search-box input { min-width:0;height:80rpx;flex:1;font-size:25rpx; }.filter { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.filter.active,.search-submit { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary); }.advanced-filter { display:flex;gap:12rpx;padding:14rpx 32rpx 0;overflow:hidden;white-space:nowrap; }.advanced-filter text,.advanced-filter span { padding:10rpx 14rpx;color:var(--color-text-secondary);background:var(--color-bg-subtle);border-radius:10rpx;font-size:19rpx; }.advanced-filter text { color:var(--color-action-primary); }.status-scroll { flex:0 0 auto;padding:16rpx 32rpx 0;white-space:nowrap; }.status-tabs { display:inline-flex;min-width:100%; }.entity-scroll { min-height:0;flex:1;padding:18rpx 32rpx calc(176rpx + env(safe-area-inset-bottom)); }.loading-state,.search-guidance { display:flex;min-height:440rpx;flex-direction:column;align-items:center;justify-content:center;gap:14rpx;color:var(--color-text-secondary);text-align:center; }.search-guidance > text { color:var(--color-text-primary);font-size:30rpx;font-weight:600; }.search-guidance > span { max-width:520rpx;font-size:22rpx;line-height:34rpx; }.entity-list { display:flex;flex-direction:column;gap:18rpx; }.entity-card { margin:0;padding:24rpx; }.entity-head { display:flex;align-items:center;gap:16rpx; }.entity-meta { display:grid;grid-template-columns:repeat(3,1fr);gap:8rpx;margin-top:20rpx;padding-top:18rpx;border-top:2rpx solid var(--color-divider);color:var(--color-text-secondary);font-size:20rpx; }.amount { display:flex;align-items:flex-end;justify-content:space-between;margin-top:18rpx;padding-top:16rpx;border-top:2rpx solid var(--color-divider); }.amount text { color:var(--color-text-secondary);font-size:21rpx; }.amount strong { font-size:32rpx; }.message-meta { display:flex;justify-content:space-between;margin-top:16rpx;color:var(--color-text-secondary);font-size:20rpx; }.read-dot { width:16rpx;height:16rpx;background:var(--ss-brand-500);border-radius:50%; }.read-dot.read { background:var(--ss-neutral-300); }.entity-actions { display:flex;justify-content:flex-end;gap:12rpx;margin-top:20rpx;padding-top:18rpx;border-top:2rpx solid var(--color-divider); }.action-button { display:flex;min-width:112rpx;height:64rpx;align-items:center;justify-content:center;gap:8rpx;padding:0 20rpx;color:var(--color-text-body);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;font-size:22rpx; }.action-button.primary { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary); }.action-button.danger { color:var(--ss-red-700);background:var(--ss-red-50);border-color:#f8c8cd; }.floating-add { position:fixed;right:36rpx;bottom:calc(36rpx + env(safe-area-inset-bottom));z-index:20;display:flex;width:104rpx;height:104rpx;align-items:center;justify-content:center;color:#fff;background:var(--color-action-primary);border:8rpx solid #fff;border-radius:50%;box-shadow:var(--shadow-floating); }
.action-button.success { color:var(--ss-green-700);background:var(--ss-green-50);border-color:var(--ss-green-200); }
.approval-center-scroll{padding-top:24rpx}.approval-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx}.approval-overview>view{padding:22rpx 12rpx;text-align:center;border-left:2rpx solid var(--color-divider)}.approval-overview>view:first-child{border-left:0}.approval-overview text,.approval-overview strong{display:block}.approval-overview text{color:var(--color-text-secondary);font-size:18rpx}.approval-overview strong{margin-top:5rpx;font-size:31rpx}.approval-note{display:flex;align-items:flex-start;gap:14rpx;margin-top:20rpx;padding:20rpx;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:12rpx}.approval-note>view{min-width:0;flex:1}.approval-note strong,.approval-note text{display:block}.approval-note strong{font-size:22rpx}.approval-note text{margin-top:4rpx;color:var(--color-text-secondary);font-size:18rpx;line-height:28rpx}.approval-list{margin-top:20rpx;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx}.approval-row{display:flex;width:100%;min-height:126rpx;align-items:center;gap:14rpx;padding:18rpx 20rpx;background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left}.approval-row:last-child{border-bottom:0}.approval-row>span{display:flex;width:56rpx;height:56rpx;flex:0 0 56rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:10rpx}.approval-row>view{min-width:0;flex:1}.approval-row text,.approval-row strong,.approval-row small{display:block}.approval-row text{color:var(--color-action-primary);font-size:17rpx}.approval-row strong{margin-top:2rpx;overflow:hidden;font-size:22rpx;text-overflow:ellipsis;white-space:nowrap}.approval-row small{margin-top:4rpx;color:var(--color-text-secondary);font-size:16rpx}
.purchase-view-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8rpx;margin:16rpx 32rpx 0;padding:6rpx;background:var(--color-bg-subtle);border:2rpx solid var(--color-border-subtle);border-radius:12rpx}.purchase-view-tabs button{display:flex;height:66rpx;align-items:center;justify-content:center;gap:8rpx;color:var(--color-text-secondary);background:transparent;border:0;border-radius:9rpx;font-size:21rpx}.purchase-view-tabs button.active{color:#fff;background:var(--color-action-primary)}.purchase-view-tabs text{display:flex;min-width:30rpx;height:30rpx;align-items:center;justify-content:center;padding:0 7rpx;color:var(--color-action-primary);background:#fff;border-radius:99rpx;font-size:16rpx}.purchase-record-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:18rpx;padding-top:16rpx;border-top:2rpx solid var(--color-divider)}.purchase-record-meta>view{min-width:0;padding:0 10rpx;border-left:2rpx solid var(--color-divider)}.purchase-record-meta>view:first-child{padding-left:0;border-left:0}.purchase-record-meta text,.purchase-record-meta strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.purchase-record-meta text{color:var(--color-text-secondary);font-size:17rpx}.purchase-record-meta strong{margin-top:4rpx;font-size:19rpx}
.purchase-purpose-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12rpx;padding:16rpx 32rpx 0}.purchase-purpose-grid>button{display:grid;grid-template-columns:48rpx minmax(0,1fr) 28rpx;align-items:center;gap:10rpx;min-height:102rpx;padding:14rpx;color:var(--color-text-primary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;text-align:left}.purchase-purpose-grid>button.active{border-color:var(--ss-blue-300);background:var(--ss-blue-50)}.purchase-purpose-grid>button>span{display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;background:#fff;border-radius:8rpx}.purchase-purpose-grid>button>span.service{background:var(--ss-orange-50)}.purchase-purpose-grid strong,.purchase-purpose-grid text{display:block}.purchase-purpose-grid strong{font-size:20rpx;line-height:28rpx}.purchase-purpose-grid text{margin-top:3rpx;color:var(--color-text-secondary);font-size:16rpx;line-height:22rpx}.recent-purchase-section{padding:18rpx 0 0}.recent-purchase-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16rpx;padding:0 32rpx 12rpx}.recent-purchase-head strong,.recent-purchase-head text{display:block}.recent-purchase-head strong{font-size:24rpx}.recent-purchase-head text{margin-top:3rpx;color:var(--color-text-secondary);font-size:17rpx}.recent-purchase-head>button{display:flex;align-items:center;gap:3rpx;color:var(--color-action-primary);font-size:18rpx}.recent-purchase-scroll{white-space:nowrap}.recent-purchase-list{display:inline-flex;gap:12rpx;padding:0 32rpx}.recent-purchase-card{display:grid;width:430rpx;min-height:132rpx;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12rpx;padding:18rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;box-sizing:border-box;white-space:normal}.recent-purchase-card>view{min-width:0}.recent-purchase-card strong,.recent-purchase-card text,.recent-purchase-card span{display:block}.recent-purchase-card strong{font-size:20rpx}.recent-purchase-card text{overflow:hidden;margin-top:5rpx;color:var(--color-text-secondary);font-size:17rpx;line-height:24rpx;text-overflow:ellipsis;white-space:nowrap}.recent-purchase-card span{margin-top:5rpx;color:var(--color-text-secondary);font-size:16rpx}.recent-purchase-card>button{display:flex;height:58rpx;align-items:center;gap:5rpx;padding:0 12rpx;color:var(--color-action-primary);background:var(--ss-blue-50);border:0;border-radius:9rpx;font-size:17rpx}
.backend-flow-panel { display:flex;flex-direction:column;gap:18rpx;margin-top:22rpx; }.backend-flow-panel .notice { margin:0; }
.payment-scroll { padding-top:16rpx; }.payment-tabs .segment-item { min-width:0;padding:0 10rpx; }.payment-filter-card { margin-top:20rpx;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.payment-filter-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding:22rpx 24rpx;border-bottom:2rpx solid var(--color-divider); }.payment-filter-head > view:first-child { min-width:0;flex:1; }.payment-filter-head strong,.payment-filter-head text { display:block; }.payment-filter-head strong { font-size:25rpx; }.payment-filter-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.payment-filter-head button { height:56rpx;padding:0 16rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:0;border-radius:10rpx;font-size:21rpx;font-weight:600; }.payment-filter-option { display:flex;min-height:104rpx;align-items:center;gap:16rpx;padding:18rpx 24rpx;border-bottom:2rpx solid var(--color-divider); }.payment-filter-option:last-child { border-bottom:0; }.payment-filter-option > span { display:flex;width:64rpx;height:64rpx;flex:0 0 64rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:12rpx; }.payment-filter-option > view { min-width:0;flex:1; }.payment-filter-option strong,.payment-filter-option text { display:block; }.payment-filter-option strong { font-size:23rpx; }.payment-filter-option text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.payment-list { display:flex;flex-direction:column;gap:20rpx;margin-top:20rpx; }.payment-card { margin:0;padding:26rpx;box-shadow:none; }.payment-card-head { display:flex;align-items:flex-start;justify-content:space-between;gap:18rpx; }.payment-card-head > view:first-child { min-width:0;flex:1; }.payment-card-head strong,.payment-card-head text { display:block; }.payment-card-head strong { overflow:hidden;font-size:27rpx;text-overflow:ellipsis;white-space:nowrap; }.payment-card-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.payment-card-foot { display:flex;align-items:flex-end;justify-content:space-between;gap:20rpx;margin-top:22rpx;padding-top:20rpx;border-top:2rpx solid var(--color-divider); }.payment-card-foot text { color:var(--color-text-secondary);font-size:21rpx; }.payment-card-foot strong { font-size:32rpx;line-height:38rpx; }.payment-card-actions { margin-top:20rpx; }.payment-card-actions .btn { min-height:68rpx;padding:0 16rpx;font-size:21rpx; }
.payment-design .payment-list { margin-top:32rpx; }.payment-design .payment-card { padding:30rpx; }.payment-design .payment-card-actions .btn { min-height:84rpx; }
.payment-order-links{display:grid;grid-template-columns:minmax(0,1fr) 26rpx minmax(0,1fr);align-items:center;gap:8rpx;margin-top:18rpx;padding:16rpx 18rpx;background:var(--color-bg-canvas);border-radius:12rpx}.payment-order-links>view{min-width:0}.payment-order-links text,.payment-order-links strong{display:block}.payment-order-links text{color:var(--color-text-secondary);font-size:18rpx}.payment-order-links strong{margin-top:4rpx;overflow:hidden;font-family:var(--ss-font-data);font-size:20rpx;text-overflow:ellipsis;white-space:nowrap}.payment-card-progress,.payment-relation-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8rpx;margin-top:18rpx}.payment-card-progress>view,.payment-relation-summary>view{min-width:0;padding:14rpx 8rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:10rpx;text-align:center}.payment-card-progress text,.payment-card-progress strong,.payment-relation-summary text,.payment-relation-summary strong{display:block}.payment-card-progress text,.payment-relation-summary text{color:var(--color-text-secondary);font-size:17rpx;line-height:25rpx}.payment-card-progress strong,.payment-relation-summary strong{margin-top:3rpx;overflow-wrap:anywhere;font-family:var(--ss-font-data);font-size:20rpx;line-height:29rpx}.payment-card-foot{align-items:center;margin-top:16rpx;padding-top:16rpx}.payment-card-foot text{line-height:31rpx}.payment-relation-card{margin-top:22rpx;padding:26rpx;box-shadow:none}.payment-relation-card>view:not(.payment-relation-summary){display:flex;align-items:center;justify-content:space-between;gap:18rpx;padding:9rpx 0;border-bottom:2rpx solid var(--color-divider)}.payment-relation-card>view>text{color:var(--color-text-secondary);font-size:20rpx}.payment-relation-card>view>strong{min-width:0;overflow:hidden;font-family:var(--ss-font-data);font-size:21rpx;text-overflow:ellipsis;white-space:nowrap}.payment-relation-card>span{display:inline-flex;margin-top:16rpx;padding:7rpx 12rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:999rpx;font-size:18rpx;font-weight:600}
.payment-card-actions .btn{width:100%}
.support-hero { display:flex;flex-direction:column;align-items:center;padding:38rpx 28rpx;text-align:center; }.support-icon { display:flex;width:112rpx;height:112rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:24rpx; }.support-hero > text { margin-top:18rpx;font-size:32rpx;font-weight:600; }.support-hero > span { margin-top:8rpx;color:var(--color-text-secondary);font-size:22rpx;line-height:34rpx; }.hub-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:20rpx; }.hub-grid button { display:flex;min-height:180rpx;flex-direction:column;align-items:flex-start;justify-content:center;gap:8rpx;padding:24rpx;color:var(--color-action-primary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx;text-align:left; }.hub-grid strong { color:var(--color-text-primary);font-size:25rpx; }.hub-grid text { color:var(--color-text-secondary);font-size:20rpx; }.success-page { display:flex;min-height:650rpx;flex-direction:column;align-items:center;justify-content:center;text-align:center; }.success-mark { display:flex;width:144rpx;height:144rpx;align-items:center;justify-content:center;color:var(--ss-green-700);background:var(--ss-green-50);border-radius:50%; }.success-page > text { margin-top:24rpx;font-size:36rpx;font-weight:600; }.success-page > span { max-width:550rpx;margin:10rpx 0 30rpx;color:var(--color-text-secondary);font-size:23rpx;line-height:36rpx; }.success-next { display:grid;width:100%;grid-template-columns:repeat(2,1fr);margin-bottom:24rpx;text-align:left; }.success-next text,.success-next strong { display:block; }.success-next text { color:var(--color-text-secondary);font-size:20rpx; }.success-next strong { margin-top:6rpx;font-size:24rpx; }.success-page .btn { width:100%; }
.project-result-summary { padding:28rpx;box-shadow:none; }.project-result-summary .section-head strong,.project-result-summary .section-head text { display:block; }.project-result-summary .section-head strong { font-size:31rpx; }.project-result-summary .section-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.project-result-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:24rpx; }.project-result-grid > view { padding:20rpx 24rpx;background:var(--color-bg-canvas);border-radius:12rpx; }.project-result-grid text,.project-result-grid strong { display:block; }.project-result-grid text { color:var(--color-text-secondary);font-size:20rpx; }.project-result-grid strong { margin-top:7rpx;overflow:hidden;font-size:26rpx;text-overflow:ellipsis;white-space:nowrap; }.project-record-label { display:block;margin:42rpx 0 16rpx;font-size:25rpx;font-weight:600; }.project-result-records .list-row { min-height:108rpx; }.project-result-actions { margin-top:28rpx; }.project-result-actions .btn { min-width:0;padding:0 10rpx;font-size:21rpx; }
.timeline-card { padding:28rpx; }.timeline { margin-top:34rpx; }.timeline-item { position:relative;display:flex;gap:22rpx;padding-bottom:36rpx; }.timeline-item::before { position:absolute;top:20rpx;bottom:0;left:9rpx;width:2rpx;content:'';background:var(--color-divider); }.timeline-item:last-child::before { display:none; }.timeline-item > i { position:relative;z-index:1;width:20rpx;height:20rpx;flex:0 0 20rpx;margin-top:5rpx;background:var(--ss-neutral-300);border:5rpx solid #fff;border-radius:50%;box-shadow:0 0 0 2rpx var(--ss-neutral-300); }.timeline-item.active > i { background:var(--ss-brand-500);box-shadow:0 0 0 2rpx var(--ss-brand-500); }.timeline-item strong,.timeline-item text,.timeline-item span { display:block; }.timeline-item text,.timeline-item span { margin-top:6rpx;color:var(--color-text-secondary);font-size:21rpx; }.transfer-steps > view { display:flex;align-items:center;gap:16rpx;padding:16rpx 0;border-bottom:2rpx solid var(--color-divider); }.transfer-steps span { display:flex;width:44rpx;height:44rpx;align-items:center;justify-content:center;background:var(--color-bg-subtle);border-radius:50%; }.transfer-steps .done span { color:#fff;background:var(--ss-green-500); }
.service-detail-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding:28rpx;box-shadow:none; }.service-detail-head > view:first-child { min-width:0;flex:1; }.service-detail-head strong,.service-detail-head text { display:block; }.service-detail-head strong { font-size:29rpx; }.service-detail-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.service-design-timeline { margin-top:34rpx;padding:36rpx 32rpx;box-shadow:none; }.service-design-step { position:relative;display:flex;gap:24rpx;padding-bottom:30rpx; }.service-design-step::before { position:absolute;top:18rpx;bottom:0;left:9rpx;width:2rpx;content:'';background:var(--color-divider); }.service-design-step:last-child { padding-bottom:0; }.service-design-step:last-child::before { display:none; }.service-design-step > i { position:relative;z-index:1;width:20rpx;height:20rpx;flex:0 0 20rpx;margin-top:4rpx;background:#fff;border:4rpx solid var(--ss-neutral-300);border-radius:50%; }.service-design-step.done > i { background:var(--ss-green-500);border-color:var(--ss-green-500); }.service-design-step.active > i { background:var(--color-action-primary);border-color:var(--color-action-primary);box-shadow:0 0 0 8rpx var(--color-action-primary-subtle); }.service-design-step strong,.service-design-step text,.service-design-step span { display:block; }.service-design-step strong { font-size:24rpx; }.service-design-step text,.service-design-step span { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.service-contact { margin-top:32rpx; }.service-contact strong,.service-contact text { display:block; }.service-contact text { margin-top:4rpx; }.service-detail-actions { margin-top:32rpx; }.service-detail-actions .btn { min-width:0; }.user-message-tabs { margin:0 32rpx 16rpx; }.user-message-tabs .segment-item { min-width:0;padding:0 8rpx; }.user-message-scroll { padding-top:0; }.user-message-list .list-row { min-height:112rpx; }.user-message-list .row-value { white-space:nowrap; }.user-message-notice { margin-top:32rpx; }.user-message-notice strong,.user-message-notice text { display:block; }.user-message-notice text { margin-top:4rpx; }
.message-detail-card { padding:26rpx; }.message-detail-head { display:flex;align-items:center;gap:16rpx; }.message-body { margin-top:24rpx;padding:22rpx;color:var(--color-text-body);background:var(--color-bg-canvas);border-radius:14rpx;font-size:24rpx;line-height:38rpx; }.message-fields { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20rpx;margin-top:24rpx; }.message-fields text,.message-fields strong { display:block; }.message-fields text { color:var(--color-text-secondary);font-size:20rpx; }.message-fields strong { margin-top:6rpx;font-size:22rpx; }.transfer-target-tabs { margin-top:22rpx; }.dealer-options { margin-top:18rpx; }.dealer-options > view,.hq-option { display:flex;min-height:100rpx;align-items:center;justify-content:space-between;gap:18rpx;padding:18rpx;border:2rpx solid var(--color-border-subtle);border-radius:14rpx;margin-top:12rpx; }.dealer-options > view.selected { color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-color:var(--ss-brand-300); }.dealer-options strong,.dealer-options text,.hq-option strong,.hq-option text { display:block; }.dealer-options text,.hq-option text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.hq-option { justify-content:flex-start;color:var(--color-action-primary); }.hq-option > view { min-width:0;flex:1;color:var(--color-text-primary); }.field-counter { display:block;margin-top:8rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:right; }.full-button { width:100%;margin-top:24rpx; }.transfer-summary { margin-top:24rpx;padding:22rpx;background:var(--color-action-primary-subtle);border-radius:14rpx; }.transfer-summary text,.transfer-summary strong,.transfer-summary span { display:block; }.transfer-summary text,.transfer-summary span { color:var(--color-text-secondary);font-size:21rpx; }.transfer-summary strong { margin:6rpx 0;font-size:26rpx; }.price-result { display:grid;grid-template-columns:1fr .7fr 1fr;gap:12rpx;margin-top:20rpx;padding-top:18rpx;border-top:2rpx solid var(--color-divider); }.price-result text,.price-result strong { display:block; }.price-result text { color:var(--color-text-secondary);font-size:19rpx; }.price-result strong { margin-top:5rpx;font-size:22rpx; }.price-result > view:last-child strong { color:var(--ss-red-700); }
.catalog-result { display:flex;align-items:center;justify-content:space-between;gap:16rpx;margin-top:20rpx;padding-top:18rpx;border-top:2rpx solid var(--color-divider); }.catalog-result text,.catalog-result strong { display:block; }.catalog-result text { color:var(--color-text-secondary);font-size:20rpx; }.catalog-result strong { margin-top:4rpx;color:var(--ss-red-700);font-size:28rpx; }.stepper { display:grid;grid-template-columns:56rpx 48rpx 56rpx;align-items:center;text-align:center; }.stepper button { height:52rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:0;border-radius:8rpx;font-size:28rpx; }.stepper text { color:var(--color-text-primary);font-size:24rpx; }
.stepper button:disabled { color:var(--ss-neutral-300);background:var(--color-bg-subtle); }.purchase-cart-bar { position:fixed;right:0;bottom:0;left:0;z-index:24;display:flex;align-items:center;justify-content:space-between;gap:20rpx;width:100%;max-width:780rpx;margin:0 auto;padding:18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));background:#fff;border-top:2rpx solid var(--color-divider);box-shadow:0 -10rpx 28rpx rgba(15,23,42,.08);box-sizing:border-box; }.purchase-cart-bar text,.purchase-cart-bar strong { display:block; }.purchase-cart-bar text { color:var(--color-text-secondary);font-size:20rpx; }.purchase-cart-bar strong { margin-top:3rpx;font-size:29rpx; }.purchase-cart-bar .btn { min-width:250rpx; }
.purchase-line-list { margin-top:18rpx;padding-top:12rpx;border-top:2rpx solid var(--color-divider); }.purchase-line-list > view { display:flex;align-items:center;justify-content:space-between;gap:16rpx;padding:7rpx 0; }.purchase-line-list text { min-width:0;overflow:hidden;color:var(--color-text-secondary);font-size:20rpx;text-overflow:ellipsis;white-space:nowrap; }.purchase-line-list strong { flex:0 0 auto;font-size:21rpx; }
.selection-radio { display:flex;width:38rpx;height:38rpx;flex:0 0 38rpx;align-items:center;justify-content:center;color:#fff;background:#fff;border:3rpx solid var(--ss-neutral-300);border-radius:50%; }.selection-radio.selected { background:var(--color-action-primary);border-color:var(--color-action-primary); }
.transfer-design .notice > view,.dealer-message-notice > view { min-width:0;flex:1; }.transfer-design .notice strong,.transfer-design .notice text,.dealer-message-notice strong,.dealer-message-notice text { display:block; }.transfer-design .notice strong,.dealer-message-notice strong { font-size:23rpx; }.transfer-design .notice text,.dealer-message-notice text { margin-top:4rpx;font-size:20rpx;line-height:31rpx; }.transfer-form { padding:24rpx 26rpx 4rpx; }.transfer-form .field { margin-bottom:22rpx; }.transfer-form .field-label small { margin-left:auto;color:var(--color-text-secondary);font-size:19rpx;font-weight:400; }.transfer-form .grow { min-width:0;flex:1;color:var(--color-text-body); }.transfer-form textarea::placeholder { color:var(--color-text-body); }.transfer-choices .row-icon,.dealer-message-list .row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.transfer-choices .row-icon.purple,.dealer-message-list .row-icon.purple { background:var(--ss-purple-50); }.dealer-message-tabs { margin:16rpx 32rpx 0; }.dealer-message-tabs .segment-item { min-width:0;padding:0 12rpx; }.dealer-message-scroll { padding-top:18rpx; }.dealer-message-list .list-row { min-height:116rpx;padding:14rpx 24rpx;gap:16rpx; }.dealer-message-list .row-icon.warning { background:var(--ss-orange-50); }.dealer-message-list .row-icon.danger { background:var(--ss-red-50); }.dealer-message-list .row-icon.success { background:var(--ss-green-50); }.dealer-message-notice { margin-top:32rpx; }
.support-search { display:flex;height:88rpx;align-items:center;gap:14rpx;padding:0 24rpx;color:var(--color-text-secondary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx;font-size:24rpx; }.support-operations { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12rpx;margin-top:30rpx; }.support-operations button { display:flex;min-width:0;flex-direction:column;align-items:center;gap:12rpx;background:transparent;border:0;font-size:20rpx; }.support-operations i { display:flex;width:80rpx;height:80rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.support-operations i.orange { background:var(--ss-orange-50); }.support-operations i.danger { background:var(--ss-red-50); }.support-operations i.purple { background:var(--ss-purple-50); }.support-operations text { width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.support-progress .row-icon,.support-faq .row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.support-progress .row-icon.warning { background:var(--ss-orange-50); }.support-progress .row-icon.success { background:var(--ss-green-50); }.support-faq .list-row { min-height:104rpx; }
.list-design-notice { margin:18rpx 32rpx 0; }.list-design-notice strong,.list-design-notice text { display:block; }.list-design-notice text { margin-top:4rpx; }.transfer-progress-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding:26rpx;box-shadow:none; }.transfer-progress-head strong,.transfer-progress-head text { display:block; }.transfer-progress-head strong { font-size:32rpx; }.transfer-progress-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:21rpx; }.transfer-progress-timeline { margin-top:24rpx;padding:30rpx;box-shadow:none; }.transfer-progress-step { position:relative;display:flex;gap:22rpx;padding-bottom:32rpx; }.transfer-progress-step::before { position:absolute;top:18rpx;bottom:0;left:8rpx;width:2rpx;content:'';background:var(--color-divider); }.transfer-progress-step:last-child { padding-bottom:0; }.transfer-progress-step:last-child::before { display:none; }.transfer-progress-step > i { position:relative;z-index:1;width:18rpx;height:18rpx;flex:0 0 18rpx;margin-top:4rpx;background:#fff;border:4rpx solid var(--ss-neutral-300);border-radius:50%; }.transfer-progress-step.done > i { background:var(--ss-green-500);border-color:var(--ss-green-500); }.transfer-progress-step.current > i { background:var(--color-action-primary);border-color:var(--color-action-primary);box-shadow:0 0 0 7rpx var(--color-action-primary-subtle); }.transfer-progress-step strong,.transfer-progress-step text,.transfer-progress-step span { display:block; }.transfer-progress-step text,.transfer-progress-step span { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.transfer-progress-metrics,.dealer-ticket-stats { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:24rpx; }.transfer-progress-metrics > view { padding:22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.transfer-progress-metrics text,.transfer-progress-metrics strong { display:block; }.transfer-progress-metrics text { color:var(--color-text-secondary);font-size:20rpx; }.transfer-progress-metrics strong { margin-top:7rpx;font-size:24rpx; }.transfer-progress-contact { width:100%;margin-top:24rpx; }.dealer-ticket-stats { margin:18rpx 32rpx 0; }.dealer-ticket-stats > view { display:flex;align-items:center;gap:14rpx;padding:18rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.dealer-ticket-stats text,.dealer-ticket-stats strong { display:block; }.dealer-ticket-stats text { color:var(--color-text-secondary);font-size:19rpx; }.dealer-ticket-stats strong { margin-top:3rpx;font-size:29rpx; }
.dealer-ticket-design { padding-top:14rpx; }.dealer-ticket-tabs .segment-item { min-width:0; }.dealer-ticket-search { display:flex;height:82rpx;align-items:center;gap:14rpx;margin-top:20rpx;padding:0 24rpx;color:var(--color-text-secondary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx;font-size:22rpx; }.dealer-ticket-search text { min-width:0;flex:1; }.dealer-ticket-design .dealer-ticket-stats { margin:32rpx 0 0; }.dealer-ticket-stat { display:flex;min-height:148rpx;align-items:center;gap:16rpx;padding:20rpx 22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.dealer-ticket-stat > i { display:flex;width:64rpx;height:64rpx;flex:0 0 64rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:12rpx; }.dealer-ticket-stat > i.warning { background:var(--ss-orange-50); }.dealer-ticket-stat > i.accent { background:var(--ss-purple-50); }.dealer-ticket-stat text,.dealer-ticket-stat strong,.dealer-ticket-stat span { display:block; }.dealer-ticket-stat text { color:var(--color-text-secondary);font-size:20rpx; }.dealer-ticket-stat strong { font-size:34rpx;line-height:40rpx; }.dealer-ticket-stat span { color:var(--ss-green-700);font-size:18rpx; }.dealer-ticket-list { display:flex;flex-direction:column;gap:20rpx;margin-top:32rpx; }.dealer-ticket-card { margin:0;padding:26rpx 30rpx;box-shadow:none; }.dealer-ticket-head { display:flex;align-items:flex-start;justify-content:space-between;gap:16rpx; }.dealer-ticket-head > view { min-width:0;flex:1; }.dealer-ticket-head strong,.dealer-ticket-head text { display:block; }.dealer-ticket-head strong { font-size:25rpx; }.dealer-ticket-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.dealer-ticket-summary { display:block;margin-top:20rpx;color:var(--color-text-body);font-size:22rpx;line-height:33rpx; }.dealer-ticket-footer { display:flex;align-items:center;justify-content:space-between;gap:14rpx;margin-top:22rpx; }.dealer-ticket-footer > text { color:var(--color-text-secondary);font-size:20rpx; }.dealer-ticket-footer .btn { min-width:0;height:68rpx;padding:0 20rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-color:var(--ss-brand-200);font-size:21rpx; }
.transfer-progress-metrics > view { background:var(--color-bg-canvas);border:0;border-radius:10rpx; }
.dealer-ticket-design .dealer-ticket-stats { gap:20rpx; }.dealer-ticket-design .dealer-ticket-stat { min-height:190rpx; }.dealer-ticket-design .dealer-ticket-stat > i { width:80rpx;height:80rpx;flex-basis:80rpx; }
.advanced-filter { display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1fr);gap:12rpx;padding-top:16rpx;overflow:visible;white-space:normal; }.advanced-filter button { display:flex;min-width:0;height:62rpx;align-items:center;justify-content:center;gap:8rpx;padding:0 14rpx;color:var(--color-text-secondary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;font-size:19rpx; }.advanced-filter .advanced-reset { color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-color:var(--ss-brand-200); }.advanced-filter .advanced-option.selected { color:var(--color-action-primary);border-color:var(--ss-brand-300); }.advanced-filter .advanced-option text { min-width:0;overflow:hidden;padding:0;color:inherit;background:transparent;border-radius:0;font-size:19rpx;text-overflow:ellipsis;white-space:nowrap; }.payment-filter-option { width:100%;color:var(--color-text-body);background:#fff;border-width:0 0 2rpx;border-color:var(--color-divider);border-radius:0;text-align:left;box-sizing:border-box; }.payment-filter-option.selected { background:var(--color-action-primary-subtle); }.transfer-picker-control { width:100%;margin:0;text-align:left;box-sizing:border-box; }.transfer-picker-control::after { display:none; }.transfer-picker-control:disabled { opacity:.62; }.service-notes { margin-top:24rpx;padding:24rpx 28rpx;box-shadow:none; }.service-note { padding:18rpx 0;border-top:2rpx solid var(--color-divider); }.service-note:first-of-type { margin-top:16rpx; }.service-note strong,.service-note text,.service-note span { display:block; }.service-note strong { font-size:22rpx; }.service-note text { margin-top:6rpx;color:var(--color-text-body);font-size:22rpx;line-height:34rpx; }.service-note span { margin-top:6rpx;color:var(--color-text-secondary);font-size:18rpx; }.supplement-layer { position:fixed;z-index:92;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.42); }.supplement-sheet { width:100%;max-width:780rpx;padding:12rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));background:var(--color-bg-surface);border-radius:28rpx 28rpx 0 0;box-sizing:border-box; }.supplement-handle { width:72rpx;height:8rpx;margin:0 auto 18rpx;background:var(--ss-neutral-300);border-radius:999rpx; }.supplement-head { display:flex;min-height:86rpx;align-items:center;justify-content:space-between;gap:20rpx;padding-bottom:16rpx;border-bottom:2rpx solid var(--color-divider); }.supplement-head > view { min-width:0;flex:1; }.supplement-head strong,.supplement-head text { display:block; }.supplement-head strong { font-size:30rpx; }.supplement-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.supplement-input { margin-top:24rpx;padding:18rpx;background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.supplement-input textarea { width:100%;height:190rpx;font-size:23rpx;line-height:34rpx; }.supplement-input > text { display:block;color:var(--color-text-secondary);font-size:19rpx;text-align:right; }.supplement-actions { margin-top:24rpx; }.supplement-actions .btn { min-width:0; }
.project-search-toolbar { grid-template-columns:minmax(0,1fr) 88rpx 88rpx; }.project-advanced-filter { grid-template-columns:repeat(2,minmax(0,1fr));padding-right:32rpx;padding-left:32rpx; }.project-advanced-filter .advanced-reset { grid-column:1 / -1; }.advanced-picker { display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5rpx 12rpx;min-height:88rpx;padding:14rpx 18rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;box-sizing:border-box; }.advanced-picker > text { grid-column:1 / -1;padding:0;color:var(--color-text-secondary);background:transparent;font-size:18rpx; }.advanced-picker > strong { min-width:0;overflow:hidden;font-size:21rpx;text-overflow:ellipsis;white-space:nowrap; }.service-billing { margin-top:24rpx;padding:26rpx;box-shadow:none; }.service-billing .section-head strong { color:var(--color-action-primary);font-size:28rpx; }.billing-line { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding:20rpx 0;border-top:2rpx solid var(--color-divider); }.billing-line:first-of-type { margin-top:14rpx; }.billing-line strong,.billing-line text { display:block; }.billing-line text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.billing-line > span { flex:0 0 auto;font-size:23rpx;font-weight:600; }
.support-search input { min-width:0;height:80rpx;flex:1;font-size:23rpx; }.support-search > button { display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;margin:0;padding:0;background:transparent;border:0;border-radius:50%; }.support-search > button::after { display:none; }.support-progress .list-row,.support-faq .list-row { cursor:pointer; }
.faq-detail-scroll { padding-top:24rpx; }.faq-hero { display:flex;flex-direction:column;align-items:center;padding:34rpx 30rpx;text-align:center;box-shadow:none; }.faq-hero .row-icon { display:flex;width:92rpx;height:92rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:20rpx; }.faq-hero > text { margin-top:20rpx;font-size:30rpx;font-weight:600; }.faq-hero > span { margin-top:10rpx;color:var(--color-text-secondary);font-size:21rpx;line-height:34rpx; }.faq-steps { margin-top:24rpx;padding:28rpx;box-shadow:none; }.faq-step { display:grid;grid-template-columns:46rpx minmax(0,1fr);gap:16rpx;padding:22rpx 0;border-bottom:2rpx solid var(--color-divider); }.faq-step:last-child { border-bottom:0; }.faq-step > i { display:flex;width:42rpx;height:42rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:50%;font-size:19rpx;font-style:normal;font-weight:600; }.faq-step > text { color:var(--color-text-body);font-size:22rpx;line-height:34rpx; }.faq-notice { margin-top:24rpx;align-items:flex-start; }.faq-notice > view { min-width:0;flex:1; }.faq-notice strong,.faq-notice text { display:block; }.faq-notice text { margin-top:5rpx; }.faq-contact { width:100%;margin-top:24rpx; }
.payment-detail-scroll { padding-top:24rpx; }.payment-detail-hero { display:flex;flex-direction:column;align-items:center;padding:34rpx 28rpx;text-align:center;box-shadow:none; }.payment-detail-icon { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;margin-bottom:18rpx;background:var(--ss-green-50);border-radius:20rpx; }.payment-detail-hero > text { margin-top:20rpx;font-size:24rpx;font-weight:600; }.payment-detail-hero > strong { margin-top:8rpx;font-size:48rpx;line-height:58rpx; }.payment-detail-hero > span { margin-top:7rpx;color:var(--color-text-secondary);font-size:20rpx; }.payment-detail-card { margin-top:24rpx;padding:28rpx;box-shadow:none; }.payment-detail-row { display:flex;min-height:82rpx;align-items:center;justify-content:space-between;gap:20rpx;border-bottom:2rpx solid var(--color-divider); }.payment-detail-row:last-child { border-bottom:0; }.payment-detail-row > text { flex:0 0 auto;color:var(--color-text-secondary);font-size:21rpx; }.payment-detail-row > strong { min-width:0;overflow-wrap:anywhere;font-size:21rpx;text-align:right; }.payment-related { margin-top:24rpx;align-items:flex-start; }.payment-related > view { min-width:0;flex:1; }.payment-related strong,.payment-related text { display:block; }.payment-related text { margin-top:5rpx; }.payment-detail-actions { margin-top:24rpx; }.payment-detail-actions .btn { min-width:0;padding:0 12rpx;font-size:21rpx; }
/* Shared business pages use one restrained operational rhythm. */
.list-toolbar { grid-template-columns:minmax(0,1fr) 84rpx;gap:12rpx;padding:12rpx 28rpx 0; }
.search-box,.filter { height:84rpx;border-radius:var(--radius-md); }.filter { width:84rpx; }
.advanced-filter,.status-scroll { padding-right:28rpx;padding-left:28rpx; }
.entity-scroll { padding:16rpx 28rpx calc(164rpx + env(safe-area-inset-bottom)); }
.entity-list,.payment-list,.dealer-ticket-list { gap:12rpx; }
.entity-card,.payment-card,.dealer-ticket-card { padding:22rpx;border-radius:var(--radius-md);box-shadow:none; }
.support-hero { align-items:flex-start;padding:28rpx;text-align:left; }
.support-icon { width:58rpx;height:58rpx;background:transparent;border:2rpx solid var(--ss-brand-200);border-radius:50%; }
.support-operations { gap:0;padding:12rpx 0;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.support-operations button { min-height:104rpx;border-right:2rpx solid var(--color-divider); }.support-operations button:last-child { border-right:0; }
.support-operations i,.support-operations i.orange,.support-operations i.danger,.support-operations i.purple { width:52rpx;height:52rpx;background:transparent;border-radius:var(--radius-sm); }
.support-progress .row-icon,.support-faq .row-icon,.transfer-choices .row-icon,.dealer-message-list .row-icon { width:50rpx;height:50rpx;flex-basis:50rpx;background:transparent;border-radius:var(--radius-sm); }
.support-progress .row-icon.warning,.support-progress .row-icon.success,.dealer-message-list .row-icon.warning,.dealer-message-list .row-icon.danger,.dealer-message-list .row-icon.success { background:transparent; }
.supplement-sheet { border-radius:16rpx 16rpx 0 0; }
</style>

<style scoped>
.unassigned-overview{display:grid;grid-template-columns:132px minmax(0,1fr);gap:1px;margin:12px 20px 0;overflow:hidden;background:var(--color-divider);border:1px solid var(--color-border-subtle);border-radius:8px}.unassigned-overview>view{min-width:0;padding:14px 16px;background:#fff}.unassigned-overview text,.unassigned-overview strong,.unassigned-overview span{display:block}.unassigned-overview text{color:var(--color-text-secondary);font-size:11px;line-height:17px}.unassigned-overview strong{margin-top:3px;overflow:hidden;color:var(--color-text-primary);font-size:18px;line-height:26px;text-overflow:ellipsis;white-space:nowrap}.unassigned-overview>view:first-child strong{color:var(--color-action-primary);font-family:var(--ss-font-data);font-size:28px}.unassigned-overview span{margin-top:2px;color:var(--color-text-secondary);font-size:10px;line-height:15px}
.advanced-filter:not(.project-advanced-filter){display:flex;align-items:center;gap:8px;margin:0;padding:12px 20px;overflow-x:auto;background:#fff;border-bottom:1px solid var(--color-divider);box-shadow:none;white-space:nowrap;scrollbar-width:none}
.advanced-filter:not(.project-advanced-filter)::-webkit-scrollbar{display:none}
.advanced-filter:not(.project-advanced-filter)>button{width:auto;min-width:0;min-height:40px;height:40px;flex:0 0 auto;gap:6px;padding:0 10px;border:1px solid var(--color-border-subtle);border-radius:6px;font-size:12px;line-height:18px;white-space:nowrap}
.advanced-filter:not(.project-advanced-filter) .advanced-reset{color:var(--color-action-primary);background:var(--ss-brand-50);border-color:var(--ss-brand-200)}
.advanced-filter:not(.project-advanced-filter) .advanced-option text{display:block;overflow:visible;padding:0;color:inherit;background:transparent;font-size:12px;line-height:18px;text-overflow:clip;white-space:nowrap}
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
.category-scroll{flex:0 0 auto;padding:12px 20px 0;white-space:nowrap}.category-chips{display:flex;gap:8px}.category-chips button{min-height:40px;padding:0 14px;color:var(--color-text-secondary);background:#fff;border:1px solid var(--color-border-subtle);border-radius:6px;font-size:13px}.category-chips button.active{color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary)}
.todo-center-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;background:#fff;border-bottom:1px solid var(--color-divider)}.todo-center-summary>view{display:flex;align-items:baseline;gap:10px}.todo-center-summary text,.todo-center-summary span{color:var(--color-text-secondary);font-size:12px}.todo-center-summary strong{font-family:var(--ss-font-data);font-size:28px}.todo-center-list{margin-top:12px;background:#fff}.todo-center-row{display:flex;width:100%;min-height:68px;align-items:center;gap:12px;padding:12px 16px;background:#fff;border:0;border-bottom:1px solid var(--color-divider);border-radius:0;text-align:left}.todo-center-row:last-child{border-bottom:0}.todo-center-icon{display:flex;width:36px;height:36px;flex:0 0 36px;align-items:center;justify-content:center;background:var(--ss-brand-50);border-radius:7px}.todo-center-icon.warning{background:var(--ss-orange-50)}.todo-center-icon.success{background:var(--ss-green-50)}.todo-center-icon.purple{background:var(--ss-purple-50)}.todo-center-row>view:nth-child(2){min-width:0;flex:1}.todo-center-row strong,.todo-center-row text{display:block}.todo-center-row strong{font-size:14px;line-height:22px}.todo-center-row text{margin-top:2px;color:var(--color-text-secondary);font-size:12px}.todo-center-row b{min-width:28px;color:var(--ss-orange-700);font-family:var(--ss-font-data);font-size:20px;text-align:right}
.purchase-cart-summary{display:flex;min-width:0;flex:1;align-items:center;justify-content:flex-start;gap:8px;padding:0;background:transparent;border:0;text-align:left}.purchase-cart-summary>view{min-width:0;flex:1}.purchase-cart-summary:disabled{opacity:.6}.cart-expand-icon{display:flex;transform:rotate(-90deg)}.purchase-selection-layer{position:fixed;z-index:23;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:calc(78px + env(safe-area-inset-bottom));background:rgba(15,23,42,.38);box-sizing:border-box}.purchase-selection-sheet{width:100%;max-width:780rpx;max-height:55vh;padding:0 20px 14px;background:#fff;border-radius:12px 12px 0 0;box-sizing:border-box}.purchase-selection-head{display:flex;min-height:64px;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-divider)}.purchase-selection-head strong,.purchase-selection-head text{display:block}.purchase-selection-head strong{font-size:17px}.purchase-selection-head text{margin-top:2px;color:var(--color-text-secondary);font-size:12px}.purchase-selection-head>button{display:flex;width:44px;height:44px;align-items:center;justify-content:center;background:transparent;border:0}.purchase-selection-list{max-height:calc(55vh - 78px)}.purchase-selection-row{display:flex;min-height:70px;align-items:center;gap:10px;border-bottom:1px solid var(--color-divider)}.purchase-selection-row:last-child{border-bottom:0}.purchase-selection-row>view:first-child{min-width:0;flex:1}.purchase-selection-row strong,.purchase-selection-row text{display:block}.purchase-selection-row strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.purchase-selection-row>view:first-child text{margin-top:3px;color:var(--color-text-secondary);font-size:11px}.purchase-selection-row .stepper{grid-template-columns:32px 30px 32px;flex:0 0 auto}.purchase-selection-row .stepper button{height:36px}.purchase-selection-row .stepper text{font-size:14px}.purchase-remove{display:flex;width:40px;height:40px;flex:0 0 40px;align-items:center;justify-content:center;background:transparent;border:0}
.purchase-record-meta strong{overflow:visible;line-height:17px;text-overflow:clip;white-space:normal}.purchase-payment-progress{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.purchase-payment-progress span{color:var(--color-text-secondary);font-size:12px}.purchase-payment-progress span:nth-child(2){text-align:right}.purchase-payment-progress i{grid-column:1/-1;height:7px;overflow:hidden;background:var(--color-bg-subtle);border-radius:999px}.purchase-payment-progress b{display:block;height:100%;background:var(--color-action-primary);border-radius:999px;transition:width .2s ease}
</style>
