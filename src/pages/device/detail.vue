<script setup lang="ts">
import { computed, onUnmounted, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsModal from '@/components/SsModal.vue'
import SsEmpty from '@/components/SsEmpty.vue'
import SsActionSheet from '@/components/SsActionSheet.vue'
import { createDefaultDeviceSettings } from '@/config/deviceDefaults'
import { backgroundAssets } from '@/config/iconAssets'
import { chartService } from '@/services/chart'
import { integrationAvailability, mapAdapter } from '@/services/adapters'
import { deviceService } from '@/services/device'
import { firmwareService } from '@/services/firmware'
import { routeService } from '@/services/routes'
import { showAuthRequired } from '@/services/routeGuard'
import { useAppStore } from '@/stores/app'
import type { ChartPreferences, CrawlDistanceMeters, Device, DeviceSettings, DeviceWorkMode, LinkedRole, RoutePlan, Waypoint } from '@/types/models'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const cloudSyncConnected = integrationAvailability.cloudSync.ready && integrationAvailability.cloudSync.mode === 'production'
const id = ref('')
const entryMode = ref('')
const allowed = ref(false)
const showMore = ref(false)
const showUnbind = ref(false)
const showService = ref(false)
const showDeleteWaypoint = ref(false)
const showWaypointName = ref(false)
const waypointToNavigate = ref<Waypoint>()
const chartPoint = ref<{ lat: number; lng: number; top: string; left: string }>()
const showSafetyConfirm = ref(false)
const showBowConfirm = ref(false)
const showAnchorConfirm = ref(false)
const chartFullscreen = ref(false)
const panel = ref<'' | 'connection' | 'settings' | 'info' | 'waypoints' | 'routes' | 'modes' | 'chart-tools' | 'chart-settings' | 'manual-control'>('')
const settingSection = ref<'' | 'bow' | 'anchor' | 'role' | 'calibration' | 'crawl' | 'safety'>('')
const waypointToDelete = ref<Waypoint>()
const waypointSaving = ref(false)
const waypointDraft = reactive({ name: '', lat: 0, lng: 0 })
const busyCommand = ref('')
const connectionBusy = ref(false)
const mapCentered = ref(false)
const calibrationBusy = ref(false)
const playbackStep = ref(0)
const demoChartLoaded = ref(false)
const measurementActive = ref(false)
const settingsDraft = reactive<DeviceSettings>(createDefaultDeviceSettings())
const pendingSafetySetting = ref<{ key: 'limitSwitchBypassEnabled' | 'arrivalProtectionEnabled'; value: boolean }>()
let playbackTimer: ReturnType<typeof setInterval> | undefined
let pressDelay: ReturnType<typeof setTimeout> | undefined
let pressRepeat: ReturnType<typeof setInterval> | undefined
let pressedDirection: 'up' | 'down' | 'left' | 'right' | '' = ''
let repeatedPress = false
let lastTouchAt = 0

const device = computed(() => allowed.value ? store.db?.devices.find((item) => item.id === id.value) : undefined)
const control = computed(() => device.value?.controlState)
const installationProject = computed(() => store.db?.projects.find((item) => item.serialNumber === device.value?.serialNumber))
const installedParts = computed(() => (installationProject.value?.installedMaterials || []).map((entry) => ({
  ...entry,
  catalog: store.db?.materialCatalog.find((item) => item.id === entry.catalogId),
})))
const dealerWarrantyYears = computed(() => store.db?.dealers.find((item) => item.id === device.value?.dealerId)?.defaultWarrantyYears || 2)
const connected = computed(() => device.value?.connectionState === 'connected' && Boolean(device.value?.bluetoothConnected))
const gpsSignal = computed(() => device.value?.telemetry.gpsSignal)
const gpsAvailable = computed(() => connected.value && Number.isFinite(Number(gpsSignal.value)) && Number(gpsSignal.value) > 0)
const controllerConnected = computed(() => Boolean(device.value?.controllerConnected))
const controllerBattery = computed(() => {
  const value = Number(device.value?.telemetry.controllerBattery)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined
})
const supportsHelmSettings = computed(() => deviceService.supportsHelmSettings(device.value, store.db?.deviceModels || []))
const isDealerManagementMode = computed(() => store.isDealer && entryMode.value === 'manage')
const isHelmControlVisible = computed(() => supportsHelmSettings.value && !store.isGuest && !isDealerManagementMode.value && store.hasCapability('device.control'))
const isCalibrationLocked = computed(() => calibrationBusy.value || device.value?.settings.magnetometerCalibrationStatus === 'calibrating')
const activeMode = computed<DeviceWorkMode>(() => control.value?.activeMode || 'manual')
const deviceName = computed(() => store.locale !== 'zh-Hans' ? device.value?.nameEn : device.value?.name)
const gear = computed(() => control.value?.powerOn && control.value.propellerOn ? Math.max(1, Math.min(10, Math.round((control.value.power || 10) / 10))) : 0)
const directionLabel = computed(() => ({ forward: l('前进', 'Forward'), reverse: l('后退', 'Reverse'), left: l('左转', 'Port'), right: l('右转', 'Starboard'), stop: l('停止', 'Stopped') })[control.value?.direction || 'stop'])
const linkedRoleLabel = computed(() => ({ standalone: l('单机', 'Standalone'), primary: l('主机', 'Primary'), secondary: l('从机', 'Secondary') })[device.value?.settings.linkedRole || 'standalone'])
const liftPositionLabel = computed(() => ({ top: l('已到顶', 'At top'), movingUp: l('上升中', 'Rising'), middle: l('中间位置', 'Middle'), movingDown: l('下降中', 'Lowering'), bottom: l('已到底', 'At bottom'), fault: l('位置异常', 'Position fault') })[control.value?.liftPosition || 'middle'])
const steeringAngle = computed(() => Number(control.value?.steeringAngleDeg || 0))
const steeringStateLabel = computed(() => control.value?.steeringLimit === 'left' ? l('左转到位', 'Port limit') : control.value?.steeringLimit === 'right' ? l('右转到位', 'Starboard limit') : steeringAngle.value === 0 ? l('回转居中', 'Steering centered') : steeringAngle.value < 0 ? l('左转中', 'Steering port') : l('右转中', 'Steering starboard'))
const waypointCloudSync = computed(() => store.db?.settings.waypointStorage === 'cloud')
const playbackActive = computed(() => activeMode.value === 'playback')
const showTargetHeading = computed(() => ['drift', 'heading-lock', 'playback'].includes(activeMode.value))
const navigationWaypoint = computed(() => deviceWaypoints.value.find((item) => item.id === control.value?.targetWaypointId))
const showSpeed = computed(() => ['drift', 'crawl'].includes(activeMode.value))
const canUseService = computed(() => !store.isGuest && (store.hasCapability('support.create') || store.hasCapability('support.manage')))
const deviceWaypoints = computed(() => (store.db?.waypoints || []).filter((item) => item.deviceId === id.value && (!store.account || item.ownerId === store.account.id)))
const waypointSyncLabel = (item: Waypoint) => item.storageTarget === 'local' ? l('仅当前手机', 'This phone only') : ({ synced: l('已同步', 'Synced'), pending: l('待同步', 'Pending sync'), failed: l('同步失败', 'Sync failed') } as Record<string, string>)[item.syncStatus] || l('待同步', 'Pending sync')
const deviceRoutes = computed(() => (store.db?.routes || []).filter((item) => item.deviceId === id.value && (!store.account || item.ownerId === store.account.id)))
const serviceHistory = computed(() => (store.db?.tickets || []).filter((item) => item.deviceId === id.value && item.category !== 'message').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
const latestService = computed(() => serviceHistory.value[0])
const projectStatusLabel = computed(() => ({ pendingApproval: l('待跨区审核', 'Regional review pending'), installing: l('安装中', 'Installing'), active: l('使用中', 'Active'), aftersales: l('售后中', 'In service'), completed: l('已完成', 'Completed'), rejected: l('已驳回', 'Rejected') } as Record<string, string>)[installationProject.value?.status || ''] || l('未建档', 'Not registered'))
const serviceStatusLabel = computed(() => ({ submitted: l('待受理', 'Submitted'), processing: l('处理中', 'Processing'), parts: l('待物料', 'Waiting for parts'), completed: l('已完成', 'Completed'), rejected: l('已驳回', 'Rejected') } as Record<string, string>)[latestService.value?.status || ''] || l('暂无记录', 'No records'))
const warrantyState = computed(() => {
  const end = installationProject.value?.warrantyEnd
  if (!end) return l('未配置', 'Not configured')
  return new Date(`${end}T23:59:59`).getTime() >= Date.now() ? l(`质保至 ${end}`, `Warranty until ${end}`) : l(`已于 ${end} 到期`, `Expired on ${end}`)
})
const connectionLabel = computed(() => ({ disconnected: l('未连接', 'Disconnected'), connecting: l('连接中', 'Connecting'), connected: l('已连接', 'Connected'), failed: l('连接失败', 'Connection failed') })[device.value?.connectionState || 'disconnected'])
const firmwareEligibility = computed(() => { try { return device.value ? firmwareService.eligibility(device.value.id) : null } catch { return null } })
const modeMeta = computed<Array<{ key: DeviceWorkMode; label: string; description: string; icon: string }>>(() => [
  { key: 'manual', label: l('手动控制', 'Manual control'), description: l('上下加减档，左右转向，中心启停推进器', 'Adjust gear, steering and propulsion'), icon: 'ship-wheel' },
  { key: 'anchor', label: l('定点锚定', 'Position anchor'), description: l('方向键每次移动目标点 1 米', 'Move the target one meter per press'), icon: 'anchor' },
  { key: 'drift', label: l('盖流模式', 'Current-following'), description: l('调整推进速度与绝对航向', 'Adjust speed and absolute heading'), icon: 'route' },
  { key: 'crawl', label: l('定点蠕动', 'Position crawl'), description: l(`按 ${device.value?.settings.crawlDistanceMeters || 10} 米距离低速移动`, `Crawl at ${device.value?.settings.crawlDistanceMeters || 10} m distance`), icon: 'navigation' },
  { key: 'side-thrust', label: l('侧推模式', 'Side thrust'), description: l('仅按住左右键侧推，松开立即停止', 'Hold left or right only; release to stop'), icon: 'fan' },
  { key: 'heading-lock', label: l('航向锁定', 'Heading lock'), description: l('锁定航向并微调目标角度', 'Lock and fine-tune target heading'), icon: 'locate-fixed' },
  { key: 'playback', label: l('航迹设置', 'Track settings'), description: l('选择已保存航迹，确认后开始导航', 'Choose a saved track, then start navigation'), icon: 'route' },
])
const modeLabel = computed(() => modeMeta.value.find((item) => item.key === activeMode.value)?.label || '')
const modeIcon = computed(() => modeMeta.value.find((item) => item.key === activeMode.value)?.icon || 'ship-wheel')
const panelTitle = computed(() => panel.value === 'settings' && settingSection.value ? ({ bow: l('船艏向参考角','Bow reference'), anchor: l('走锚报警距离','Anchor drift alert'), role: l('联机角色','Linked role'), calibration: l('磁力计校准','Magnetometer calibration'), crawl: l('定点蠕动距离','Crawl distance'), safety: l('安全保护','Safety protection') })[settingSection.value] : ({ connection: l('连接设备', 'Device connection'), settings: l('设备工作参数', 'Device working parameters'), info: l('设备信息', 'Device information'), waypoints: l('航点管理', 'Waypoints'), routes: l('航迹设置', 'Track settings'), modes: l('选择工作模式', 'Select work mode'), 'chart-tools': l('海图工具', 'Chart tools'), 'chart-settings': l('海图显示设置', 'Chart display settings'), 'manual-control': l('手动控制', 'Manual control') } as Record<string, string>)[panel.value] || '')
const chartPreferences = computed<ChartPreferences>(() => store.db?.settings.chartPreferences || { displayMode: 'standard', theme: 'day', boundaryStyle: 'simple', pointSymbol: 'simple', depthColors: 2, zoomLevel: 2 })
const chartClass = computed(() => [`display-${chartPreferences.value.displayMode}`, `theme-${chartPreferences.value.theme}`, `boundary-${chartPreferences.value.boundaryStyle}`, `points-${chartPreferences.value.pointSymbol}`, `depth-${chartPreferences.value.depthColors}`])
const chartTransform = computed(() => `scale(${[0.88, 1, 1.12, 1.25, 1.4][chartPreferences.value.zoomLevel - 1]})${mapCentered.value ? ' translate(-2%, 2%)' : ''}`)
const markerPosition = computed(() => {
  if (!playbackActive.value) return { top: '48%', left: '50%' }
  return [{ top: '48%', left: '50%' }, { top: '44%', left: '46%' }, { top: '40%', left: '41%' }, { top: '36%', left: '35%' }][playbackStep.value % 4]
})
const playbackPointCount = computed(() => navigationWaypoint.value ? 1 : Math.max(4, deviceWaypoints.value.length))
const dpadLabels = computed(() => {
  if (activeMode.value === 'anchor') return { up: l('前移 1m', 'Forward 1m'), down: l('后移 1m', 'Back 1m'), left: l('左移 1m', 'Left 1m'), right: l('右移 1m', 'Right 1m') }
  if (['drift', 'heading-lock'].includes(activeMode.value)) return { up: l('加档', 'Gear up'), down: l('减档', 'Gear down'), left: l('航向 -1°', 'Heading -1°'), right: l('航向 +1°', 'Heading +1°') }
  return { up: l('加档', 'Gear up'), down: l('减档', 'Gear down'), left: l('向左', 'Left'), right: l('向右', 'Right') }
})
const controlGuide = computed(() => ({
  manual: l('上下调档 · 左右转向', 'Gear up/down · steer left/right'),
  anchor: l('方向键每次移动锚点 1m', 'Move anchor 1 m per press'),
  drift: l('上下调档 · 左右调整航向', 'Gear up/down · adjust heading'),
  crawl: l('上下调速 · 左右调整方向', 'Speed up/down · adjust direction'),
  'side-thrust': l('按住左/右侧推 · 松开即停', 'Hold left/right · release to stop'),
  'heading-lock': l('上下调档 · 左右微调航向', 'Gear up/down · trim heading'),
  playback: l('按所选航迹顺序自动导航', 'Navigate the selected track automatically'),
})[activeMode.value])
const centerLabel = computed(() => ['anchor', 'crawl', 'playback'].includes(activeMode.value) ? control.value?.controlPaused ? l('恢复', 'Resume') : l('暂停', 'Pause') : control.value?.propellerOn ? l('停止推进', 'Stop propulsion') : l('启动推进', 'Start propulsion'))
const safetyConfirmTitle = computed(() => pendingSafetySetting.value?.key === 'limitSwitchBypassEnabled' ? l('开启限位开关屏蔽', 'Enable limit switch bypass') : l('关闭到位保护', 'Disable arrival protection'))
const safetyConfirmDescription = computed(() => pendingSafetySetting.value?.key === 'limitSwitchBypassEnabled' ? l('开启后，主杆升降不再依赖限位器停止。请确认仅用于限位器异常排查。', 'Lift movement will no longer stop from limit-switch feedback.') : l('关闭后，主杆未到位时也可能继续执行控制。请确认设备周围安全。', 'Control may continue before the shaft reaches its limit.'))
const moreActions = computed(() => {
  const items: Array<{ key: string; label: string; description: string; icon: string; tone?: 'danger' }> = [{ key: 'info', label: l('完整设备信息', 'Device information'), description: l('序列号、规格、激活、质保和固件', 'Serial, specification, activation, warranty and firmware'), icon: 'info' }]
  if (store.isGuest) return items
  if (canUseService.value) items.push({ key: 'service', label: l('售后服务', 'After-sales service'), description: l('报修、投诉及维修记录', 'Repairs, complaints and service history'), icon: 'wrench' })
  if (firmwareEligibility.value?.eligible && store.hasCapability('device.control')) items.push({ key: 'ota', label: l('固件升级', 'Firmware update'), description: l(`可升级至 ${firmwareEligibility.value.latest}`, `Update to ${firmwareEligibility.value.latest}`), icon: 'download' })
  if (!connected.value && store.hasCapability('device.control')) items.push({ key: 'reconnect', label: l('重新连接设备', 'Reconnect device'), description: l('重新扫描蓝牙并恢复连接', 'Scan Bluetooth and restore connection'), icon: 'bluetooth' })
  if (store.hasCapability('map.edit')) { items.push({ key: 'waypoints', label: l('航点管理', 'Waypoints'), description: l('命名、编辑、删除与同步航点', 'Name, edit, delete and sync waypoints'), icon: 'map-pinned' }); items.push({ key: 'routes', label: l('航迹设置', 'Track settings'), description: l('航点排序、保存、上传与导航', 'Order, save, sync and navigate tracks'), icon: 'route' }) }
  if (store.hasCapability('support.manage')) items.push({ key: 'mainboard', label: l('主板更换登记', 'Mainboard replacement'), description: l('登记新主板并保留设备累计运行时长', 'Register the replacement and retain lifetime runtime'), icon: 'refresh-cw' })
  if (device.value?.ownerId === store.account?.id) items.push({ key: 'unbind', label: l('解绑设备', 'Unbind device'), description: l('移除当前绑定与控制权限', 'Remove binding and control access'), icon: 'unlink', tone: 'danger' })
  return items
})
const serviceActions = computed(() => [
  { key: 'repair', label: l('故障报修', 'Repair request'), description: l('提交故障现象、联系方式和现场附件', 'Submit issue, contact and attachments'), icon: 'wrench' },
  { key: 'complaint', label: l('提交投诉', 'Submit complaint'), description: l('关联当前设备提交服务投诉', 'Submit a complaint linked to this device'), icon: 'message-square-warning' },
  { key: 'history', label: l('维修记录', 'Service history'), description: l(`${serviceHistory.value.length} 条设备售后记录`, `${serviceHistory.value.length} service records`), icon: 'history' },
])

onLoad(async (query) => { await store.init(); id.value = String(query?.id || 'dev-01'); entryMode.value = String(query?.mode || ''); try { allowed.value = Boolean(await store.get<Device>('devices', id.value)); syncSettings() } catch { allowed.value = false } })
onShow(() => store.refresh())
onUnmounted(() => { stopPlaybackTimer(); stopDirectionalPress(false) })
function syncSettings() { if (device.value?.settings) Object.assign(settingsDraft, device.value.settings) }
function openPanel(next: typeof panel.value) { showMore.value = false; panel.value = next; settingSection.value = ''; if (next === 'settings') syncSettings() }
function closePanel() { stopDirectionalPress(false); panel.value = ''; settingSection.value = '' }
function cancelSettingEdit() { syncSettings(); settingSection.value = '' }
function openSettingEdit(key: string) { settingSection.value = key as typeof settingSection.value }
function process(scenario: string) { uni.navigateTo({ url: `/pages/process/index?scenario=${scenario}&deviceId=${id.value}` }) }
function requireControl() {
  if (store.isGuest) { showAuthRequired(`/pages/device/detail?id=${id.value}`, store.locale); return false }
  if (!store.hasCapability('device.control')) { uni.showToast({ title: l('当前账号无控制权限', 'No control permission'), icon: 'none' }); return false }
  if (!connected.value) { uni.showModal({ title: l('设备未连接', 'Device disconnected'), content: l('请先恢复蓝牙连接再操作。', 'Restore Bluetooth before operating.'), confirmText: l('去连接', 'Connect'), success: (result) => { if (result.confirm) openPanel('connection') } }); return false }
  if (isCalibrationLocked.value) { uni.showToast({ title: l('磁力计校准中，请稍候', 'Calibration in progress'), icon: 'none' }); return false }
  return true
}
async function toggleConnection() {
  if (!device.value || connectionBusy.value) return
  if (store.isGuest) return showAuthRequired(`/pages/device/detail?id=${id.value}`, store.locale)
  const next = !connected.value
  connectionBusy.value = true
  try {
    await deviceService.setConnection(device.value.id, 'bluetooth', next, store.context)
    store.refresh()
    if (next && store.account && firmwareEligibility.value?.available && firmwareService.takeReminder(device.value.id, store.account.id)) {
      uni.showModal({ title: l('固件更新提醒', 'Firmware update reminder'), content: l(`发现新版本 ${firmwareEligibility.value.latest}，是否现在更新？`, `Version ${firmwareEligibility.value.latest} is available. Update now?`), confirmText: l('查看更新', 'View update'), cancelText: l('稍后', 'Later'), success: (result) => { if (result.confirm) process('ota'); else firmwareService.deferReminder(device.value!.id, store.account!.id) } })
    } else uni.showToast({ title: next ? l('连接成功', 'Connected') : l('已断开', 'Disconnected'), icon: 'success' })
  } catch { store.refresh(); uni.showToast({ title: l('连接未完成，请重试', 'Connection failed. Try again'), icon: 'none' }) } finally { connectionBusy.value = false }
}
function controlError(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code.includes('ANCHOR_REQUIRED')) return l('请先进入定点锚定建立锚定点', 'Create an anchor point first')
  if (code.includes('LIFT_NOT_AT_BOTTOM')) return l('到位保护已开启，请先将主杆下降到底', 'Lower the shaft before anchoring')
  if (code.includes('GPS_UNAVAILABLE')) return l('当前无有效 GPS 定位', 'No valid GPS position')
  if (code.includes('CONTROL_UNAVAILABLE')) return l('当前模式不支持此操作', 'Unavailable in this mode')
  if (code.includes('INTEGRATION_NOT_CONFIGURED')) return l('设备控制服务未配置', 'Device control is not configured')
  return l('指令未执行，请重试', 'Command was not executed. Try again')
}
async function runControl(key: string, action: () => Promise<unknown>, successText = '') {
  if (!device.value || !requireControl() || busyCommand.value) return false
  busyCommand.value = key
  uni.showToast({ title: l('指令执行中', 'Command in progress'), icon: 'loading', duration: 900, mask: false })
  try {
    await action()
    store.refresh()
    uni.showToast({ title: successText || l('指令执行成功', 'Command completed'), icon: 'success', duration: 1300 })
    return true
  } catch (error) {
    store.refresh()
    uni.showToast({ title: controlError(error), icon: 'none', duration: 2200 })
    return false
  } finally { busyCommand.value = '' }
}
async function activateMode(mode: DeviceWorkMode, closeOnSuccess = true) {
  if (!device.value) return false
  // The meeting-confirmed "Track settings" entry is a route selector, not an
  // immediate replay of every saved waypoint. A concrete route starts control.
  if (mode === 'playback') { openPanel('routes'); return false }
  if (mode === 'anchor' && device.value.settings.arrivalProtectionEnabled && device.value.controlState.liftPosition !== 'bottom') { showAnchorConfirm.value = true; return false }
  const item = modeMeta.value.find((entry) => entry.key === mode)
  const succeeded = await runControl(`mode-${mode}`, () => deviceService.setWorkMode(device.value!.id, mode, store.context), l(`${item?.label || ''}已启用`, `${item?.label || ''} enabled`))
  if (succeeded) { if (closeOnSuccess) closePanel(); stopPlaybackTimer() }
  return succeeded
}
async function openManualControl() {
  openPanel('manual-control')
  if (activeMode.value !== 'manual' && !await activateMode('manual', false)) closePanel()
}
async function lowerShaftAndAnchor() {
  if (!device.value || !requireControl() || busyCommand.value) return
  showAnchorConfirm.value = false
  busyCommand.value = 'anchor-prepare'
  try {
    await deviceService.moveLift(device.value.id, 'down', store.context)
    await deviceService.setWorkMode(device.value.id, 'anchor', store.context)
    store.refresh()
    closePanel()
    stopPlaybackTimer()
    uni.showToast({ title: l('主杆已到底，定点锚定已启用', 'Shaft lowered; anchor enabled'), icon: 'success' })
  } catch (error) {
    store.refresh()
    uni.showToast({ title: controlError(error), icon: 'none' })
  } finally { busyCommand.value = '' }
}
function startPlaybackTimer(reset = false) {
  if (playbackTimer) clearInterval(playbackTimer)
  if (reset) playbackStep.value = 0
  playbackTimer = setInterval(() => { playbackStep.value = (playbackStep.value + 1) % playbackPointCount.value }, 1000)
}
function stopPlaybackTimer(reset = true) { if (playbackTimer) clearInterval(playbackTimer); playbackTimer = undefined; if (reset) playbackStep.value = 0 }
async function runDirectional(direction: 'up' | 'down' | 'left' | 'right') {
  if (!device.value || busyCommand.value) return
  if (activeMode.value === 'playback' || activeMode.value === 'side-thrust' && ['up', 'down'].includes(direction)) return
  await runControl(`direction-${direction}`, () => deviceService.directionalControl(device.value!.id, direction, store.context))
}
function startDirectionalPress(direction: 'up' | 'down' | 'left' | 'right', touch = false) {
  if (touch) lastTouchAt = Date.now(); else if (Date.now() - lastTouchAt < 700) return
  if (pressedDirection || !requireControl()) return
  pressedDirection = direction; repeatedPress = false
  if (activeMode.value === 'side-thrust' && ['left', 'right'].includes(direction)) { repeatedPress = true; void runDirectional(direction); return }
  pressDelay = setTimeout(() => { repeatedPress = true; void runDirectional(direction); pressRepeat = setInterval(() => void runDirectional(direction), 250) }, 500)
}
function stopDirectionalPress(runTap = true) {
  if (pressDelay) clearTimeout(pressDelay); if (pressRepeat) clearInterval(pressRepeat)
  pressDelay = undefined; pressRepeat = undefined
  const direction = pressedDirection; const wasRepeated = repeatedPress
  pressedDirection = ''; repeatedPress = false
  if (!direction) return
  if (activeMode.value === 'side-thrust' && ['left', 'right'].includes(direction)) { if (device.value) void runControl('side-thrust-stop', () => deviceService.stopSideThrust(device.value!.id, store.context)) }
  else if (runTap && !wasRepeated) void runDirectional(direction)
}
async function togglePrimary() {
  if (!device.value) return
  const succeeded = await runControl('primary-action', () => deviceService.togglePrimaryAction(device.value!.id, store.context))
  if (succeeded && playbackActive.value) {
    if (control.value?.controlPaused) stopPlaybackTimer(false)
    else startPlaybackTimer(false)
  }
}
async function endPlayback() { if (playbackActive.value) await activateMode('manual') }
async function changeLift(lift: 'up' | 'down') { if (device.value) await runControl(`shaft-${lift}`, () => deviceService.moveLift(device.value!.id, lift, store.context), lift === 'up' ? l('主杆已到顶', 'Shaft at top') : l('主杆已到底', 'Shaft at bottom')) }
async function recordWaypoint() {
  if (!device.value || !store.account || !requireControl()) return
  if (!gpsAvailable.value) { uni.showToast({ title: l('当前无有效 GPS 定位', 'No valid GPS position'), icon: 'none' }); return }
  const count = (store.db?.waypoints.filter((item) => item.deviceId === device.value?.id).length || 0) + 1
  Object.assign(waypointDraft, {
    name: l(`航点 ${String(count).padStart(2, '0')}`, `Waypoint ${String(count).padStart(2, '0')}`),
    lat: device.value.location.lat,
    lng: device.value.location.lng,
  })
  showWaypointName.value = true
}
async function inspectChartPoint(event: MouseEvent) {
  if (!device.value || !gpsAvailable.value || !store.hasCapability('map.edit')) return
  const bounds = await new Promise<UniApp.NodeInfo | null>((resolve) => {
    uni.createSelectorQuery().select('.chart-viewport').boundingClientRect((rect) => resolve(Array.isArray(rect) ? rect[0] : rect)).exec()
  })
  const pointer = event as MouseEvent & { detail?: { x?: number; y?: number }; changedTouches?: ArrayLike<{ clientX: number; clientY: number }> }
  const clientX = pointer.changedTouches?.[0]?.clientX ?? pointer.detail?.x ?? pointer.clientX
  const clientY = pointer.changedTouches?.[0]?.clientY ?? pointer.detail?.y ?? pointer.clientY
  if (!bounds || bounds.left === undefined || bounds.top === undefined || !bounds.width || !bounds.height || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return
  const x = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width))
  const y = Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height))
  const coordinate = await mapAdapter.moveCoordinate(device.value.location.lat, device.value.location.lng, (x - .5) * bounds.width, (y - .48) * bounds.height)
  chartPoint.value = { ...coordinate, top: `${Math.max(20, Math.min(79, y * 100))}%`, left: `${Math.max(22, Math.min(78, x * 100))}%` }
}
function saveChartPoint() {
  if (!chartPoint.value || !device.value || !requireControl()) return
  const count = deviceWaypoints.value.length + 1
  Object.assign(waypointDraft, { name: l(`航点 ${String(count).padStart(2, '0')}`, `Waypoint ${String(count).padStart(2, '0')}`), lat: chartPoint.value.lat, lng: chartPoint.value.lng })
  showWaypointName.value = true
}
async function navigateToWaypoint() {
  const target = waypointToNavigate.value
  waypointToNavigate.value = undefined
  if (!target || !device.value || !requireControl()) return
  if (!gpsAvailable.value) { uni.showToast({ title: l('当前无有效 GPS 定位', 'No valid GPS position'), icon: 'none' }); return }
  if (await runControl('waypoint-navigation', () => deviceService.navigateToWaypoint(device.value!.id, target.id, store.context), l(`已选择航点：${target.name}`, `Waypoint selected: ${target.nameEn}`))) { stopPlaybackTimer(); closePanel() }
}
async function saveWaypoint() {
  if (!device.value || waypointSaving.value) return
  const name = waypointDraft.name.trim()
  if (!name) { uni.showToast({ title: l('请输入航点名称', 'Enter a waypoint name'), icon: 'none' }); return }
  waypointSaving.value = true
  try {
    await routeService.createWaypoint({ name, nameEn: name, lat: waypointDraft.lat, lng: waypointDraft.lng, note: l('由设备详情记录', 'Recorded from device details'), deviceId: device.value.id }, store.context)
    store.refresh()
    showWaypointName.value = false
    uni.showToast({ title: l('航点已保存', 'Waypoint saved'), icon: 'success' })
  } catch {
    uni.showToast({ title: l('航点保存失败', 'Could not save waypoint'), icon: 'none' })
  } finally { waypointSaving.value = false }
}
async function toggleWaypointCloudSync() {
  try {
    await store.setWaypointStorage(waypointCloudSync.value ? 'local' : 'cloud')
    uni.showToast({ title: waypointCloudSync.value ? l('新航点将同步云端', 'New waypoints will sync to cloud') : l('新航点仅保存本机', 'New waypoints stay on this phone'), icon: 'none' })
  } catch { uni.showToast({ title: l('航点保存策略未更新', 'Waypoint preference was not updated'), icon: 'none' }) }
}
async function setBowReference() { if (!device.value) return; try { deviceService.setBowHeadingReference(device.value.id, store.context); store.refresh(); syncSettings(); showBowConfirm.value = false; uni.showToast({ title: l('船艏向参考已设置', 'Bow reference set'), icon: 'success' }) } catch { uni.showToast({ title: l('当前船艏角不可用', 'Current heading unavailable'), icon: 'none' }) } }
async function calibrateMagnetometer() {
  if (!device.value || calibrationBusy.value || !requireControl()) return
  calibrationBusy.value = true
  try { const task = deviceService.calibrateMagnetometer(device.value.id, store.context); store.refresh(); await task; store.refresh(); syncSettings(); uni.showToast({ title: l('磁力计校准成功', 'Calibration succeeded'), icon: 'success' }) } catch { store.refresh(); uni.showToast({ title: l('磁力计校准失败', 'Calibration failed'), icon: 'none' }) } finally { calibrationBusy.value = false }
}
function requestSafetySetting(key: 'limitSwitchBypassEnabled' | 'arrivalProtectionEnabled') { const value = !settingsDraft[key]; if ((key === 'limitSwitchBypassEnabled' && value) || (key === 'arrivalProtectionEnabled' && !value)) { pendingSafetySetting.value = { key, value }; showSafetyConfirm.value = true } else settingsDraft[key] = value }
function confirmSafetySetting() { if (pendingSafetySetting.value) settingsDraft[pendingSafetySetting.value.key] = pendingSafetySetting.value.value; pendingSafetySetting.value = undefined; showSafetyConfirm.value = false }
function cancelSafetySetting() { pendingSafetySetting.value = undefined; showSafetyConfirm.value = false }
async function saveSettings() {
  if (!device.value) return
  const distance = Number(settingsDraft.anchorDriftAlertDistanceMeters)
  if (!Number.isInteger(distance) || distance < 1 || distance > 999) { uni.showToast({ title: l('走锚距离请输入 1–999 米整数', 'Enter an integer from 1 to 999 m'), icon: 'none' }); return }
  try { await deviceService.saveSettings(device.value.id, { anchorDriftAlertDistanceMeters: distance, linkedRole: settingsDraft.linkedRole, crawlDistanceMeters: settingsDraft.crawlDistanceMeters, limitSwitchBypassEnabled: settingsDraft.limitSwitchBypassEnabled, arrivalProtectionEnabled: settingsDraft.arrivalProtectionEnabled }, store.context); store.refresh(); closePanel(); uni.showToast({ title: l('工作参数已保存', 'Parameters saved'), icon: 'success' }) } catch { uni.showToast({ title: l('设置未保存，请检查输入', 'Settings were not saved'), icon: 'none' }) }
}
async function setChartPreference<K extends keyof ChartPreferences>(key: K, value: ChartPreferences[K]) { try { chartService.savePreferences({ [key]: value }, store.context); store.refresh() } catch { uni.showToast({ title: l('海图设置未保存', 'Chart setting was not saved'), icon: 'none' }) } }
function changeZoom(step: -1 | 1) { const next = Math.max(1, Math.min(5, chartPreferences.value.zoomLevel + step)) as ChartPreferences['zoomLevel']; if (next !== chartPreferences.value.zoomLevel) void setChartPreference('zoomLevel', next) }
function locateOwnShip() { mapCentered.value = true; setTimeout(() => { mapCentered.value = false }, 900) }
function toggleChartFullscreen() { chartFullscreen.value = !chartFullscreen.value; closePanel() }
function runChartFeature(capability: 'chartImport' | 'measurement') {
  try {
    const result = chartService.previewCapability(capability, store.context)
    if (capability === 'chartImport') {
      demoChartLoaded.value = true
      uni.showToast({ title: l('海图已载入', 'Chart loaded'), icon: 'success' })
    } else {
      measurementActive.value = !measurementActive.value
      uni.showToast({ title: measurementActive.value ? l('测量已开启', 'Measurement on') : l('测量已关闭', 'Measurement off'), icon: 'none' })
    }
    store.refresh()
  } catch { uni.showToast({ title: l('操作未完成', 'Action was not completed'), icon: 'none' }) }
}
function requestDeleteWaypoint(item: Waypoint) { waypointToDelete.value = item; showDeleteWaypoint.value = true }
function editWaypoint(item: Waypoint) { uni.navigateTo({ url: `/pages/manage/form?entity=waypoints&id=${item.id}&deviceId=${id.value}` }) }
async function syncWaypoint(item: Waypoint) { try { await routeService.syncWaypoint(item.id, store.context); store.refresh(); uni.showToast({ title: l('航点已同步', 'Waypoint synced'), icon: 'success' }) } catch { uni.showToast({ title: l('服务器暂未连接，请稍后重试', 'Server unavailable. Try again later.'), icon: 'none' }) } }
async function deleteWaypoint() { if (!waypointToDelete.value) return; try { await routeService.deleteWaypoint(waypointToDelete.value.id, store.context); store.refresh(); showDeleteWaypoint.value = false; waypointToDelete.value = undefined } catch { uni.showToast({ title: l('航点正在被航线使用', 'Waypoint is used by a route'), icon: 'none' }) } }
async function startRoute(item: RoutePlan) { if (await runControl('route-playback', () => deviceService.setWorkMode(device.value!.id, 'playback', store.context), l(`已开始导航：${store.locale !== 'zh-Hans' ? item.nameEn : item.name}`, `Navigation started: ${item.nameEn}`))) { startPlaybackTimer(true); closePanel() } }
function openRoutePlanner() { const route = store.db?.routes.find((item) => item.deviceId === id.value); uni.navigateTo({ url: `/pages/process/index?scenario=route&deviceId=${id.value}${route ? `&routeId=${route.id}` : ''}` }) }
function openService() { if (!canUseService.value) return showAuthRequired(`/pages/device/detail?id=${id.value}`, store.locale); showService.value = true }
function handleService(key: string) { showService.value = false; if (key === 'history') return uni.navigateTo({ url: `/pages/manage/list?entity=tickets&deviceId=${id.value}` }); uni.navigateTo({ url: `/pages/manage/form?entity=tickets&category=${key}&deviceId=${id.value}` }) }
function openInstallationProject() { if (installationProject.value) uni.navigateTo({ url: `/pages/manage/form?entity=projects&id=${installationProject.value.id}&mode=detail` }); else uni.showToast({ title: l('该设备尚未建立安装项目', 'No installation project is linked'), icon: 'none' }) }
function openServiceHistory() { uni.navigateTo({ url: `/pages/manage/list?entity=tickets&deviceId=${id.value}` }) }
function handleMore(key: string) { showMore.value = false; if (key === 'service') return openService(); if (['info', 'settings', 'waypoints', 'routes'].includes(key)) return openPanel(key as typeof panel.value); if (key === 'reconnect') return openPanel('connection'); if (key === 'ota' || key === 'mainboard') return process(key); if (key === 'unbind') showUnbind.value = true }
async function unbind() { if (!device.value) return; try { await deviceService.unbind(device.value.id, store.context); store.refresh(); showUnbind.value = false; uni.redirectTo({ url: '/pages/shell/index' }) } catch { uni.showToast({ title: l('当前账号无权解绑', 'Unable to unbind'), icon: 'none' }) } }
</script>

<template>
  <view class="page detail-page">
    <SsAppBar :title="deviceName || l('设备详情','Device Details')" fallback-url="/pages/shell/index" right-icon="ellipsis" :right-label="l('更多设备操作','More device actions')" @right="showMore = true" />

    <view v-if="device && isHelmControlVisible" class="helm-map" :class="[chartClass, { fullscreen: chartFullscreen }]">
      <view class="chart-viewport" :style="{ transform: chartTransform }" @click="inspectChartPoint">
        <image class="chart-background" :src="backgroundAssets.mapCanvas" mode="aspectFill" />
        <view v-if="chartPreferences.depthColors === 4" class="depth-band band-a" /><view v-if="chartPreferences.depthColors === 4" class="depth-band band-b" />
        <view class="chart-grid-label label-a">24°28.9′ N</view><view class="chart-grid-label label-b">118°11.6′ E</view><view class="chart-grid-label label-c">{{ l('鼓浪屿东锚地','Gulangyu East Anchorage') }}</view>
        <view class="course-segment course-a" /><view class="course-segment course-b" />
        <view class="waypoint-marker marker-a"><SsIcon name="flag" :size="16" tone="brand" /></view><view class="waypoint-marker marker-b"><SsIcon name="anchor" :size="16" tone="inverse" /></view>
        <view v-if="measurementActive" class="demo-measurement"><span /><text>{{ l('测距','Distance') }} 1.28 km</text></view>
        <view class="device-position" :class="{ 'is-playing': playbackActive }" :style="{ ...markerPosition, transform: `translate(-50%, -50%) rotate(${device.telemetry.heading || 0}deg)` }"><SsIcon name="navigation" :size="24" tone="inverse" /></view>
        <button v-if="chartPoint" class="chart-point-preview" :style="{ top: chartPoint.top, left: chartPoint.left }" @click.stop="saveChartPoint"><SsIcon name="map-pin" :size="18" tone="inverse" /><view><strong>{{ chartPoint.lat.toFixed(5) }}, {{ chartPoint.lng.toFixed(5) }}</strong><text>{{ l('保存为航点','Save waypoint') }}</text></view></button>
        <view v-if="demoChartLoaded" class="demo-chart-badge"><SsIcon name="map" :size="14" tone="brand" />{{ l('海图预览','Chart preview') }}</view>
      </view>

      <view class="helm-top-stack" :class="{ fullscreen: chartFullscreen }">
        <view v-if="!chartFullscreen" class="helm-summary">
          <view class="connection-row"><view class="gps-block" :aria-label="gpsAvailable ? l(`GPS 信号 ${gpsSignal}%`,`GPS signal ${gpsSignal}%`) : l('GPS 信号不可用','GPS unavailable')"><view class="gps-bars"><i v-for="level in 4" :key="level" :class="{ active: gpsAvailable && Number(gpsSignal) >= level * 25 }" /></view><view><strong>GPS</strong><text>{{ gpsAvailable ? `${gpsSignal}%` : l('无信号','No signal') }}</text></view></view><view class="controller-status" :class="{ connected: controllerConnected }" :data-controller-state="controllerConnected ? 'connected' : 'disconnected'" :aria-label="controllerConnected ? l(`遥控器已连接，电量 ${controllerBattery ?? '--'}%`,`Remote connected, battery ${controllerBattery ?? '--'}%`) : l('遥控器未连接','Remote disconnected')"><SsIcon :name="controllerConnected ? 'radio' : 'unplug'" :size="17" :tone="controllerConnected ? 'success' : 'muted'" /><view><strong>{{ l('遥控器','Remote') }}</strong><text>{{ controllerConnected ? `${controllerBattery ?? '--'}%` : l('未连接','Offline') }}</text></view></view><button class="connection-button" data-action-key="connection" :class="{ connected }" :aria-label="connected ? l('App 蓝牙已连接','App Bluetooth connected') : l('App 蓝牙未连接','App Bluetooth disconnected')" @click="openPanel('connection')"><SsIcon name="bluetooth" :size="17" :tone="connected ? 'success' : 'brand'" /><view><strong>{{ l('App 连接','App link') }}</strong><text>{{ connected ? l('已连接','Connected') : l('未连接','Disconnected') }}</text></view></button></view>
          <view class="control-status-strip">
            <view class="status-priority status-runtime" data-metric-key="runtime"><text>{{ l('累计运行','Runtime') }}</text><strong>{{ device.telemetry.runtime }} <small>h</small></strong></view>
            <view class="status-priority" data-metric-key="gear"><text>{{ l('档位','Gear') }}</text><strong>{{ gear }} <small>{{ l('档','gear') }}</small></strong></view>
            <view class="status-priority" data-metric-key="offset"><text>{{ l('偏差距离','Offset') }}</text><strong>{{ device.telemetry.offsetDistance ?? 0 }} <small>m</small></strong></view>
            <button class="status-mode" data-action-key="mode-selector" @click="openPanel('modes')"><view><text>{{ l('工作模式','Mode') }}</text><strong>{{ modeLabel }}</strong></view><SsIcon name="chevron-right" :size="13" tone="inverse" /></button>
          </view>
        </view>

      </view>

      <view v-if="showTargetHeading" class="secondary-telemetry" :class="{ fullscreen: chartFullscreen }"><view><text>{{ l('实际航向','Heading') }}</text><strong>{{ Math.round(device.telemetry.heading || 0) }}°</strong></view><i /><view><text>{{ l('目标航向','Target') }}</text><strong>{{ Math.round(device.telemetry.targetHeading || 0) }}°</strong></view></view>
      <view class="chart-interactions">
      <button class="waypoint-primary" data-action-key="waypoint-mark" @click="recordWaypoint"><SsIcon name="flag" :size="19" tone="brand" /><view><strong>{{ l('标记当前位置','Mark position') }}</strong><text>{{ waypointCloudSync ? l('云端同步','Cloud sync') : l('仅当前手机','This phone only') }}</text></view></button>
      <view class="chart-tools">
        <button data-action-key="waypoint-list" :aria-label="l('航点列表','Waypoint list')" @click="openPanel('waypoints')"><SsIcon name="map-pinned" :size="19" tone="brand" /><text>{{ l('航点','Points') }}</text></button>
        <button data-action-key="working-parameters" :aria-label="l('设备工作参数','Device parameters')" @click="openPanel('settings')"><SsIcon name="settings-2" :size="19" tone="brand" /><text>{{ l('设置','Settings') }}</text></button>
        <button data-action-key="chart-locate" :aria-label="l('定位本船','Locate own ship')" @click="locateOwnShip"><SsIcon name="crosshair" :size="19" tone="muted" /><text>{{ l('本船','Own ship') }}</text></button>
        <button v-if="chartFullscreen" data-action-key="chart-fullscreen" :aria-label="l('退出全屏','Exit fullscreen')" @click="toggleChartFullscreen"><SsIcon name="scan-line" :size="19" tone="brand" /><text>{{ l('退出','Exit') }}</text></button>
        <button data-action-key="chart-tools" :aria-label="l('海图工具','Chart tools')" @click="openPanel('chart-tools')"><SsIcon name="layers-3" :size="19" tone="brand" /><text>{{ l('工具','Tools') }}</text></button>
      </view>
      </view>
      <view class="zoom-control"><button data-action-key="chart-zoom-in" :aria-label="l('放大','Zoom in')" @click="changeZoom(1)">+</button><text>{{ chartPreferences.zoomLevel }}</text><button data-action-key="chart-zoom-out" :aria-label="l('缩小','Zoom out')" @click="changeZoom(-1)">−</button></view>

      <view class="helm-dock" :class="[`mode-${activeMode}`, { working: Boolean(busyCommand) }]">
        <view class="dock-heading-panel">
          <view class="heading-compass dock-heading-compass" data-heading-compass="true" :aria-label="l(`设备朝向 ${Math.round(device.telemetry.heading || 0)} 度`,`Device heading ${Math.round(device.telemetry.heading || 0)} degrees`)">
            <text class="heading-label heading-front">{{ l('前','F') }}</text>
            <text class="heading-label heading-right">{{ l('右','R') }}</text>
            <text class="heading-label heading-back">{{ l('后','B') }}</text>
            <text class="heading-label heading-left">{{ l('左','L') }}</text>
            <view class="heading-compass-core"><view class="heading-pointer" :style="{ transform: `rotate(${device.telemetry.heading || 0}deg)` }"><SsIcon name="navigation" :size="30" tone="brand" /></view></view>
          </view>
        </view>
        <view v-if="playbackActive" class="playback-console">
          <view class="playback-heading"><span><SsIcon name="route" :size="21" tone="inverse" /></span><view><strong>{{ navigationWaypoint ? l('航点导航','Waypoint navigation') : l('航迹导航','Track navigation') }}</strong><text data-playback-status>{{ navigationWaypoint ? (store.locale === 'zh-Hans' ? navigationWaypoint.name : navigationWaypoint.nameEn) : l(`正在前往航点 ${playbackStep + 1}`,`Heading to waypoint ${playbackStep + 1}`) }} · {{ control?.controlPaused ? l('已暂停','Paused') : l('导航中','Navigating') }}</text></view><b>{{ playbackStep + 1 }}/{{ playbackPointCount }}</b></view>
          <view class="playback-progress"><span :style="{ width: `${((playbackStep + 1) / playbackPointCount) * 100}%` }" /></view>
          <view class="playback-actions"><button class="primary" :disabled="Boolean(busyCommand)" @click="togglePrimary"><SsIcon name="propeller" :size="19" tone="inverse" />{{ control?.controlPaused ? l('继续推进','Resume') : l('暂停推进','Pause') }}</button><button @click="openPanel('routes')"><SsIcon name="route" :size="18" tone="inverse" />{{ l('航迹设置','Track settings') }}</button><button class="danger" :disabled="Boolean(busyCommand)" @click="endPlayback"><SsIcon name="power" :size="17" tone="inverse" />{{ l('结束','Stop') }}</button></view>
        </view>
        <view v-else-if="activeMode === 'side-thrust'" class="side-thrust-console">
          <button class="side-direction" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="l('按住向左侧推','Hold side thrust left')" @touchstart.stop.prevent="startDirectionalPress('left', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('left')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-left" :size="28" tone="default" /><text>{{ l('向左侧推','Thrust left') }}</text></button>
          <button class="side-primary" :class="{ engaged: Boolean(control?.propellerOn) }" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="centerLabel" @click="togglePrimary"><SsIcon name="propeller" :size="29" tone="inverse" /><text>{{ control?.propellerOn ? l('推进器运行','Propulsion on') : l('启动推进器','Start propulsion') }}</text></button>
          <button class="side-direction" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="l('按住向右侧推','Hold side thrust right')" @touchstart.stop.prevent="startDirectionalPress('right', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('right')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-right" :size="28" tone="default" /><text>{{ l('向右侧推','Thrust right') }}</text></button>
        </view>
        <view v-else class="dock-primary-control">
          <button class="dock-propeller-button" :class="{ engaged: Boolean(control?.propellerOn) }" :aria-label="centerLabel" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="togglePrimary"><SsIcon name="propeller" :size="31" tone="inverse" /></button>
        </view>
        <view v-if="activeMode === 'manual'" class="dock-steering-actions">
          <button data-action-key="steer-left" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="runDirectional('left')"><SsIcon name="arrow-left" :size="18" tone="inverse" /><text>{{ l('左转','Left') }}</text></button>
          <button data-action-key="steer-right" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="runDirectional('right')"><SsIcon name="arrow-right" :size="18" tone="inverse" /><text>{{ l('右转','Right') }}</text></button>
        </view>
        <button class="lift-control lift-up" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="changeLift('up')"><SsIcon name="arrow-up" :size="20" tone="default" /><text>{{ l('主杆上升','Shaft up') }}</text></button>
        <button class="lift-control lift-down" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="changeLift('down')"><SsIcon name="arrow-down" :size="20" tone="default" /><text>{{ l('主杆下降','Shaft down') }}</text></button>
        <view class="lift-state">{{ liftPositionLabel }}</view>
      </view>
      <view v-if="!connected" class="offline-cover"><view><SsIcon name="bluetooth" :size="34" tone="default" /><strong>{{ l('设备未连接','Device disconnected') }}</strong><text>{{ l('恢复蓝牙连接后可使用设备控制。','Restore Bluetooth to use device control.') }}</text><button class="btn primary" @click="openPanel('connection')">{{ l('连接设备','Connect device') }}</button></view></view>
    </view>

    <scroll-view v-else-if="device" scroll-y class="basic-device">
      <view class="basic-device-hero"><span class="basic-device-icon"><SsIcon v-if="device.model.startsWith('DL-')" name="propeller" :size="32" tone="brand" /><SsIcon v-else-if="device.category.includes('淡化')" name="droplets" :size="32" tone="success" /><SsIcon v-else name="cpu" :size="32" tone="brand" /></span><view><strong>{{ deviceName }}</strong><text>{{ device.category }} · {{ device.model }}</text><span :class="device.connectionState">{{ connectionLabel }}</span></view></view>
      <view class="device-record-summary"><view><strong>{{ device.telemetry.runtime }}<small>h</small></strong><text>{{ l('累计运行', 'Total runtime') }}</text></view><view><strong>{{ device.firmware }}</strong><text>{{ l('固件版本', 'Firmware') }}</text></view><view><strong>{{ serviceHistory.length }}</strong><text>{{ l('售后记录', 'Service records') }}</text></view></view>
      <button v-if="!store.isGuest" class="service-entry" @click="openService"><span><SsIcon name="wrench" :size="24" tone="warning" /></span><view><strong>{{ l('售后服务','After-sales service') }}</strong><text>{{ l('故障报修、投诉与维修记录','Repair, complaint and service history') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button>
      <view class="basic-section"><view class="basic-section-title"><strong>{{ l('设备信息','Device information') }}</strong><button @click="openPanel('info')">{{ l('查看完整信息','View details') }}</button></view><view class="basic-grid"><view><text>{{ l('序列号','Serial') }}</text><strong>{{ device.serialNumber }}</strong></view><view><text>{{ l('固件','Firmware') }}</text><strong>{{ device.firmware }}</strong></view><view><text>{{ l('规格','Specification') }}</text><strong>{{ device.specification }}</strong></view><view><text>{{ l('质保','Warranty') }}</text><strong>{{ warrantyState }}</strong></view></view></view>
      <view v-if="store.isDealer" class="basic-section linked-business">
        <view class="basic-section-title"><strong>{{ l('关联业务','Linked records') }}</strong><text>{{ l('只读','Read only') }}</text></view>
        <button class="linked-row" @click="openInstallationProject"><span><SsIcon name="folder-search" :size="21" tone="brand" /></span><view><strong>{{ l('安装项目','Installation project') }}</strong><text>{{ installationProject ? `${installationProject.name} · ${projectStatusLabel}` : l('尚未建立安装项目','No installation project') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
        <view class="linked-row"><span><SsIcon name="user-round" :size="21" tone="brand" /></span><view><strong>{{ l('客户与船只','Customer and vessel') }}</strong><text>{{ installationProject ? `${installationProject.ownerName} · ${installationProject.vessel} · ${installationProject.phone}` : '--' }}</text></view></view>
        <view class="linked-row"><span><SsIcon name="shield-check" :size="21" tone="success" /></span><view><strong>{{ l('安装与质保','Activation and warranty') }}</strong><text>{{ installationProject ? `${installationProject.region} · ${warrantyState}` : warrantyState }}</text></view></view>
        <button class="linked-row" @click="openServiceHistory"><span><SsIcon name="history" :size="21" tone="brand" /></span><view><strong>{{ l('售后记录','Service records') }}</strong><text>{{ l(`${serviceHistory.length} 条记录`, `${serviceHistory.length} records`) }}{{ latestService ? ` · ${serviceStatusLabel}` : '' }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
      </view>
      <view v-if="store.isDealer && installationProject" class="basic-section device-parts-section">
        <view class="basic-section-title"><strong>{{ l('子物料明细','Installed parts') }}</strong><text>{{ installedParts.length }} {{ l('条','records') }}</text></view>
        <view v-for="part in installedParts" :key="part.id" class="device-part-row"><SsIcon name="package-check" :size="20" tone="brand" /><view><strong>{{ store.locale === 'zh-Hans' ? part.catalog?.name || l('未登记物料','Unregistered part') : part.catalog?.nameEn || l('未登记物料','Unregistered part') }}</strong><text>{{ l('物料编码','Part SKU') }} {{ part.catalog?.sku || '--' }} · ×{{ part.quantity }}</text><text>{{ String(part.at).slice(0,16).replace('T',' ') }}</text></view><span>{{ part.status === 'removed' ? l('已拆下','Removed') : l('已安装','Installed') }}</span></view>
        <view v-if="!installedParts.length" class="device-part-empty">{{ l('该设备尚未登记子物料','No parts registered for this device') }}</view>
      </view>
    </scroll-view>
    <SsEmpty v-else :title="l('设备不可访问','Device unavailable')" :description="l('设备不存在，或当前账号没有查看权限。','The device does not exist or is outside your access scope.')" icon="shield-alert" />

    <view v-if="device && panel" class="detail-panel-layer" @click.self="closePanel">
      <view class="detail-panel" :class="{ 'compact-panel': panel === 'chart-tools', 'manual-control-panel': panel === 'manual-control' }"><view class="panel-grabber" /><view class="panel-header"><button v-if="panel === 'settings' && settingSection" class="setting-back" :aria-label="l('返回设置列表','Back to settings')" @click="cancelSettingEdit"><SsIcon name="arrow-left" :size="20" tone="muted" /></button><view><strong>{{ panelTitle }}</strong><text>{{ deviceName }} · {{ device.model }}</text></view><button data-action-key="close-panel" :aria-label="l('关闭','Close')" @click="closePanel"><SsIcon name="x" :size="21" tone="muted" /></button></view>
        <scroll-view scroll-y class="panel-scroll">
          <template v-if="panel === 'connection'"><view class="connection-overview"><span :class="{ online: connected }" /><view><strong>{{ connectionLabel }}</strong><text>{{ connected ? l('设备状态已通过蓝牙回读','State read from Bluetooth') : l('连接仅包含蓝牙扫描、连接与重试','Bluetooth scan, connect and retry only') }}</text></view></view><view class="panel-list"><view class="panel-list-row"><span class="panel-icon"><SsIcon name="bluetooth" :size="22" tone="brand" /></span><view><strong>{{ l('蓝牙连接','Bluetooth connection') }}</strong><text>{{ connectionLabel }}</text></view><button class="compact-action" :disabled="connectionBusy" @click="toggleConnection">{{ connectionBusy ? l('处理中','Working') : connected ? l('断开','Disconnect') : device.connectionState === 'failed' ? l('重试','Retry') : l('连接','Connect') }}</button></view><view class="panel-list-row" data-connection-item="controller"><span class="panel-icon" :class="{ offline: !controllerConnected }"><SsIcon :name="controllerConnected ? 'radio' : 'unplug'" :size="22" :tone="controllerConnected ? 'success' : 'muted'" /></span><view><strong>{{ l('遥控器状态','Remote controller') }}</strong><text>{{ controllerConnected ? l(`已连接 · 电量 ${controllerBattery ?? '--'}%`,`Connected · Battery ${controllerBattery ?? '--'}%`) : l('未连接，请检查遥控器电源和配对状态','Disconnected. Check power and pairing') }}</text></view><span class="connection-state-label" :class="{ online: controllerConnected }">{{ controllerConnected ? l('已连接','Connected') : l('未连接','Offline') }}</span></view></view></template>

          <template v-else-if="panel === 'manual-control'">
            <view class="manual-control-summary"><view><text>{{ l('档位','Gear') }}</text><strong>{{ gear }} {{ l('档','gear') }}</strong></view><view><text>{{ l('转向状态','Steering') }}</text><strong>{{ steeringStateLabel }}</strong></view><view><text>{{ l('推进器','Propeller') }}</text><strong :class="{ running: control?.propellerOn }">{{ control?.propellerOn ? l('运行中','Running') : l('已停止','Stopped') }}</strong></view></view>
            <view class="manual-control-layout">
              <view class="compass remote-pad manual-control-pad" :class="{ working: Boolean(busyCommand) }">
                <button class="direction north-button" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="dpadLabels.up" @touchstart.stop.prevent="startDirectionalPress('up', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('up')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-up" :size="26" tone="default" /><text>{{ l('加档','Gear +') }}</text></button>
                <button class="direction south-button" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="dpadLabels.down" @touchstart.stop.prevent="startDirectionalPress('down', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('down')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-down" :size="26" tone="default" /><text>{{ l('减档','Gear -') }}</text></button>
                <button class="direction west-button" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="dpadLabels.left" @touchstart.stop.prevent="startDirectionalPress('left', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('left')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-left" :size="26" tone="default" /><text>{{ l('左转','Left') }}</text></button>
                <button class="direction east-button" :disabled="Boolean(busyCommand) || isCalibrationLocked" :aria-label="dpadLabels.right" @touchstart.stop.prevent="startDirectionalPress('right', true)" @touchend.stop.prevent="stopDirectionalPress()" @touchcancel.stop.prevent="stopDirectionalPress(false)" @mousedown.prevent="startDirectionalPress('right')" @mouseup.prevent="stopDirectionalPress()" @mouseleave="stopDirectionalPress(false)"><SsIcon name="arrow-right" :size="26" tone="default" /><text>{{ l('右转','Right') }}</text></button>
                <button class="stop-button" :class="{ engaged: Boolean(control?.propellerOn) }" :aria-label="centerLabel" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="togglePrimary"><SsIcon name="fan" :size="30" tone="inverse" /></button>
              </view>
              <view class="manual-control-tip"><SsIcon name="info" :size="17" tone="brand" /><text>{{ l('点按调节，长按连续控制；红色螺旋桨可立即停止推进。','Tap to adjust or hold for continuous control. Use the red propeller to stop immediately.') }}</text></view>
            </view>
          </template>

          <template v-else-if="panel === 'modes'"><view class="mode-list"><button v-for="item in modeMeta" :key="item.key" :class="{ active: item.key === activeMode }" :disabled="Boolean(busyCommand) || isCalibrationLocked" @click="item.key === 'manual' ? openManualControl() : activateMode(item.key)"><span><SsIcon :name="item.icon" :size="22" :tone="item.key === activeMode ? 'inverse' : 'brand'" /></span><view><strong>{{ item.label }}</strong><text>{{ item.description }}</text></view><SsIcon v-if="item.key === activeMode" name="circle-check" :size="20" tone="success" /><SsIcon v-else name="chevron-right" :size="18" tone="muted" /></button></view></template>

          <template v-else-if="panel === 'settings'">
            <view v-if="!settingSection" class="settings-menu">
              <button v-for="item in [{key:'bow',icon:'navigation',name:l('船艏向参考角','Bow reference'),value:settingsDraft.bowHeadingReferenceDeg === null ? l('尚未设置','Not set') : `${settingsDraft.bowHeadingReferenceDeg}°`},{key:'anchor',icon:'anchor',name:l('走锚报警距离','Anchor drift alert'),value:`${settingsDraft.anchorDriftAlertDistanceMeters} m`},{key:'role',icon:'link-2',name:l('联机角色','Linked role'),value:linkedRoleLabel},{key:'calibration',icon:'crosshair',name:l('磁力计校准','Magnetometer calibration'),value:calibrationBusy ? l('校准中','Calibrating') : l('查看状态','View status')},{key:'crawl',icon:'navigation',name:l('定点蠕动距离','Crawl distance'),value:`${settingsDraft.crawlDistanceMeters} m`},{key:'safety',icon:'shield-check',name:l('安全保护','Safety protection'),value:settingsDraft.arrivalProtectionEnabled ? l('到位保护开启','Arrival protection on') : l('到位保护关闭','Arrival protection off')}]" :key="item.key" class="settings-menu-row" @click="openSettingEdit(item.key)"><span class="panel-icon"><SsIcon :name="item.icon" :size="20" tone="brand" /></span><strong>{{ item.name }}</strong><text>{{ item.value }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
            </view>
            <template v-else>
              <view v-if="settingSection === 'bow'" class="setting-edit"><text>{{ l('当前参考角','Current reference') }}：{{ settingsDraft.bowHeadingReferenceDeg === null ? l('尚未设置','Not set') : `${settingsDraft.bowHeadingReferenceDeg}°` }}</text><button class="btn primary" @click="showBowConfirm = true">{{ settingsDraft.bowHeadingReferenceDeg === null ? l('设置参考角','Set reference') : l('重新设置参考角','Reset reference') }}</button></view>
              <view v-else-if="settingSection === 'anchor'" class="setting-edit"><text>{{ l('走锚报警距离（米）','Anchor drift alert distance (m)') }}</text><view class="number-field"><input v-model.number="settingsDraft.anchorDriftAlertDistanceMeters" type="number" inputmode="numeric" /><text>m</text></view><span>{{ l('请输入 1–999 米整数','Enter an integer from 1 to 999 m') }}</span></view>
              <view v-else-if="settingSection === 'role'" class="setting-edit"><text>{{ l('联机角色','Linked role') }}</text><view class="segment-control"><button v-for="item in ([['standalone',l('单机','Standalone')],['primary',l('主机','Primary')],['secondary',l('从机','Secondary')]] as Array<[LinkedRole,string]>)" :key="item[0]" :class="{ active: settingsDraft.linkedRole === item[0] }" @click="settingsDraft.linkedRole = item[0]">{{ item[1] }}</button></view><span>{{ l('修改后需要重启设备生效','Restart the device after changing this setting') }}</span></view>
              <view v-else-if="settingSection === 'calibration'" class="setting-edit"><text>{{ calibrationBusy ? l('校准中，请保持设备稳定','Calibrating; keep the device stable') : ({ idle:l('待校准','Not calibrated'), calibrating:l('校准中','Calibrating'), succeeded:l('校准成功','Succeeded'), failed:l('校准失败','Failed') } as Record<string,string>)[device.settings.magnetometerCalibrationStatus] }}</text><button class="btn primary" :disabled="calibrationBusy" @click="calibrateMagnetometer">{{ calibrationBusy ? l('校准中','Calibrating') : l('开始校准','Calibrate') }}</button></view>
              <view v-else-if="settingSection === 'crawl'" class="setting-edit"><text>{{ l('定点蠕动距离','Position crawl distance') }}</text><view class="distance-options"><button v-for="distance in ([6,10,15,20,30] as CrawlDistanceMeters[])" :key="distance" :class="{ active: settingsDraft.crawlDistanceMeters === distance }" @click="settingsDraft.crawlDistanceMeters = distance">{{ distance }}m</button></view></view>
              <view v-else class="panel-list safety-list"><button class="panel-list-row toggle-row" data-setting-key="limitSwitchBypassEnabled" role="switch" :aria-checked="settingsDraft.limitSwitchBypassEnabled" @click="requestSafetySetting('limitSwitchBypassEnabled')"><span class="panel-icon warning"><SsIcon name="shield-alert" :size="20" tone="warning" /></span><view><strong>{{ l('限位开关屏蔽','Limit switch bypass') }}</strong><text>{{ l('仅在限位器异常排查时开启','Only when troubleshooting a faulty switch') }}</text></view><i :class="{ on: settingsDraft.limitSwitchBypassEnabled }" /></button><button class="panel-list-row toggle-row" data-setting-key="arrivalProtectionEnabled" role="switch" :aria-checked="settingsDraft.arrivalProtectionEnabled" @click="requestSafetySetting('arrivalProtectionEnabled')"><span class="panel-icon"><SsIcon name="shield-check" :size="20" tone="success" /></span><view><strong>{{ l('到位保护','Arrival protection') }}</strong><text>{{ l('主杆到位后才允许继续执行','Continue after shaft position is confirmed') }}</text></view><i :class="{ on: settingsDraft.arrivalProtectionEnabled }" /></button></view>
              <view v-if="!['bow','calibration'].includes(settingSection)" class="setting-actions"><button class="btn" @click="cancelSettingEdit">{{ l('取消','Cancel') }}</button><button class="btn primary" @click="saveSettings">{{ l('保存','Save') }}</button></view>
            </template>
          </template>

          <template v-else-if="panel === 'chart-tools'">
            <view class="chart-tool-list">
              <button data-action-key="chart-settings" @click="openPanel('chart-settings')"><span class="panel-icon"><SsIcon name="layers-3" :size="22" tone="brand" /></span><view><strong>{{ l('图层与显示','Layers and display') }}</strong><text>{{ l('调整海图主题、边界、点符号和水深颜色','Theme, boundaries, symbols and depth colors') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button>
              <button data-action-key="track-settings" @click="openPanel('routes')"><span class="panel-icon"><SsIcon name="route" :size="22" tone="brand" /></span><view><strong>{{ l('航迹设置','Track settings') }}</strong><text>{{ l('管理已保存航迹并开始导航','Manage saved tracks and start navigation') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button>
              <button class="chart-import" data-action-key="chart-import" :class="{ active: demoChartLoaded }" @click="runChartFeature('chartImport')"><span class="panel-icon"><SsIcon name="upload-cloud" :size="22" tone="brand" /></span><view><strong>{{ demoChartLoaded ? l('海图已载入','Chart loaded') : l('海图导入','Chart import') }}</strong><text>{{ l('载入当前作业区域海图','Load the chart for the current operating area') }}</text></view><em>{{ demoChartLoaded ? l('已载入','Loaded') : l('导入','Import') }}</em></button>
              <button data-action-key="chart-measurement" :class="{ active: measurementActive }" @click="runChartFeature('measurement')"><span class="panel-icon"><SsIcon name="ruler" :size="22" tone="brand" /></span><view><strong>{{ measurementActive ? l('结束测量','End measurement') : l('测量','Measure') }}</strong><text>{{ l('在当前海图测量两点距离','Measure the distance between two chart points') }}</text></view><em>{{ measurementActive ? l('进行中','Active') : l('测量','Measure') }}</em></button>
              <button data-action-key="chart-fullscreen" @click="toggleChartFullscreen"><span class="panel-icon"><SsIcon name="scan-line" :size="22" tone="brand" /></span><view><strong>{{ chartFullscreen ? l('退出全屏','Exit fullscreen') : l('全屏海图','Fullscreen chart') }}</strong><text>{{ l('隐藏顶部摘要，保留关键控制','Hide the summary and keep essential controls') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></button>
            </view>
            <view class="panel-note"><SsIcon name="info" :size="18" tone="brand" /><text>{{ l('当前海图支持预览与测距；缩放范围以海图服务能力为准。','The current chart supports preview and distance measurement. Zoom range depends on the chart service.') }}</text></view>
          </template>

          <template v-else-if="panel === 'chart-settings'">
            <view class="chart-setting-group"><text>{{ l('显示模式','Display mode') }}</text><view class="segment-control"><button v-for="item in [['basic',l('基础','Basic')],['standard',l('标准','Standard')],['all',l('全部','All')]]" :key="item[0]" :class="{ active: chartPreferences.displayMode === item[0] }" @click="setChartPreference('displayMode', item[0] as ChartPreferences['displayMode'])">{{ item[1] }}</button></view></view>
            <view class="chart-setting-group"><text>{{ l('主题','Theme') }}</text><view class="segment-control"><button v-for="item in [['day',l('白天','Day')],['dusk',l('傍晚','Dusk')],['night',l('黑夜','Night')]]" :key="item[0]" :class="{ active: chartPreferences.theme === item[0] }" @click="setChartPreference('theme', item[0] as ChartPreferences['theme'])">{{ item[1] }}</button></view></view>
            <view class="chart-setting-group"><text>{{ l('边界','Boundary') }}</text><view class="segment-control two"><button :class="{ active: chartPreferences.boundaryStyle === 'simple' }" @click="setChartPreference('boundaryStyle','simple')">{{ l('简单线','Simple') }}</button><button :class="{ active: chartPreferences.boundaryStyle === 'symbolized' }" @click="setChartPreference('boundaryStyle','symbolized')">{{ l('符号化','Symbolized') }}</button></view></view>
            <view class="chart-setting-group"><text>{{ l('点符号','Point symbol') }}</text><view class="segment-control two"><button :class="{ active: chartPreferences.pointSymbol === 'simple' }" @click="setChartPreference('pointSymbol','simple')">{{ l('简单符号','Simple') }}</button><button :class="{ active: chartPreferences.pointSymbol === 'paper' }" @click="setChartPreference('pointSymbol','paper')">{{ l('纸质海图符号','Paper chart') }}</button></view></view>
            <view class="chart-setting-group"><text>{{ l('水深颜色','Depth colors') }}</text><view class="segment-control two"><button :class="{ active: chartPreferences.depthColors === 2 }" @click="setChartPreference('depthColors',2)">2 {{ l('色','colors') }}</button><button :class="{ active: chartPreferences.depthColors === 4 }" @click="setChartPreference('depthColors',4)">4 {{ l('色','colors') }}</button></view></view>
            <view class="panel-note"><SsIcon name="info" :size="18" tone="brand" /><text>{{ l('显示设置即时写入本机，并立即应用到当前海图。','Settings are saved locally and applied immediately.') }}</text></view>
          </template>

          <template v-else-if="panel === 'info'"><view class="identity-strip"><span class="panel-icon large"><SsIcon name="fan" :size="28" tone="brand" /></span><view><strong>{{ deviceName }}</strong><text>{{ device.category }} · {{ device.model }}</text></view><em>{{ connectionLabel }}</em></view><view class="info-grid"><view><text>{{ l('设备序列号','Serial') }}</text><strong>{{ device.serialNumber }}</strong></view><view><text>{{ l('设备规格','Specification') }}</text><strong>{{ device.specification }}</strong></view><view><text>{{ l('通信设备 ID','Communication ID') }}</text><strong>{{ device.identity?.communicationId || '--' }}</strong></view><view><text>{{ l('芯片 ID','Chip ID') }}</text><strong>{{ device.identity?.chipId || '--' }}</strong></view><view><text>{{ l('主板编号','Mainboard') }}</text><strong>{{ device.identity?.mainboardSerial || '--' }}</strong></view><view><text>{{ l('固件版本','Firmware') }}</text><strong>{{ device.firmware }}</strong></view><view><text>{{ l('销售地区','Sales region') }}</text><strong>{{ device.salesRegion }}</strong></view><view><text>{{ l('安装位置','Installed at') }}</text><strong>{{ device.location.label }}</strong></view><view><text>{{ l('激活日期','Activated') }}</text><strong>{{ device.activatedAt?.slice(0,10) || l('尚未激活','Not activated') }}</strong></view><view><text>{{ l('累计运行','Runtime') }}</text><strong>{{ device.telemetry.runtime }}h</strong></view><view><text>{{ l('质保状态','Warranty') }}</text><strong>{{ warrantyState }}</strong></view><view><text>{{ l('质保配置','Warranty setting') }}</text><strong>{{ dealerWarrantyYears }} {{ l('年','years') }}</strong></view></view></template>

          <template v-else-if="panel === 'waypoints'">
            <view class="waypoint-sync-setting" role="switch" :aria-checked="waypointCloudSync" @click="toggleWaypointCloudSync"><span class="panel-icon"><SsIcon name="cloud" :size="21" tone="brand" /></span><view><strong>{{ l('同步服务器','Sync to server') }}</strong><text>{{ waypointCloudSync ? l('新航点保存后进入同步队列','New waypoints enter the sync queue') : l('新航点仅保存在当前手机','New waypoints stay on this phone') }}</text></view><i :class="{ on: waypointCloudSync }" /></view>
            <view class="panel-toolbar"><view><strong>{{ l(`${deviceWaypoints.length} 个航点`,`${deviceWaypoints.length} waypoints`) }}</strong><text>{{ l('选择航点导航或管理已存位置','Navigate to or manage saved positions') }}</text></view><button class="compact-action" @click="recordWaypoint"><SsIcon name="flag" :size="17" tone="brand" />{{ l('标记','Mark') }}</button></view>
            <view v-if="deviceWaypoints.length" class="panel-list"><view v-for="(item,index) in deviceWaypoints" :key="item.id" class="panel-list-row"><span class="sequence">{{ index + 1 }}</span><view><strong>{{ store.locale !== 'zh-Hans' ? item.nameEn : item.name }}</strong><text>{{ item.lat.toFixed(4) }}, {{ item.lng.toFixed(4) }} · {{ waypointSyncLabel(item) }}</text></view><view class="waypoint-actions"><button class="waypoint-navigate" :aria-label="l(`导航至 ${item.name}`, `Navigate to ${item.nameEn}`)" @click="waypointToNavigate = item"><SsIcon name="navigation" :size="18" tone="inverse" /></button><button :aria-label="l('编辑航点','Edit waypoint')" @click="editWaypoint(item)"><SsIcon name="pencil" :size="18" tone="brand" /></button><button v-if="cloudSyncConnected && item.storageTarget === 'server' && item.syncStatus !== 'synced'" :aria-label="l('同步航点','Sync waypoint')" @click="syncWaypoint(item)"><SsIcon name="upload-cloud" :size="18" tone="brand" /></button><button :aria-label="l('删除航点','Delete waypoint')" @click="requestDeleteWaypoint(item)"><SsIcon name="trash-2" :size="18" tone="danger" /></button></view></view></view>
            <SsEmpty v-else :title="l('还没有航点','No waypoints')" :description="l('标记设备当前 GPS 位置后会显示在这里。','Mark the current GPS position to add one.')" icon="map-pinned" />
          </template>

          <template v-else-if="panel === 'routes'"><view class="panel-toolbar"><view><strong>{{ l('航迹设置','Track settings') }}</strong><text>{{ l(`${deviceRoutes.length} 条已保存航迹，可新建、上传或导航`,`${deviceRoutes.length} saved tracks. Create, sync, or navigate`) }}</text></view><button class="compact-action" @click="openRoutePlanner"><SsIcon name="plus" :size="17" tone="brand" />{{ l('新建航迹','New track') }}</button></view><view v-if="deviceRoutes.length" class="panel-list"><view v-for="item in deviceRoutes" :key="item.id" class="panel-list-row"><span class="panel-icon"><SsIcon name="route" :size="20" tone="brand" /></span><view><strong>{{ store.locale !== 'zh-Hans' ? item.nameEn : item.name }}</strong><text>{{ item.distanceKm }}km · {{ item.waypointIds.length }} {{ l('个轨迹点','track points') }}</text></view><button class="compact-action" @click="startRoute(item)">{{ l('开始导航','Navigate') }}</button></view></view><SsEmpty v-else :title="l('还没有航迹','No tracks')" :description="l('新建航迹并选择已记录的航点。','Create a track from recorded waypoints.')" icon="route" /></template>
        </scroll-view>
      </view>
    </view>

    <SsActionSheet :show="showMore" :title="l('更多设备操作','More Device Actions')" :items="moreActions" @cancel="showMore = false" @select="handleMore" />
    <SsActionSheet :show="showService" :title="l('售后服务','After-sales service')" :items="serviceActions" @cancel="showService = false" @select="handleService" />
    <SsModal :show="showUnbind" :title="l('解绑二手机设备','Unbind pre-owned device')" :description="l('解绑后将移除当前账号的控制权限，历史数据按账号隔离保留。设备再次绑定时会重新核验销售地区与当前使用地区。','Unbinding removes control access while retaining owner-scoped history. The sales and current regions will be checked again before rebinding.')" icon="unlink" tone="danger" :confirm-text="l('确认解绑','Unbind')" @cancel="showUnbind = false" @confirm="unbind"><view class="unbind-region-summary"><view><text>{{ l('设备销售地区','Device sales region') }}</text><strong>{{ device?.salesRegion || '--' }}</strong></view><view><text>{{ l('当前使用区域','Current use region') }}</text><strong>{{ device?.location.label || '--' }}</strong></view><span>{{ l('若地区不一致，重新激活时将提示联系所属代理商处理。','If the regions differ, rebinding will direct the user to the assigned dealer.') }}</span></view></SsModal>
    <SsModal :show="showWaypointName" :title="l('命名航点','Name waypoint')" :description="l('为当前设备位置命名，保存后可用于航迹规划。','Name the current device position for track planning.')" icon="map-pin" :confirm-text="waypointSaving ? l('保存中','Saving') : l('保存航点','Save waypoint')" @cancel="showWaypointName = false" @confirm="saveWaypoint">
      <view class="waypoint-name-form">
        <label><text>{{ l('航点名称','Waypoint name') }}</text><view><SsIcon name="flag" :size="19" tone="brand" /><input v-model="waypointDraft.name" maxlength="30" :placeholder="l('请输入航点名称','Enter waypoint name')" /></view></label>
        <view class="waypoint-coordinate"><span><SsIcon name="crosshair" :size="18" tone="brand" /></span><view><text>{{ l('当前坐标','Current coordinates') }}</text><strong>{{ waypointDraft.lat.toFixed(6) }}, {{ waypointDraft.lng.toFixed(6) }}</strong></view></view>
        <view class="waypoint-storage"><SsIcon :name="waypointCloudSync ? 'cloud' : 'smartphone'" :size="17" tone="muted" /><text>{{ waypointCloudSync ? l('保存后同步至服务器','Sync to server after saving') : l('保存到当前手机','Save on this phone') }}</text></view>
      </view>
    </SsModal>
    <SsModal :show="Boolean(waypointToNavigate)" :title="l('前往航点','Navigate to waypoint')" :description="l(`确认前往 ${waypointToNavigate?.name || ''}？请确保设备连接正常且 GPS 信号可用。`, `Navigate to ${waypointToNavigate?.nameEn || ''}? Keep the device connected and GPS available.`)" icon="navigation" :confirm-text="l('确认导航','Start navigation')" @cancel="waypointToNavigate = undefined" @confirm="navigateToWaypoint" />
    <SsModal :show="showDeleteWaypoint" :title="l('删除航点','Delete waypoint')" :description="l('正在被航线使用的航点不能直接删除。','A waypoint used by a route cannot be deleted directly.')" icon="trash-2" tone="danger" :confirm-text="l('确认删除','Delete')" @cancel="showDeleteWaypoint = false" @confirm="deleteWaypoint" />
    <SsModal :show="showSafetyConfirm" :title="safetyConfirmTitle" :description="safetyConfirmDescription" icon="shield-alert" tone="warning" :confirm-text="l('确认修改','Confirm')" @cancel="cancelSafetySetting" @confirm="confirmSafetySetting" />
    <SsModal :show="showBowConfirm" :title="l('设置船艏向参考','Set bow heading reference')" :description="l(`将以设备当前船艏角 ${device?.telemetry.heading ?? '--'}° 建立参考。`,`Use current heading ${device?.telemetry.heading ?? '--'}° as the reference.`)" icon="navigation" tone="warning" :confirm-text="l('确认设置','Set reference')" @cancel="showBowConfirm = false" @confirm="setBowReference" />
    <SsModal :show="showAnchorConfirm" :title="l('主杆尚未到底','Shaft is not lowered')" :description="l('到位保护已开启。将先把主杆下降到底，再自动进入定点锚定。','Arrival protection is on. Lower the shaft first, then enter anchor mode automatically.')" icon="anchor" tone="warning" :confirm-text="l('下降并锚定','Lower and anchor')" @cancel="showAnchorConfirm = false" @confirm="lowerShaftAndAnchor" />
  </view>
</template>

<style scoped>
.direction :deep(.ss-icon),.lift-control :deep(.ss-icon),.stop-button :deep(.ss-icon){filter:brightness(0) invert(1)}
.unbind-region-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12rpx;margin-top:24rpx;padding:18rpx;background:var(--color-bg-canvas);border-radius:var(--radius-sm)}.unbind-region-summary view{min-width:0}.unbind-region-summary text,.unbind-region-summary strong,.unbind-region-summary span{display:block}.unbind-region-summary text{color:var(--color-text-secondary);font-size:19rpx}.unbind-region-summary strong{margin-top:4rpx;font-size:22rpx;overflow-wrap:anywhere}.unbind-region-summary span{grid-column:1/-1;padding-top:12rpx;color:var(--color-text-secondary);border-top:2rpx solid var(--color-divider);font-size:20rpx;line-height:30rpx}
.waypoint-name-form{display:flex;flex-direction:column;gap:16rpx;margin-top:24rpx}.waypoint-name-form label>text{display:block;margin-bottom:8rpx;color:var(--color-text-secondary);font-size:21rpx;font-weight:600}.waypoint-name-form label>view{display:flex;height:78rpx;align-items:center;gap:10rpx;padding:0 18rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-sm);box-sizing:border-box}.waypoint-name-form input{min-width:0;height:100%;flex:1;color:var(--color-text-primary);font-size:24rpx}.waypoint-coordinate{display:flex;align-items:center;gap:12rpx;padding:16rpx;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-blue-200);border-radius:var(--radius-sm)}.waypoint-coordinate>span{display:flex;width:44rpx;height:44rpx;flex:0 0 44rpx;align-items:center;justify-content:center;background:#fff;border-radius:9rpx}.waypoint-coordinate text,.waypoint-coordinate strong{display:block}.waypoint-coordinate text{color:var(--color-text-secondary);font-size:19rpx}.waypoint-coordinate strong{margin-top:3rpx;font-family:var(--ss-font-data);font-size:22rpx}.waypoint-storage{display:flex;align-items:center;gap:8rpx;color:var(--color-text-secondary);font-size:19rpx}
.detail-page{display:flex;height:100vh;flex-direction:column;overflow:hidden;background:#d9ebfb}.detail-page :deep(.ss-status-bar),.detail-page :deep(.app-bar){color:#fff;background:#071827}.detail-page :deep(.app-title){color:#fff}.detail-page :deep(.app-action .ss-icon){filter:brightness(0) invert(1)}
.helm-map{position:relative;min-height:0;flex:1;overflow:hidden;background:#cfe8fb}.helm-map.fullscreen{position:fixed;z-index:70;inset:0}.chart-viewport{position:absolute;inset:0;transform-origin:center;transition:transform .25s ease}.chart-background{position:absolute;width:100%;height:100%;inset:0;transition:filter .25s ease}.theme-dusk .chart-background{filter:sepia(.28) saturate(.85) brightness(.78)}.theme-night .chart-background{filter:hue-rotate(172deg) saturate(.7) brightness(.34)}.theme-night{background:#10263a}.depth-band{position:absolute;z-index:1;border-radius:50%;opacity:.18}.band-a{width:380rpx;height:330rpx;top:38%;left:-120rpx;background:#1f91dc}.band-b{width:320rpx;height:300rpx;right:-80rpx;bottom:30%;background:#0e6db1}
.chart-grid-label{position:absolute;z-index:2;color:rgba(42,75,92,.58);font-size:18rpx;font-weight:600}.label-a{top:36%;left:30rpx}.label-b{top:54%;right:24rpx}.label-c{top:47%;left:50%;transform:translateX(-50%)}.display-basic .chart-grid-label,.display-basic .course-segment,.display-basic .waypoint-marker{display:none}.display-standard .label-c{display:none}.course-segment{position:absolute;z-index:2;height:3rpx;background:rgba(36,105,224,.75);border-radius:99rpx;transform-origin:left center}.course-a{top:44%;left:34%;width:210rpx;transform:rotate(28deg)}.course-b{top:51%;left:52%;width:150rpx;transform:rotate(142deg)}.boundary-symbolized .course-segment{height:5rpx;background:repeating-linear-gradient(90deg,#2469e0 0 18rpx,transparent 18rpx 30rpx)}
.waypoint-marker{position:absolute;z-index:3;display:flex;width:54rpx;height:54rpx;align-items:center;justify-content:center;background:#fff;border:5rpx solid var(--color-action-primary);border-radius:50%;box-shadow:0 8rpx 18rpx rgba(15,23,42,.18)}.marker-a{top:40%;left:31%}.marker-b{top:49%;right:25%;background:var(--ss-orange-500);border-color:#fff}.points-paper .waypoint-marker{border-radius:50% 50% 50% 10rpx;transform:rotate(-45deg)}.points-paper .waypoint-marker :deep(.ss-icon){transform:rotate(45deg)}.device-position{position:absolute;z-index:4;display:flex;width:66rpx;height:66rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50%;box-shadow:0 8rpx 24rpx rgba(15,23,42,.24);transform:translate(-50%,-50%);transition:top .8s,left .8s}.device-position.is-playing{box-shadow:0 0 0 12rpx rgba(36,105,224,.18),0 8rpx 24rpx rgba(15,23,42,.24)}
.helm-top-stack{position:absolute;z-index:8;top:16rpx;right:16rpx;left:16rpx;display:flex;flex-direction:column;gap:12rpx}.helm-top-stack.fullscreen{top:20rpx;right:96rpx;left:20rpx}.helm-summary{padding:12rpx 14rpx;background:rgba(255,255,255,.96);border:2rpx solid rgba(255,255,255,.98);border-radius:14rpx;box-shadow:0 10rpx 28rpx rgba(26,64,94,.14);backdrop-filter:blur(10px)}.device-overview{display:flex;min-height:72rpx;align-items:center;gap:10rpx;padding-bottom:8rpx;border-bottom:2rpx solid var(--color-divider)}.device-overview>span{display:flex;width:48rpx;height:48rpx;flex:0 0 48rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:10rpx}.device-overview>view{min-width:0;flex:1}.device-overview strong,.device-overview text{display:block}.device-overview strong{overflow:hidden;font-size:22rpx;text-overflow:ellipsis;white-space:nowrap}.device-overview>view text{overflow:hidden;color:var(--color-text-secondary);font-size:15rpx;text-overflow:ellipsis;white-space:nowrap}.device-overview>button{display:flex;min-width:92rpx;height:88rpx;align-items:center;justify-content:center;gap:5rpx;padding:0 11rpx;color:var(--ss-orange-700);background:var(--ss-orange-50);border:2rpx solid #ffd59a;border-radius:10rpx;font-size:17rpx;font-weight:700}.connection-row{display:flex;align-items:center;gap:10rpx;padding-top:8rpx}.gps-block{display:flex;min-width:0;flex:1;align-items:center;gap:8rpx}.gps-block>view{min-width:0}.gps-block strong,.gps-block text{display:block}.gps-block strong{font-size:19rpx}.gps-block text{overflow:hidden;color:var(--color-text-secondary);font-size:14rpx;text-overflow:ellipsis;white-space:nowrap}.connection-button{display:flex;min-width:96rpx;height:54rpx;align-items:center;justify-content:center;gap:4rpx;padding:0 8rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-blue-200);border-radius:9rpx;font-size:14rpx;font-weight:700}.connection-button.connected{color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary)}
.summary-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:8rpx;padding-top:8rpx;border-top:2rpx solid var(--color-divider)}.summary-metrics>view{min-width:0;padding:0 7rpx;text-align:center;border-left:2rpx solid var(--color-divider)}.summary-metrics>view:first-child{border-left:0}.summary-metrics text,.summary-metrics strong,.summary-metrics span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.summary-metrics text{color:var(--color-text-secondary);font-size:13rpx}.summary-metrics strong{margin-top:1rpx;font-size:17rpx}.summary-metrics span{margin-top:1rpx;color:var(--color-text-secondary);font-size:12rpx}.summary-metrics .highlight strong{color:var(--color-action-primary)}.metric-mode{display:flex!important;align-items:center;justify-content:center;gap:3rpx}.status-ribbon{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4rpx;margin-top:8rpx;padding-top:8rpx;border-top:2rpx solid var(--color-divider)}.status-ribbon span{display:flex;min-width:0;align-items:center;justify-content:center;gap:4rpx;overflow:hidden;color:var(--color-text-secondary);font-size:13rpx;text-overflow:ellipsis;white-space:nowrap}
.quick-actions{display:grid;grid-template-columns:1.18fr repeat(3,minmax(0,1fr));gap:8rpx}.quick-actions button{display:flex;min-width:0;height:88rpx;flex-direction:column;align-items:center;justify-content:center;gap:3rpx;padding:4rpx;color:var(--color-text-primary);background:rgba(255,255,255,.96);border:2rpx solid rgba(255,255,255,.98);border-radius:11rpx;box-shadow:0 7rpx 18rpx rgba(29,69,99,.12);font-size:15rpx}.quick-actions button:first-child{flex-direction:row;gap:4rpx}.quick-actions button text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.quick-actions button.active{color:var(--color-action-primary);border-color:var(--ss-blue-300);background:var(--ss-blue-50)}.chart-tools{position:absolute;z-index:9;top:382rpx;right:14rpx;display:flex;flex-direction:column;gap:8rpx}.helm-map.fullscreen .chart-tools{top:122rpx}.chart-tools button{display:flex;width:76rpx;height:78rpx;flex-direction:column;align-items:center;justify-content:center;gap:2rpx;color:var(--color-text-secondary);background:rgba(255,255,255,.96);border:2rpx solid rgba(123,151,174,.26);border-radius:9rpx;box-shadow:0 6rpx 16rpx rgba(27,65,94,.12);font-size:13rpx}.chart-secondary-tools{position:absolute;z-index:7;top:382rpx;left:14rpx;display:flex;flex-direction:column;gap:8rpx}.helm-map.fullscreen .chart-secondary-tools{top:122rpx}.chart-secondary-tools button{display:flex;min-width:104rpx;height:66rpx;align-items:center;justify-content:flex-start;gap:6rpx;padding:0 10rpx;color:var(--color-text-secondary);background:rgba(255,255,255,.94);border:2rpx solid rgba(123,151,174,.26);border-radius:9rpx;box-shadow:0 6rpx 16rpx rgba(27,65,94,.1);font-size:14rpx}.zoom-control{position:absolute;z-index:9;right:14rpx;bottom:316rpx;display:grid;width:68rpx;overflow:hidden;background:rgba(255,255,255,.96);border:2rpx solid rgba(123,151,174,.26);border-radius:9rpx;box-shadow:0 6rpx 16rpx rgba(27,65,94,.12)}.zoom-control button,.zoom-control text{display:flex;height:54rpx;align-items:center;justify-content:center;background:transparent;border:0;font-size:26rpx}.zoom-control text{height:38rpx;color:var(--color-text-secondary);border-top:2rpx solid var(--color-divider);border-bottom:2rpx solid var(--color-divider);font-size:17rpx}
.helm-dock{position:absolute;z-index:6;right:0;bottom:0;left:0;height:294rpx;background:rgba(7,24,36,.94);border-top:2rpx solid rgba(255,255,255,.14);border-radius:24rpx 24rpx 0 0;box-shadow:0 -12rpx 30rpx rgba(7,24,36,.2);backdrop-filter:blur(8px)}.dock-guide{position:absolute;z-index:7;top:18rpx;left:18rpx;display:flex;width:174rpx;align-items:flex-start;gap:7rpx;color:#fff}.dock-guide>view{min-width:0}.dock-guide strong,.dock-guide text{display:block}.dock-guide strong{font-size:17rpx}.dock-guide text{margin-top:2rpx;color:rgba(255,255,255,.62);font-size:12rpx;line-height:17rpx}.compass{position:absolute;bottom:12rpx;left:50%;width:246rpx;height:246rpx;background:#071116;border:5rpx solid rgba(255,255,255,.94);border-radius:50%;box-shadow:0 0 0 5rpx rgba(72,105,125,.5),0 12rpx 28rpx rgba(0,0,0,.28);transform:translateX(-50%)}.compass.working{box-shadow:0 0 0 5rpx rgba(72,105,125,.5),0 0 28rpx rgba(45,123,255,.5)}.compass-ring{position:absolute;inset:25rpx;border:2rpx solid rgba(255,255,255,.2);border-radius:50%}.north{position:absolute;top:11rpx;left:50%;color:#fff;font-size:19rpx;font-weight:700;transform:translateX(-50%)}.heading-needle{position:absolute;top:9rpx;bottom:9rpx;left:50%;width:4rpx;background:linear-gradient(to bottom,#ef3340 0 41%,transparent 41% 59%,#fff 59%);transform-origin:center}.direction{position:absolute;z-index:3;display:flex!important;width:76rpx;height:76rpx;flex-direction:column;align-items:center;justify-content:center;padding:0!important;color:#fff!important;background:#183141!important;border:2rpx solid rgba(255,255,255,.18)!important;border-radius:50%;font-size:13rpx;line-height:15rpx}.direction:disabled{opacity:.3}.north-button{top:7rpx;left:50%;transform:translateX(-50%)}.south-button{bottom:7rpx;left:50%;transform:translateX(-50%)}.west-button{top:50%;left:7rpx;transform:translateY(-50%)}.east-button{top:50%;right:7rpx;transform:translateY(-50%)}.stop-button{position:absolute;z-index:4;top:50%;left:50%;display:flex!important;width:78rpx;height:78rpx;align-items:center;justify-content:center;padding:0!important;background:var(--color-action-primary)!important;border:5rpx solid rgba(255,255,255,.2)!important;border-radius:50%;transform:translate(-50%,-50%)}.stop-button.engaged{background:#cf2639!important}.dock-readout{position:absolute;bottom:17rpx;color:#fff;text-align:left}.dock-readout.left{left:18rpx}.dock-readout.right{right:18rpx;text-align:right}.dock-readout strong,.dock-readout text{display:block}.dock-readout strong{font-size:25rpx}.dock-readout text{color:rgba(255,255,255,.62);font-size:13rpx}.lift-control{position:absolute;z-index:7;right:18rpx;display:flex!important;width:94rpx;height:66rpx;flex-direction:column;align-items:center;justify-content:center;padding:0!important;color:#fff!important;background:#173344!important;border:2rpx solid rgba(255,255,255,.38)!important;border-radius:10rpx;font-size:12rpx;line-height:15rpx}.lift-control:disabled{opacity:.35}.lift-up{top:20rpx}.lift-down{top:94rpx}.lift-state{position:absolute;right:18rpx;top:169rpx;display:flex;width:94rpx;height:34rpx;align-items:center;justify-content:center;color:#b9d8ee;background:rgba(3,14,21,.6);border-radius:8rpx;font-size:12rpx}
.offline-cover{position:absolute;z-index:30;inset:0;display:flex;align-items:center;justify-content:center;padding:34rpx;background:rgba(8,20,29,.54)}.offline-cover>view{width:100%;padding:32rpx;background:#fff;border-radius:18rpx;text-align:center}.offline-cover strong,.offline-cover text{display:block}.offline-cover strong{margin-top:12rpx;font-size:28rpx}.offline-cover text{margin-top:7rpx;color:var(--color-text-secondary);font-size:20rpx}.offline-cover .btn{width:100%;margin-top:22rpx}
.basic-device{min-height:0;flex:1;padding:24rpx 28rpx calc(36rpx + env(safe-area-inset-bottom));box-sizing:border-box;background:var(--color-background-page)}.basic-device-hero{display:flex;align-items:center;gap:18rpx;padding:24rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:15rpx}.basic-device-icon{display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx}.basic-device-hero>view{min-width:0}.basic-device-hero strong,.basic-device-hero text,.basic-device-hero span{display:block}.basic-device-hero strong{font-size:28rpx}.basic-device-hero text{color:var(--color-text-secondary);font-size:19rpx}.basic-device-hero span{width:max-content;margin-top:8rpx;padding:4rpx 10rpx;background:var(--ss-neutral-100);border-radius:99rpx;font-size:17rpx}.basic-device-hero span.connected{color:var(--color-status-success);background:var(--ss-green-50)}.service-entry{display:flex;width:100%;align-items:center;gap:14rpx;margin-top:18rpx;padding:17rpx;color:var(--color-text-primary);background:var(--ss-orange-50);border:2rpx solid #ffdca8;border-radius:13rpx;text-align:left}.service-entry>span{display:flex;width:62rpx;height:62rpx;align-items:center;justify-content:center;background:#fff;border-radius:11rpx}.service-entry>view{min-width:0;flex:1}.service-entry strong,.service-entry text{display:block}.service-entry strong{font-size:24rpx}.service-entry text{color:var(--color-text-secondary);font-size:18rpx}.basic-section{margin-top:18rpx;padding:20rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx}.basic-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:15rpx}.basic-section-title strong{font-size:25rpx}.basic-section-title button{color:var(--color-action-primary);background:transparent;border:0;font-size:18rpx}.basic-grid,.info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11rpx}.basic-grid>view,.info-grid>view{min-width:0;padding:15rpx;background:var(--color-background-page);border-radius:10rpx}.basic-grid text,.basic-grid strong,.info-grid text,.info-grid strong{display:block}.basic-grid text,.info-grid text{color:var(--color-text-secondary);font-size:17rpx}.basic-grid strong,.info-grid strong{margin-top:4rpx;overflow:hidden;font-size:21rpx;text-overflow:ellipsis;white-space:nowrap}
.linked-business{padding:0;overflow:hidden}.linked-business .basic-section-title{margin:0;padding:20rpx;border-bottom:2rpx solid var(--color-divider)}.linked-business .basic-section-title>text{color:var(--color-text-secondary);font-size:18rpx}.linked-row{display:flex;width:100%;min-height:92rpx;align-items:center;gap:13rpx;padding:14rpx 18rpx;color:var(--color-text-primary);background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left;box-sizing:border-box}.linked-row:last-child{border-bottom:0}.linked-row>span{display:flex;width:48rpx;height:48rpx;flex:0 0 48rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:10rpx}.linked-row>view{min-width:0;flex:1}.linked-row strong,.linked-row text{display:block}.linked-row strong{font-size:21rpx}.linked-row text{margin-top:3rpx;overflow:hidden;color:var(--color-text-secondary);font-size:17rpx;text-overflow:ellipsis;white-space:nowrap}
.detail-panel-layer{position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;background:rgba(7,24,39,.46)}.detail-panel{display:flex;width:100%;max-height:82vh;flex-direction:column;padding-bottom:calc(env(safe-area-inset-bottom) + 12rpx);background:#fff;border-radius:26rpx 26rpx 0 0;box-shadow:0 -18rpx 48rpx rgba(7,24,39,.22)}.panel-grabber{width:70rpx;height:7rpx;margin:11rpx auto 3rpx;background:#b4c0cf;border-radius:99rpx}.panel-header{display:flex;min-height:82rpx;align-items:center;justify-content:space-between;padding:9rpx 20rpx 12rpx 26rpx;border-bottom:2rpx solid var(--color-divider)}.panel-header>view{min-width:0}.panel-header strong,.panel-header text{display:block}.panel-header strong{font-size:27rpx}.panel-header text{color:var(--color-text-secondary);font-size:17rpx}.panel-header button{display:flex;width:68rpx;height:64rpx;align-items:center;justify-content:center;background:transparent;border:0}.panel-scroll{height:min(66vh,940rpx);padding:21rpx 25rpx 30rpx;box-sizing:border-box}.connection-overview{display:flex;align-items:center;gap:14rpx;padding:20rpx;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-blue-200);border-radius:13rpx}.connection-overview>span{width:16rpx;height:16rpx;background:var(--color-status-error);border-radius:50%}.connection-overview>span.online{background:var(--color-status-success)}.connection-overview strong,.connection-overview text{display:block}.connection-overview strong{font-size:24rpx}.connection-overview text{color:var(--color-text-secondary);font-size:18rpx}
.panel-list{margin-top:18rpx;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:13rpx}.panel-list-row{display:flex;width:100%;min-height:94rpx;align-items:center;gap:13rpx;padding:13rpx 16rpx;color:var(--color-text-primary);background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left;box-sizing:border-box}.panel-list-row:last-child{border-bottom:0}.panel-list-row>view{min-width:0;flex:1}.panel-list-row strong,.panel-list-row text{display:block}.panel-list-row strong{font-size:22rpx}.panel-list-row text{overflow:hidden;color:var(--color-text-secondary);font-size:17rpx;text-overflow:ellipsis;white-space:nowrap}.panel-icon{display:flex;width:60rpx;height:60rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:11rpx}.panel-icon.warning{background:var(--ss-orange-50)}.panel-icon.large{width:76rpx;height:76rpx}.compact-action{display:flex;min-width:100rpx;height:60rpx;align-items:center;justify-content:center;gap:5rpx;padding:0 13rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-blue-200);border-radius:9rpx;font-size:18rpx;font-weight:700}.compact-action:disabled{opacity:.45}.panel-primary{display:flex;width:100%;height:80rpx;align-items:center;justify-content:center;gap:8rpx;margin-top:20rpx}.panel-note{display:flex;gap:9rpx;margin-top:18rpx;padding:16rpx;background:var(--ss-blue-50);border-radius:11rpx;color:var(--color-text-secondary);font-size:18rpx}.panel-note text{flex:1}
.mode-list{overflow:hidden;border:2rpx solid var(--color-border-subtle);border-radius:13rpx}.mode-list button{display:flex;width:100%;min-height:100rpx;align-items:center;gap:13rpx;padding:12rpx 15rpx;color:var(--color-text-primary);background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left}.mode-list button:last-child{border-bottom:0}.mode-list button>span{display:flex;width:58rpx;height:58rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:11rpx}.mode-list button>view{min-width:0;flex:1}.mode-list strong,.mode-list text{display:block}.mode-list strong{font-size:22rpx}.mode-list text{color:var(--color-text-secondary);font-size:17rpx}.mode-list button.active{background:var(--ss-blue-50)}.mode-list button.active>span{background:var(--color-action-primary)}
.parameter-card{display:flex;align-items:center;gap:15rpx;padding:18rpx;background:var(--ss-blue-50);border:2rpx solid var(--ss-blue-200);border-radius:12rpx}.parameter-card+*{margin-top:20rpx}.parameter-card>view{min-width:0;flex:1}.parameter-card strong,.parameter-card text{display:block}.parameter-card strong{font-size:22rpx}.parameter-card text{margin-top:3rpx;color:var(--color-text-secondary);font-size:17rpx}.field-block{margin-top:20rpx}.field-label{display:block;margin-bottom:9rpx;color:var(--color-text-secondary);font-size:19rpx;font-weight:700}.field-block>span{display:block;margin-top:7rpx;color:var(--color-text-secondary);font-size:16rpx}.number-field{display:flex;height:72rpx;align-items:center;border:2rpx solid var(--color-border-subtle);border-radius:10rpx}.number-field input{min-width:0;height:100%;flex:1;padding:0 14rpx;font-size:22rpx}.number-field text{padding:0 16rpx;color:var(--color-text-secondary);font-size:20rpx}.segment-control{display:grid;grid-template-columns:repeat(3,1fr);gap:6rpx;padding:5rpx;background:var(--color-background-page);border-radius:11rpx}.segment-control.two{grid-template-columns:repeat(2,1fr)}.segment-control button{height:66rpx;color:var(--color-text-secondary);background:transparent;border:0;border-radius:8rpx;font-size:19rpx;font-weight:700}.segment-control button.active{color:#fff;background:var(--color-action-primary)}.distance-options{display:grid;grid-template-columns:repeat(5,1fr);gap:7rpx}.distance-options button{height:62rpx;color:var(--color-text-secondary);background:var(--color-background-page);border:2rpx solid var(--color-border-subtle);border-radius:9rpx;font-size:18rpx}.distance-options button.active{color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary)}.safety-list{margin-top:22rpx}.toggle-row>i{position:relative;width:78rpx;height:42rpx;flex:0 0 auto;background:#cbd5e1;border-radius:99rpx}.toggle-row>i::after{position:absolute;top:4rpx;left:4rpx;width:34rpx;height:34rpx;content:'';background:#fff;border-radius:50%;transition:transform .2s}.toggle-row>i.on{background:var(--color-action-primary)}.toggle-row>i.on::after{transform:translateX(36rpx)}
.chart-setting-group{margin-bottom:22rpx}.chart-setting-group>text{display:block;margin-bottom:9rpx;color:var(--color-text-secondary);font-size:19rpx;font-weight:700}.identity-strip{display:flex;align-items:center;gap:14rpx;padding-bottom:18rpx;border-bottom:2rpx solid var(--color-divider)}.identity-strip>view{min-width:0;flex:1}.identity-strip strong,.identity-strip text{display:block}.identity-strip strong{font-size:25rpx}.identity-strip text{color:var(--color-text-secondary);font-size:18rpx}.identity-strip em{padding:5rpx 10rpx;color:var(--color-status-success);background:var(--ss-green-50);border-radius:99rpx;font-size:16rpx;font-style:normal}.info-grid{margin-top:18rpx}.panel-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12rpx;margin-bottom:14rpx}.panel-toolbar strong,.panel-toolbar text{display:block}.panel-toolbar strong{font-size:23rpx}.panel-toolbar text{color:var(--color-text-secondary);font-size:17rpx}.sequence{display:flex;width:44rpx;height:44rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:50%;font-size:17rpx;font-weight:700}.waypoint-actions{display:flex}.waypoint-actions button{display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;background:transparent;border:0}.waypoint-sync-setting{display:flex;min-height:94rpx;align-items:center;gap:13rpx;margin-bottom:18rpx;padding:14rpx 16rpx;background:var(--ss-blue-50);border:2rpx solid var(--ss-blue-200);border-radius:var(--radius-md);box-sizing:border-box}.waypoint-sync-setting>view{min-width:0;flex:1}.waypoint-sync-setting strong,.waypoint-sync-setting text{display:block}.waypoint-sync-setting strong{font-size:22rpx}.waypoint-sync-setting text{margin-top:3rpx;color:var(--color-text-secondary);font-size:17rpx}.waypoint-sync-setting>i{position:relative;width:78rpx;height:42rpx;flex:0 0 auto;background:#cbd5e1;border-radius:99rpx}.waypoint-sync-setting>i::after{position:absolute;top:4rpx;left:4rpx;width:34rpx;height:34rpx;content:'';background:#fff;border-radius:50%;transition:transform .2s}.waypoint-sync-setting>i.on{background:var(--color-action-primary)}.waypoint-sync-setting>i.on::after{transform:translateX(36rpx)}
@media(max-height:760px){.helm-top-stack{top:10rpx}.helm-summary{padding:8rpx 12rpx}.device-overview{min-height:64rpx}.device-overview>button{height:78rpx}.quick-actions button{height:78rpx}.chart-tools,.chart-secondary-tools{top:348rpx}.helm-dock{height:276rpx}.compass{width:230rpx;height:230rpx}.zoom-control{bottom:294rpx}.lift-up{top:16rpx}.lift-down{top:87rpx}.lift-state{top:158rpx}.detail-panel{max-height:84vh}.panel-scroll{height:71vh}}

/* Marine equipment console: one summary surface, grouped tools and reliable touch sizes. */
.detail-page{background:#dcecf7}
.detail-page :deep(.ss-status-bar),.detail-page :deep(.app-bar){background:#0d2a3c}
.helm-top-stack{top:18rpx;right:18rpx;left:18rpx;gap:10rpx}
.helm-summary{padding:14rpx 16rpx;background:rgba(255,255,255,.98);border:2rpx solid rgba(180,203,219,.78);border-radius:var(--radius-md);box-shadow:0 8rpx 24rpx rgba(21,52,85,.12);backdrop-filter:none}
.device-overview{min-height:82rpx;gap:12rpx;padding-bottom:10rpx}
.device-overview>span{width:54rpx;height:54rpx;flex-basis:54rpx;border-radius:var(--radius-sm)}
.device-overview strong{font-size:24rpx;line-height:32rpx;font-weight:650}
.device-overview>view text{font-size:17rpx;line-height:25rpx}
.device-overview>button{min-width:104rpx;height:88rpx;gap:6rpx;padding:0 14rpx;border-radius:var(--radius-sm);font-size:18rpx}
.connection-row{min-height:66rpx;gap:12rpx;padding-top:10rpx}
.gps-block{gap:10rpx}.gps-block strong{font-size:20rpx;line-height:28rpx}.gps-block text{font-size:16rpx;line-height:23rpx}
.connection-button{min-width:106rpx;height:72rpx;padding:0 12rpx;border-radius:var(--radius-sm);font-size:17rpx}
.summary-metrics{margin-top:10rpx;padding-top:10rpx}
.summary-metrics>view{padding:0 8rpx}.summary-metrics text{font-size:15rpx}.summary-metrics strong{margin-top:3rpx;font-size:19rpx;line-height:27rpx}.summary-metrics span{font-size:14rpx;line-height:21rpx}
.quick-actions{grid-template-columns:repeat(4,minmax(0,1fr));gap:0;overflow:hidden;background:rgba(255,255,255,.98);border:2rpx solid rgba(180,203,219,.78);border-radius:var(--radius-md);box-shadow:0 8rpx 22rpx rgba(21,52,85,.11)}
.quick-actions button,.quick-actions button:first-child{height:88rpx;flex-direction:column;gap:3rpx;padding:4rpx;border:0;border-right:2rpx solid var(--color-divider);border-radius:0;box-shadow:none;font-size:16rpx}
.quick-actions button:last-child{border-right:0}.quick-actions button.active{background:var(--ss-brand-50);border-color:var(--color-divider)}
.chart-tools{top:520rpx;right:16rpx;gap:0;overflow:hidden;background:rgba(255,255,255,.98);border:2rpx solid rgba(123,151,174,.28);border-radius:var(--radius-md);box-shadow:0 7rpx 20rpx rgba(21,52,85,.12)}
.helm-map.fullscreen .chart-tools{top:116rpx}
.chart-tools button{width:88rpx;height:88rpx;gap:3rpx;background:transparent;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none;font-size:14rpx}
.chart-tools button:last-child{border-bottom:0}
.chart-secondary-tools{top:520rpx;left:16rpx;gap:8rpx}
.helm-map.fullscreen .chart-secondary-tools{top:116rpx}
.chart-secondary-tools button{min-width:116rpx;height:88rpx;gap:8rpx;padding:0 12rpx;background:rgba(255,255,255,.98);border-radius:var(--radius-md);font-size:15rpx}
.zoom-control{right:16rpx;bottom:322rpx;width:80rpx;border-radius:var(--radius-md)}
.zoom-control button{height:64rpx}.zoom-control text{height:42rpx;font-size:16rpx}
.helm-dock{height:304rpx;background:rgba(13,42,60,.98);border-radius:20rpx 20rpx 0 0;box-shadow:0 -10rpx 26rpx rgba(13,42,60,.18);backdrop-filter:none}
.dock-guide{top:20rpx;left:20rpx;width:176rpx;gap:8rpx}.dock-guide strong{font-size:18rpx}.dock-guide text{font-size:13rpx;line-height:18rpx}
.compass{bottom:14rpx;width:254rpx;height:254rpx;background:#091820;border-width:4rpx;box-shadow:0 0 0 4rpx rgba(109,141,160,.46),0 10rpx 24rpx rgba(0,0,0,.24)}
.direction{width:88rpx;height:88rpx;background:#1b3b4e!important;font-size:14rpx;line-height:16rpx}
.north-button{top:4rpx}.south-button{bottom:4rpx}.west-button{left:4rpx}.east-button{right:4rpx}
.stop-button{width:88rpx;height:88rpx;border-width:4rpx!important}
.lift-control{right:20rpx;width:100rpx;height:82rpx;border-radius:var(--radius-sm);font-size:14rpx;line-height:18rpx}.lift-up{top:18rpx}.lift-down{top:108rpx}.lift-state{right:20rpx;top:200rpx;width:100rpx;height:38rpx;border-radius:var(--radius-sm);font-size:13rpx}
.dock-readout{bottom:20rpx}.dock-readout.left{left:20rpx}.dock-readout.right{right:20rpx}.dock-readout strong{font-size:27rpx}.dock-readout text{font-size:14rpx}
.detail-panel{border-radius:28rpx 28rpx 0 0}.panel-header{min-height:94rpx;padding:10rpx 16rpx 14rpx 28rpx}.panel-header strong{font-size:28rpx}.panel-header text{font-size:18rpx}.panel-header button{width:88rpx;height:88rpx}
.panel-scroll{padding:24rpx 28rpx 32rpx}.panel-list,.mode-list{border-radius:var(--radius-md)}.panel-list-row{min-height:108rpx;padding:15rpx 18rpx}.panel-list-row strong{font-size:23rpx}.panel-list-row text{font-size:18rpx}
.compact-action{min-width:108rpx;height:72rpx;border-radius:var(--radius-sm);font-size:18rpx}
.parameter-card,.field-block,.chart-setting-group{border-radius:var(--radius-md)}
.chart-secondary-tools button.active{color:var(--color-action-primary);border-color:var(--ss-blue-300);background:var(--ss-blue-50)}
.demo-chart-badge{position:absolute;z-index:5;top:34%;left:50%;display:flex;align-items:center;gap:7rpx;padding:8rpx 13rpx;color:var(--ss-blue-800);background:rgba(255,255,255,.9);border:2rpx solid rgba(70,125,229,.25);border-radius:8rpx;font-size:14rpx;box-shadow:0 5rpx 14rpx rgba(21,52,85,.12);transform:translateX(-50%)}
.demo-measurement{position:absolute;z-index:4;top:47%;left:30%;width:40%;height:80rpx;transform:rotate(-18deg)}
.demo-measurement span{position:absolute;top:38rpx;right:0;left:0;height:3rpx;background:var(--color-action-primary);box-shadow:0 0 0 2rpx rgba(255,255,255,.7)}
.demo-measurement span::before,.demo-measurement span::after{position:absolute;top:-8rpx;width:3rpx;height:19rpx;background:var(--color-action-primary);content:''}.demo-measurement span::before{left:0}.demo-measurement span::after{right:0}
.demo-measurement text{position:absolute;top:3rpx;left:50%;padding:4rpx 8rpx;color:#fff;background:var(--color-action-primary);border-radius:6rpx;font-size:13rpx;white-space:nowrap;transform:translateX(-50%) rotate(18deg)}
.dock-guide em{display:inline-flex;margin-top:5rpx;padding:2rpx 7rpx;color:#d9ecf8;background:rgba(255,255,255,.1);border-radius:5rpx;font-size:12rpx;font-style:normal;line-height:17rpx}

@media(max-height:760px){.helm-top-stack{top:10rpx}.helm-summary{padding:9rpx 12rpx}.device-overview{min-height:68rpx}.device-overview>button{height:88rpx}.connection-button{height:60rpx}.quick-actions button,.quick-actions button:first-child{height:78rpx}.chart-tools,.chart-secondary-tools{top:484rpx}.chart-tools button,.chart-secondary-tools button{height:80rpx}.helm-dock{height:286rpx}.compass{width:236rpx;height:236rpx}.zoom-control{bottom:302rpx}.lift-control{height:74rpx}.lift-up{top:14rpx}.lift-down{top:94rpx}.lift-state{top:174rpx}.detail-panel{max-height:84vh}.panel-scroll{height:71vh}}

/* Mode-aware helm layout aligned with the physical remote and meeting decisions. */
.helm-top-stack{top:14rpx;right:16rpx;left:16rpx;gap:8rpx}
.helm-summary{padding:10rpx 14rpx}
.device-overview{min-height:72rpx;gap:10rpx;padding-bottom:8rpx}.device-overview>span{width:52rpx;height:52rpx;flex-basis:52rpx}.device-overview strong{font-size:24rpx;line-height:30rpx}.device-overview>view text{font-size:17rpx;line-height:22rpx}.device-overview>button{min-width:102rpx;height:88rpx;gap:5rpx;padding:0 11rpx;font-size:17rpx}
.connection-row{min-height:88rpx;gap:10rpx;padding-top:7rpx}.gps-block{gap:8rpx}.gps-block strong{font-size:20rpx;line-height:26rpx}.gps-block text{font-size:16rpx;line-height:21rpx}.connection-button{min-width:102rpx;height:88rpx;font-size:17rpx}
.summary-metrics{margin-top:7rpx;padding-top:7rpx}.summary-metrics>view{padding:0 6rpx}.summary-metrics text{font-size:15rpx}.summary-metrics strong{margin-top:1rpx;font-size:20rpx;line-height:26rpx}.summary-metrics span{font-size:14rpx;line-height:19rpx}.status-ribbon{margin-top:6rpx;padding-top:6rpx}.status-ribbon span{font-size:14rpx}
.quick-actions{grid-template-columns:1.32fr repeat(3,minmax(0,1fr))}.quick-actions button,.quick-actions button:first-child{height:88rpx;font-size:17rpx}.quick-actions button.mode-action,.quick-actions button.mode-action:first-child{flex-direction:row;justify-content:flex-start;gap:7rpx;padding:0 9rpx;text-align:left}.mode-action>span{display:flex;width:46rpx;height:46rpx;flex:0 0 46rpx;align-items:center;justify-content:center;background:var(--ss-blue-50);border-radius:8rpx}.mode-action>view{min-width:0}.mode-action text,.mode-action strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mode-action text{color:var(--color-text-secondary);font-size:14rpx;font-weight:500}.mode-action strong{margin-top:1rpx;font-size:17rpx}
.chart-tools{top:474rpx;right:16rpx;gap:0}.helm-map.fullscreen .chart-tools{top:112rpx}.chart-tools button{width:88rpx;height:88rpx;font-size:15rpx}
.zoom-control{right:16rpx;bottom:336rpx;width:78rpx}.zoom-control button{height:88rpx}.zoom-control text{height:42rpx}
.helm-dock{height:320rpx}.helm-dock.working{box-shadow:0 -10rpx 30rpx rgba(36,105,224,.24)}
.dock-guide{top:16rpx;left:18rpx;width:228rpx}.dock-guide strong{font-size:17rpx}.dock-guide text{font-size:12rpx;line-height:17rpx}
.lift-control{width:104rpx;height:88rpx}.lift-up{top:16rpx}.lift-down{top:112rpx}.lift-state{top:208rpx;width:104rpx;height:38rpx}.dock-readout.right{right:20rpx}
.playback-console{position:absolute;top:20rpx;right:132rpx;bottom:16rpx;left:18rpx;color:#fff}.playback-heading{display:flex;align-items:center;gap:9rpx}.playback-heading>span{display:flex;width:52rpx;height:52rpx;align-items:center;justify-content:center;background:rgba(255,255,255,.1);border-radius:8rpx}.playback-heading>view{min-width:0;flex:1}.playback-heading strong,.playback-heading text{display:block}.playback-heading strong{font-size:19rpx}.playback-heading text{margin-top:2rpx;overflow:hidden;color:rgba(255,255,255,.68);font-size:14rpx;text-overflow:ellipsis;white-space:nowrap}.playback-heading b{font-size:23rpx}.playback-progress{height:7rpx;margin-top:12rpx;overflow:hidden;background:rgba(255,255,255,.16);border-radius:99rpx}.playback-progress span{display:block;height:100%;background:#55a3ff;border-radius:99rpx;transition:width .3s}.playback-actions{display:grid;grid-template-columns:1.35fr 1.2fr .75fr;gap:7rpx;margin-top:18rpx}.playback-actions button{display:flex;height:88rpx;align-items:center;justify-content:center;gap:5rpx;padding:0 8rpx;color:#fff;background:#21465c;border:2rpx solid rgba(255,255,255,.25);border-radius:9rpx;font-size:15rpx;font-weight:700}.playback-actions button.primary{background:var(--color-action-primary);border-color:var(--color-action-primary)}.playback-actions button.danger{background:rgba(207,38,57,.84);border-color:rgba(255,255,255,.2)}.playback-actions button:disabled{opacity:.4}
.playback-actions :deep(.ss-icon){filter:brightness(0) invert(1)}
.side-thrust-console{position:absolute;top:76rpx;right:132rpx;bottom:20rpx;left:18rpx;display:grid;grid-template-columns:1fr 104rpx 1fr;align-items:center;gap:10rpx}.side-thrust-console button{display:flex;min-width:0;height:126rpx;flex-direction:column;align-items:center;justify-content:center;gap:7rpx;padding:0 8rpx;color:#fff;border-radius:14rpx;font-size:13rpx;font-weight:700}.side-direction{background:#1b3b4e;border:2rpx solid rgba(255,255,255,.26)}.side-direction:active{background:#2469e0}.side-primary{background:#22506a;border:2rpx solid rgba(255,255,255,.32)}.side-primary.engaged{background:#cf2639}.side-thrust-console button:disabled{opacity:.35}
.side-thrust-console :deep(.ss-icon){filter:brightness(0) invert(1)}
.chart-tool-list{overflow:hidden;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md)}.chart-tool-list>button{display:flex;width:100%;min-height:102rpx;align-items:center;gap:13rpx;padding:13rpx 16rpx;color:var(--color-text-primary);background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);text-align:left}.chart-tool-list>button:last-child{border-bottom:0}.chart-tool-list>button.active{background:var(--ss-blue-50)}.chart-tool-list>button>view{min-width:0;flex:1}.chart-tool-list strong,.chart-tool-list text{display:block}.chart-tool-list strong{font-size:21rpx}.chart-tool-list text{margin-top:3rpx;color:var(--color-text-secondary);font-size:16rpx;line-height:22rpx}.chart-tool-list em{padding:4rpx 8rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:6rpx;font-size:14rpx;font-style:normal}
.detail-panel.compact-panel .panel-scroll{height:auto;max-height:68vh}.detail-panel.compact-panel{max-height:none}

@media(max-height:760px){.helm-top-stack{top:8rpx}.helm-summary{padding:7rpx 11rpx}.chart-tools{top:454rpx}.helm-dock{height:310rpx}.zoom-control{bottom:326rpx}.playback-console{top:16rpx}.side-thrust-console{top:68rpx}}

/* Field-console polish: flat instrumentation above, one tactile surface below. */
.helm-map{background:#c9e2f3}
.depth-band{display:none}
.helm-top-stack{top:12rpx;right:14rpx;left:14rpx;gap:6rpx}
.helm-summary{padding:10rpx 12rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md);box-shadow:none;backdrop-filter:none}
.device-overview>span{background:transparent;border-radius:0}
.device-overview>button{height:88rpx;min-height:88rpx;color:var(--ss-orange-700);background:#fff;border-color:#e4c28d;border-radius:var(--radius-sm)}
.connection-row{min-height:76rpx}
.connection-button{height:72rpx;border-radius:var(--radius-sm)}
.summary-metrics text,.status-ribbon span{color:#667582}
.quick-actions{gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md)}
.quick-actions button,.quick-actions button:first-child{height:82rpx;background:#fff;border:0;border-right:2rpx solid var(--color-divider);border-radius:0;box-shadow:none}
.quick-actions button:last-child{border-right:0}
.quick-actions button.active{background:var(--color-action-primary-subtle);border-color:var(--color-divider)}
.mode-action>span{background:transparent;border-radius:0}
.chart-tools{right:14rpx;overflow:hidden;gap:0;background:#fff;border:2rpx solid rgba(98,126,146,.32);border-radius:var(--radius-sm);box-shadow:0 4rpx 12rpx rgba(20,49,72,.08)}
.chart-tools button{width:82rpx;height:82rpx;background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none}
.chart-tools button:last-child{border-bottom:0}
.chart-secondary-tools{left:14rpx;gap:8rpx}
.chart-secondary-tools button{min-width:108rpx;height:76rpx;background:#fff;border:2rpx solid rgba(98,126,146,.3);border-radius:var(--radius-sm);box-shadow:0 4rpx 12rpx rgba(20,49,72,.07)}
.zoom-control{right:14rpx;overflow:hidden;border-radius:var(--radius-sm);box-shadow:0 4rpx 12rpx rgba(20,49,72,.08)}
.helm-dock{background:#0d2a3c;border-radius:16rpx 16rpx 0 0;box-shadow:0 -6rpx 18rpx rgba(7,24,36,.16)}
.direction,.lift-control,.playback-actions button,.side-thrust-console button{border-radius:var(--radius-sm)}
.detail-panel{border-radius:20rpx 20rpx 0 0}
.parameter-card,.field-block,.chart-setting-group,.panel-list,.mode-list,.chart-tool-list{border-radius:var(--radius-md);box-shadow:none}
.device-overview strong{font-size:25rpx;line-height:31rpx}.device-overview>view text{font-size:18rpx;line-height:23rpx}.device-overview>button{font-size:18rpx}
.gps-block strong{font-size:21rpx;line-height:27rpx}.gps-block text{font-size:18rpx;line-height:23rpx}.connection-button{font-size:18rpx}
.summary-metrics text{font-size:17rpx}.summary-metrics strong{font-size:22rpx;line-height:27rpx}.summary-metrics span,.status-ribbon span{font-size:16rpx;line-height:20rpx}
.quick-actions button,.quick-actions button:first-child{font-size:18rpx}.mode-action text{font-size:16rpx}.mode-action strong{font-size:18rpx}
.chart-tools button{font-size:17rpx}

/* Customer-reviewed remote layout: status screen, frequent keys, then chart. */
.remote-display{display:grid;grid-template-columns:1.2fr 1fr .72fr;overflow:hidden;margin-top:8rpx;color:#fff;background:#0c2a3c;border:2rpx solid #173f56;border-radius:10rpx}
.display-mode,.display-propeller,.display-gear{min-width:0;min-height:82rpx;border-right:2rpx solid rgba(255,255,255,.13)}
.display-mode{display:flex;align-items:center;gap:8rpx;padding:8rpx 10rpx;color:#fff;background:transparent;border-top:0;border-bottom:0;border-left:0;text-align:left}
.display-mode>span,.display-propeller>span{display:flex;width:42rpx;height:42rpx;flex:0 0 42rpx;align-items:center;justify-content:center;background:rgba(255,255,255,.1);border-radius:7rpx}
.display-mode>view,.display-propeller>view{min-width:0;flex:1}.display-mode text,.display-mode strong,.display-propeller text,.display-propeller strong,.display-propeller small,.display-gear text,.display-gear strong,.display-gear span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.display-mode text,.display-propeller text,.display-gear text{color:#a9c7d8;font-size:13rpx}.display-mode strong,.display-propeller strong{margin-top:2rpx;font-size:18rpx}.display-mode>:deep(.ss-icon:last-child){opacity:.55}
.display-propeller{display:flex;align-items:center;gap:7rpx;padding:8rpx}.display-propeller small{margin-top:1rpx;color:#a9c7d8;font-size:12rpx}.display-propeller.running>span{background:#176a58}.display-propeller.running>span :deep(.ss-icon){animation:propeller-spin 1.2s linear infinite}
.display-gear{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:5rpx;border-right:0;text-align:center}.display-gear strong{margin:1rpx 0;color:#fff;font-size:25rpx}.display-gear span{color:#a9c7d8;font-size:12rpx}
.remote-display .summary-metrics{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0;padding:7rpx 0;border-top:2rpx solid rgba(255,255,255,.13)}
.remote-display .summary-metrics>view{padding:0 6rpx;border-left:2rpx solid rgba(255,255,255,.1);text-align:center}.remote-display .summary-metrics>view:first-child{border-left:0}.remote-display .summary-metrics text{color:#8fb1c4;font-size:12rpx}.remote-display .summary-metrics strong{margin-top:2rpx;color:#fff;font-size:15rpx;line-height:20rpx}
.quick-actions{grid-template-columns:1fr 1fr 1.35fr}.quick-actions button,.quick-actions button:first-child{height:82rpx;flex-direction:row;gap:6rpx;font-size:16rpx}.quick-actions button.mode-action,.quick-actions button.mode-action:first-child{justify-content:flex-start;padding:0 10rpx}.mode-action>span{width:40rpx;height:40rpx;flex-basis:40rpx}.mode-action text{font-size:13rpx}.mode-action strong{font-size:16rpx}
.waypoint-primary{position:absolute;z-index:9;top:466rpx;left:14rpx;display:flex;min-width:166rpx;height:72rpx;align-items:center;gap:8rpx;padding:0 12rpx;color:#fff;background:var(--color-action-primary);border:2rpx solid #fff;border-radius:var(--radius-sm);box-shadow:0 6rpx 16rpx rgba(20,72,148,.24);text-align:left}.waypoint-primary>view{min-width:0}.waypoint-primary strong,.waypoint-primary text{display:block}.waypoint-primary strong{font-size:17rpx}.waypoint-primary text{margin-top:1rpx;color:rgba(255,255,255,.75);font-size:12rpx}
.waypoint-primary>:deep(.ss-icon){filter:brightness(0) invert(1)}
.chart-tools{top:466rpx}.chart-tools button{height:74rpx}.helm-map.fullscreen .waypoint-primary{top:116rpx}.helm-map.fullscreen .chart-tools{top:116rpx}
.remote-pad{background:#071820;border:4rpx solid rgba(255,255,255,.82);box-shadow:0 0 0 3rpx rgba(103,137,158,.45),0 8rpx 20rpx rgba(0,0,0,.24)}
.remote-pad::before{position:absolute;inset:49rpx;content:'';border:2rpx solid rgba(255,255,255,.12);border-radius:50%}
.remote-pad .direction{color:#173344!important;background:#eef3f6!important;border-color:#fff!important;box-shadow:inset 0 -4rpx 0 rgba(17,45,63,.12)}
.remote-pad .direction:active{background:#cbd9e2!important;transform:scale(.96)}.remote-pad .north-button:active{transform:translateX(-50%) scale(.96)}.remote-pad .south-button:active{transform:translateX(-50%) scale(.96)}.remote-pad .west-button:active{transform:translateY(-50%) scale(.96)}.remote-pad .east-button:active{transform:translateY(-50%) scale(.96)}
.remote-pad .direction :deep(.ss-icon){filter:none}.remote-pad .direction text{color:#173344;font-size:12rpx;font-weight:700}.remote-pad .stop-button{background:#d52d43!important;border-color:#f58a98!important}.remote-pad .stop-button :deep(.ss-icon){filter:brightness(0) invert(1)}
@keyframes propeller-spin{to{transform:rotate(360deg)}}

@media(max-height:760px){.remote-display{margin-top:5rpx}.display-mode,.display-propeller,.display-gear{min-height:70rpx}.remote-display .summary-metrics{padding:5rpx 0}.quick-actions button,.quick-actions button:first-child{height:72rpx}.waypoint-primary,.chart-tools{top:456rpx}.helm-dock{height:300rpx}.zoom-control{bottom:316rpx}}

/* 2026-09 mature UI pass: one instrument hierarchy, one tool language. */
.detail-page :deep(.ss-status-bar),
.detail-page :deep(.app-bar) { background: var(--ss-navy-950); }
.detail-page :deep(.app-bar) { border-bottom-color: rgba(255,255,255,.08); }
.helm-map { background: var(--ss-chart-water); }
.helm-top-stack { top: 16rpx; right: 16rpx; left: 16rpx; gap: 10rpx; }
.helm-summary { padding: 0; overflow: hidden; background: rgba(255,255,255,.985); border: 2rpx solid rgba(119,151,174,.28); border-radius: var(--radius-md); box-shadow: 0 10rpx 28rpx rgba(13,45,64,.13); }
.device-overview { min-height: 88rpx; gap: 12rpx; padding: 10rpx 12rpx; border-bottom: 2rpx solid var(--color-divider); }
.device-overview > span { width: 54rpx; height: 54rpx; flex-basis: 54rpx; background: var(--ss-brand-50); border-radius: var(--radius-sm); }
.device-overview strong { font-size: 26rpx; line-height: 34rpx; }
.device-overview > view text { font-family: var(--ss-font-data); font-size: 16rpx; line-height: 23rpx; }
.device-overview > button { min-width: 106rpx; height: 68rpx; min-height: 68rpx; padding: 0 12rpx; background: #fff8ed; border-color: #e7c58e; font-size: 17rpx; }
.connection-row { min-height: 76rpx; gap: 10rpx; padding: 8rpx 12rpx; }
.gps-block strong { font-size: 20rpx; line-height: 28rpx; }
.gps-block text { font-size: 16rpx; line-height: 22rpx; }
.connection-button { min-width: 104rpx; height: 64rpx; padding: 0 10rpx; font-size: 17rpx; }
.remote-display { margin: 0; background: var(--ss-navy-900); border: 0; border-radius: 0; }
.display-mode, .display-propeller, .display-gear { min-height: 78rpx; }
.display-mode { padding: 8rpx 12rpx; }
.display-mode > span, .display-propeller > span { width: 40rpx; height: 40rpx; flex-basis: 40rpx; background: rgba(255,255,255,.08); }
.display-mode text, .display-propeller text, .display-gear text { font-size: 14rpx; }
.display-mode strong, .display-propeller strong { font-size: 19rpx; }
.display-gear strong { font-family: var(--ss-font-data); font-size: 27rpx; line-height: 30rpx; }
.remote-display .summary-metrics { min-height: 50rpx; padding: 6rpx 0; }
.remote-display .summary-metrics text { font-size: 13rpx; }
.remote-display .summary-metrics strong { font-family: var(--ss-font-data); font-size: 16rpx; line-height: 22rpx; }
.quick-actions { grid-template-columns: repeat(2,minmax(0,1fr)); background: #fff; border-color: rgba(119,151,174,.28); box-shadow: 0 8rpx 22rpx rgba(13,45,64,.1); }
.quick-actions button, .quick-actions button:first-child { height: 88rpx; min-height: 88rpx; gap: 7rpx; padding: 0 8rpx; font-size: 18rpx; }
.quick-actions button.mode-action, .quick-actions button.mode-action:first-child { justify-content: center; }
.mode-action > span { width: 42rpx; height: 42rpx; flex-basis: 42rpx; }
.mode-action text { display: none; }
.mode-action strong { font-size: 18rpx; }
.waypoint-primary { top: 410rpx; left: 16rpx; min-width: 176rpx; height: 76rpx; padding: 0 14rpx; border: 0; background: var(--color-action-primary); box-shadow: 0 8rpx 20rpx rgba(19,67,114,.22); }
.waypoint-primary strong { font-size: 18rpx; }
.waypoint-primary text { font-size: 13rpx; }
.chart-tools { top: 410rpx; right: 16rpx; border-color: rgba(79,111,135,.28); box-shadow: 0 8rpx 20rpx rgba(13,45,64,.12); }
.chart-tools button { width: 84rpx; height: 78rpx; font-size: 15rpx; }
.zoom-control { right: 16rpx; bottom: 326rpx; width: 76rpx; border-color: rgba(79,111,135,.28); box-shadow: 0 8rpx 20rpx rgba(13,45,64,.12); }
.zoom-control button { height: 72rpx; font-size: 28rpx; }
.zoom-control text { height: 42rpx; font-family: var(--ss-font-data); font-size: 16rpx; }
.chart-grid-label { font-family: var(--ss-font-data); font-size: 17rpx; font-weight: 500; }
.device-position { width: 62rpx; height: 62rpx; border-width: 5rpx; }
.waypoint-marker { width: 50rpx; height: 50rpx; border-width: 4rpx; }
.helm-dock { height: 306rpx; background: var(--ss-navy-950); border-top: 2rpx solid rgba(255,255,255,.13); border-radius: 18rpx 18rpx 0 0; box-shadow: 0 -10rpx 26rpx rgba(8,31,46,.2); }
.dock-guide { top: 18rpx; left: 20rpx; width: 202rpx; }
.dock-guide strong { font-size: 19rpx; line-height: 24rpx; }
.dock-guide text { margin-top: 3rpx; font-size: 13rpx; line-height: 18rpx; }
.compass { bottom: 12rpx; width: 244rpx; height: 244rpx; background: #06151e; border: 4rpx solid rgba(255,255,255,.88); box-shadow: 0 0 0 4rpx rgba(105,139,158,.42), 0 12rpx 26rpx rgba(0,0,0,.26); }
.remote-pad::before { inset: 52rpx; border-color: rgba(255,255,255,.16); }
.direction { width: 78rpx; height: 78rpx; color: #fff!important; background: #16384c!important; border: 2rpx solid rgba(255,255,255,.22)!important; box-shadow: inset 0 2rpx 0 rgba(255,255,255,.08)!important; }
.remote-pad .direction { color: #fff!important; background: #16384c!important; border-color: rgba(255,255,255,.22)!important; box-shadow: inset 0 2rpx 0 rgba(255,255,255,.08)!important; }
.remote-pad .direction :deep(.ss-icon) { filter: brightness(0) invert(1); }
.remote-pad .direction text { color: #fff; }
.north-button { top: 7rpx; }
.south-button { bottom: 7rpx; }
.west-button { left: 7rpx; }
.east-button { right: 7rpx; }
.stop-button { width: 78rpx; height: 78rpx; background: var(--color-action-primary)!important; border: 4rpx solid rgba(255,255,255,.25)!important; box-shadow: 0 5rpx 14rpx rgba(0,0,0,.2); }
.stop-button.engaged { background: var(--ss-red-500)!important; }
.lift-control { right: 18rpx; width: 100rpx; height: 76rpx; background: #143447!important; border-color: rgba(255,255,255,.28)!important; font-size: 14rpx; line-height: 19rpx; }
.lift-up { top: 18rpx; }
.lift-down { top: 102rpx; }
.lift-state { top: 186rpx; right: 18rpx; width: 100rpx; height: 36rpx; font-size: 13rpx; }
.dock-readout { bottom: 20rpx; }
.dock-readout.left { left: 20rpx; }
.dock-readout.right { right: 20rpx; }
.dock-readout strong { font-family: var(--ss-font-data); font-size: 28rpx; line-height: 34rpx; }
.dock-readout text { font-size: 13rpx; line-height: 18rpx; }
.detail-panel { border-radius: 18rpx 18rpx 0 0; }
.panel-header { min-height: 100rpx; padding: 8rpx 18rpx 14rpx 28rpx; }
.panel-header strong { font-size: 30rpx; line-height: 40rpx; }
.panel-header text { margin-top: 3rpx; font-size: 19rpx; }
.panel-scroll { padding: 24rpx 28rpx 36rpx; }
.panel-list, .mode-list, .chart-tool-list { box-shadow: var(--shadow-card); }
.panel-list-row, .mode-list button { min-height: 112rpx; }
.panel-list-row strong, .mode-list strong { font-size: 24rpx; }
.panel-list-row text, .mode-list text { font-size: 18rpx; line-height: 26rpx; }
.basic-device { padding: 28rpx 28rpx calc(40rpx + env(safe-area-inset-bottom)); }
.basic-device-hero, .basic-section { box-shadow: var(--shadow-card); }

@media(max-height:760px){
  .device-overview{min-height:76rpx;padding-top:7rpx;padding-bottom:7rpx}
  .connection-row{min-height:66rpx;padding-top:6rpx;padding-bottom:6rpx}
  .display-mode,.display-propeller,.display-gear{min-height:68rpx}
  .remote-display .summary-metrics{min-height:44rpx;padding:4rpx 0}
  .quick-actions button,.quick-actions button:first-child{height:76rpx;min-height:76rpx}
  .waypoint-primary,.chart-tools{top:366rpx}
  .helm-dock{height:286rpx}
  .compass{width:226rpx;height:226rpx}
  .zoom-control{bottom:304rpx}
  .lift-control{height:68rpx}.lift-up{top:14rpx}.lift-down{top:88rpx}.lift-state{top:162rpx}
}

/* Production console: continuous telemetry, open chart, one tactile control deck. */
.helm-top-stack { top: 0; right: 0; left: 0; gap: 0; }
.helm-summary { background: #fff; border: 0; border-bottom: 2rpx solid rgba(83,113,132,.22); border-radius: 0; box-shadow: none; }
.device-overview { min-height: 72rpx; padding: 8rpx 18rpx; border-bottom: 2rpx solid var(--color-divider); }
.device-overview > span { width: 42rpx; height: 42rpx; flex-basis: 42rpx; }
.device-overview strong { font-size: 25rpx; line-height: 32rpx; }
.device-overview > view text { font-size: 18rpx; line-height: 23rpx; }
.device-overview > button { min-width: 100rpx; height: 58rpx; min-height: 58rpx; padding: 0 10rpx; background: transparent; border: 2rpx solid #d7a85f; border-radius: 6rpx; font-size: 18rpx; }
.connection-row { min-height: 64rpx; padding: 6rpx 18rpx; }
.gps-block strong { font-size: 21rpx; line-height: 27rpx; }
.gps-block text { font-size: 17rpx; line-height: 22rpx; }
.connection-button { min-width: 96rpx; height: 56rpx; min-height: 56rpx; border-radius: 6rpx; font-size: 17rpx; }
.remote-display { margin: 0; background: #0d2a3c; border: 0; border-radius: 0; }
.display-mode,.display-propeller,.display-gear { min-height: 82rpx; }
.display-mode { padding: 7rpx 12rpx 7rpx 18rpx; }
.display-mode > span,.display-propeller > span { width: 38rpx; height: 38rpx; flex-basis: 38rpx; background: transparent; }
.display-mode text,.display-propeller text,.display-gear text { font-size: 16rpx; }
.display-mode strong,.display-propeller strong { font-size: 21rpx; }
.display-propeller small,.display-gear span { font-size: 15rpx; }
.display-gear strong { font-size: 30rpx; }
.remote-display .summary-metrics { min-height: 60rpx; padding: 7rpx 10rpx; }
.remote-display .summary-metrics text { font-size: 15rpx; }
.remote-display .summary-metrics strong { font-size: 19rpx; line-height: 24rpx; }
.quick-actions { background: rgba(255,255,255,.98); border: 0; border-bottom: 2rpx solid rgba(83,113,132,.22); border-radius: 0; box-shadow: none; }
.quick-actions button,.quick-actions button:first-child { height: 72rpx; min-height: 72rpx; gap: 7rpx; border-right: 0; font-size: 16rpx; }
.quick-actions button::after { position: absolute; right: 16rpx; bottom: 0; left: 16rpx; height: 4rpx; content: ''; background: transparent; }
.quick-actions button { position: relative; }
.quick-actions button.active { color: var(--color-action-primary); background: #fff; }
.quick-actions button.active::after { background: var(--color-action-primary); }
.waypoint-primary { top: 360rpx; left: 16rpx; min-width: 164rpx; height: 70rpx; color: #17384d; background: rgba(255,255,255,.96); border: 2rpx solid rgba(70,105,128,.28); border-radius: 6rpx; box-shadow: 0 4rpx 10rpx rgba(13,45,64,.08); }
.waypoint-primary>:deep(.ss-icon) { filter: none; }
.waypoint-primary strong { font-size: 18rpx; }
.waypoint-primary text { color: #667987; font-size: 15rpx; }
.chart-tools { top: 360rpx; right: 16rpx; background: rgba(255,255,255,.96); border: 2rpx solid rgba(70,105,128,.24); border-radius: 6rpx; box-shadow: 0 4rpx 10rpx rgba(13,45,64,.08); }
.chart-tools button { width: 76rpx; height: 72rpx; font-size: 16rpx; }
.zoom-control { right: 16rpx; bottom: 314rpx; width: 68rpx; border: 2rpx solid rgba(70,105,128,.24); border-radius: 6rpx; box-shadow: 0 4rpx 10rpx rgba(13,45,64,.08); }
.zoom-control button { height: 58rpx; }
.zoom-control text { height: 34rpx; }
.helm-dock { height: 294rpx; background: #0b293a; border-radius: 12rpx 12rpx 0 0; box-shadow: 0 -4rpx 14rpx rgba(7,24,36,.14); }
.dock-guide { top: 16rpx; left: 18rpx; }
.dock-guide strong { font-size: 17rpx; }
.compass { bottom: 10rpx; width: 226rpx; height: 226rpx; border-width: 3rpx; box-shadow: 0 0 0 2rpx rgba(105,139,158,.35); }
.remote-pad::before { inset: 48rpx; }
.direction { width: 70rpx; height: 70rpx; border-radius: 50%; }
.stop-button { width: 72rpx; height: 72rpx; }
.lift-control { right: 18rpx; width: 94rpx; height: 66rpx; border-radius: 6rpx; }
.lift-up { top: 18rpx; }
.lift-down { top: 92rpx; }
.lift-state { top: 166rpx; right: 18rpx; width: 94rpx; }
.dock-readout { bottom: 14rpx; }
.dock-readout strong { font-size: 25rpx; }
.basic-device-hero,.basic-section { border-radius: 6rpx; box-shadow: none; }
.service-entry { border-radius: 6rpx; }
.panel-list,.mode-list,.chart-tool-list { box-shadow: none; }

@media(max-height:760px){
  .device-overview{min-height:64rpx}
  .connection-row{min-height:56rpx}
  .display-mode,.display-propeller,.display-gear{min-height:60rpx}
  .quick-actions button,.quick-actions button:first-child{height:64rpx;min-height:64rpx}
  .waypoint-primary,.chart-tools{top:296rpx}
  .helm-dock{height:274rpx}
  .compass{width:210rpx;height:210rpx}
  .zoom-control{bottom:292rpx}
}
.helm-summary { padding: 0; }
.device-overview { min-height: 52px; gap: 10px; padding: 8px 14px; }
.device-overview > span { width: 34px; height: 34px; flex-basis: 34px; }
.device-overview strong { font-size: 15px; line-height: 21px; }
.device-overview > view text { font-size: 11px; line-height: 16px; }
.device-overview > button { min-width: 68px; height: 36px; min-height: 36px; padding: 0 8px; font-size: 11px; border-radius: 6px; }
.connection-row { min-height: 46px; gap: 10px; padding: 6px 14px; }
.gps-block strong { font-size: 12px; line-height: 18px; }.gps-block text { font-size: 10px; line-height: 15px; }
.connection-button { min-width: 74px; height: 34px; min-height: 34px; font-size: 11px; border-radius: 6px; }
.display-mode, .display-propeller, .display-gear { min-height: 58px; }
.display-mode { padding: 8px 10px; }.display-mode > span, .display-propeller > span { width: 24px; height: 24px; flex-basis: 24px; }
.display-mode text, .display-propeller text, .display-gear text { font-size: 10px; line-height: 15px; }
.display-mode strong, .display-propeller strong { font-size: 13px; line-height: 20px; }.display-gear strong { font-size: 22px; line-height: 26px; }.display-propeller small, .display-gear span { font-size: 10px; }
.remote-display .summary-metrics { min-height: 43px; padding: 6px 8px; }.remote-display .summary-metrics text { font-size: 10px; line-height: 15px; }.remote-display .summary-metrics strong { font-size: 12px; line-height: 18px; }
.quick-actions button, .quick-actions button:first-child { height: 44px; min-height: 44px; gap: 6px; font-size: 12px; }
.waypoint-primary { top: 256px; left: 12px; min-width: 105px; height: 44px; border-radius: 6px; }.waypoint-primary strong { font-size: 12px; }.waypoint-primary text { font-size: 10px; }
.chart-tools { top: 256px; right: 12px; border-radius: 6px; }.chart-tools button { width: 44px; height: 44px; font-size: 10px; }
.zoom-control { right: auto; left: 12px; bottom: 192px; width: 36px; }.zoom-control button { height: 36px; }.zoom-control text { height: 22px; font-size: 11px; }
.helm-dock { height: 180px; border-radius: 8px 8px 0 0; }
.dock-guide { top: 14px; left: 12px; width: 88px; }.dock-guide strong { font-size: 11px; line-height: 17px; }.dock-guide text { font-size: 10px; line-height: 15px; }
.compass { bottom: 16px; width: 140px; height: 140px; }.remote-pad::before { inset: 30px; }.direction { width: 44px; height: 44px; }.stop-button { width: 44px; height: 44px; }
.north-button { top: 4px; }.south-button { bottom: 4px; }.west-button { left: 4px; }.east-button { right: 4px; }
.lift-control { right: 12px; width: 58px; height: 42px; border-radius: 6px; font-size: 10px; line-height: 13px; }.lift-up { top: 14px; }.lift-down { top: 63px; }.lift-state { top: 112px; right: 12px; width: 58px; font-size: 10px; }
.dock-readout { bottom: 12px; }.dock-readout.left { left: 12px; }.dock-readout.right { right: 12px; }.dock-readout strong { font-size: 17px; line-height: 22px; }.dock-readout text { font-size: 10px; line-height: 14px; }
.helm-map.fullscreen .chart-tools, .helm-map.fullscreen .waypoint-primary { top: 80px; }
.detail-page { background: var(--color-bg-canvas); }
.detail-page :deep(.ss-status-bar), .detail-page :deep(.app-bar) { color: var(--color-text-primary); background: #fff; border-bottom-color: var(--color-divider); }
.detail-page :deep(.app-title) { color: var(--color-text-primary); }
.detail-page :deep(.app-action .ss-icon) { filter: none; }
.basic-device { padding: 0 0 calc(28px + env(safe-area-inset-bottom)); background: var(--color-bg-canvas); }
.basic-device-hero { padding: 26px 22px 20px; gap: 16px; border: 0; border-radius: 0; }
.basic-device-hero > .basic-device-icon { display: flex; width: 64px; height: 64px; flex: 0 0 64px; align-items: center; justify-content: center; margin: 0; padding: 0; background: var(--color-action-primary-subtle); border-radius: 8px; }
.basic-device-hero strong { font-size: 22px; line-height: 30px; overflow-wrap: anywhere; }
.basic-device-hero text { margin-top: 5px; font-size: 13px; line-height: 20px; }
.basic-device-hero span { margin-top: 8px; font-size: 12px; }
.device-record-summary { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 8px 22px 24px; background: #fff; }
.device-record-summary > view { min-width: 0; text-align: center; border-right: 1px solid var(--color-divider); }.device-record-summary > view:last-child { border: 0; }
.device-record-summary strong { display: block; font-family: var(--ss-font-data); font-size: 24px; line-height: 32px; font-weight: 600; overflow-wrap: anywhere; }.device-record-summary small { margin-left: 3px; font-size: 12px; font-weight: 400; }.device-record-summary text { display: block; margin-top: 5px; color: var(--color-text-secondary); font-size: 12px; }
.service-entry { min-height: 78px; gap: 12px; margin: 0; padding: 18px 22px; border: 0; border-radius: 0; }.service-entry > span { width: 40px; height: 40px; border-radius: 50%; }.service-entry strong { font-size: 15px; line-height: 22px; }.service-entry text { margin-top: 3px; font-size: 12px; line-height: 18px; }
.basic-section { margin-top: 12px; padding: 20px 22px; border: 0; border-radius: 0; }
.basic-section-title { margin-bottom: 8px; }.basic-section-title strong { font-size: 17px; }.basic-section-title button { display: flex; min-height: 44px; align-items: center; font-size: 12px; }
.basic-grid { grid-template-columns: minmax(0,1fr); gap: 0; }.basic-grid > view { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; min-height: 48px; padding: 14px 0; border-bottom: 1px solid var(--color-divider); background: transparent; border-radius: 0; }.basic-grid > view:last-child { border: 0; }.basic-grid text { flex-shrink: 0; font-size: 13px; }.basic-grid strong { margin: 0; font-size: 14px; text-align: right; white-space: normal; overflow-wrap: anywhere; }
.detail-panel { border-radius: 16px 16px 0 0; }.panel-header { min-height: 72px; padding: 12px 16px 12px 22px; }.panel-header strong { font-size: 18px; line-height: 26px; }.panel-header text { font-size: 12px; }.panel-header button { width: 44px; height: 44px; }.panel-scroll { padding: 18px 20px 28px; }
.panel-list-row, .mode-list button { min-height: 62px; }.panel-list-row strong, .mode-list strong { font-size: 14px; line-height: 22px; }.panel-list-row text, .mode-list text { font-size: 12px; line-height: 18px; white-space: normal; }.panel-icon { flex-shrink: 0; }.compact-action { min-height: 40px; font-size: 12px; }.info-grid text { font-size: 12px; }.info-grid strong { font-size: 14px; line-height: 22px; white-space: normal; overflow-wrap: anywhere; }
</style>

<style scoped>
/* Final mobile helm layout: two compact status rows, a fixed command rail, and maximum chart space. */
.helm-summary { overflow:hidden; }
.device-overview { height:44px;min-height:44px;gap:9px;padding:0 12px; }
.device-overview > span { width:32px;height:32px;flex-basis:32px;background:var(--ss-brand-50);border-radius:7px; }
.device-overview strong { font-size:15px;line-height:20px; }
.device-overview > view text { font-size:10px;line-height:14px; }
.device-overview > button { min-width:72px;height:36px;min-height:36px;gap:4px;padding:0 8px;background:#fff8ed;border:1px solid #e4bd7d;border-radius:6px;font-size:11px; }
.connection-row { display:grid;height:40px;min-height:40px;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:0 12px; }
.gps-block { gap:7px;overflow:hidden; }.gps-block strong { overflow:hidden;font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap; }.gps-block text { display:none; }
.connection-button,.connection-button.connected { min-width:82px;height:32px;min-height:32px;gap:5px;padding:0 8px;color:var(--color-action-primary);background:#fff;border:1px solid var(--ss-brand-200);border-radius:6px;font-size:11px; }
.control-status-strip { height:42px;min-height:42px; }
.quick-actions button,.quick-actions button:first-child { height:42px;min-height:42px; }
.chart-interactions { top:170px; }
.secondary-telemetry { top:176px; }
.helm-dock { height:136px; }
.zoom-control { bottom:146px; }
@media(max-height:760px) {
  .device-overview { height:40px;min-height:40px; }
  .connection-row { height:36px;min-height:36px; }
  .connection-button,.connection-button.connected { height:30px;min-height:30px; }
  .control-status-strip { height:40px;min-height:40px; }
  .quick-actions button,.quick-actions button:first-child { height:40px;min-height:40px; }
  .chart-interactions { top:156px; }
  .secondary-telemetry { top:160px; }
  .helm-dock { height:132px; }
  .zoom-control { bottom:142px; }
}
</style>

<style scoped lang="scss">
@import '@/styles/overlay-surfaces.scss';

.helm-top-stack { position:relative; top:0; right:auto; left:auto; gap:6px; }
.helm-top-stack.fullscreen { top:0; right:auto; left:auto; }
.chart-interactions { position:relative; z-index:7; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding:12px; pointer-events:none; }
.chart-interactions > .waypoint-primary,.chart-interactions > .chart-tools { position:static; margin:0; pointer-events:auto; }
.device-overview > button { height:44px; min-height:44px; }
.connection-button { height:44px; min-height:44px; }
.lift-control { height:44px; min-height:44px; }
.lift-down { top:66px; }.lift-state { top:120px; }
.zoom-control { width:44px; }.zoom-control button { height:44px; }
.remote-display .summary-metrics > view { min-width:0; }
.remote-display .summary-metrics strong { overflow:visible; text-overflow:clip; }
.helm-top-stack{position:absolute;top:0;right:0;left:0;gap:0}
.helm-summary{overflow:visible}
.device-overview{height:44px;min-height:44px;padding:0 12px;box-sizing:border-box}
.device-overview>button{height:44px;min-height:44px}
.connection-row{height:44px;min-height:44px;padding:0 12px;box-sizing:border-box}
.gps-block text{display:none}
.connection-button{height:44px;min-height:44px}
.control-status-strip{display:grid;height:44px;min-height:44px;grid-template-columns:1.35fr .72fr .95fr 1.15fr;color:#fff;background:#0d2a3c;box-sizing:border-box}
.control-status-strip>view,.control-status-strip>button{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;padding:4px 1px;color:#fff;background:transparent;border:0;border-left:1px solid rgba(255,255,255,.12);box-sizing:border-box;text-align:center}
.control-status-strip>.status-priority{background:#123b53}.control-status-strip>.status-direction{border-left:0;background:#0f4967}
.control-status-strip>.status-mode{min-width:0;flex-direction:row;gap:2px;padding:4px 3px;background:#0d2a3c;text-align:left}
.status-mode>view{min-width:0;flex:1}.control-status-strip text,.control-status-strip strong{display:block}.control-status-strip text{color:#9fc1d5;font-size:9px;line-height:12px;white-space:nowrap}.control-status-strip strong{overflow:hidden;max-width:100%;font-family:var(--ss-font-data);font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}.control-status-strip>.status-mode strong{font-size:13px}.control-status-strip small{font-size:8px;font-weight:400}
.control-status-strip>.status-priority strong{font-size:15px;color:#fff}.status-direction strong{display:flex;align-items:center;justify-content:center;gap:3px}.motion-arrow{display:flex;align-items:center;justify-content:center;filter:brightness(0) invert(1);transform-origin:center}
.quick-actions button,.quick-actions button:first-child{height:44px;min-height:44px}
.chart-interactions{position:absolute;top:178px;right:0;left:0;padding:8px 12px}
.helm-dock{height:140px}
.compass{bottom:10px;width:120px;height:120px}
.remote-pad::before{inset:27px}
.direction{width:44px;height:44px}.stop-button{width:44px;height:44px}
.lift-control{right:10px;width:56px;height:44px}.lift-up{top:8px}.lift-down{top:56px}.lift-state{top:104px;right:10px;width:56px;height:26px}
.zoom-control{bottom:150px}
.device-position{transform-origin:center}
.heading-compass{position:absolute;z-index:5;width:112px;height:112px;color:#fff;background:rgba(8,35,65,.94);border:2px solid rgba(104,153,209,.72);border-radius:50%;box-shadow:0 0 0 4px rgba(20,70,119,.2),0 8px 18px rgba(7,24,36,.22);transform:translate(-50%,-50%);transition:top .8s,left .8s;pointer-events:none;box-sizing:border-box}.heading-compass::before{position:absolute;inset:6px;content:'';border:4px dashed rgba(73,127,184,.5);border-radius:50%}.heading-compass.is-playing{box-shadow:0 0 0 7px rgba(36,105,224,.2),0 8px 18px rgba(7,24,36,.22)}.heading-compass-core{position:absolute;inset:27px;display:flex;align-items:center;justify-content:center;background:#173b69;border:1px solid rgba(255,255,255,.08);border-radius:50%}.heading-pointer{display:flex;align-items:center;justify-content:center;filter:brightness(0) saturate(100%) invert(76%) sepia(89%) saturate(1124%) hue-rotate(358deg) brightness(103%) contrast(104%);transform-origin:center;transition:transform .25s ease}.heading-label{position:absolute;z-index:2;color:#fff;font-size:11px;line-height:14px;text-shadow:0 1px 2px rgba(0,0,0,.5)}.heading-front{top:7px;left:50%;transform:translateX(-50%)}.heading-back{bottom:7px;left:50%;transform:translateX(-50%)}.heading-left{top:50%;left:8px;transform:translateY(-50%)}.heading-right{top:50%;right:8px;transform:translateY(-50%)}
.position-readout{position:absolute;z-index:6;display:flex;min-width:92px;flex-direction:column;align-items:center;gap:1px;padding:4px 7px;color:#fff;background:rgba(7,36,54,.88);border:1px solid rgba(255,255,255,.78);border-radius:5px;box-shadow:0 3px 8px rgba(7,24,36,.16);transform:translate(-50%,62px);pointer-events:none;box-sizing:border-box}.position-readout strong,.position-readout text{display:block;white-space:nowrap}.position-readout strong{font-size:10px;line-height:13px}.position-readout text{color:#c8e0ec;font-size:9px;line-height:12px}
.secondary-telemetry{position:absolute;z-index:7;top:184px;right:64px;display:flex;height:38px;align-items:center;gap:6px;padding:0 8px;color:#17384d;background:rgba(255,255,255,.94);border:1px solid rgba(70,105,128,.22);border-radius:5px;box-shadow:0 3px 8px rgba(13,45,64,.08);white-space:nowrap}.secondary-telemetry.fullscreen{top:54px}.secondary-telemetry>view{display:flex;min-width:46px;flex:0 0 auto;flex-direction:column;align-items:center;gap:0}.secondary-telemetry text,.secondary-telemetry strong{display:block;white-space:nowrap}.secondary-telemetry text{color:#667987;font-size:9px;line-height:11px}.secondary-telemetry strong{font-family:var(--ss-font-data);font-size:11px;line-height:14px}.secondary-telemetry i{width:1px;height:20px;background:var(--color-divider)}
@media(min-width:700px) and (max-height:760px){
  .helm-summary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);height:94px}
  .device-overview,.connection-row{height:50px;min-height:50px;box-sizing:border-box}
  .device-overview{border-right:1px solid var(--color-divider);border-bottom:0}
  .connection-row{min-width:0;padding:0 8px}
  .gps-block{min-width:0}.gps-block strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .connection-button{min-width:44px;padding:0 7px}.connection-button text{display:none}
  .control-status-strip{grid-column:1 / -1;height:44px}
  .quick-actions button,.quick-actions button:first-child{height:40px;min-height:40px}
  .chart-interactions{top:142px}
  .secondary-telemetry{right:auto;left:50%;transform:translateX(-50%)}
}
@media(max-height:760px) {
  .chart-interactions > .chart-tools { display:flex; flex-direction:row; }
  .chart-tools button { width:44px; height:44px; }
  .chart-interactions { padding:8px 12px; }
  .zoom-control { display:flex; align-items:center; width:auto; height:44px; }
  .zoom-control button { width:44px; height:44px; }
  .zoom-control text { display:flex; width:28px; height:44px; align-items:center; justify-content:center; }
  .chart-interactions{top:160px}
  .secondary-telemetry{top:164px}
  .helm-dock{height:136px}
  .zoom-control{bottom:146px}
  .heading-compass{width:96px;height:96px}.heading-compass-core{inset:23px}.heading-label{font-size:10px}.heading-front{top:5px}.heading-back{bottom:5px}.heading-left{left:6px}.heading-right{right:6px}.position-readout{transform:translate(-50%,54px)}
}

/* Customer-confirmed compact helm: heading and propeller remain visible; steering opens on demand. */
.dock-heading-panel{position:absolute;z-index:8;top:8px;bottom:8px;left:8px;display:flex;width:102px;flex-direction:column;align-items:center;justify-content:center;color:#fff;border-right:1px solid rgba(255,255,255,.12);box-sizing:border-box}
.dock-heading-panel>view:first-child{order:2;min-width:0;margin-top:3px;text-align:center}.dock-heading-panel strong,.dock-heading-panel text{display:block;overflow:hidden;max-width:92px;text-overflow:ellipsis;white-space:nowrap}.dock-heading-panel strong{font-family:var(--ss-font-data);font-size:11px;line-height:15px}.dock-heading-panel text{color:#9fc1d5;font-size:9px;line-height:12px}
.dock-heading-compass{position:relative;order:1;top:auto;left:auto;width:76px;height:76px;flex:0 0 76px;transform:none;transition:none}.dock-heading-compass::before{inset:5px;border-width:3px}.dock-heading-compass .heading-compass-core{inset:18px}.dock-heading-compass .heading-label{font-size:9px;line-height:11px}.dock-heading-compass .heading-front{top:4px}.dock-heading-compass .heading-back{bottom:4px}.dock-heading-compass .heading-left{left:5px}.dock-heading-compass .heading-right{right:5px}
.dock-primary-control{position:absolute;z-index:8;top:8px;left:50%;display:flex;width:96px;flex-direction:column;align-items:center;color:#fff;transform:translateX(-50%)}.dock-propeller-button{display:flex!important;width:72px;height:72px;align-items:center;justify-content:center;padding:0!important;background:#2469e0!important;border:4px solid rgba(255,255,255,.32)!important;border-radius:50%;box-shadow:0 5px 14px rgba(0,0,0,.28)}.dock-propeller-button.engaged{background:#cf2639!important;box-shadow:0 0 0 5px rgba(207,38,57,.18),0 5px 14px rgba(0,0,0,.28)}.dock-propeller-button:disabled{opacity:.48}.dock-primary-control strong,.dock-primary-control text{display:block;white-space:nowrap}.dock-primary-control strong{margin-top:3px;font-size:11px;line-height:15px}.dock-primary-control text{color:#9fc1d5;font-size:9px;line-height:12px}
.helm-dock .playback-console{top:8px;right:74px;bottom:8px;left:116px}.helm-dock .playback-heading{gap:4px}.helm-dock .playback-heading>span{display:none}.helm-dock .playback-heading strong{font-size:11px;line-height:14px}.helm-dock .playback-heading text{margin-top:0;font-size:9px;line-height:12px}.helm-dock .playback-heading b{font-size:12px}.helm-dock .playback-progress{height:4px;margin-top:4px}.helm-dock .playback-actions{grid-template-columns:1.2fr 1fr .7fr;gap:4px;margin-top:7px}.helm-dock .playback-actions button{height:58px;gap:3px;padding:0 3px;border-width:1px;border-radius:6px;font-size:10px;line-height:13px}
.helm-dock .side-thrust-console{top:14px;right:74px;bottom:14px;left:116px;grid-template-columns:1fr 54px 1fr;gap:5px}.helm-dock .side-thrust-console button{height:112px;gap:4px;padding:0 3px;border-width:1px;border-radius:7px;font-size:10px;line-height:13px}
.manual-control-panel{max-height:none}.manual-control-panel .panel-scroll{height:auto;max-height:none;padding:14px 18px calc(env(safe-area-inset-bottom) + 18px)}.manual-control-summary{display:grid;grid-template-columns:.7fr 1.35fr .8fr;overflow:hidden;background:#f1f5f8;border:1px solid #dce5eb;border-radius:7px}.manual-control-summary>view{display:flex;min-width:0;height:52px;flex-direction:column;align-items:center;justify-content:center;padding:0 5px;border-left:1px solid #dce5eb;text-align:center;box-sizing:border-box}.manual-control-summary>view:first-child{border-left:0}.manual-control-summary text,.manual-control-summary strong{display:block;overflow:hidden;max-width:100%;text-overflow:ellipsis;white-space:nowrap}.manual-control-summary text{color:var(--color-text-secondary);font-size:10px;line-height:14px}.manual-control-summary strong{font-size:12px;line-height:17px}.manual-control-summary strong.running{color:#cf2639}
.manual-control-layout{display:flex;flex-direction:column;align-items:center}.manual-control-pad{position:relative;bottom:auto;left:auto;width:196px;height:196px;margin:12px auto 8px;transform:none}.manual-control-pad::before{inset:43px}.manual-control-pad .direction{width:62px;height:62px}.manual-control-pad .direction text{font-size:10px;line-height:12px}.manual-control-pad .north-button{top:7px}.manual-control-pad .south-button{bottom:7px}.manual-control-pad .west-button{left:7px}.manual-control-pad .east-button{right:7px}.manual-control-pad .stop-button{width:64px;height:64px}.manual-control-tip{display:flex;max-width:360px;align-items:flex-start;gap:6px;color:var(--color-text-secondary);font-size:11px;line-height:16px;text-align:left}.manual-control-tip text{flex:1}
@media(max-width:390px){.dock-heading-panel{left:6px;width:96px}.dock-heading-panel strong,.dock-heading-panel text{max-width:86px}.helm-dock .playback-console,.helm-dock .side-thrust-console{left:108px}.helm-dock .playback-actions button{font-size:9px}.manual-control-pad{width:188px;height:188px}.manual-control-pad::before{inset:42px}}
@media(max-height:760px){.dock-heading-compass{width:72px;height:72px;flex-basis:72px}.dock-heading-compass .heading-compass-core{inset:17px}.manual-control-panel .panel-header{min-height:58px}.manual-control-panel .panel-scroll{padding-top:10px}.manual-control-pad{width:178px;height:178px;margin-top:8px}.manual-control-pad::before{inset:40px}.manual-control-pad .direction{width:56px;height:56px}.manual-control-pad .stop-button{width:58px;height:58px}}
</style>

<style scoped>
/* Keep this block last so legacy device-detail rules cannot expand the status header again. */
.helm-summary{display:block!important;height:auto!important;overflow:hidden}
.device-overview{height:44px;min-height:44px;gap:9px;padding:0 12px}
.device-overview{border-right:0!important;border-bottom:1px solid var(--color-divider)!important}
.device-overview>span{width:32px;height:32px;flex-basis:32px;background:var(--ss-brand-50);border-radius:7px}
.device-overview strong{font-size:15px;line-height:20px}.device-overview>view text{font-size:10px;line-height:14px}
.device-overview>button{min-width:72px;height:44px;min-height:44px;gap:4px;padding:0 8px;background:#fff8ed;border:1px solid #e4bd7d;border-radius:6px;font-size:11px}
.connection-row{display:grid;height:40px;min-height:40px;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:0 12px}
.gps-block{gap:7px;overflow:hidden}.gps-block strong{overflow:hidden;font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}.gps-block text{display:none}
.connection-button,.connection-button.connected{min-width:82px;height:44px;min-height:44px;gap:5px;padding:0 8px;color:var(--color-action-primary);background:#fff;border:1px solid var(--ss-brand-200);border-radius:6px;font-size:11px}
.connection-button text{display:inline!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.connection-row{grid-template-columns:minmax(0,1fr) 76px 76px;gap:6px}
.controller-status{display:flex;height:34px;min-width:0;align-items:center;justify-content:center;gap:5px;padding:0 5px;color:var(--color-text-secondary);background:#f7f9fc;border:1px solid var(--color-border-subtle);border-radius:6px;box-sizing:border-box}.controller-status.connected{color:var(--ss-green-700);background:var(--ss-green-50);border-color:var(--ss-green-200)}.controller-status>view{min-width:0}.controller-status strong,.controller-status text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.controller-status strong{font-size:9px;line-height:12px}.controller-status text{color:inherit;font-size:8px;line-height:10px}.panel-icon.offline{background:var(--color-bg-canvas)}.connection-state-label{flex:0 0 auto;color:var(--color-text-secondary);font-size:21rpx;font-weight:600}.connection-state-label.online{color:var(--ss-green-700)}
.connection-button>view{min-width:0}.connection-button>view strong,.connection-button>view text{display:block!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.connection-button>view strong{font-size:9px;line-height:12px}.connection-button>view text{color:inherit;font-size:8px;line-height:10px}
.control-status-strip{height:42px;min-height:42px}.quick-actions button,.quick-actions button:first-child{height:42px;min-height:42px}
.chart-interactions{top:172px}.secondary-telemetry{top:178px}.helm-dock{height:106px}.zoom-control{bottom:116px}
.dock-heading-compass{width:68px;height:68px;flex-basis:68px}.dock-heading-compass .heading-compass-core{inset:16px}
.dock-propeller-button{width:64px;height:64px}.helm-dock .side-thrust-console{top:8px;bottom:8px}.helm-dock .side-thrust-console button{height:96px}
@media(max-height:760px){.device-overview{height:40px;min-height:40px}.connection-row{height:40px;min-height:40px}.connection-button,.connection-button.connected{height:44px;min-height:44px}.control-status-strip{height:40px;min-height:40px}.quick-actions button,.quick-actions button:first-child{height:40px;min-height:40px}.chart-interactions{top:166px}.secondary-telemetry{top:170px}.helm-dock{height:106px}.zoom-control{bottom:116px}}

/* Keep the chart open between compact telemetry and the bottom control deck. */
.helm-top-stack{top:0;right:0;left:0}
.helm-summary{border-bottom:1px solid #c7d7e2}
.connection-row{height:44px;min-height:44px;grid-template-columns:minmax(0,1fr) 82px 82px;padding:0 12px}
.gps-block{height:36px;min-width:0;align-items:center}.gps-block>view:last-child{min-width:0}.gps-block strong{font-size:11px}.gps-block text{display:block;font-size:10px;line-height:12px}
.gps-bars{display:flex;flex:0 0 25px;height:22px;align-items:flex-end;gap:2px}.gps-bars i{width:4px;height:30%;background:#c6d5df;border-radius:2px}.gps-bars i:nth-child(2){height:50%}.gps-bars i:nth-child(3){height:72%}.gps-bars i:nth-child(4){height:100%}.gps-bars i.active{background:#13866b}
.connection-button,.connection-button.connected{height:44px;min-height:44px;background:#f7fbff;border-color:#d6e5f2}
.control-status-strip{height:46px;min-height:46px;grid-template-columns:1.25fr .65fr .9fr 1.15fr}
.control-status-strip text{font-size:10px}.control-status-strip strong{font-size:12px}.control-status-strip>.status-priority strong{font-size:15px}
.secondary-telemetry,.secondary-telemetry.fullscreen{top:94px;right:12px;left:auto;height:32px;gap:7px;transform:none}.secondary-telemetry.fullscreen{top:12px}
.secondary-telemetry>view{min-width:52px}.secondary-telemetry strong{font-size:12px}
.chart-interactions{top:auto!important;right:0;bottom:113px;left:0;display:flex;height:46px;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;box-sizing:border-box}
.waypoint-primary,.helm-map.fullscreen .waypoint-primary{position:static;min-width:0;height:44px;flex:0 0 auto;padding:0 10px;box-shadow:0 2px 8px rgba(13,45,64,.13)}
.waypoint-primary strong{font-size:11px;line-height:15px}.waypoint-primary text{font-size:9px;line-height:12px}
.chart-tools,.helm-map.fullscreen .chart-tools{position:static;display:flex;flex-direction:row;min-width:0;gap:0;overflow:hidden;box-shadow:0 2px 8px rgba(13,45,64,.13)}
.chart-tools button{width:44px;height:44px;flex:0 0 44px;border:0;border-right:1px solid var(--color-divider);font-size:9px}.chart-tools button:last-child{border-right:0}
.chart-tools button text{font-size:9px}.helm-map.fullscreen .waypoint-primary{display:none}
.dock-mode-actions{position:absolute;z-index:9;top:7px;right:68px;display:grid;width:72px;grid-template-rows:repeat(2,44px);gap:4px}
.dock-mode-actions button{display:flex;width:72px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;padding:0 2px;color:#e2f0f8;background:#1b3c50;border:1px solid #4c6b7c;border-radius:5px;box-sizing:border-box;font-size:10px;white-space:nowrap}
.dock-mode-actions button.active{color:#fff;background:#175d90;border-color:#70b3e4}.dock-mode-actions button text{white-space:nowrap}
.dock-steering-actions{position:absolute;z-index:9;top:7px;right:68px;display:grid;width:72px;grid-template-rows:repeat(2,44px);gap:4px}
.dock-steering-actions button{display:flex;width:72px;height:44px;min-height:44px;align-items:center;justify-content:center;gap:3px;padding:0 2px;color:#e2f0f8;background:#1b3c50;border:1px solid #4c6b7c;border-radius:5px;box-sizing:border-box;font-size:10px;white-space:nowrap}
.dock-steering-actions button:active{background:#175d90}.dock-steering-actions button:disabled{opacity:.45}
.dock-heading-panel{justify-content:center}.dock-primary-control{top:20px}
.control-status-strip>.status-runtime{border-left:0;background:#0f4967}
.zoom-control{display:flex;left:12px;right:auto;bottom:172px;width:116px;height:40px;align-items:center;box-sizing:border-box}
.zoom-control button{width:40px;height:40px;flex:0 0 40px;padding:0}
.zoom-control text{width:32px;height:40px;flex:0 0 32px;border-top:0;border-bottom:0;border-right:1px solid var(--color-divider);border-left:1px solid var(--color-divider)}
.helm-dock{height:106px}
.device-part-row{display:flex;align-items:flex-start;gap:10px;padding:12px 0;border-top:1px solid var(--color-divider)}.device-part-row>view{min-width:0;flex:1}.device-part-row strong,.device-part-row text{display:block;overflow-wrap:anywhere}.device-part-row strong{font-size:13px}.device-part-row text{margin-top:3px;color:var(--color-text-secondary);font-size:11px}.device-part-row>span{flex:0 0 auto;color:var(--color-action-primary);font-size:11px}.device-part-empty{padding:14px 0;color:var(--color-text-secondary);font-size:12px}
.chart-point-preview{position:absolute;z-index:7;display:flex;align-items:center;gap:6px;min-width:152px;padding:7px 9px;color:#fff;background:#123746;border:1px solid rgba(255,255,255,.8);border-radius:6px;box-shadow:0 5px 14px rgba(7,24,36,.24);transform:translate(-50%,-112%);text-align:left}.chart-point-preview strong,.chart-point-preview text{display:block;white-space:nowrap}.chart-point-preview strong{font-size:10px}.chart-point-preview text{margin-top:2px;color:#b8d5e8;font-size:9px}
.waypoint-actions{align-items:center;gap:2px}.waypoint-actions button{width:34px;height:38px}.waypoint-actions .waypoint-navigate{width:42px;background:var(--color-action-primary);border-radius:6px}
.parameter-card{background:#fff;border-color:var(--color-border-subtle);border-radius:0}.field-block{padding:15px 0;border-bottom:1px solid var(--color-divider)}.field-block .field-label{margin-bottom:8px;color:var(--color-text-primary)}.safety-list{margin-top:0}
.panel-header .setting-back{width:40px;height:44px;flex:0 0 40px}.settings-menu{margin:-6px -20px}.settings-menu-row{display:flex;width:100%;min-height:58px;align-items:center;gap:10px;padding:10px 18px;background:#fff;border:0;border-bottom:1px solid #e6edf1;text-align:left}.settings-menu-row .panel-icon{display:flex;width:32px;height:32px;flex:0 0 32px;align-items:center;justify-content:center;background:#edf5f8;border-radius:6px}.settings-menu-row strong{min-width:0;flex:1;color:#213c4e;font-size:13px}.settings-menu-row text{max-width:37%;overflow:hidden;color:#647c8b;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.setting-edit{display:flex;flex-direction:column;gap:14px;padding:8px 0}.setting-edit>text{color:#243d4e;font-size:14px;font-weight:600}.setting-edit>span{color:#687c89;font-size:11px;line-height:18px}.setting-edit>.btn{margin-top:8px}.setting-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}.setting-actions .btn{min-width:0}
@media(max-height:760px){.connection-row{height:44px;min-height:44px}.control-status-strip{height:44px;min-height:44px}.secondary-telemetry{top:92px}.chart-interactions{bottom:113px;top:auto!important}.helm-dock{height:106px}.zoom-control{bottom:172px;width:116px}}
</style>
