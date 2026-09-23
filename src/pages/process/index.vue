<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsModal from '@/components/SsModal.vue'
import SsActionSheet from '@/components/SsActionSheet.vue'
import { summarizeDealerYear } from '@/services/dealerAnalytics'
import { deviceService } from '@/services/device'
import { firmwareService } from '@/services/firmware'
import { routeService } from '@/services/routes'
import { integrationAvailability, integrationReason, isLocalDemoCapability, mapAdapter } from '@/services/adapters'
import { workflowService } from '@/services/workflow'
import { localizedEntityText } from '@/config/entities'
import { useAppStore } from '@/stores/app'
import { backOrFallback } from '@/utils/navigation'
import type { Device, FirmwareJob, Payment, RoutePlan } from '@/types/models'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const scenario = ref('ota')
const deviceId = ref('dev-01')
const routeId = ref('')
const paymentId = ref('')
const shipmentId = ref('')
const source = ref('')
const nextScenario = ref('')
const stage = ref(0)
const progress = ref(0)
const running = ref(false)
const failed = ref(false)
const powerOn = ref(false)
const speed = ref(45)
const direction = ref('forward')
const lift = ref<'up' | 'down' | 'stop'>('stop')
const propellerOn = ref(false)
const mode = ref('auto')
const showDanger = ref(false)
const showResult = ref(false)
const showPaymentConfirm = ref(false)
const accessible = ref(true)
const firmwareJobId = ref('')
const selectedWaypointIds = ref<string[]>([])
const routeName = ref('')
const routeDeviceId = ref('')
const showWaypointPicker = ref(false)
const paymentProofId = ref('')
const paymentProofPicking = ref(false)
const paymentAmountInput = ref('')
const commandError = ref(false)
const analyticsPeriod = ref<'month' | 'year'>('month')
const boardSerial = ref('MB-20260811-01')
const boardFirmware = ref('3.3.0')
const boardNote = ref('')
const dragOffsets = reactive<Record<string, { x: number; y: number }>>({})
let timer: ReturnType<typeof setInterval> | null = null

const device = computed(() => accessible.value ? store.db?.devices.find((item) => item.id === deviceId.value) : undefined)
const route = computed(() => store.db?.routes.find((item) => item.id === routeId.value) ?? (scenario.value === 'playback' ? store.db?.routes.find((item) => item.ownerId === store.account?.id) : undefined))
const routeWaypoints = computed(() => selectedWaypointIds.value.map((id) => store.db?.waypoints.find((item) => item.id === id)).filter(Boolean))
const availableWaypoints = computed(() => store.db?.waypoints.filter((item) => item.ownerId === store.account?.id) ?? [])
const routeDevices = computed(() => store.db?.devices.filter((item) => item.ownerId === store.account?.id && item.activationStatus === 'active') ?? [])
const routeDeviceIndex = computed(() => Math.max(0, routeDevices.value.findIndex((item) => item.id === routeDeviceId.value)))
const routeDeviceLabel = computed(() => {
  const target = routeDevices.value.find((item) => item.id === routeDeviceId.value)
  return target ? (store.locale !== 'zh-Hans' ? target.nameEn : target.name) : l('不关联设备', 'No linked device')
})
const payment = computed(() => store.db?.payments.find((item) => item.id === paymentId.value) ?? store.db?.payments.find((item) => item.status === 'pending'))
const paymentPurchase = computed(() => store.db?.purchases.find((item) => item.id === payment.value?.purchaseId || item.orderNo === payment.value?.orderNo))
const paymentChildNo = computed(() => payment.value?.paymentNo || (payment.value ? `${payment.value.orderNo}-P${String(Number(payment.value.installmentNumber || 1)).padStart(2,'0')}` : '--'))
const previousPayments = computed(() => (store.db?.payments || []).filter((item) => item.orderNo === payment.value?.orderNo && item.id !== payment.value?.id && ['verified','paid'].includes(item.status) && Number(item.installmentNumber || 1) < Number(payment.value?.installmentNumber || 1)).sort((a,b) => Number(a.installmentNumber || 1) - Number(b.installmentNumber || 1)))
const previousPaidAmount = computed(() => previousPayments.value.reduce((sum,item) => sum + Number(item.amount || 0),0))
const nextPendingPayment = computed(() => store.db?.payments.find((item) => item.orderNo === payment.value?.orderNo && item.status === 'pending' && item.id !== payment.value?.id))
const paymentFullyPaid = computed(() => paymentPurchase.value?.paymentStatus === 'paid')
const paymentProof = computed(() => store.db?.attachments.find((item) => item.id === (paymentProofId.value || payment.value?.proofAttachmentId)))
const purchaseShipment = computed(() => store.db?.shipments.find((item) => item.orderNo === payment.value?.orderNo))
const paymentStatusLabel = computed(() => ({
  pending: l('待支付', 'Awaiting payment'),
  verifying: l('待财务核实', 'Awaiting finance review'),
  verified: l('已核实', 'Verified'),
  paid: l('已核实', 'Verified'),
  refunded: l('已退款', 'Refunded'),
  failed: l('提交失败', 'Submission failed'),
}[payment.value?.status || 'pending']))
const shipment = computed(() => store.db?.shipments.find((item) => item.id === shipmentId.value) ?? store.db?.shipments[0])
const controlProfile = computed(() => deviceService.controlProfile(device.value))
const isGlobal = computed(() => store.db?.settings.region === 'GLOBAL')
const externalCapability = computed(() => ({ ota: 'ota', control: 'deviceControl', bluetooth: 'bluetooth' } as const)[scenario.value as 'ota' | 'control' | 'bluetooth'])
const externalBlocked = computed(() => Boolean(externalCapability.value && !integrationAvailability[externalCapability.value].ready))
const externalBlockedReason = computed(() => externalCapability.value ? integrationReason(externalCapability.value, store.locale) : '')
const titles = computed<Record<string, string>>(() => ({ ota: l('固件升级', 'Firmware Update'), control: l('远程控制', 'Remote Control'), settings: l('设备运行设置', 'Device Settings'), dealerAnalytics: l('数据统计', 'Data Statistics'), deviceDistribution: l('设备类型分布', 'Device Distribution'), report: l('数据报表', 'Data Report'), location: l('设备位置', 'Device Location'), info: l('完整设备信息', 'Device Information'), mainboard: l('主板更换登记', 'Mainboard Replacement'), route: l('航迹设置', 'Track Settings'), playback: l('航迹导航', 'Track Navigation'), bluetooth: l('蓝牙连接', 'Bluetooth Connection'), payment: l('采购支付', 'Purchase Payment'), logistics: l('物流轨迹', 'Shipment Tracking') }))
const title = computed(() => store.designCaseId === 'B17' ? l('确认订单', 'Confirm Order') : titles.value[scenario.value] || l('业务处理', 'Business Process'))
const rightIcon = computed(() => {
  if (store.designCaseId === 'B11') return 'copy'
  if (store.designCaseId === 'M08') return 'ellipsis'
  if (store.designCaseId === 'D14') return 'share-2'
  if (store.designCaseId === 'D09') return 'download'
  if (scenario.value === 'dealerAnalytics') return 'calendar-days'
  if (scenario.value === 'info') return 'copy'
  if (scenario.value === 'control') return 'circle-help'
  return ''
})
const fallbackUrl = computed(() => {
  if (['ota', 'control', 'settings', 'location', 'info', 'mainboard', 'bluetooth', 'report'].includes(scenario.value)) return `/pages/device/detail?id=${encodeURIComponent(deviceId.value)}`
  if (['route', 'playback'].includes(scenario.value)) return deviceId.value ? `/pages/device/detail?id=${encodeURIComponent(deviceId.value)}` : '/pages/shell/index'
  if (scenario.value === 'payment') return '/pages/manage/list?entity=payments'
  if (scenario.value === 'logistics') return source.value === 'support' ? '/pages/manage/list?entity=tickets&mode=hub' : '/pages/manage/list?entity=shipments'
  if (scenario.value === 'dealerAnalytics') return '/pages/shell/index?tab=workbench'
  return '/pages/shell/index?tab=home'
})
const otaStage = computed(() => failed.value ? l('更新失败', 'Update Failed') : [l('版本检查', 'Checking Version'), l('下载固件', 'Downloading Firmware'), l('蓝牙传输', 'Bluetooth Transfer'), l('更新完成', 'Update Complete')][stage.value])
const otaVersion = computed(() => device.value ? firmwareService.latestVersion(device.value.id) : undefined)
const otaCopy = computed(() => failed.value
  ? l(`升级未完成，设备仍保留原固件 ${device.value?.firmware || '--'}。请检查蓝牙连接后重试。`, `The update did not finish. Firmware ${device.value?.firmware || '--'} is unchanged. Check Bluetooth and retry.`)
  : [otaVersion.value?.available ? l(`当前版本 ${device.value?.firmware || '--'}，发现新版本 ${otaVersion.value.latest}。`, `Current version ${device.value?.firmware || '--'}. Version ${otaVersion.value.latest} is available.`) : l('当前已是最新版本，无需更新。','The firmware is up to date.'), l('正在读取 18.6 MB 固件包。', 'Reading the 18.6 MB firmware package.'), l('请保持当前页面开启，升级进度将写入任务记录。', 'Keep this page open while progress is written to the update task.'), l(`固件记录已更新至 ${device.value?.firmware || '3.3.0'}。`, `Firmware record updated to ${device.value?.firmware || '3.3.0'}.`)][stage.value])
const analyticsData = computed(() => {
  const scope = store.context.dealerScopeIds
  const now = new Date()
  const cutoff = analyticsPeriod.value === 'month' ? now.toISOString().slice(0, 7) : String(now.getFullYear())
  const applications = (store.db?.materials || []).filter((item) => scope.includes(item.dealerId) && item.createdAt.startsWith(cutoff))
  const count = (...statuses: string[]) => applications.filter((item) => statuses.includes(item.status)).length
  return {
    applications: applications.length,
    completed: count('received'),
    processing: count('approved', 'shipping'),
    pending: count('pending'),
    rejected: count('rejected'),
  }
})
const growthMetrics = computed(() => {
  const month = new Date().toISOString().slice(0, 7)
  const devices = (store.db?.devices || []).filter((item) => Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)))
  const users = (store.db?.accounts || []).filter((item) => item.role === 'user')
  return {
    userTotal: users.length,
    userNew: users.filter((item) => item.createdAt.startsWith(month)).length,
    deviceTotal: devices.length,
    deviceNew: devices.filter((item) => item.createdAt.startsWith(month)).length,
  }
})
const analyticsTrend = computed(() => {
  const scope = store.context.dealerScopeIds
  const year = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, month) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    return (store.db?.materials || []).filter((item) => scope.includes(item.dealerId) && item.createdAt.startsWith(prefix)).length
  })
})
const analyticsBars = computed(() => {
  const max = Math.max(1, ...analyticsTrend.value)
  return analyticsTrend.value.map((value) => Math.round(30 + value / max * 100))
})
const distributionRows = computed(() => [
  { icon: 'fan', tone: 'brand' as const, skin: '', name: l('顶流机 / 制冰机','Surface jet / ice maker'), status: l('已连接 26 · 未连接 6','Connected 26 · Not connected 6'), count: l('32 台','32') },
  { icon: 'droplets', tone: 'success' as const, skin: 'green', name: l('海水淡化器','Desalinator'), status: l('已连接 21 · 未连接 3','Connected 21 · Not connected 3'), count: l('24 台','24') },
  { icon: 'battery-charging', tone: 'warning' as const, skin: 'orange', name: l('电池组','Battery bank'), status: l('已连接 14 · 未连接 6','Connected 14 · Not connected 6'), count: l('20 台','20') },
  { icon: 'network', tone: 'accent' as const, skin: 'purple', name: l('网络检测仪','Network tester'), status: l('已连接 13 · 未连接 5','Connected 13 · Not connected 5'), count: l('18 台','18') },
  { icon: 'boxes', tone: 'brand' as const, skin: '', name: l('其他设备','Other devices'), status: l('已连接 22 · 未连接 12','Connected 22 · Not connected 12'), count: l('34 台','34') },
])
const analyticsYear = ref(new Date().getFullYear())
const showAnalyticsYears = ref(false)
const analyticsMonth = ref(new Date().getMonth())
const dealerAnnualMetrics = computed(() => summarizeDealerYear(store.db, store.context.dealerScopeIds, analyticsYear.value))
const analyticsYears = computed(() => {
  const scope = store.context.dealerScopeIds
  const years = new Set(Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index))
  for (const item of [...(store.db?.orders || []), ...(store.db?.tickets || [])]) {
    const year = new Date(item.createdAt).getFullYear()
    if (item.dealerId && scope.includes(item.dealerId) && Number.isFinite(year)) years.add(year)
  }
  return [...years].sort((a, b) => b - a).map(year => ({ key: String(year), label: String(year), icon: 'calendar-days', description: year === analyticsYear.value ? l('已选择', 'Selected') : '' }))
})
const salesRevenueLabel = computed(() => {
  const revenue = dealerAnnualMetrics.value.revenue
  return [revenue.CNY || !revenue.USD ? `¥${revenue.CNY.toLocaleString()}` : '', revenue.USD ? `US$ ${revenue.USD.toLocaleString()}` : ''].filter(Boolean).join(' · ')
})
const analyticsHasData = computed(() => dealerAnnualMetrics.value.salesCount + dealerAnnualMetrics.value.serviceCount > 0)
const analyticsScale = computed(() => Math.max(1, ...dealerAnnualMetrics.value.months.flatMap(item => [item.sales, item.service])))
const selectedAnalyticsMonth = computed(() => dealerAnnualMetrics.value.months[analyticsMonth.value])
function analyticsPoints(key: 'sales' | 'service') {
  return dealerAnnualMetrics.value.months.map((item, index) => `${14 + index * 28},${132 - item[key] / analyticsScale.value * 112}`).join(' ')
}
function selectAnalyticsYear(key: string) {
  if (analyticsYears.value.some(item => item.key === key)) analyticsYear.value = Number(key)
  showAnalyticsYears.value = false
}
onLoad(async (query) => {
  await store.init()
  scenario.value = String(query?.scenario || 'ota')
  if (scenario.value === 'dealerAnalytics') accessible.value = store.isDealer && store.hasCapability('support.manage')
  deviceId.value = String(query?.deviceId || 'dev-01')
  routeId.value = String(query?.routeId || '')
  paymentId.value = String(query?.paymentId || store.db?.payments.find((item) => item.status === 'pending')?.id || '')
  paymentAmountInput.value = String(payment.value?.amount || '')
  shipmentId.value = String(query?.shipmentId || '')
  source.value = String(query?.source || '')
  nextScenario.value = String(query?.next || '')
  if (['ota', 'control', 'settings', 'location', 'info', 'mainboard', 'bluetooth', 'report'].includes(scenario.value)) {
    try { accessible.value = Boolean(await store.get<Device>('devices', deviceId.value)) } catch { accessible.value = false }
  }
  if (device.value) {
    speed.value = device.value.settings.power
    mode.value = device.value.controlState.activeMode === 'manual' ? 'manual' : 'auto'
    powerOn.value = device.value.controlState.powerOn
    direction.value = device.value.controlState.direction
    lift.value = device.value.controlState.lift
    propellerOn.value = device.value.controlState.propellerOn
    if (store.designCaseId === 'D07') {
      powerOn.value = true
      speed.value = 60
      mode.value = 'auto'
      direction.value = 'stop'
    }
  }
  if (['route', 'playback'].includes(scenario.value)) {
    if (route.value) {
      selectedWaypointIds.value = route.value.waypointIds.slice()
      routeName.value = store.locale !== 'zh-Hans' ? route.value.nameEn : route.value.name
      routeDeviceId.value = route.value.deviceId || ''
    } else {
      selectedWaypointIds.value = []
      routeName.value = l(`海上航线 ${new Date().getMonth() + 1}-${new Date().getDate()}`, `Sea Route ${new Date().getMonth() + 1}-${new Date().getDate()}`)
      routeDeviceId.value = routeDevices.value.find((item) => item.id === deviceId.value)?.id || routeDevices.value[0]?.id || ''
    }
  }
  paymentProofId.value = payment.value?.proofAttachmentId || ''
  const requestedStage = Number(query?.stage)
  if (Number.isFinite(requestedStage)) stage.value = Math.max(0, Math.min(3, requestedStage))
  if (query?.state === 'failed') { failed.value = true; progress.value = 46; stage.value = 2 }
})
onUnmounted(() => { if (timer) clearInterval(timer) })

function runProgress(onDone: () => unknown) {
  if (timer) clearInterval(timer)
  running.value = true
  progress.value = 0
  timer = setInterval(() => {
    progress.value += 5
    if (progress.value >= 100) {
      if (timer) clearInterval(timer)
      running.value = false
      Promise.resolve().then(onDone).catch(() => { failed.value = true })
    }
  }, 100)
}
async function ensureFirmwareJob() {
  if (!firmwareJobId.value) firmwareJobId.value = (await firmwareService.start(deviceId.value, store.context)).id
  return firmwareJobId.value
}
async function advanceOta() {
  if (stage.value === 3) return backOrFallback(fallbackUrl.value)
  if (stage.value === 0 && device.value) {
    const check = firmwareService.eligibility(device.value.id)
    if (!check.eligible) {
      const message = check.reasons.includes('DEVICE_NOT_CONNECTED') ? l('请先连接设备蓝牙','Connect the device via Bluetooth first')
        : check.reasons.includes('BATTERY_TOO_LOW') ? l('设备电量不足 30%','Device battery must be at least 30%')
          : check.reasons.includes('NO_FIRMWARE_UPDATE') ? l('当前已是最新版本','Already up to date') : l('当前设备不支持升级','This device does not support updates')
      uni.showToast({ title: message, icon: 'none' })
      return
    }
  }
  failed.value = false
  try {
    const jobId = await ensureFirmwareJob()
    if (stage.value === 0) { await firmwareService.update(jobId, 'downloading', 0, store.context); stage.value = 1; return }
    if (stage.value === 1 || stage.value === 2) runProgress(async () => {
      const nextStage = stage.value + 1
      const persistedStage: FirmwareJob['stage'] = nextStage === 2 ? 'transferring' : 'completed'
      await firmwareService.update(jobId, persistedStage, persistedStage === 'completed' ? 100 : 0, store.context)
      stage.value = nextStage
      await store.refresh()
      progress.value = 0
    })
  } catch {
    failed.value = true
    uni.showToast({ title: l('升级未完成，请检查连接后重试','Update incomplete. Check the connection and retry'), icon: 'none' })
  }
}
function retryOta() { failed.value = false; stage.value = 2; advanceOta() }
function deferOta() {
  if (store.account) firmwareService.deferReminder(deviceId.value, store.account.id)
  backOrFallback(fallbackUrl.value)
}
function togglePower() { if (!powerOn.value) showDanger.value = true; else powerOn.value = false }
async function confirmPower() { showDanger.value = false; powerOn.value = true; await sendControl() }
async function sendControl() {
  if (!device.value) return
  try {
    const command = await deviceService.sendCommand(device.value.id, powerOn.value ? 'start' : 'stop', { powerOn: powerOn.value, power: speed.value, mode: mode.value, direction: direction.value, lift: lift.value, propellerOn: propellerOn.value }, store.context)
    commandError.value = command.status === 'timeout'
    store.refresh()
    if (!commandError.value) uni.showToast({ title: l('指令执行成功', 'Command completed'), icon: 'success' })
  } catch (cause) { uni.showModal({ title: l('控制不可用', 'Control Unavailable'), content: cause instanceof Error && cause.message === 'DEVICE_OFFLINE' ? l('设备当前未连接，无法控制', 'The device is not connected') : integrationReason('deviceControl', store.locale), showCancel: false }) }
}
async function emergencyStop() { powerOn.value = false; speed.value = 0; direction.value = 'stop'; lift.value = 'stop'; propellerOn.value = false; await sendControl() }
async function applyControlMode(value: string) { mode.value = value; if (powerOn.value) await sendControl() }
async function applyControlDirection(value: string) { direction.value = value; if (powerOn.value) await sendControl() }
async function applyControlPower(value: number) { speed.value = value; if (powerOn.value) await sendControl() }
function removeWaypoint(id: string) { selectedWaypointIds.value = selectedWaypointIds.value.filter((item) => item !== id) }
function toggleRouteWaypoint(id: string) {
  selectedWaypointIds.value = selectedWaypointIds.value.includes(id)
    ? selectedWaypointIds.value.filter((item) => item !== id)
    : [...selectedWaypointIds.value, id]
}
function selectRouteDevice(event: { detail: { value: string | number } }) {
  const target = routeDevices.value[Number(event.detail.value)]
  routeDeviceId.value = target?.id || ''
}
function moveWaypoint(index: number, offset: number) {
  const next = index + offset
  if (next < 0 || next >= selectedWaypointIds.value.length) return
  const copy = selectedWaypointIds.value.slice(); [copy[index], copy[next]] = [copy[next], copy[index]]; selectedWaypointIds.value = copy
}
async function saveRoute(uploadAfterSave: boolean | Event = false) {
  const shouldUpload = uploadAfterSave === true
  try {
    if (!routeName.value.trim()) return uni.showToast({ title: l('请输入航迹名称', 'Enter a track name'), icon: 'none' })
    const saved: RoutePlan = route.value
      ? await routeService.updateRoute(route.value.id, routeName.value, selectedWaypointIds.value, routeDeviceId.value || undefined, store.context)
      : await routeService.createRoute(routeName.value, selectedWaypointIds.value, routeDeviceId.value || undefined, store.context)
    store.refresh(); routeId.value = saved.id
    if (!shouldUpload) {
      uni.showToast({ title: l('航线已保存', 'Route saved'), icon: 'success' })
      return
    }
    try {
      await routeService.uploadRoute(saved.id, store.context)
      store.refresh(); uni.showToast({ title: l('航线已保存并上传', 'Route saved and uploaded'), icon: 'success' })
    } catch {
      uni.showModal({ title: l('航线已保存', 'Route Saved'), content: l('上传未完成，航线已保存在本机，可稍后重试上传。', 'Upload was not completed. The route remains saved locally and can be retried later.'), showCancel: false })
    }
  } catch (cause) { uni.showToast({ title: cause instanceof Error && cause.message === 'ROUTE_REQUIRES_TWO_WAYPOINTS' ? l('至少保留两个航点', 'Keep at least two waypoints') : l('航线保存失败', 'Could not save route'), icon: 'none' }) }
}
function trackWaypointDrag(id: string, event: { detail: { x: number; y: number } }) { dragOffsets[id] = { x: event.detail.x, y: event.detail.y } }
async function commitWaypointMove(id: string) {
  const offset = dragOffsets[id]
  if (!offset || (!offset.x && !offset.y)) return
  try { await routeService.moveWaypoint(id, offset.x - 80, offset.y - 80, store.context); store.refresh(); dragOffsets[id] = { x: 80, y: 80 }; uni.showToast({ title: l('航点位置已更新', 'Waypoint moved'), icon: 'success' }) }
  catch { uni.showToast({ title: l('航点调整失败', 'Could not move waypoint'), icon: 'none' }) }
}
async function choosePaymentProof() {
  if (paymentProofPicking.value || payment.value?.status !== 'pending') return
  paymentProofPicking.value = true
  try {
    const [attachment] = await store.pickAttachments('image', 1, 'payment-proof')
    if (attachment) paymentProofId.value = attachment.id
  } catch {
    uni.showToast({ title: l('凭证读取失败，请选择 JPG 或 PNG 图片', 'Could not read the proof. Choose a JPG or PNG image.'), icon: 'none' })
  } finally { paymentProofPicking.value = false }
}
async function submitPaymentProof() {
  if (!payment.value || !paymentProofId.value || payment.value.status !== 'pending') return
  try {
    const installmentAmount = Number(paymentAmountInput.value)
    if (!Number.isFinite(installmentAmount) || installmentAmount <= 0 || installmentAmount > Number(paymentPurchase.value?.remainingAmount || payment.value.amount)) {
      return uni.showToast({ title: l('本次付款金额不能超过剩余待付金额', 'The installment must not exceed the remaining balance'), icon: 'none' })
    }
    await workflowService.setPurchasePaymentAmount(payment.value.id, installmentAmount, store.context)
    await workflowService.submitPaymentProof(payment.value.id, paymentProofId.value, store.context)
    store.refresh()
    showResult.value = true
  } catch {
    uni.showModal({ title: l('凭证提交失败', 'Proof Submission Failed'), content: l('付款状态没有改变，请检查凭证后重试。','The payment status was not changed. Check the proof and try again.'), showCancel: false })
  }
}
async function simulateFinanceReview() {
  if (!payment.value || payment.value.status !== 'verifying' || !isLocalDemoCapability('payment')) return
  try {
    await workflowService.completePurchasePaymentReview(payment.value.id, store.context)
    store.refresh()
    showResult.value = true
  } catch {
    uni.showToast({ title: l('演示核实失败，请稍后重试', 'Demo review failed. Try again.'), icon: 'none' })
  }
}
function continuePurchasePayment() {
  if (payment.value?.status === 'verifying') return uni.redirectTo({ url: '/pages/manage/list?entity=payments&status=verifying' })
  if (nextPendingPayment.value) return uni.redirectTo({ url: `/pages/process/index?scenario=payment&paymentId=${nextPendingPayment.value.id}` })
  openPurchaseShipment()
}
function openPurchaseShipment() {
  if (purchaseShipment.value) {
    uni.redirectTo({ url: '/pages/process/index?scenario=logistics&shipmentId=' + purchaseShipment.value.id })
    return
  }
  uni.redirectTo({ url: '/pages/manage/list?entity=shipments' })
}
function copyTracking() {
  if (!shipment.value?.trackingNumber) return
  uni.setClipboardData({ data: shipment.value.trackingNumber, success: () => uni.showToast({ title: l('物流单号已复制', 'Tracking number copied'), icon: 'success' }) })
}
async function connectBluetooth() {
  if (!device.value) return
  try {
    await deviceService.setConnection(device.value.id, 'bluetooth', true, store.context)
    store.refresh()
    stage.value = 1
    uni.showToast({ title: l('设备连接已建立', 'Device connection established'), icon: 'success' })
    if (nextScenario.value === 'control') setTimeout(() => uni.redirectTo({ url: `/pages/process/index?scenario=control&deviceId=${deviceId.value}` }), 420)
  }
  catch { uni.showModal({ title: l('连接失败', 'Connection Failed'), content: l('未能建立设备连接，请重试。','The device connection could not be established. Try again.'), showCancel: false }) }
}
async function openDeviceLocation() {
  if (!device.value) return
  try {
    await mapAdapter.openLocation({ latitude: device.value.location.lat, longitude: device.value.location.lng, name: store.locale !== 'zh-Hans' ? device.value.nameEn : device.value.name, address: store.locale !== 'zh-Hans' ? device.value.location.labelEn : device.value.location.label })
    uni.showToast({ title: l('本机导航预览已打开', 'On-device navigation preview opened'), icon: 'success' })
  } catch { uni.showModal({ title: l('系统地图不可用', 'System Map Unavailable'), content: l('当前平台无法打开系统地图，设备坐标仍可在本页查看。', 'The system map cannot be opened on this platform. The device coordinates remain available on this page.'), showCancel: false }) }
}
const paymentAmount = computed(() => {
  if (store.designCaseId === 'B17') return isGlobal.value ? '$127.22' : '¥916.00'
  if (!payment.value) return '--'
  const globalAmount = payment.value.currency === 'USD' ? payment.value.amount : payment.value.amount / 7.2
  const amount = isGlobal.value ? globalAmount : payment.value.amount
  return `${isGlobal.value ? '$' : '¥'}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
})
async function saveMainboard() {
  if (!device.value || !boardSerial.value.trim() || !boardFirmware.value.trim()) return uni.showToast({ title: l('请填写新主板编号和固件版本', 'Enter the new board serial and firmware version'), icon: 'none' })
  try {
    await deviceService.replaceMainboard(device.value.id, boardSerial.value.trim(), boardFirmware.value.trim(), store.context, boardNote.value.trim())
    store.refresh()
    uni.showToast({ title: l('主板更换已登记', 'Replacement registered'), icon: 'success' })
    backOrFallback(fallbackUrl.value)
  } catch { uni.showToast({ title: l('登记失败，请检查设备和权限', 'Could not register. Check the device and permission.'), icon: 'none' }) }
}
</script>

<template>
  <view class="page process-page" :class="{ 'dealer-workspace': store.isDealer }" :data-business="scenario">
    <SsAppBar :title="store.designCaseId === 'M08' ? l('航点导航','Waypoint Navigation') : store.designCaseId === 'M07' ? l('调整航点','Adjust waypoints') : store.designCaseId === 'M06' ? l('规划航线','Plan route') : scenario === 'settings' ? l('设备工作参数','Device parameters') : scenario === 'dealerAnalytics' ? l('数据统计','Data Statistics') : scenario === 'info' ? l('设备信息','Device Information') : title" :fallback-url="fallbackUrl" :right-icon="rightIcon" :right-text="store.designCaseId === 'M07' ? l('完成','Done') : store.designCaseId === 'M06' ? l('保存','Save') : ''" @right="scenario === 'dealerAnalytics' ? showAnalyticsYears = true : store.designCaseId === 'B11' ? copyTracking() : ['M06','M07'].includes(store.designCaseId) ? saveRoute(false) : scenario === 'control' ? uni.showToast({title:l('持续按住方向键控制设备，松开后停止。','Hold a direction to move; release to stop.'),icon:'none'}) : undefined" />

    <scroll-view v-if="!accessible" scroll-y class="page-scroll"><view class="empty-business"><SsIcon name="shield-alert" :size="46" tone="default" /><text>{{ l('当前账号无权访问', 'Access denied') }}</text><span>{{ l('设备不在当前账号的数据范围内，或需要先登录。', 'This device is outside your data scope, or you need to sign in.') }}</span><button class="btn primary" @click="backOrFallback(fallbackUrl)">{{ l('返回', 'Go Back') }}</button></view></scroll-view>

    <scroll-view v-else-if="externalBlocked" scroll-y class="page-scroll"><view class="empty-business integration-blocked"><SsIcon name="unplug" :size="46" tone="default" /><text>{{ l('功能暂不可用', 'Feature Unavailable') }}</text><span>{{ externalBlockedReason }}</span><view class="notice warning"><SsIcon name="info" :size="19" tone="default" /><text>{{ l('系统未改变设备、订单或升级记录。配置正式服务后可在此继续操作。', 'No device, order, or firmware data was changed. Configure the production service to continue here.') }}</text></view><button class="btn primary" @click="backOrFallback(fallbackUrl)">{{ l('返回上级页面', 'Go Back') }}</button></view></scroll-view>

    <scroll-view v-else-if="scenario === 'ota'" scroll-y class="page-scroll with-cta">
      <view class="notice demo-mode-notice"><SsIcon name="info" :size="19" tone="default" /><text>{{ l('当前升级流程会更新固件版本、升级任务和操作记录。','The current update flow changes the firmware version, update task, and operation record.') }}</text></view>
      <view class="ota-device card"><view class="icon-tile"><SsIcon name="cpu" :size="28" tone="default" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? device?.nameEn : device?.name }}</strong><text>{{ device?.model }} · {{ l('当前固件', 'Current firmware') }} {{ device?.firmware }}</text></view><SsStatus :status="device?.bluetoothConnected ? 'online' : 'offline'" :label="device?.bluetoothConnected ? l('蓝牙已连接', 'Bluetooth connected') : l('蓝牙未连接', 'Bluetooth disconnected')" /></view>
      <view class="ota-state" :class="{ failed }"><view class="ota-icon"><SsIcon :name="failed ? 'circle-x' : stage === 3 ? 'check-circle-2' : stage === 0 ? 'refresh-ccw-dot' : stage === 1 ? 'download' : 'bluetooth'" :size="48" tone="default" /></view><text>{{ otaStage }}</text><span>{{ otaCopy }}</span><view v-if="running || failed" class="ota-progress"><view class="progress"><view class="progress-bar" :style="{ width: `${progress}%` }" /></view><strong>{{ progress }}%</strong></view></view>
      <view class="connection-rail"><view v-for="(item,index) in [['smartphone',l('手机','Phone')],['cloud',l('云端','Cloud')],['bluetooth',l('蓝牙','Bluetooth')],['cpu',l('设备','Device')]]" :key="item[1]" class="rail" :class="{ done: index < stage, current: index === stage }"><span><SsIcon :name="item[0]" :size="11" tone="default" /></span><text>{{ item[1] }}</text></view></view>
      <view v-if="stage === 0 && otaVersion?.available" class="card release"><text class="card-title">{{ l('版本', 'Version') }} {{ otaVersion.latest }}</text><span>• {{ l('提升弱网环境下的连接稳定性', 'Improves connection stability on weak networks') }}</span><span>• {{ l('优化离线控制与状态缓存', 'Improves offline controls and state caching') }}</span><span>• {{ l('修复温度曲线显示异常', 'Fixes temperature chart display issues') }}</span><text class="caption">{{ l('固件 18.6 MB · 预计 4 分钟', 'Firmware 18.6 MB · About 4 minutes') }}</text></view>
      <view v-if="running && stage === 2" class="notice warning"><SsIcon name="triangle-alert" :size="20" tone="default" /><text>{{ l('传输阶段不可中断。请保持设备通电，手机距离设备不超过 3 米。', 'Do not interrupt the transfer. Keep the device powered and the phone within 3 meters.') }}</text></view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'control'" scroll-y class="page-scroll remote-control-page">
      <view class="notice success control-live-notice"><SsIcon name="radio-tower" :size="19" tone="success" /><view><strong>{{ device?.bluetoothConnected || device?.controllerConnected ? l('设备已连接 · 指令延迟约 120ms','Device connected · About 120 ms latency') : l('设备未连接','Device not connected') }}</strong><text>{{ l('连续运动请按住方向键，松开即停止。','Hold a direction button for continuous movement; release to stop.') }}</text></view></view>
      <view class="control-power-stage" :class="{on:powerOn}"><button @click="togglePower"><SsIcon name="power" :size="42" :tone="powerOn ? 'inverse' : 'success'" /></button><strong>{{ powerOn ? l('设备运行中','Device running') : l('设备已停止','Device stopped') }}</strong><text>{{ l('模式','Mode') }}：{{ mode === 'auto' ? l('自动','Auto') : mode === 'manual' ? l('手动','Manual') : l('定点','Fixed') }} · {{ l('推力','Thrust') }} {{ speed }}%</text></view>
      <view v-if="controlProfile.direction" class="round-direction-pad"><button @click="applyControlDirection('forward')"><SsIcon name="arrow-up" :size="22" tone="default" /></button><button @click="applyControlDirection('left')"><SsIcon name="arrow-left" :size="22" tone="default" /></button><button class="stop" @click="emergencyStop"><SsIcon name="square" :size="18" tone="danger" /></button><button @click="applyControlDirection('right')"><SsIcon name="arrow-right" :size="22" tone="default" /></button><button @click="applyControlDirection('reverse')"><SsIcon name="arrow-down" :size="22" tone="default" /></button></view>
      <view class="card remote-mode-card"><view class="segment"><view v-for="item in [['manual',l('手动','Manual')],['auto',l('自动','Auto')],['fixed',l('定点','Fixed')]]" :key="item[0]" class="segment-item" :class="{active:mode===item[0]}" @click="applyControlMode(item[0])">{{ item[1] }}</view></view><view class="remote-thrust-head"><view><text>{{ l('当前推力','Current thrust') }}</text><strong>{{ speed }}%</strong></view><SsStatus :status="powerOn ? 'online' : 'offline'" :label="powerOn ? l('已执行','Applied') : l('已停止','Stopped')" /></view><slider :value="speed" min="0" max="100" activeColor="#1f60d9" backgroundColor="#e9eef5" block-color="#ffffff" :disabled="!powerOn" @change="applyControlPower($event.detail.value)" /></view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'settings'" scroll-y class="page-scroll with-cta">
      <view class="notice"><SsIcon name="settings-2" :size="20" tone="brand" /><view><strong>{{ l('设备工作参数已合并','Device parameters were consolidated') }}</strong><text>{{ l('请在设备详情右上角“更多”中打开“设备工作参数”，无需进入独立页面。','Open Device parameters from More on the device details page. No separate page is required.') }}</text></view></view>
      <button class="btn primary section" @click="uni.redirectTo({url:`/pages/device/detail?id=${deviceId}`})">{{ l('返回设备详情','Back to device details') }}</button>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'location' && store.designCaseId === 'D14'" scroll-y class="page-scroll design-location-page">
      <view class="design-location-map"><image src="/static/assest/backgrounds/map-canvas.png" mode="aspectFill" /><view class="design-map-marker"><SsIcon name="fan" :size="21" tone="inverse" /></view></view>
      <view class="card design-location-summary"><view class="section-head"><view><strong>{{ l('1号机房','Engine room 1') }}</strong><text>24.496218°N, 118.092833°E</text></view><SsStatus status="online" :label="l('实时','Live')" /></view><view class="design-location-metrics"><view><text>{{ l('定位来源','Source') }}</text><strong>{{ l('设备 GPS','Device GPS') }}</strong></view><view><text>{{ l('定位精度','Accuracy') }}</text><strong>±6m</strong></view></view></view>
      <view class="section list-card design-location-actions"><view v-for="item in [{icon:'map-pinned',title:l('在海图中查看','View on chart'),copy:l('查看附近航点与航线','View nearby waypoints and routes')},{icon:'navigation',title:l('导航到设备位置','Navigate to device'),copy:l('使用系统地图','Use system maps')},{icon:'history',title:l('位置记录','Location history'),copy:l('最近 30 天','Last 30 days')}]" :key="item.title" class="list-row" @click="item.icon === 'navigation' && openDeviceLocation()"><view class="row-icon"><SsIcon :name="item.icon" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><SsIcon name="chevron-right" :size="16" tone="muted" /></view></view>
      <view class="notice design-location-notice"><SsIcon name="shield-check" :size="18" tone="brand-strong" /><view><strong>{{ l('位置信息','Location privacy') }}</strong><text>{{ l('设备位置仅对设备拥有者和授权经销商可见。','Device location is visible only to its owner and authorized dealers.') }}</text></view></view>
    </scroll-view>

    <view v-else-if="scenario === 'location'" class="location-view"><image src="/static/assest/backgrounds/map-canvas.png" mode="aspectFill" /><view class="location-pin"><SsIcon name="ship-wheel" :size="25" tone="default" /></view><view class="location-controls"><button><SsIcon name="locate-fixed" :size="22" tone="default" /></button><button @click="openDeviceLocation"><SsIcon name="navigation" :size="22" tone="default" /></button></view><view class="location-sheet"><view class="sheet-handle" /><text>{{ store.locale !== 'zh-Hans' ? device?.nameEn : device?.name }}</text><span>{{ store.locale !== 'zh-Hans' ? device?.location.labelEn : device?.location.label }} · {{ l('最近一次本机记录', 'Latest local record') }}</span><view class="coordinates">{{ device?.location.lat.toFixed(5) }}, {{ device?.location.lng.toFixed(5) }}</view><button class="btn primary" @click="openDeviceLocation"><SsIcon name="navigation" :size="20" tone="default" />{{ l('系统导航', 'Open Navigation') }}</button></view></view>

    <scroll-view v-else-if="scenario === 'info'" scroll-y class="page-scroll device-info-page">
      <view class="card device-identity"><view class="device-identity-icon"><SsIcon name="propeller" :size="34" tone="brand" /></view><view><text>{{ store.locale !== 'zh-Hans' ? device?.nameEn : device?.name }} <SsStatus :status="device?.status || 'offline'" :label="device?.status === 'online' ? l('在线', 'Online') : l('离线', 'Offline')" /></text><span>{{ device?.model }} · {{ l('1号机房','Engine room 1') }}</span></view></view>
      <text class="group-label">{{ l('设备标识','Device identity') }}</text>
      <view class="list-card info-list"><view v-for="item in [{icon:'hash',label:l('设备序列号','Serial number'),value:'DL300020240101'},{icon:'boxes',label:l('设备类型','Device type'),value:l('顶流机 / 制冰机','Surface jet / ice maker')},{icon:'calendar-check',label:l('激活日期','Activation date'),value:'2026-03-18'},{icon:'map-pin',label:l('安装位置','Installation location'),value:l('1号机房','Engine room 1')}]" :key="item.label" class="list-row"><view class="row-icon"><SsIcon :name="item.icon" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ item.label }}</strong></view><text class="row-value">{{ item.value }}</text></view></view>
      <text class="group-label">{{ l('软硬件版本','Hardware and software') }}</text>
      <view class="list-card info-list"><view class="list-row"><view class="row-icon"><SsIcon name="download" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ l('主板固件','Mainboard firmware') }}</strong><text>{{ l('有新版本 V2.4.1','V2.4.1 available') }}</text></view><SsStatus status="pending" label="V2.3.8" /><SsIcon name="chevron-right" :size="16" tone="disabled" /></view><view class="list-row"><view class="row-icon"><SsIcon name="cpu" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ l('主板型号','Mainboard model') }}</strong></view><text class="row-value">DL-MB-03</text></view><view class="list-row"><view class="row-icon"><SsIcon name="circuit-board" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ l('驱动器版本','Driver version') }}</strong></view><text class="row-value">DRV-1.6.2</text></view></view>
      <text class="group-label">{{ l('使用统计','Usage statistics') }}</text>
      <view class="usage-grid"><view><text>{{ l('累计使用','Lifetime') }}</text><strong>1,286h</strong></view><view><text>{{ l('本月使用','This month') }}</text><strong>120h</strong></view><view><text>{{ l('主板同步','Board sync') }}</text><strong class="success">{{ l('已完成','Completed') }}</strong></view><view><text>{{ l('上次同步','Last sync') }}</text><strong>09:41</strong></view></view>
      <view class="notice info-notice"><SsIcon name="refresh-cw" :size="18" tone="brand-strong" /><view><strong>{{ l('更换主板','Mainboard replacement') }}</strong><text>{{ l('更换主板后，历史累计时长会从云端同步到新主板。','Lifetime history syncs to the new mainboard after replacement.') }}</text></view></view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'mainboard'" scroll-y class="page-scroll with-cta">
      <view class="notice warning"><SsIcon name="history" :size="20" tone="default" /><text>{{ l('更换主板不会清零设备累计运行时长，提交后将记录更换前后固件与操作人。','Replacing the mainboard does not reset lifetime runtime. Previous and new firmware plus the operator are recorded.') }}</text></view>
      <view class="section card board-summary"><view class="icon-tile"><SsIcon name="circuit-board" :size="28" tone="default" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? device?.nameEn : device?.name }}</strong><text>{{ device?.serialNumber }} · {{ l('累计','Lifetime') }} {{ device?.telemetry.runtime || 0 }}h</text></view></view>
      <view class="section card board-form">
        <view class="field"><text class="field-label">{{ l('新主板编号','New board serial') }} *</text><view class="field-control"><SsIcon name="scan-line" :size="20" tone="default" /><input v-model="boardSerial" maxlength="40" /></view></view>
        <view class="field"><text class="field-label">{{ l('新固件版本','New firmware version') }} *</text><view class="field-control"><SsIcon name="package-check" :size="20" tone="default" /><input v-model="boardFirmware" maxlength="20" /></view></view>
        <view class="field"><text class="field-label">{{ l('更换说明','Replacement notes') }}</text><view class="field-control"><textarea v-model="boardNote" maxlength="300" :placeholder="l('记录故障原因、配件来源等','Record the fault, part source, or other notes')" /></view><text class="character-count">{{ boardNote.length }}/300</text></view>
      </view>
    </scroll-view>

    <view v-else-if="scenario === 'playback' && store.designCaseId === 'M08'" class="navigation-view"><image src="/static/assest/backgrounds/map-canvas.png" mode="aspectFill" /><view class="navigation-route"><i/><i/></view><view class="nav-marker start"><SsIcon name="ship-wheel" :size="20" tone="inverse" /></view><view class="nav-marker flag"><SsIcon name="flag" :size="20" tone="brand" /></view><view class="nav-marker anchor"><SsIcon name="anchor" :size="20" tone="warning" /></view><view class="navigation-tools"><button><SsIcon name="locate-fixed" :size="20" tone="default" /></button><button><SsIcon name="layers-3" :size="20" tone="default" /></button></view><view class="navigation-sheet"><view class="navigation-head"><view><strong>{{ l('前往：东侧约点','To: East waypoint') }}</strong><text>{{ l('剩余 2.3km · 预计 9 分钟','2.3 km · 9 min remaining') }}</text></view><SsStatus status="online" :label="l('导航中','Navigating')" /></view><view class="progress"><view class="progress-bar" style="width:42%"/></view><view class="navigation-metrics"><view><text>{{ l('当前速度','Speed') }}</text><strong>15.2km/h</strong></view><view><text>{{ l('航向','Heading') }}</text><strong>086°</strong></view><view class="warning"><text>{{ l('偏差','Deviation') }}</text><strong>18m</strong></view></view><view class="button-row navigation-actions"><button class="btn" @click="running=!running"><SsIcon name="pause" :size="18" tone="default" />{{ l('暂停导航','Pause') }}</button><button class="btn danger" @click="running=false"><SsIcon name="square" :size="18" tone="danger" />{{ l('紧急停止','Emergency stop') }}</button></view></view></view>

    <view v-else-if="scenario === 'route' && store.designCaseId === 'M06'" class="route-design-map"><image src="/static/assest/backgrounds/map-canvas.png" mode="aspectFill" /><view class="route-design-line first"/><view class="route-design-line second"/><view class="route-design-marker device"><SsIcon name="ship-wheel" :size="20" tone="inverse" /></view><view class="route-design-marker flag"><SsIcon name="flag" :size="19" tone="brand" /></view><view class="route-design-marker anchor"><SsIcon name="anchor" :size="19" tone="warning" /></view><view class="route-design-tools"><button><SsIcon name="locate-fixed" :size="20" tone="default" /></button><button><SsIcon name="layers-3" :size="20" tone="default" /></button></view><view class="route-design-sheet"><view class="route-design-head"><view><strong>{{ l('东侧约点 → 避风锚地','East waypoint → Sheltered anchorage') }}</strong><text>{{ l('3 个航点 · 8.4km · 预计 32 分钟','3 waypoints · 8.4 km · 32 min') }}</text></view><SsStatus status="pending" :label="l('草稿','Draft')" /></view><view class="route-design-stages"><view class="done"><span>1</span><text>{{ l('当前位置','Current') }}</text></view><i/><view class="active"><span>2</span><text>{{ l('东侧约点','East waypoint') }}</text></view><i/><view><span>3</span><text>{{ l('避风锚地','Anchorage') }}</text></view></view><view class="button-row route-design-actions"><button class="btn" @click="uni.navigateTo({url:'/pages/process/index?scenario=route&state=sort'})"><SsIcon name="list-restart" :size="18" tone="default" />{{ l('调整航点','Adjust') }}</button><button class="btn primary" @click="saveRoute(true)"><SsIcon name="send" :size="18" tone="inverse" />{{ l('保存并上传','Save & upload') }}</button></view></view></view>

    <scroll-view v-else-if="scenario === 'route' && store.designCaseId === 'M07'" scroll-y class="page-scroll waypoint-sort-page"><view class="notice waypoint-sort-notice"><SsIcon name="list-restart" :size="19" tone="brand-strong" /><view><strong>{{ l('拖动航点可调整顺序','Drag to reorder waypoints') }}</strong><text>{{ l('系统会根据新顺序重新计算距离和预计时间。','Distance and ETA are recalculated for the new order.') }}</text></view></view><view class="list-card waypoint-sort-list"><view v-for="(item,index) in [{name:l('当前位置','Current location'),copy:'24.496218°N, 118.092833°E',skin:'success'},{name:l('东侧约点','East waypoint'),copy:l('距上一点 3.1km','3.1 km from previous'),skin:''},{name:l('避风锚地','Sheltered anchorage'),copy:l('距上一点 5.3km','5.3 km from previous'),skin:'purple'}]" :key="item.name" class="list-row"><span :class="item.skin">{{ index + 1 }}</span><view class="list-copy"><strong>{{ item.name }}</strong><text>{{ item.copy }}</text></view><SsIcon name="grip-vertical" :size="18" tone="muted" /></view></view><button class="waypoint-add-button"><SsIcon name="plus" :size="18" tone="brand" />{{ l('添加航点','Add waypoint') }}</button><view class="waypoint-summary-grid"><view><text>{{ l('总距离','Distance') }}</text><strong>8.4km</strong></view><view><text>{{ l('预计时间','ETA') }}</text><strong>32min</strong></view><view><text>{{ l('平均速度','Average speed') }}</text><strong>15.8km/h</strong></view><view><text>{{ l('航点数量','Waypoints') }}</text><strong>3</strong></view></view><view class="notice warning waypoint-safety"><SsIcon name="shield-alert" :size="18" tone="warning-strong" /><view><strong>{{ l('安全提示','Safety notice') }}</strong><text>{{ l('航线仅作辅助，请结合实际海况和海事规定航行。','Route guidance is advisory. Follow actual sea conditions and maritime rules.') }}</text></view></view></scroll-view>

    <scroll-view v-else-if="scenario === 'route' || scenario === 'playback'" scroll-y class="page-scroll with-cta">
      <view class="notice demo-mode-notice"><SsIcon name="map" :size="19" tone="default" /><text>{{ l('海图为本机离线底图。可拖动航点、调整顺序并保存航迹。','This is an on-device offline chart. Drag waypoints, reorder them, and save the track.') }}</text></view>
      <view v-if="scenario === 'route'" class="route-editor card">
        <view class="field"><label>{{ l('航迹名称','Track name') }} *</label><view class="input-shell"><SsIcon name="route" :size="19" tone="brand" /><input v-model="routeName" maxlength="30" :placeholder="l('请输入航迹名称','Enter track name')" /></view></view>
        <view class="field"><label>{{ l('关联设备','Linked device') }}</label><picker :range="routeDevices" range-key="name" :value="routeDeviceIndex" @change="selectRouteDevice"><view class="input-shell route-device-picker"><view class="route-device-value"><SsIcon name="cpu" :size="19" tone="brand" /><text>{{ routeDeviceLabel }}</text></view><SsIcon name="chevron-down" :size="17" tone="muted" /></view></picker></view>
        <view class="route-selection-head"><view><strong>{{ l('航点顺序','Waypoint order') }}</strong><text>{{ selectedWaypointIds.length }} {{ l('个已选择','selected') }}</text></view><button class="btn small" @click="showWaypointPicker = true"><SsIcon name="list-restart" :size="17" tone="brand-strong" />{{ l('选择航点','Choose') }}</button></view>
      </view>
      <view class="route-map"><image class="route-map-image" src="/static/assest/backgrounds/map-canvas.png" mode="aspectFill" /><view v-if="routeWaypoints.length > 1" class="route-path r1" /><view v-if="routeWaypoints.length > 2" class="route-path r2" /><movable-area v-if="scenario === 'route' && routeWaypoints.length" class="route-movable"><movable-view v-for="(item,index) in routeWaypoints.slice(0,3)" :key="item?.id" class="route-dot movable-dot" direction="all" :x="80 + index * 105" :y="70 + (index % 2) * 80" @change="item && trackWaypointDrag(item.id,$event)" @touchend="item && commitWaypointMove(item.id)">{{ index + 1 }}</movable-view></movable-area><view v-else v-for="(_,index) in routeWaypoints.slice(0,3)" :key="index" class="route-dot" :class="`d${index + 1}`">{{ index + 1 }}</view><view v-if="!routeWaypoints.length" class="route-empty"><SsIcon name="map-pinned" :size="36" tone="default" /><text>{{ availableWaypoints.length ? l('请选择至少两个航点','Choose at least two waypoints') : l('还没有可用航点','No waypoints available') }}</text><button class="btn small primary" @click="availableWaypoints.length ? (showWaypointPicker = true) : uni.navigateTo({url:'/pages/manage/form?entity=waypoints'})">{{ availableWaypoints.length ? l('选择航点','Choose waypoints') : l('新建航点','Add waypoint') }}</button></view></view>
      <view v-if="scenario === 'route' && routeWaypoints.length" class="section list-card"><view v-for="(item,index) in routeWaypoints" :key="item?.id" class="list-row"><view class="sort-buttons"><button :disabled="index===0" @click="moveWaypoint(index,-1)">↑</button><button :disabled="index===routeWaypoints.length-1" @click="moveWaypoint(index,1)">↓</button></view><view class="order">{{ index + 1 }}</view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? `Waypoint ${index + 1}` : item?.name }}</strong><text>{{ item?.lat.toFixed(4) }}, {{ item?.lng.toFixed(4) }}</text></view><button class="icon-action danger" @click="item && removeWaypoint(item.id)"><SsIcon name="trash-2" :size="18" tone="default" /></button></view></view>
      <view v-else-if="scenario === 'playback'" class="playback-card card section"><view class="section-head"><text class="section-title">{{ l('导航进度', 'Navigation Progress') }}</text><SsStatus :status="running ? 'online' : 'pending'" :label="running ? l('导航中', 'Navigating') : l('已暂停', 'Paused')" /></view><view class="progress"><view class="progress-bar" :style="{ width: `${progress}%` }" /></view><view class="playback-data grid-3"><view><text>{{ l('速度', 'Speed') }}</text><strong>6.8kn</strong></view><view><text>{{ l('偏差', 'Deviation') }}</text><strong>12m</strong></view><view><text>{{ l('剩余', 'Remaining') }}</text><strong>18min</strong></view></view><button class="play-button" @click="running ? (running = false) : runProgress(() => running = false)"><SsIcon :name="running ? 'pause' : 'play'" :size="26" tone="default" /></button></view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'bluetooth'" scroll-y class="page-scroll with-cta">
      <view class="notice demo-mode-notice"><SsIcon name="info" :size="19" tone="default" /><text>{{ l('连接完成后会更新设备连接状态，并可继续进入控制流程。','After connecting, the connection state updates and the control flow becomes available.') }}</text></view>
      <view class="bluetooth-stage"><view class="radar"><view class="ripple one" /><view class="ripple two" /><view class="bt-core"><SsIcon name="bluetooth" :size="42" tone="default" /></view></view><text>{{ stage ? l('设备已连接', 'Device Connected') : l('正在发现设备', 'Discovering Devices') }}</text><span>{{ store.locale !== 'zh-Hans' ? device?.nameEn : device?.name }} · {{ device?.serialNumber }}</span></view><view class="connection-rail"><view v-for="(item,index) in [['smartphone',l('手机','Phone')],['bluetooth',l('蓝牙','Bluetooth')],['cpu',l('设备','Device')],['cloud',l('云端','Cloud')]]" :key="item[1]" class="rail" :class="{ done: index < (stage ? 4 : 1), current: index === (stage ? -1 : 1) }"><span><SsIcon :name="item[0]" :size="11" tone="default" /></span><text>{{ item[1] }}</text></view></view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'payment'" scroll-y class="page-scroll with-cta scan-payment-page">
      <view class="payment-order-head">
        <view><text>{{ l('支付子单号','Payment order') }}</text><strong>{{ paymentChildNo }}</strong></view>
        <SsStatus :status="payment?.status || 'pending'" :label="paymentStatusLabel" />
        <view class="payment-parent-link"><text>{{ l('订单编号','Order number') }}</text><strong>{{ payment?.orderNo || '--' }}</strong><span>{{ l(`采购母订单 · 第 ${payment?.installmentNumber || 1} 笔付款`,`Parent order · Installment ${payment?.installmentNumber || 1}`) }}</span></view>
        <span>{{ store.locale !== 'zh-Hans' ? payment?.titleEn : payment?.title }}</span>
        <b>{{ paymentAmount }}</b>
      </view>
      <view v-if="isGlobal" class="notice warning payment-offline-notice"><SsIcon name="info" :size="19" tone="warning" /><text>{{ l('海外业务采用线下外汇结算，付款凭证由财务人工核实。','Overseas business uses offline FX settlement. Finance reviews the proof manually.') }}</text></view>
      <view v-if="paymentPurchase" class="card installment-card">
        <view class="payment-section-head"><view><strong>{{ l(`第 ${payment?.installmentNumber || 1} 笔付款`,`Installment ${payment?.installmentNumber || 1}`) }}</strong><text>{{ l('支持按合同约定分多次付款，全部付清后进入发货','Multiple installments are supported. Shipment starts after full payment.') }}</text></view><span>{{ paymentPurchase.paymentStatus === 'partial' ? l('部分付款','Partial') : l('待付款','Pending') }}</span></view>
        <view class="installment-summary"><view><text>{{ l('订单总额','Order total') }}</text><strong>{{ paymentPurchase.items[0]?.currency === 'USD' ? '$' : '¥' }}{{ Number(paymentPurchase.amount).toFixed(2) }}</strong></view><view><text>{{ l('此前已付','Paid before') }}</text><strong>{{ paymentPurchase.items[0]?.currency === 'USD' ? '$' : '¥' }}{{ Number(previousPaidAmount).toFixed(2) }}</strong></view><view><text>{{ l('当前剩余','Outstanding') }}</text><strong>{{ paymentPurchase.items[0]?.currency === 'USD' ? '$' : '¥' }}{{ Number(paymentPurchase.remainingAmount).toFixed(2) }}</strong></view></view>
        <view v-if="payment?.status === 'pending'" class="installment-amount"><text>{{ l('本次付款金额','This installment') }}</text><view><span>{{ payment?.currency === 'USD' ? '$' : '¥' }}</span><input v-model="paymentAmountInput" type="digit" data-payment-amount :placeholder="String(paymentPurchase.remainingAmount)" /></view><button @click="paymentAmountInput=String(paymentPurchase.remainingAmount)">{{ l('付清余款','Pay balance') }}</button></view>
      </view>
      <view v-if="previousPayments.length" class="card installment-history-card"><view class="payment-section-head"><view><strong>{{ l('历史付款','Payment history') }}</strong><text>{{ l('以下款项已由财务核实并计入母订单','These payments are verified and included in the parent order.') }}</text></view><span>{{ previousPayments.length }} {{ l('笔','paid') }}</span></view><view class="installment-history-list"><view v-for="item in previousPayments" :key="item.id"><view><strong>{{ item.paymentNo || `${item.orderNo}-P${String(Number(item.installmentNumber || 1)).padStart(2,'0')}` }}</strong><text>{{ l(`第 ${item.installmentNumber || 1} 笔`,`Installment ${item.installmentNumber || 1}`) }} · {{ String(item.verifiedAt || item.updatedAt).slice(0,16).replace('T',' ') }}</text></view><b>{{ item.currency === 'USD' ? '$' : '¥' }}{{ Number(item.amount).toFixed(2) }}</b></view></view></view>
      <view class="card payment-qr-card">
        <view class="payment-section-head"><view><strong>{{ l('扫码支付','Scan to pay') }}</strong><text>{{ l('请使用手机扫码，在外部完成付款','Scan with your phone and complete payment externally') }}</text></view><span>{{ l('唯一方式','Only method') }}</span></view>
        <view class="mock-qr" :aria-label="l('演示收款二维码','Demo payment QR code')"><i class="qr-corner c" /><em /></view>
        <view class="qr-merchant"><SsIcon name="landmark" :size="18" tone="brand" /><text>{{ l('鲨鱼妹妹设备服务收款码','Shark Sister equipment service payment code') }}</text></view>
        <view class="payment-instruction"><SsIcon name="shield-check" :size="19" tone="brand" /><text>{{ l('二维码不会自动识别订单或到账金额。付款后请上传与本订单对应的截图，由财务人工核实。','The QR code does not identify the order or amount automatically. Upload the proof for manual finance review.') }}</text></view>
      </view>
      <view class="card payment-proof-card">
        <view class="payment-section-head"><view><strong>{{ l('付款凭证','Payment proof') }}</strong><text>{{ payment?.status === 'pending' ? l('支持 JPG、PNG，单张不超过 5 MB','JPG or PNG, up to 5 MB') : l('凭证已关联当前订单','Proof linked to this order') }}</text></view><SsIcon v-if="paymentProof" name="circle-check" :size="22" tone="success" /><SsIcon v-else name="image-plus" :size="22" tone="brand" /></view>
        <image v-if="paymentProof?.localPath" class="payment-proof-preview" :src="paymentProof.localPath" mode="aspectFill" />
        <button v-if="payment?.status === 'pending'" class="payment-proof-upload" data-action-key="payment-proof-upload" @click="choosePaymentProof"><SsIcon name="image-plus" :size="20" tone="brand" /><view><strong>{{ paymentProof ? l('更换付款凭证','Replace proof') : l('上传付款凭证','Upload proof') }}</strong><text>{{ paymentProof?.name || l('从相册或文件中选择付款截图','Choose a payment screenshot') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
        <view v-else class="payment-proof-state"><SsIcon name="clock-3" :size="20" tone="brand" /><view><strong>{{ paymentStatusLabel }}</strong><text>{{ payment?.status === 'verifying' ? l('财务将根据凭证与收款记录进行人工核对','Finance will compare the proof with the receipt record') : l('财务已完成付款凭证核实','Finance has verified the payment proof') }}</text></view></view>
      </view>
    </scroll-view>

    <scroll-view v-else-if="scenario === 'dealerAnalytics'" scroll-y class="page-scroll analytics-page">
      <view class="analytics-period"><text>{{ l('统计年度','Reporting year') }}</text><button @click="showAnalyticsYears = true">{{ analyticsYear }}<SsIcon name="chevron-down" :size="16" tone="muted" /></button></view>
      <view class="analytics-stats annual-overview section">
        <view><view class="stat-icon"><SsIcon name="shopping-cart" :size="20" tone="brand" /></view><view><text>{{ l('年度销售','Annual sales') }}</text><strong>{{ dealerAnnualMetrics.salesCount }}</strong><span>{{ l('销售额','Revenue') }} {{ salesRevenueLabel }}</span></view></view>
        <view><view class="stat-icon orange"><SsIcon name="wrench" :size="20" tone="warning" /></view><view><text>{{ l('年度售后','Annual service') }}</text><strong>{{ dealerAnnualMetrics.serviceCount }}</strong><span>{{ l('完成率','Completion') }} {{ dealerAnnualMetrics.completionRate }}%</span></view></view>
      </view>
      <view class="analytics-stats growth-overview section">
        <view><view class="stat-icon"><SsIcon name="users-round" :size="20" tone="brand" /></view><view><text>{{ l('用户总数','Total users') }}</text><strong>{{ growthMetrics.userTotal }}</strong><span>{{ l(`本月新增 ${growthMetrics.userNew}` , `${growthMetrics.userNew} added this month`) }}</span></view></view>
        <view><view class="stat-icon orange"><SsIcon name="cpu" :size="20" tone="brand" /></view><view><text>{{ l('设备总数','Total devices') }}</text><strong>{{ growthMetrics.deviceTotal }}</strong><span>{{ l(`本月新增 ${growthMetrics.deviceNew}` , `${growthMetrics.deviceNew} added this month`) }}</span></view></view>
      </view>
      <view class="trend-card section">
        <view class="trend-head"><view><strong>{{ l('销售与售后趋势','Sales and service trends') }}</strong><text>{{ analyticsYear }} · {{ l('单数','Record count') }}</text></view><SsStatus status="online" :label="l('本地数据','Local data')" /></view>
        <view v-if="analyticsHasData" class="analytics-legend"><text><i class="sales"/>{{ l('销售','Sales') }}</text><text><i class="service"/>{{ l('售后','Service') }}</text></view>
        <view v-if="analyticsHasData" class="line-chart" role="img" :aria-label="l('每月销售和售后单数','Monthly sales and service counts')">
          <i v-for="n in 4" :key="n"/>
          <svg viewBox="0 0 334 150" aria-hidden="true"><line :x1="14 + analyticsMonth * 28" y1="12" :x2="14 + analyticsMonth * 28" y2="132" class="month-cursor"/><polyline class="sales-line" :points="analyticsPoints('sales')"/><polyline class="service-line" :points="analyticsPoints('service')"/></svg>
          <view><text>1</text><text>4</text><text>8</text><text>12</text></view>
        </view>
        <view v-else class="analytics-empty"><SsIcon name="chart-no-axes-combined" :size="28" tone="brand" /><text>{{ l('本年度暂无销售或售后记录','No sales or service records this year') }}</text></view>
        <template v-if="analyticsHasData">
          <scroll-view scroll-x class="analytics-month-strip"><view class="analytics-month-options"><button v-for="month in dealerAnnualMetrics.months" :key="month.month" :class="{ active:analyticsMonth === month.month - 1 }" :aria-pressed="analyticsMonth === month.month - 1" @click="analyticsMonth = month.month - 1">{{ month.month }}{{ l('月','') }}</button></view></scroll-view>
          <view class="analytics-month-detail"><strong>{{ selectedAnalyticsMonth.month }}{{ l('月',' / month') }}</strong><text>{{ l('销售','Sales') }} <b>{{ selectedAnalyticsMonth.sales }}</b></text><text>{{ l('售后','Service') }} <b>{{ selectedAnalyticsMonth.service }}</b></text></view>
        </template>
      </view>
      <view class="section">
        <view class="section-head"><text class="section-title">{{ l('经销商售后分布','Dealer service distribution') }}</text><text class="section-meta">{{ l('合计','Total') }} {{ dealerAnnualMetrics.serviceCount }} {{ l('单','records') }}</text></view>
        <view v-if="dealerAnnualMetrics.serviceCount" class="list-card analytics-list">
          <view v-for="item in dealerAnnualMetrics.dealers.filter(row => row.count)" :key="item.id" class="list-row" :data-dealer-id="item.id"><view class="row-icon"><SsIcon name="store" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ store.locale === 'zh-Hans' ? item.name : item.nameEn }}</strong><text>{{ l('已完成','Completed') }} {{ item.completed }} · {{ l('处理中','In progress') }} {{ item.processing }}<template v-if="item.rejected"> · {{ l('已驳回','Rejected') }} {{ item.rejected }}</template></text></view><text class="row-value" :data-count="item.count">{{ item.count }} {{ l('单','') }}</text></view>
        </view>
        <view v-else class="analytics-empty">{{ l('本年度暂无售后记录','No service records this year') }}</view>
      </view>
      <SsActionSheet :show="showAnalyticsYears" :title="l('选择统计年度','Reporting year')" :items="analyticsYears" @cancel="showAnalyticsYears = false" @select="selectAnalyticsYear" />
    </scroll-view>

    <scroll-view v-else-if="scenario === 'deviceDistribution'" scroll-y class="page-scroll distribution-page"><view class="distribution-card card"><view class="donut"><view><text>{{ l('设备总数','Devices') }}</text><strong>128</strong></view></view><view class="distribution-legend"><view v-for="item in [[l('顶流机 / 制冰机','Surface jet / ice maker'),'32 · 25%','brand'],[l('海水淡化器','Desalinator'),'24 · 18.8%','success'],[l('电池组','Battery bank'),'20 · 15.6%','warning'],[l('网络检测仪','Network tester'),'18 · 14.1%','accent']]" :key="String(item[0])"><i :class="String(item[2])"/><text>{{ item[0] }}</text><strong>{{ item[1] }}</strong></view></view></view><view class="section"><view class="section-head"><text class="section-title">{{ l('设备明细','Device details') }}</text><text class="section-meta">{{ l('按数量排序','Sorted by quantity') }}</text></view><view class="list-card distribution-list"><view v-for="item in distributionRows" :key="item.name" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone" /></view><view class="list-copy"><strong>{{ item.name }}</strong><text>{{ item.status }}</text></view><text class="row-value">{{ item.count }}</text><SsIcon name="chevron-right" :size="16" tone="disabled" /></view></view></view><view class="trend-card card section"><view class="trend-head"><view><strong>75%</strong><text>{{ l('设备在线率 · 最近 7 天','Device online rate · Last 7 days') }}</text></view><SsStatus status="online" :label="l('实时','Live')" /></view><view class="line-chart"><i v-for="n in 4" :key="n"/><svg viewBox="0 0 334 140" aria-hidden="true"><polyline points="15,108 45,102 72,74 102,93 132,65 163,54 192,58 224,88 255,67 286,82 318,39"/><circle cx="318" cy="39" r="4"/></svg><view><text>00:00</text><text>08:00</text><text>16:00</text><text>24:00</text></view></view></view></scroll-view>

    <scroll-view v-else-if="scenario === 'report'" scroll-y class="page-scroll report-design-page"><view class="segment report-range-tabs"><view class="segment-item active">{{ l('今日','Today') }}</view><view class="segment-item">7 {{ l('天','days') }}</view><view class="segment-item">30 {{ l('天','days') }}</view><view class="segment-item">{{ l('自定义','Custom') }}</view></view><view class="report-grid section"><view v-for="item in [[l('运行时长','Runtime'),'8.6h'],[l('产量','Output'),'256kg'],[l('平均功率','Average power'),'682W'],[l('峰值电流','Peak current'),'4.1A'],[l('平均水温','Water temperature'),'18.4°C'],[l('告警次数','Alerts'),'0']]" :key="String(item[0])"><text>{{ item[0] }}</text><strong>{{ item[1] }}</strong></view></view><view class="card section report-line-card"><view class="section-head"><view><strong class="report-main-value">704W</strong><text>{{ l('功率 · 今日 00:00-24:00','Power · Today 00:00-24:00') }}</text></view><SsStatus status="online" :label="l('实时','Live')" /></view><view class="design-line-chart"><i v-for="n in 4" :key="n"/><svg viewBox="0 0 334 140" aria-hidden="true"><polyline points="15,108 45,102 72,74 102,93 132,65 163,54 192,58 224,88 255,67 286,82 318,39"/><circle cx="318" cy="39" r="4"/></svg><view><text>00:00</text><text>08:00</text><text>16:00</text><text>24:00</text></view></view></view><view class="section"><view class="section-head"><text class="section-title">{{ l('运行记录','Run history') }}</text><text class="section-meta">{{ l('共 6 条','6 records') }}</text></view><view class="list-card report-records"><view v-for="item in [{icon:'play',tone:'success',skin:'success',title:l('自动模式运行','Automatic mode'),time:l('09:10-09:41 · 31 分钟','09:10-09:41 · 31 min'),value:'704W'},{icon:'pause',tone:'brand',skin:'',title:l('设备待机','Standby'),time:l('08:42-09:10 · 28 分钟','08:42-09:10 · 28 min'),value:'18W'},{icon:'play',tone:'success',skin:'success',title:l('定点模式运行','Fixed mode'),time:l('07:25-08:42 · 1小时17分','07:25-08:42 · 1 h 17 min'),value:'658W'}]" :key="item.title" class="list-row"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.title }}</strong><text>{{ item.time }}</text></view><text class="row-value">{{ item.value }}</text></view></view></view></scroll-view>

    <scroll-view v-else-if="store.designCaseId === 'B11'" scroll-y class="page-scroll logistics-design-page"><view class="card logistics-design-head"><view><strong>{{ l('顺丰速运','SF Express') }}</strong><text>SF1482904820 · {{ l('点击复制','Tap to copy') }}</text></view><SsStatus status="online" :label="l('运输中','In transit')" /></view><view class="card logistics-design-timeline"><view v-for="(item,index) in [{title:l('订单已创建','Order created'),copy:l('厦门海创设备有限公司','Xiamen Haichuang Equipment'),time:'08月10日 10:02',state:'done'},{title:l('快件已揽收','Parcel collected'),copy:l('泉州丰泽营业点','Quanzhou Fengze station'),time:'08月10日 12:18',state:'done'},{title:l('运输中','In transit'),copy:l('离开泉州中转场','Left Quanzhou transfer center'),time:'08月10日 15:42',state:'done'},{title:l('到达厦门集美中转场','Arrived at Xiamen Jimei hub'),copy:l('等待安排派送','Awaiting delivery dispatch'),time:'08月11日 06:28',state:'active'},{title:l('待派送','Awaiting delivery'),copy:l('预计今天送达','Expected today'),time:'',state:''}]" :key="item.title" class="logistics-design-step" :class="item.state"><i/><view><strong>{{ item.title }}</strong><text>{{ item.copy }}</text><span>{{ item.time }}</span></view></view></view><view class="notice logistics-delivery"><SsIcon name="truck" :size="19" tone="brand-strong" /><view><strong>{{ l('预计送达','Estimated delivery') }}</strong><text>{{ l('今天 14:00-18:00，请保持收件电话畅通。','Today 14:00-18:00. Keep your phone available.') }}</text></view></view><button class="btn logistics-contact"><SsIcon name="phone" :size="18" tone="brand" />{{ l('联系快递','Contact courier') }}</button></scroll-view>

    <scroll-view v-else scroll-y class="page-scroll logistics-page">
      <view class="timeline-card card"><view class="tracking-title" @click="copyTracking"><view><text class="card-title">{{ localizedEntityText(shipment?.carrier || l('物流订单', 'Shipment'), store.locale) }}</text><text>{{ shipment?.trackingNumber }}</text></view><SsIcon name="copy" :size="18" tone="default" /></view><text class="caption">{{ l('预计送达', 'Estimated delivery') }} {{ shipment?.estimatedAt.slice(5,16).replace('T',' ') }}</text></view>
      <view class="card section shipment-evidence"><view class="section-head"><text class="section-title">{{ l('发货信息','Dispatch information') }}</text><SsStatus :status="shipment?.status || 'pending'" :label="shipment?.status === 'received' ? l('已签收','Received') : l('运输中','In transit')" /></view><view class="shipment-facts"><view><text>{{ l('发货人','Dispatched by') }}</text><strong>{{ shipment?.dispatchedBy || l('仓库','Warehouse') }}</strong></view><view><text>{{ l('发货时间','Dispatched at') }}</text><strong>{{ shipment?.dispatchedAt?.slice(0,16).replace('T',' ') || '--' }}</strong></view></view><view class="dispatch-photo"><SsIcon name="camera" :size="28" tone="accent" /><view><strong>{{ l('发货现场照片','Dispatch photos') }}</strong><text>{{ shipment?.dispatchAttachmentIds?.length || 0 }} {{ l('张已核验','verified') }}</text></view><SsIcon name="circle-check" :size="21" tone="success" /></view></view>
      <view class="card section shipment-items"><text class="section-title">{{ l('物料清单','Item list') }}</text><view v-for="item in shipment?.items || []" :key="item.id"><view><strong>{{ item.name }}</strong><text>{{ item.sku || l('无 SKU','No SKU') }}</text></view><b>×{{ item.quantity }}</b></view></view>
      <view class="timeline-card card section"><text class="section-title">{{ l('物流轨迹','Shipment timeline') }}</text><view class="timeline"><view v-for="(item,index) in shipment?.events || []" :key="item.id" class="timeline-item" :class="{ active: index === (shipment?.events.length || 1) - 1 }"><i /><view><strong>{{ localizedEntityText(item.status, store.locale) }}</strong><text>{{ localizedEntityText(item.description, store.locale) }}</text><span>{{ item.at.slice(5,16).replace('T',' ') }}</span></view></view></view></view>
    </scroll-view>

    <view v-if="scenario === 'ota' && !externalBlocked" class="fixed-cta"><view v-if="failed" class="button-row"><button class="btn" @click="uni.navigateTo({ url: '/pages/manage/list?entity=tickets' })">{{ l('联系售后', 'Contact Support') }}</button><button class="btn primary" @click="retryOta">{{ l('重新传输', 'Retry Transfer') }}</button></view><view v-else class="button-row"><button v-if="stage === 0 && otaVersion?.available" class="btn" @click="deferOta">{{ l('稍后提醒','Remind me later') }}</button><button class="btn primary" :disabled="running || (stage === 0 && !otaVersion?.available)" @click="advanceOta"><SsIcon v-if="['M10','M11'].includes(store.designCaseId)" :name="running ? 'loader-circle' : stage < 2 ? 'download' : stage === 2 ? 'bluetooth' : 'check'" :size="19" tone="inverse" />{{ running ? `${progress}%` : stage === 0 ? otaVersion?.available ? l('立即更新', 'Update Now') : l('已是最新版本','Up to date') : stage === 1 ? l('下载固件', 'Download Firmware') : stage === 2 ? l('开始传输', 'Start Transfer') : l('完成', 'Done') }}</button></view></view>
    <view v-else-if="scenario === 'mainboard' && accessible" class="fixed-cta"><button class="btn primary" @click="saveMainboard">{{ l('确认登记主板更换', 'Register Replacement') }}</button></view>
    <view v-else-if="scenario === 'route' && !['M06','M07'].includes(store.designCaseId)" class="fixed-cta"><view class="button-row route-save-actions"><button class="btn" @click="saveRoute(false)">{{ l('仅保存', 'Save') }}</button><button class="btn primary" @click="saveRoute(true)">{{ l('保存并上传', 'Save & upload') }}</button></view></view>
    <view v-else-if="scenario === 'bluetooth' && accessible && !externalBlocked" class="fixed-cta"><button class="btn primary" @click="connectBluetooth">{{ stage ? l('重新连接', 'Reconnect') : l('连接设备', 'Connect Device') }}</button></view>
    <view v-else-if="scenario === 'payment'" class="fixed-cta payment-submit-bar"><button v-if="payment?.status === 'pending'" class="btn primary" :disabled="paymentProofPicking" @click="paymentProof ? (showPaymentConfirm = true) : choosePaymentProof()"><SsIcon v-if="paymentProof" name="send" :size="18" tone="inverse" />{{ paymentProof ? l('提交付款凭证','Submit payment proof') : l('上传付款凭证','Upload payment proof') }}</button><button v-else-if="payment?.status === 'verifying' && isLocalDemoCapability('payment')" data-action-key="demo-finance-review" class="btn" @click="simulateFinanceReview"><SsIcon name="shield-check" :size="18" tone="brand" />{{ l('模拟后台财务核实','Simulate finance review') }}</button><button v-else class="btn primary" @click="continuePurchasePayment"><SsIcon :name="nextPendingPayment ? 'wallet-cards' : 'truck'" :size="18" tone="inverse" />{{ nextPendingPayment ? l('继续下一笔付款','Continue next installment') : l('查看物流进度','Track shipment') }}</button></view>

    <view v-if="showWaypointPicker" class="route-picker-layer" @click.self="showWaypointPicker = false">
      <view class="route-picker-sheet">
        <view class="sheet-handle" />
        <view class="route-picker-head"><view><strong>{{ l('选择航点','Choose waypoints') }}</strong><text>{{ l('至少选择两个航点，选择顺序即航行顺序。','Choose at least two. Selection order is the route order.') }}</text></view><button class="icon-button" @click="showWaypointPicker = false"><SsIcon name="x" :size="20" tone="muted" /></button></view>
        <scroll-view scroll-y class="route-picker-list"><view v-for="item in availableWaypoints" :key="item.id" class="list-row" @click="toggleRouteWaypoint(item.id)"><view class="row-icon"><SsIcon name="map-pin" :size="20" tone="brand" /></view><view class="list-copy"><strong>{{ item.name }}</strong><text>{{ item.lat.toFixed(4) }}, {{ item.lng.toFixed(4) }}</text></view><SsIcon v-if="selectedWaypointIds.includes(item.id)" name="circle-check" :size="21" tone="brand" /><view v-else class="route-picker-checkbox" /></view><view v-if="!availableWaypoints.length" class="route-picker-empty">{{ l('暂无航点，请先新建航点','No waypoints. Add a waypoint first.') }}</view></scroll-view>
        <button class="btn primary route-picker-done" @click="showWaypointPicker = false">{{ l('完成选择','Done') }}</button>
      </view>
    </view>

    <SsModal :show="showDanger" :title="l('确认启动设备', 'Start Device?')" :description="l('螺旋桨即将启动。请确认设备周边无人、无绳索及其他障碍物，并保持观察。', 'The propeller is about to start. Keep people, ropes, and other obstacles clear and monitor the device.')" icon="triangle-alert" tone="danger" :confirm-text="l('确认启动', 'Start Device')" @cancel="showDanger = false" @confirm="confirmPower" />
    <SsModal :show="showPaymentConfirm" :title="l('提交付款凭证','Submit payment proof')" :description="l('提交后进入待财务核实，核实前不会计入已付金额或生成发货任务。','Finance must review the proof before it counts as paid or creates a shipment.')" icon="shield-check" tone="warning" :confirm-text="l('确认提交','Submit')" @cancel="showPaymentConfirm=false" @confirm="showPaymentConfirm=false;submitPaymentProof()" />
    <SsModal :show="showResult" :title="payment?.status === 'verifying' ? l('凭证已提交','Proof submitted') : paymentFullyPaid ? l('订单已付清','Order Paid') : l('本次付款已核实','Installment Verified')" :description="payment?.status === 'verifying' ? l('本次付款等待财务核实；当前已付金额与余款暂不变。','Finance review is pending. Paid and remaining balances have not changed.') : paymentFullyPaid ? l('全部款项已核实，仓库发货任务及物流信息已经生成。','The order is fully paid and the shipment record is ready.') : l(`财务已核实 ${paymentPurchase?.paymentCount || 0} 笔付款，可继续支付剩余款项。`,`Finance verified ${paymentPurchase?.paymentCount || 0} installment(s). Continue with the remaining balance.`)" icon="circle-check" tone="success" hide-cancel :confirm-text="payment?.status === 'verifying' ? l('查看支付记录','Payment records') : paymentFullyPaid ? l('查看物流进度','Track Shipment') : l('继续下一笔付款','Next Installment')" @confirm="showResult = false; continuePurchasePayment()" />
    <SsModal :show="commandError" :title="l('设备指令超时', 'Command Timed Out')" :description="l('设备未在规定时间内返回确认。App 未改变本地运行状态，可检查蓝牙或网络后重试。', 'The device did not confirm in time. Local state was unchanged. Check Bluetooth or the network and retry.')" icon="clock-alert" tone="danger" :confirm-text="l('重新发送', 'Send Again')" @cancel="commandError=false" @confirm="commandError=false;sendControl()" />
  </view>
</template>

<style scoped>
.fixed-cta .btn { width: 100%; }.ota-device,.control-status,.order-product { display:flex;align-items:center;gap:18rpx; }.ota-state { display:flex;min-height:420rpx;flex-direction:column;align-items:center;justify-content:center;text-align:center; }.ota-icon { display:flex;width:152rpx;height:152rpx;align-items:center;justify-content:center;color:var(--ss-purple-700);background:var(--ss-purple-50);border-radius:50%; }.ota-state.failed .ota-icon { color:var(--ss-red-700);background:var(--ss-red-50); }.ota-state > text { margin-top:28rpx;font-size:38rpx;font-weight:600; }.ota-state > span { max-width:580rpx;margin-top:12rpx;color:var(--color-text-secondary);font-size:24rpx;line-height:38rpx; }.ota-progress { width:100%;margin-top:34rpx; }.ota-progress strong { display:block;margin-top:10rpx;color:var(--color-action-primary);font-size:24rpx; }.connection-rail { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:28rpx 10rpx 20rpx; }.rail { position:relative;display:flex;min-width:0;flex-direction:column;align-items:center;gap:10rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:center; }.rail::before { position:absolute;z-index:0;top:20rpx;right:50%;width:100%;height:4rpx;content:'';background:var(--color-border-subtle); }.rail:first-child::before { display:none; }.rail span { position:relative;z-index:1;display:flex;width:44rpx;height:44rpx;align-items:center;justify-content:center;color:var(--color-text-secondary);background:#fff;border:4rpx solid var(--ss-neutral-300);border-radius:50%; }.rail.done::before { background:var(--ss-green-500); }.rail.done span { color:#fff;background:var(--ss-green-500);border-color:var(--ss-green-500); }.rail.current span { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary);box-shadow:0 0 0 8rpx var(--color-action-primary-subtle); }.release span { display:block;margin-top:14rpx;color:var(--color-text-body);font-size:24rpx; }.release .caption { margin-top:24rpx; }
.checkout-design-page { padding-top:20rpx; }.checkout-address { display:flex;min-height:116rpx;align-items:center;gap:20rpx;padding:20rpx 24rpx;box-shadow:none; }.checkout-address-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:12rpx; }.checkout-address > view:nth-child(2) { min-width:0;flex:1; }.checkout-address strong,.checkout-address text { display:block; }.checkout-address strong { font-size:27rpx; }.checkout-address text { margin-top:5rpx;overflow:hidden;color:var(--color-text-secondary);font-size:22rpx;text-overflow:ellipsis;white-space:nowrap; }.checkout-products { margin-top:32rpx;padding:25rpx 32rpx;box-shadow:none; }.checkout-products > view { display:flex;align-items:center;justify-content:space-between;gap:18rpx;padding:6rpx 0 18rpx; }.checkout-products > view:last-child { padding:12rpx 0 0; }.checkout-products strong,.checkout-products text { display:block; }.checkout-products strong { font-size:27rpx; }.checkout-products text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.checkout-products > view > strong { flex:0 0 auto;font-weight:500; }.checkout-section-title { display:block;margin:42rpx 0 32rpx;font-size:28rpx;font-weight:600; }.checkout-methods { padding:0 28rpx;box-shadow:none; }.checkout-method { display:flex;min-height:112rpx;align-items:center;gap:20rpx;border-bottom:2rpx solid var(--color-divider); }.checkout-method:last-child { border-bottom:0; }.checkout-method > span { display:flex;width:70rpx;height:70rpx;flex:0 0 70rpx;align-items:center;justify-content:center;background:var(--ss-green-50);border-radius:12rpx; }.checkout-method > span.brand { background:var(--color-action-primary-subtle); }.checkout-method > span.accent { background:var(--ss-purple-50); }.checkout-method > view { min-width:0;flex:1; }.checkout-method strong,.checkout-method text { display:block; }.checkout-method strong { font-size:26rpx; }.checkout-method text { margin-top:3rpx;color:var(--color-text-secondary);font-size:21rpx; }.checkout-method em { flex:0 0 auto;padding:8rpx 14rpx;color:var(--ss-green-700);background:var(--ss-green-50);border-radius:999rpx;font-size:19rpx;font-style:normal; }.checkout-total { margin-top:28rpx;padding:28rpx 32rpx;box-shadow:none; }.checkout-total > view { display:flex;align-items:center;justify-content:space-between;padding:6rpx 0; }.checkout-total text,.checkout-total strong { font-size:28rpx; }.checkout-total i { display:block;height:2rpx;margin:20rpx 0;background:var(--color-divider); }.checkout-total .checkout-due { align-items:baseline; }.checkout-total .checkout-due text { font-weight:600; }.checkout-total .checkout-due strong { font-size:44rpx;font-weight:500; }.checkout-design-cta { top:1338rpx;bottom:auto;padding:0 32rpx;background:transparent;border:0;box-shadow:none; }.checkout-design-cta .btn { min-height:84rpx; }
.scan-payment-page{padding:0 28rpx 210rpx;background:var(--color-bg-canvas)}
.installment-card{margin-top:24rpx;padding:26rpx 28rpx;box-shadow:none}.installment-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10rpx;margin-top:24rpx}.installment-summary>view{min-width:0;padding:18rpx 12rpx;background:var(--color-bg-canvas);border-radius:12rpx;text-align:center}.installment-summary text,.installment-summary strong{display:block}.installment-summary text{color:var(--color-text-secondary);font-size:19rpx;line-height:28rpx}.installment-summary strong{margin-top:6rpx;overflow-wrap:anywhere;font-family:var(--ss-font-data);font-size:24rpx;line-height:32rpx}.installment-amount{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:12rpx;margin-top:24rpx;padding-top:22rpx;border-top:2rpx solid var(--color-divider)}.installment-amount>text{grid-column:1/-1;color:var(--color-text-secondary);font-size:21rpx}.installment-amount>view{display:flex;min-width:0;height:78rpx;align-items:center;padding:0 20rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;box-sizing:border-box}.installment-amount span{flex:0 0 auto;color:var(--color-text-secondary);font-size:25rpx}.installment-amount input{min-width:0;flex:1;padding-left:8rpx;font-family:var(--ss-font-data);font-size:27rpx}.installment-amount button{height:78rpx;padding:0 22rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:12rpx;font-size:21rpx;white-space:nowrap}
.payment-parent-link{grid-column:1/-1;display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4rpx 16rpx;margin-top:12rpx;padding:14rpx 16rpx;background:rgba(255,255,255,.14);border:2rpx solid rgba(255,255,255,.18);border-radius:10rpx}.payment-parent-link text{grid-column:1/-1;color:rgba(255,255,255,.72)!important;font-size:18rpx!important}.payment-parent-link strong{overflow:hidden;font-family:var(--ss-font-data);font-size:21rpx!important;text-overflow:ellipsis;white-space:nowrap}.payment-parent-link span{grid-column:auto!important;margin:0!important;color:#fff!important;font-size:18rpx!important;white-space:nowrap}.installment-history-card{margin-top:24rpx;padding:26rpx 28rpx;box-shadow:none}.installment-history-list{margin-top:18rpx}.installment-history-list>view{display:flex;align-items:center;justify-content:space-between;gap:18rpx;padding:18rpx 0;border-top:2rpx solid var(--color-divider)}.installment-history-list>view>view{min-width:0;flex:1}.installment-history-list strong,.installment-history-list text{display:block}.installment-history-list strong{overflow:hidden;font-family:var(--ss-font-data);font-size:21rpx;text-overflow:ellipsis;white-space:nowrap}.installment-history-list text{margin-top:4rpx;color:var(--color-text-secondary);font-size:18rpx}.installment-history-list b{flex:0 0 auto;font-family:var(--ss-font-data);font-size:23rpx}
.payment-order-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10rpx 20rpx;margin:0 -28rpx 24rpx;padding:30rpx 32rpx 36rpx;color:#fff;background:linear-gradient(140deg,#155bd7,#4a91f5)}
.payment-order-head>view text,.payment-order-head>view strong,.payment-order-head>span,.payment-order-head>b{display:block}.payment-order-head>view text{color:rgba(255,255,255,.74);font-size:21rpx}.payment-order-head>view strong{margin-top:4rpx;font-size:25rpx}.payment-order-head>span{grid-column:1/-1;margin-top:12rpx;color:rgba(255,255,255,.82);font-size:23rpx}.payment-order-head>b{grid-column:1/-1;font-family:var(--ss-font-data);font-size:58rpx;line-height:68rpx;letter-spacing:0}.payment-order-head :deep(.status){color:#155bd7;background:#fff;border-color:rgba(255,255,255,.8)}
.payment-offline-notice{margin:0 0 20rpx}.payment-qr-card,.payment-proof-card{padding:28rpx;border-color:#dce9fb;box-shadow:0 12rpx 36rpx rgba(45,102,173,.09)}.payment-section-head{display:flex;align-items:center;justify-content:space-between;gap:20rpx}.payment-section-head>view{min-width:0}.payment-section-head strong,.payment-section-head text{display:block}.payment-section-head strong{font-size:30rpx}.payment-section-head text{margin-top:6rpx;color:var(--color-text-secondary);font-size:21rpx;line-height:31rpx}.payment-section-head>span{flex:0 0 auto;padding:8rpx 14rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:999rpx;font-size:19rpx}
.mock-qr{position:relative;width:288rpx;height:288rpx;margin:30rpx auto 18rpx;background-color:#fff;background-image:linear-gradient(90deg,#12233b 12rpx,transparent 12rpx),linear-gradient(#12233b 12rpx,transparent 12rpx);background-size:28rpx 28rpx;border:18rpx solid #fff;box-shadow:0 0 0 2rpx #dce6f3,0 12rpx 28rpx rgba(26,68,122,.1)}.mock-qr::before,.mock-qr::after,.qr-corner{position:absolute;z-index:2;width:58rpx;height:58rpx;content:'';background:#fff;border:16rpx solid #12233b;box-sizing:border-box}.mock-qr::before{top:0;left:0}.mock-qr::after{top:0;right:0}.qr-corner.c{right:0;bottom:0}.mock-qr em{position:absolute;z-index:3;top:50%;left:50%;width:58rpx;height:58rpx;background:#fff url('../../static/assest/brand/logo-glyph.png') center/42rpx 42rpx no-repeat;border-radius:10rpx;transform:translate(-50%,-50%);box-shadow:0 2rpx 8rpx rgba(15,60,118,.15)}
.qr-merchant{display:flex;align-items:center;justify-content:center;gap:9rpx;color:var(--color-text-body);font-size:22rpx}.payment-instruction{display:flex;align-items:flex-start;gap:12rpx;margin-top:24rpx;padding:20rpx;color:#315675;background:#f3f8ff;border-radius:12rpx;font-size:21rpx;line-height:32rpx}.payment-instruction>text{min-width:0;flex:1}.payment-proof-card{margin-top:20rpx}.payment-proof-upload,.payment-proof-state{display:flex;width:100%;min-height:112rpx;align-items:center;gap:16rpx;margin-top:22rpx;padding:18rpx 20rpx;background:#f7faff;border:2rpx dashed #bfd5f3;border-radius:14rpx;text-align:left}.payment-proof-upload>view,.payment-proof-state>view{min-width:0;flex:1}.payment-proof-upload strong,.payment-proof-upload text,.payment-proof-state strong,.payment-proof-state text{display:block}.payment-proof-upload strong,.payment-proof-state strong{font-size:25rpx}.payment-proof-upload text,.payment-proof-state text{margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:30rpx;overflow-wrap:anywhere}.payment-proof-preview{display:block;width:100%;height:250rpx;margin-top:22rpx;border-radius:12rpx}.payment-proof-state{background:var(--ss-orange-50);border-style:solid;border-color:#f5d5a3}.payment-submit-bar{box-shadow:0 -14rpx 36rpx rgba(23,66,121,.08)}
.empty-business { display:flex;min-height:680rpx;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--ss-orange-700); }.empty-business > text { margin-top:18rpx;color:var(--color-text-primary);font-size:32rpx;font-weight:600; }.empty-business > span { margin:10rpx 0 28rpx;color:var(--color-text-secondary);font-size:23rpx; }.sort-buttons { display:flex;flex-direction:column;gap:4rpx; }.sort-buttons button,.icon-action { display:flex;width:44rpx;height:40rpx;align-items:center;justify-content:center;background:transparent;border:0;font-size:20rpx; }.icon-action.danger { color:var(--ss-red-700); }.compact { margin-top:26rpx; }.analytics-hero { text-align:center; }.analytics-hero text,.analytics-hero strong,.analytics-hero span { display:block; }.analytics-hero text { color:var(--color-text-secondary);font-size:23rpx; }.analytics-hero strong { margin:10rpx 0;font-size:64rpx; }.analytics-hero span { color:var(--ss-green-700);font-size:21rpx; }
.integration-blocked .notice { max-width:620rpx;margin:0 0 28rpx;text-align:left; }
.power-stage { display:flex;min-height:390rpx;flex-direction:column;align-items:center;justify-content:center; }.power-button { display:flex;width:180rpx;height:180rpx;align-items:center;justify-content:center;color:var(--color-text-secondary);background:#fff;border:8rpx solid var(--color-bg-subtle);border-radius:50%;box-shadow:var(--shadow-floating); }.power-stage.on .power-button { color:#fff;background:var(--ss-green-500);border-color:var(--ss-green-50);box-shadow:0 0 0 24rpx rgba(22,195,125,.08),var(--shadow-floating); }.power-stage > text { margin-top:28rpx;font-size:34rpx;font-weight:600; }.power-stage > span { margin-top:8rpx;color:var(--color-text-secondary);font-size:23rpx; }.control-panel { padding:24rpx; }.slider-head { display:flex;justify-content:space-between;margin:32rpx 0 8rpx;font-size:24rpx; }.slider-head strong { color:var(--color-action-primary); }.emergency { display:flex;width:100%;height:104rpx;align-items:center;justify-content:center;gap:14rpx;margin-top:24rpx;color:var(--ss-red-700);background:var(--ss-red-50);border:2rpx solid #f8c8cd;border-radius:16rpx;font-weight:600; }
.direction-pad { display:grid;width:304rpx;grid-template-columns:repeat(3,88rpx);grid-template-rows:repeat(3,72rpx);gap:8rpx;margin:18rpx auto 0;justify-content:center; }.direction-pad button { display:flex;align-items:center;justify-content:center;color:var(--color-text-secondary);background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.direction-pad button.active { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary); }.direction-pad button:nth-child(1) { grid-column:2; }.direction-pad button:nth-child(2) { grid-column:1;grid-row:2; }.direction-pad button:nth-child(3) { grid-column:2;grid-row:2; }.direction-pad button:nth-child(4) { grid-column:3;grid-row:2; }.direction-pad button:nth-child(5) { grid-column:2;grid-row:3; }.control-row { display:flex;align-items:center;justify-content:space-between;gap:20rpx;margin-top:26rpx;padding-top:24rpx;border-top:2rpx solid var(--color-divider); }.control-row strong,.control-row text { display:block; }.control-row strong { font-size:24rpx; }.control-row text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.control-row .button-row { flex:0 0 auto;gap:8rpx; }.control-row .btn { min-width:82rpx;padding:0 12rpx; }
.remote-control-page { padding-top:16rpx; }.control-live-notice { margin-bottom:24rpx;align-items:flex-start; }.control-live-notice > view { min-width:0;flex:1; }.control-live-notice strong,.control-live-notice text { display:block; }.control-live-notice text { margin-top:5rpx; }.control-power-stage { display:flex;flex-direction:column;align-items:center;padding-top:4rpx;text-align:center; }.control-power-stage button { display:flex;width:148rpx;height:148rpx;align-items:center;justify-content:center;background:#fff;border:8rpx solid #eef2f7;border-radius:50%;box-shadow:0 14rpx 34rpx rgba(15,23,42,.1); }.control-power-stage.on button { background:var(--ss-green-700);border-color:var(--ss-green-50);box-shadow:0 0 0 14rpx rgba(16,185,129,.08),0 14rpx 34rpx rgba(15,23,42,.1); }.control-power-stage strong { margin-top:26rpx;font-size:28rpx; }.control-power-stage text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }
.round-direction-pad { display:grid;width:360rpx;height:360rpx;grid-template-columns:repeat(3,96rpx);grid-template-rows:repeat(3,96rpx);align-content:center;justify-content:center;gap:8rpx;margin:34rpx auto 30rpx;background:#edf3fb;border:2rpx solid #dce5f0;border-radius:50%; }.round-direction-pad button { display:flex;align-items:center;justify-content:center;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:50%; }.round-direction-pad button:nth-child(1) { grid-column:2; }.round-direction-pad button:nth-child(2) { grid-column:1;grid-row:2; }.round-direction-pad button:nth-child(3) { grid-column:2;grid-row:2; }.round-direction-pad button:nth-child(4) { grid-column:3;grid-row:2; }.round-direction-pad button:nth-child(5) { grid-column:2;grid-row:3; }.round-direction-pad .stop { background:var(--ss-red-50);border-color:#f8c8cd; }
.remote-mode-card { padding:30rpx 32rpx;box-shadow:none; }.remote-mode-card .segment { height:68rpx; }.remote-thrust-head { display:flex;align-items:flex-end;justify-content:space-between;margin-top:30rpx; }.remote-thrust-head text,.remote-thrust-head strong { display:block; }.remote-thrust-head text { color:var(--color-text-secondary);font-size:21rpx; }.remote-thrust-head strong { margin-top:4rpx;font-size:42rpx;line-height:48rpx; }.remote-mode-card slider { margin:6rpx -8rpx 0; }
.report-range-tabs .segment-item { min-width:0;cursor:pointer; }.report-grid .card { margin:0;padding:24rpx; }.report-grid text,.report-grid strong,.report-grid span { display:block; }.report-grid text { color:var(--color-text-secondary);font-size:22rpx; }.report-grid strong { margin:8rpx 0;font-size:34rpx;font-weight:600; }.report-grid span { color:var(--ss-green-700);font-size:20rpx; }.report-grid .orange { color:var(--ss-orange-700); }.chart-range { display:block;margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.report-chart { display:flex;height:240rpx;align-items:flex-end;justify-content:space-between;gap:12rpx;padding:20rpx 8rpx;border-bottom:2rpx solid var(--color-divider); }.report-chart view { min-width:12rpx;max-width:30rpx;flex:1;background:linear-gradient(180deg,#2872f8,#b8d5ff);border-radius:8rpx 8rpx 2rpx 2rpx;transition:height .22s ease; }.axis { display:flex;justify-content:space-between;margin-top:12rpx;color:var(--color-text-secondary);font-size:19rpx; }
.report-main-value { display:block;margin-top:12rpx;font-size:42rpx; }.distribution-card { display:grid;grid-template-columns:240rpx minmax(0,1fr);align-items:center;gap:20rpx; }.donut { display:flex;width:220rpx;height:220rpx;align-items:center;justify-content:center;background:conic-gradient(var(--ss-brand-500) 0 25%,var(--ss-green-500) 25% 43.8%,var(--ss-orange-500) 43.8% 59.4%,#6941c6 59.4% 100%);border-radius:50%; }.donut::before { position:absolute;width:132rpx;height:132rpx;content:'';background:#fff;border-radius:50%; }.donut > view { position:relative;z-index:1;text-align:center; }.donut text,.donut strong { display:block; }.donut text { color:var(--color-text-secondary);font-size:19rpx; }.donut strong { font-size:38rpx; }.distribution-legend view { display:grid;grid-template-columns:18rpx minmax(0,1fr) auto;align-items:center;gap:10rpx;padding:10rpx 0;border-bottom:2rpx solid var(--color-divider); }.distribution-legend i { width:14rpx;height:14rpx;background:var(--ss-brand-500);border-radius:4rpx; }.distribution-legend i.success { background:var(--ss-green-500); }.distribution-legend i.warning { background:var(--ss-orange-500); }.distribution-legend i.accent { background:#6941c6; }.distribution-legend text,.distribution-legend strong { font-size:20rpx; }.distribution-legend strong { white-space:nowrap; }
.section-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:14rpx; }.section-title { font-size:28rpx;font-weight:600; }.section-meta { color:var(--color-text-secondary);font-size:21rpx; }
.distribution-page .distribution-card { padding:28rpx 30rpx; }.distribution-page .donut { width:204rpx;height:204rpx; }.distribution-page .donut::before { width:122rpx;height:122rpx; }.distribution-list .list-row,.analytics-list .list-row { min-height:106rpx;padding:14rpx 24rpx;gap:18rpx; }.distribution-list .row-icon,.analytics-list .row-icon,.info-list .row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.distribution-list .row-icon.green,.analytics-list .row-icon.green { background:var(--ss-green-50); }.distribution-list .row-icon.orange,.analytics-list .row-icon.orange { background:var(--ss-orange-50); }.distribution-list .row-icon.purple,.analytics-list .row-icon.purple { background:var(--ss-purple-50); }.row-value { flex:0 0 auto;color:var(--color-text-body);font-size:22rpx;white-space:nowrap; }
.trend-card { padding:24rpx; }.trend-head { display:flex;align-items:flex-start;justify-content:space-between; }.trend-head strong,.trend-head text { display:block; }.trend-head strong { font-size:32rpx; }.trend-head text { margin-top:2rpx;color:var(--color-text-secondary);font-size:21rpx; }.line-chart { position:relative;height:292rpx;margin-top:8rpx;overflow:hidden; }.line-chart > i { position:absolute;right:0;left:0;height:2rpx;background:var(--color-divider); }.line-chart > i:nth-child(1) { top:35rpx; }.line-chart > i:nth-child(2) { top:103rpx; }.line-chart > i:nth-child(3) { top:171rpx; }.line-chart > i:nth-child(4) { top:239rpx; }.line-chart svg { position:absolute;inset:0 0 22rpx;width:100%;height:270rpx;overflow:visible; }.line-chart polyline { fill:none;stroke:var(--ss-brand-500);stroke-width:2.5;vector-effect:non-scaling-stroke; }.line-chart circle { fill:#fff;stroke:var(--ss-brand-500);stroke-width:2;vector-effect:non-scaling-stroke; }.line-chart > view { position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;color:var(--color-text-secondary);font-size:17rpx; }
.analytics-stats { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18rpx; }.analytics-stats > view { display:flex;min-height:160rpx;align-items:center;gap:18rpx;padding:22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.stat-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.stat-icon.orange { background:var(--ss-orange-50); }.stat-icon.green { background:var(--ss-green-50); }.analytics-stats text,.analytics-stats strong,.analytics-stats span { display:block; }.analytics-stats text { color:var(--color-text-secondary);font-size:21rpx; }.analytics-stats strong { margin-top:2rpx;font-size:38rpx; }.analytics-stats span { color:var(--ss-green-700);font-size:19rpx; }.analytics-page .trend-card { margin-top:26rpx; }
.analytics-page > .report-range-tabs { display:none; }
.annual-overview > view { min-height:144rpx; }.analytics-legend { display:flex;justify-content:flex-end;gap:24rpx;margin:18rpx 0 4rpx;color:var(--color-text-secondary);font-size:19rpx; }.analytics-legend text { display:flex;align-items:center;gap:8rpx; }.analytics-legend i { width:22rpx;height:5rpx;background:var(--color-action-primary);border-radius:3rpx; }.analytics-legend i.service { background:var(--ss-orange-500); }.line-chart .sales-line { stroke:var(--color-action-primary); }.line-chart .service-line { stroke:var(--ss-orange-500); }
.device-info-page { padding-top:20rpx; }.device-identity { display:flex;min-height:176rpx;align-items:center;gap:28rpx;padding:30rpx; }.device-identity-icon { display:flex;width:128rpx;height:128rpx;flex:0 0 128rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:16rpx; }.device-identity > view:last-child { min-width:0;flex:1; }.device-identity > view:last-child > text { display:flex;align-items:center;gap:12rpx;font-size:31rpx;font-weight:600; }.device-identity span { display:block;margin-top:8rpx;color:var(--color-text-secondary);font-size:22rpx; }.group-label { display:block;margin:30rpx 0 12rpx;color:var(--color-text-secondary);font-size:21rpx;font-weight:600; }.info-list .list-row { min-height:100rpx;padding:12rpx 24rpx;gap:18rpx; }.info-list .row-icon { width:68rpx;height:68rpx;flex-basis:68rpx; }.info-list .list-copy strong { font-size:24rpx; }.info-list .list-copy text { font-size:19rpx; }.usage-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx; }.usage-grid > view { min-height:116rpx;padding:22rpx 24rpx;background:#f8fafe;border-radius:14rpx; }.usage-grid text,.usage-grid strong { display:block; }.usage-grid text { color:var(--color-text-secondary);font-size:21rpx; }.usage-grid strong { margin-top:6rpx;font-size:28rpx; }.usage-grid .success { color:var(--ss-green-700); }.info-notice { margin-top:26rpx;align-items:flex-start; }.info-notice > view { min-width:0;flex:1; }.info-notice strong,.info-notice text { display:block; }.info-notice strong { font-size:23rpx; }.info-notice text { margin-top:4rpx;font-size:20rpx;line-height:31rpx; }
.location-view { position:relative;height:calc(100vh - var(--status-bar-height) - 96rpx);overflow:hidden; }.location-view > image { position:absolute;inset:0;width:100%;height:100%; }.location-pin { position:absolute;top:34%;left:48%;display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;color:#fff;background:var(--color-action-primary);border:8rpx solid #fff;border-radius:50%;box-shadow:var(--shadow-floating); }.location-controls { position:absolute;top:160rpx;right:28rpx;display:flex;flex-direction:column;gap:12rpx; }.location-controls button { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.location-sheet { position:absolute;right:20rpx;bottom:24rpx;left:20rpx;padding:16rpx 28rpx 28rpx;background:#fff;border-radius:24rpx;box-shadow:var(--shadow-floating); }.sheet-handle { width:72rpx;height:8rpx;margin:0 auto 20rpx;background:var(--ss-neutral-300);border-radius:999rpx; }.location-sheet > text,.location-sheet > span { display:block; }.location-sheet > text { font-size:30rpx;font-weight:600; }.location-sheet > span { margin-top:6rpx;color:var(--color-text-secondary);font-size:23rpx; }.coordinates { margin:20rpx 0;padding:18rpx;background:var(--color-bg-canvas);border-radius:12rpx;font-family:monospace;text-align:center; }
.design-location-map { position:relative;height:240rpx;overflow:hidden;border-radius:16rpx; }.design-location-map > image { width:100%;height:100%; }.design-map-marker { position:absolute;top:78rpx;left:calc(62% - 32rpx);display:flex;width:64rpx;height:64rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50% 50% 50% 10rpx;box-shadow:0 8rpx 18rpx rgba(15,23,42,.24);transform:rotate(-45deg); }.design-map-marker .ss-icon { transform:rotate(45deg); }.design-location-summary { margin-top:20rpx;padding:28rpx;box-shadow:none; }.design-location-summary .section-head strong,.design-location-summary .section-head text { display:block; }.design-location-summary .section-head strong { font-size:31rpx; }.design-location-summary .section-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.design-location-metrics { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:24rpx; }.design-location-metrics > view { padding:20rpx 24rpx;background:var(--color-bg-canvas);border-radius:12rpx; }.design-location-metrics text,.design-location-metrics strong { display:block; }.design-location-metrics text { color:var(--color-text-secondary);font-size:21rpx; }.design-location-metrics strong { margin-top:8rpx;font-size:28rpx; }.design-location-actions .list-row { min-height:96rpx; }.design-location-notice { margin-top:30rpx; }.design-location-notice strong,.design-location-notice text { display:block; }.design-location-notice text { margin-top:5rpx; }
.report-design-page .report-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:18rpx;background:transparent; }.report-design-page .report-grid > view { min-height:116rpx;padding:20rpx 24rpx;background:rgba(255,255,255,.42); }.report-design-page .report-grid text,.report-design-page .report-grid strong { display:block; }.report-design-page .report-grid text { color:var(--color-text-secondary);font-size:20rpx; }.report-design-page .report-grid strong { margin-top:7rpx;font-size:30rpx; }.report-line-card { padding:24rpx;box-shadow:none; }.report-line-card .section-head > view text { display:block;margin-top:3rpx;color:var(--color-text-secondary);font-size:20rpx; }.design-line-chart { position:relative;height:260rpx;margin-top:18rpx; }.design-line-chart > i { display:block;height:2rpx;margin-top:52rpx;background:var(--color-divider); }.design-line-chart svg { position:absolute;inset:4rpx 8rpx 34rpx;width:calc(100% - 16rpx);height:calc(100% - 38rpx);overflow:visible; }.design-line-chart polyline { fill:none;stroke:var(--color-action-primary);stroke-width:3; }.design-line-chart circle { fill:#fff;stroke:var(--color-action-primary);stroke-width:3; }.design-line-chart > view { position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;color:var(--color-text-secondary);font-size:17rpx; }.report-records .list-row { min-height:100rpx; }
.identity-card { display:flex;flex-direction:column;align-items:center;text-align:center; }.identity-icon { display:flex;width:144rpx;height:144rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:24rpx; }.identity-card > text { margin-top:20rpx;font-size:32rpx;font-weight:600; }.identity-card > span { margin:6rpx 0 12rpx;color:var(--color-text-secondary);font-size:22rpx; }.info-row { display:flex;min-height:88rpx;align-items:center;justify-content:space-between;gap:20rpx;padding:16rpx 24rpx;border-bottom:2rpx solid var(--color-divider); }.info-row:last-child { border-bottom:0; }.info-row text { color:var(--color-text-secondary);font-size:23rpx; }.info-row strong { max-width:62%;font-size:24rpx;text-align:right; }
.board-summary { display:flex;align-items:center;gap:18rpx; }.board-form { padding-bottom:4rpx; }.board-form .field:last-child { margin-bottom:0; }.character-count { display:block;margin-top:8rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:right; }
.route-map { position:relative;height:420rpx;overflow:hidden;background:#d9ebff;border:2rpx solid var(--ss-brand-200);border-radius:20rpx;isolation:isolate; }.route-map-image { position:absolute;z-index:0;inset:0;width:100%;height:100%;opacity:1; }.route-path { position:absolute;z-index:1;height:6rpx;background:var(--ss-brand-500);border:3rpx solid #fff;border-radius:999rpx;transform-origin:left center; }.r1 { top:180rpx;left:150rpx;width:260rpx;transform:rotate(23deg); }.r2 { top:280rpx;left:382rpx;width:210rpx;transform:rotate(-35deg); }.route-dot { position:absolute;z-index:3;display:flex;width:56rpx;height:56rpx;align-items:center;justify-content:center;color:#fff;background:var(--color-action-primary);border:5rpx solid #fff;border-radius:50%;font-size:20rpx;font-weight:600; }.d1 { top:142rpx;left:120rpx; }.d2 { top:234rpx;left:365rpx; }.d3 { top:158rpx;right:85rpx; }.route-empty { position:absolute;z-index:4;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16rpx;color:var(--color-text-secondary);background:rgba(255,255,255,.7); }.order { display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;color:#fff;background:var(--color-action-primary);border-radius:50%;font-size:21rpx; }.playback-card { position:relative; }.playback-data { margin-top:28rpx; }.playback-data view { text-align:center; }.playback-data text,.playback-data strong { display:block; }.playback-data text { color:var(--color-text-secondary);font-size:21rpx; }.playback-data strong { margin-top:6rpx;font-size:27rpx; }.play-button { display:flex;width:96rpx;height:96rpx;align-items:center;justify-content:center;margin:30rpx auto 0;color:#fff;background:var(--color-action-primary);border-radius:50%;box-shadow:var(--shadow-floating); }
.navigation-view { position:relative;height:calc(100vh - var(--ss-status-bar-height) - 96rpx);overflow:hidden;background:#d9ebff; }.navigation-view > image { position:absolute;inset:0;width:100%;height:100%; }.navigation-route { position:absolute;z-index:2;top:180rpx;left:300rpx;width:280rpx;height:780rpx; }.navigation-route i { position:absolute;width:7rpx;height:430rpx;background:repeating-linear-gradient(to bottom,var(--ss-brand-500) 0 18rpx,transparent 18rpx 30rpx);transform:rotate(-35deg); }.navigation-route i:last-child { top:340rpx;left:-8rpx;height:370rpx;transform:rotate(39deg); }.nav-marker { position:absolute;z-index:3;display:flex;width:72rpx;height:72rpx;align-items:center;justify-content:center;background:#fff;border-radius:50%;box-shadow:var(--shadow-floating); }.nav-marker.start { top:210rpx;left:245rpx;background:var(--color-action-primary);border:5rpx solid #fff; }.nav-marker.flag { top:478rpx;right:220rpx; }.nav-marker.anchor { top:650rpx;left:330rpx; }.navigation-tools { position:absolute;z-index:5;top:28rpx;right:28rpx;display:flex;flex-direction:column;gap:12rpx; }.navigation-tools button { display:flex;width:84rpx;height:84rpx;align-items:center;justify-content:center;background:#fff;border:0;border-radius:14rpx;box-shadow:var(--shadow-card); }.navigation-sheet { position:absolute;z-index:6;right:24rpx;bottom:22rpx;left:24rpx;padding:26rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx;box-shadow:var(--shadow-floating); }.navigation-head { display:flex;align-items:flex-start;justify-content:space-between;gap:18rpx; }.navigation-head strong,.navigation-head text { display:block; }.navigation-head strong { font-size:26rpx; }.navigation-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.navigation-sheet .progress { margin-top:18rpx; }.navigation-metrics { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14rpx;margin-top:20rpx; }.navigation-metrics > view { min-height:126rpx;padding:20rpx;background:var(--color-bg-canvas);border-radius:14rpx; }.navigation-metrics > view.warning { background:var(--ss-orange-50);border:2rpx solid #ffdca8; }.navigation-metrics text,.navigation-metrics strong { display:block; }.navigation-metrics text { color:var(--color-text-secondary);font-size:19rpx; }.navigation-metrics strong { margin-top:8rpx;font-size:26rpx; }.navigation-metrics .warning strong { color:var(--ss-orange-700); }.navigation-actions { margin-top:18rpx; }.navigation-actions .btn { min-width:0;padding:0 12rpx;font-size:22rpx; }
.route-design-map { position:relative;height:calc(100vh - var(--ss-status-bar-height) - 96rpx);overflow:hidden; }.route-design-map > image { position:absolute;inset:0;width:100%;height:100%; }.route-design-line { position:absolute;z-index:1;height:5rpx;background:var(--color-action-primary);border-radius:999rpx;transform-origin:left center; }.route-design-line.first { top:300rpx;left:278rpx;width:250rpx;transform:rotate(55deg); }.route-design-line.second { top:504rpx;left:418rpx;width:195rpx;transform:rotate(138deg); }.route-design-marker { position:absolute;z-index:3;display:flex;width:66rpx;height:66rpx;align-items:center;justify-content:center;background:#fff;border-radius:50%;box-shadow:var(--shadow-floating); }.route-design-marker.device { top:246rpx;left:224rpx;background:var(--color-action-primary); }.route-design-marker.flag { top:448rpx;left:472rpx; }.route-design-marker.anchor { top:542rpx;left:322rpx; }.route-design-tools { position:absolute;top:28rpx;right:28rpx;display:flex;flex-direction:column;gap:12rpx; }.route-design-tools button { display:flex;width:84rpx;height:84rpx;align-items:center;justify-content:center;background:#fff;border:0;border-radius:14rpx; }.route-design-sheet { position:absolute;right:24rpx;bottom:24rpx;left:24rpx;padding:28rpx;background:#fff;border-radius:18rpx;box-shadow:var(--shadow-floating); }.route-design-head { display:flex;align-items:flex-start;justify-content:space-between;gap:16rpx; }.route-design-head strong,.route-design-head text { display:block; }.route-design-head strong { font-size:25rpx; }.route-design-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.route-design-stages { display:grid;grid-template-columns:1fr 50rpx 1fr 50rpx 1fr;align-items:start;margin-top:22rpx; }.route-design-stages > view { display:flex;flex-direction:column;align-items:center;gap:7rpx;color:var(--color-text-secondary);font-size:17rpx;text-align:center; }.route-design-stages span { display:flex;width:38rpx;height:38rpx;align-items:center;justify-content:center;background:#fff;border:3rpx solid var(--color-border-subtle);border-radius:50%; }.route-design-stages .done span { color:#fff;background:var(--ss-green-500);border-color:var(--ss-green-500); }.route-design-stages .active span { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary); }.route-design-stages i { height:3rpx;margin-top:18rpx;background:var(--color-border-subtle); }.route-design-actions { margin-top:22rpx; }.route-design-actions .btn { min-width:0; }.waypoint-sort-notice strong,.waypoint-sort-notice text,.waypoint-safety strong,.waypoint-safety text { display:block; }.waypoint-sort-notice text,.waypoint-safety text { margin-top:4rpx; }.waypoint-sort-list { margin-top:32rpx; }.waypoint-sort-list .list-row { min-height:100rpx; }.waypoint-sort-list .list-row > span { display:flex;width:70rpx;height:70rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:12rpx;font-size:22rpx; }.waypoint-sort-list .list-row > span.success { color:var(--ss-green-700);background:var(--ss-green-50); }.waypoint-sort-list .list-row > span.purple { color:var(--ss-purple-700);background:var(--ss-purple-50); }.waypoint-add-button { display:flex;width:100%;height:86rpx;align-items:center;justify-content:center;gap:10rpx;margin-top:28rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:12rpx;font-size:23rpx; }.waypoint-summary-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:30rpx;padding:26rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }.waypoint-summary-grid > view { padding:18rpx 24rpx;background:var(--color-bg-canvas);border-radius:12rpx; }.waypoint-summary-grid text,.waypoint-summary-grid strong { display:block; }.waypoint-summary-grid text { color:var(--color-text-secondary);font-size:20rpx; }.waypoint-summary-grid strong { margin-top:7rpx;font-size:27rpx; }.waypoint-safety { margin-top:30rpx; }
.route-movable { position:absolute;z-index:2;inset:0;width:100%;height:100%;background:transparent; }.movable-dot { position:relative;box-sizing:border-box;box-shadow:var(--shadow-card); }.tracking-title { display:flex;align-items:center;justify-content:space-between;gap:18rpx;color:var(--color-action-primary); }.tracking-title .card-title { min-width:0;color:var(--color-text-primary); }
.logistics-design-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx;padding:28rpx;box-shadow:none; }.logistics-design-head > view { min-width:0;flex:1; }.logistics-design-head strong,.logistics-design-head text { display:block; }.logistics-design-head strong { font-size:30rpx; }.logistics-design-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.logistics-design-timeline { margin-top:34rpx;padding:38rpx 32rpx;box-shadow:none; }.logistics-design-step { position:relative;display:flex;gap:24rpx;padding-bottom:28rpx; }.logistics-design-step::before { position:absolute;top:18rpx;bottom:0;left:9rpx;width:2rpx;content:'';background:var(--color-divider); }.logistics-design-step:last-child { padding-bottom:0; }.logistics-design-step:last-child::before { display:none; }.logistics-design-step > i { position:relative;z-index:1;width:20rpx;height:20rpx;flex:0 0 20rpx;margin-top:4rpx;background:#fff;border:4rpx solid var(--ss-neutral-300);border-radius:50%; }.logistics-design-step.done > i { background:var(--ss-green-500);border-color:var(--ss-green-500); }.logistics-design-step.active > i { background:var(--color-action-primary);border-color:var(--color-action-primary);box-shadow:0 0 0 8rpx var(--color-action-primary-subtle); }.logistics-design-step strong,.logistics-design-step text,.logistics-design-step span { display:block; }.logistics-design-step strong { font-size:24rpx; }.logistics-design-step text,.logistics-design-step span { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.logistics-delivery { margin-top:32rpx; }.logistics-delivery strong,.logistics-delivery text { display:block; }.logistics-delivery text { margin-top:4rpx; }.logistics-contact { width:100%;margin-top:32rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200); }
.demo-mode-notice { margin-bottom:20rpx; }.custom-range { display:grid;grid-template-columns:minmax(0,1fr) 36rpx minmax(0,1fr);align-items:center;gap:8rpx;padding:22rpx; }.custom-range picker { min-width:0;padding:12rpx;background:var(--color-bg-canvas);border-radius:12rpx; }.custom-range text,.custom-range strong { display:block; }.custom-range text { color:var(--color-text-secondary);font-size:20rpx; }.custom-range strong { margin-top:6rpx;font-size:24rpx; }
.settings-sync-notice strong,.settings-sync-notice text,.settings-capability strong,.settings-capability text { display:block; }.settings-sync-notice text,.settings-capability text { margin-top:4rpx; }.design-setting-fields { margin-top:32rpx;padding:14rpx 28rpx;box-shadow:none; }.design-setting-field { padding:18rpx 0; }.design-setting-field > text { display:block;margin-bottom:10rpx;font-size:22rpx;font-weight:600; }.design-setting-field > view { display:flex;min-height:78rpx;align-items:center;justify-content:space-between;padding:0 22rpx;border:2rpx solid var(--color-border-subtle);border-radius:12rpx; }.design-setting-field strong { font-size:24rpx;font-weight:500; }.settings-group-label { display:block;margin:30rpx 0 14rpx;font-size:25rpx;font-weight:600; }.design-safety-list .list-row { min-height:108rpx; }.settings-capability { margin-top:30rpx; }
.bluetooth-stage { display:flex;min-height:500rpx;flex-direction:column;align-items:center;justify-content:center; }.radar { position:relative;display:flex;width:260rpx;height:260rpx;align-items:center;justify-content:center; }.ripple { position:absolute;border:2rpx solid var(--ss-brand-200);border-radius:50%;animation:ripple 1.8s ease infinite; }.ripple.one { inset:28rpx; }.ripple.two { inset:0;animation-delay:.5s; }.bt-core { display:flex;width:130rpx;height:130rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:50%; }.bluetooth-stage > text { margin-top:24rpx;font-size:34rpx;font-weight:600; }.bluetooth-stage > span { margin-top:8rpx;color:var(--color-text-secondary);font-size:23rpx; }
.address { display:flex;align-items:center;gap:16rpx;margin-top:24rpx;padding-top:20rpx;border-top:2rpx solid var(--color-divider); }.address view { min-width:0;flex:1; }.address strong,.address text { display:block; }.address strong { font-size:25rpx; }.address text { margin-top:5rpx;color:var(--color-text-secondary);font-size:21rpx; }.order-product > strong { font-size:27rpx; }.payment-method { padding:24rpx; }.method { display:flex;min-height:88rpx;align-items:center;gap:16rpx;border-bottom:2rpx solid var(--color-divider); }.method text { flex:1; }.method.selected { color:var(--color-action-primary); }.total { display:flex;align-items:flex-end;justify-content:space-between;margin-top:32rpx;padding:28rpx 0;border-top:2rpx solid var(--color-divider); }.total text { color:var(--color-text-secondary); }.total strong { color:var(--ss-red-700);font-size:38rpx; }
.timeline { margin-top:32rpx; }.timeline-item { position:relative;display:flex;gap:24rpx;padding-bottom:34rpx; }.timeline-item::before { position:absolute;top:22rpx;bottom:0;left:9rpx;width:2rpx;content:'';background:var(--color-divider); }.timeline-item:last-child::before { display:none; }.timeline-item > i { position:relative;z-index:1;width:20rpx;height:20rpx;flex:0 0 20rpx;margin-top:8rpx;background:var(--ss-neutral-300);border:5rpx solid #fff;border-radius:50%;box-shadow:0 0 0 2rpx var(--ss-neutral-300); }.timeline-item.active > i { background:var(--ss-brand-500);box-shadow:0 0 0 2rpx var(--ss-brand-500); }.timeline-item strong,.timeline-item text,.timeline-item span { display:block; }.timeline-item text { margin-top:6rpx;color:var(--color-text-body);font-size:23rpx; }.timeline-item span { margin-top:6rpx;color:var(--color-text-secondary);font-size:20rpx; }
.route-editor { margin-bottom:22rpx;padding:24rpx;box-shadow:none; }.route-editor .field { margin-bottom:22rpx; }.route-editor .field:last-of-type { margin-bottom:0; }.route-editor label { display:block;margin-bottom:10rpx;font-size:22rpx;font-weight:600; }.route-editor .input-shell { display:flex;min-height:84rpx;align-items:center;gap:14rpx;padding:0 20rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;box-sizing:border-box; }.route-editor input,.route-device-picker text { min-width:0;flex:1;font-size:23rpx; }.route-selection-head,.route-picker-head { display:flex;align-items:center;justify-content:space-between;gap:18rpx; }.route-selection-head { padding-top:22rpx;border-top:2rpx solid var(--color-divider); }.route-selection-head strong,.route-selection-head text,.route-picker-head strong,.route-picker-head text { display:block; }.route-selection-head strong { font-size:24rpx; }.route-selection-head text,.route-picker-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.route-save-actions { width:100%; }.route-save-actions .btn { min-width:0; }.route-picker-layer { position:fixed;z-index:120;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.42); }.route-picker-sheet { width:100%;max-width:780rpx;padding:12rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));background:#fff;border-radius:24rpx 24rpx 0 0;box-sizing:border-box; }.route-picker-head { padding:0 0 18rpx;border-bottom:2rpx solid var(--color-divider); }.route-picker-head > view { min-width:0;flex:1; }.route-picker-head strong { font-size:29rpx; }.route-picker-list { max-height:620rpx; }.route-picker-list .list-row { min-height:104rpx; }.route-picker-done { width:100%;margin-top:18rpx; }.route-picker-empty { padding:70rpx 20rpx;color:var(--color-text-secondary);font-size:22rpx;text-align:center; }
.route-picker-checkbox { width:36rpx;height:36rpx;border:2rpx solid var(--color-text-tertiary);border-radius:50%;box-sizing:border-box;flex:0 0 auto; }
.route-editor picker { display:block;width:100%; }
.route-editor .route-device-picker { display:grid;grid-template-columns:minmax(0,1fr) 20px;align-items:center;column-gap:10px;min-height:50px;padding:0 14px; }
.route-device-value { display:flex;width:100%;min-width:0;align-items:center;gap:10px; }
.route-device-value text { display:block;width:auto!important;min-width:0;max-width:none;overflow:visible;flex:1;font-size:14px;line-height:20px;text-align:left;text-overflow:clip;white-space:nowrap; }
.route-device-picker .ss-icon:last-child { justify-self:end; }
@keyframes ripple { 50% { transform:scale(1.08);opacity:.45; } }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
.logistics-page{padding-bottom:calc(40px + env(safe-area-inset-bottom))}.logistics-page .timeline-card{box-shadow:none}.tracking-title>view{min-width:0;flex:1}.tracking-title>view text{display:block}.tracking-title>view>text:last-child{margin-top:4px;color:var(--color-text-secondary);font-family:var(--ss-font-data);font-size:12px}.shipment-evidence,.shipment-items{box-shadow:none}.shipment-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.shipment-facts>view{padding:12px;background:var(--color-bg-canvas);border-radius:8px}.shipment-facts text,.shipment-facts strong{display:block}.shipment-facts text{color:var(--color-text-secondary);font-size:12px}.shipment-facts strong{margin-top:5px;font-size:13px;overflow-wrap:anywhere}.dispatch-photo{display:flex;min-height:64px;align-items:center;gap:12px;margin-top:14px;padding:12px;background:var(--ss-brand-50);border:1px solid var(--ss-brand-200);border-radius:8px}.dispatch-photo>view{min-width:0;flex:1}.dispatch-photo strong,.dispatch-photo text{display:block}.dispatch-photo strong{font-size:14px}.dispatch-photo text{margin-top:3px;color:var(--color-text-secondary);font-size:12px}.shipment-items>.section-title{display:block;margin-bottom:8px}.shipment-items>view{display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-divider)}.shipment-items>view:last-child{border-bottom:0}.shipment-items strong,.shipment-items text{display:block}.shipment-items strong{font-size:14px}.shipment-items text{color:var(--color-text-secondary);font-size:11px}.shipment-items b{font-family:var(--ss-font-data);font-size:16px}
</style>
