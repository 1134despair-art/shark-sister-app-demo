<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsModal from '@/components/SsModal.vue'
import { deviceBindingService, generateDeviceSerial, isDeviceSerialLike, normalizeDeviceSerial, type BindingCheck } from '@/services/device'
import { bluetoothAdapter, scanAdapter } from '@/services/adapters'
import { useAppStore } from '@/stores/app'
import { complianceService } from '@/services/compliance'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const step = ref(0)
const method = ref<'bluetooth' | 'qr' | 'manual'>('bluetooth')
const location = ref(false)
const camera = ref(false)
const bluetoothAllowed = ref(false)
const scanning = ref(false)
const connecting = ref(false)
type NearbyDevice = { id: string; name: string; model: string; deviceType: string; deviceTypeEn: string; signal: number }
const nearbyDevices = ref<NearbyDevice[]>([])
const serialNumber = ref('')
const createdId = ref('')
const bindingCheck = ref<BindingCheck | null>(null)
const bindingRegistration = computed(() => bindingCheck.value && 'registration' in bindingCheck.value ? bindingCheck.value.registration : undefined)
const bindingBusy = ref(false)
const currentRegion = ref('福建省厦门市')
const waypointStorageLabel = computed(() => store.db?.settings.waypointStorage === 'cloud' ? l('同步服务器','Sync to server') : l('保存本机','Save on this device'))
const regionReviewBusy = ref(false)
const showRegionMismatch = ref(false)
const isQrDesignCase = computed(() => store.designCaseId === 'D17' && step.value === 2)
const isConnectDesignCase = computed(() => store.designCaseId === 'D19')
const isFlowDesignCase = computed(() => ['D15', 'D18', 'D21'].includes(store.designCaseId))
const isBluetoothSearch = computed(() => store.designCaseId === 'D16' && step.value === 2 && method.value === 'bluetooth')
const nearbyDesignRows = computed(() => [
  { id:'DL300020260814', name:'Shark-DL3000-01', model:'DL-3000', deviceType:l('顶流机/制冰机','Surface jet / ice maker'), signal:-42, icon:'fan', tone:'brand', skin:'', bound:false },
  { id:'SW200020260814', name:'Shark-SW2000-02', model:'SW-2000', deviceType:l('海水淡化器','Desalinator'), signal:-61, icon:'droplets', tone:'success', skin:'success', bound:false },
  { id:'BT500020240303', name:'Shark BT5000-03', model:'BT-5000', deviceType:l('电池组','Battery bank'), signal:-79, icon:'battery', tone:'warning', skin:'warning', bound:true },
])
const designFlowTitle = computed(() => store.designCaseId === 'D18' ? l('输入设备序列号','Enter device serial') : l('添加设备','Add device'))
const stepTitle = computed(() => [l('权限预检','Permission check'), l('选择添加方式','Choose a method'), method.value === 'manual' ? l('手动输入','Manual entry') : method.value === 'qr' ? l('扫码添加','Scan QR code') : l('蓝牙扫描','Bluetooth scan'), l('连接设备','Connect device'), l('激活未完成','Activation incomplete'), l('激活成功','Device activated')][step.value])
const hasFooterAction = computed(() => step.value === 5 || (
  step.value !== 1
  && step.value !== 3
  && step.value !== 4
))
const bindingCopy = computed(() => {
  if (!bindingCheck.value) return { icon: 'loader-circle', title: l('正在准备激活','Preparing activation'), tone: '', detail: l('正在确认设备连接和当前状态。','Checking the connection and current device state.') }
  if (bindingCheck.value.status === 'bound') return { icon: 'link-2-off', title: l('设备已被绑定','Device already linked'), tone: 'error', detail: l('请原用户先解除绑定，再重新添加设备。','Ask the previous owner to unlink it before adding it again.') }
  if (bindingCheck.value.status === 'projectMissing') return { icon: 'folder-x', title: l('当前设备无法激活','Device cannot be activated'), tone: 'warning', detail: l('设备暂不满足激活条件，请联系服务人员处理。','This device is not ready for activation. Contact service for assistance.') }
  if (bindingCheck.value.status === 'regionMismatch') return { icon: 'shield-alert', title: regionReviewSubmitted.value ? l('待人工审核','Review pending') : l('暂时无法激活','Activation unavailable'), tone: 'warning', detail: regionReviewSubmitted.value ? l(`激活申请已上报，预计 ${regionReviewDeadline.value} 前完成核验。`, `The activation request was reported and should be reviewed by ${regionReviewDeadline.value}.`) : l('请上报异常，审核完成后再试。', 'Report this issue and try again after review.') }
  return { icon: 'loader-circle', title: l('正在激活设备','Activating device'), tone: 'success', detail: l('请稍候。','Please wait.') }
})
const regionReviewSubmitted = computed(() => {
  if (bindingCheck.value?.status !== 'regionMismatch') return false
  return Boolean(store.db?.platformApprovals.some((item) => item.entity === 'deviceActivation' && item.serialNumber === bindingCheck.value?.registration?.serialNumber && item.targetRegion === currentRegion.value && item.status === 'pending'))
})
const regionReview = computed(() => {
  if (bindingCheck.value?.status !== 'regionMismatch') return undefined
  return store.db?.platformApprovals.find((item) => item.entity === 'deviceActivation' && item.serialNumber === bindingCheck.value?.registration?.serialNumber && item.targetRegion === currentRegion.value && item.status === 'pending')
})
const regionReviewDeadline = computed(() => {
  const value = regionReview.value?.reviewEtaAt || regionReview.value?.temporaryOperationUntil
  if (!value) return l('48 小时内','within 48 hours')
  return new Date(value).toLocaleString(store.locale === 'zh-Hans' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
})
const ownerDealer = computed(() => {
  const registration = bindingCheck.value && 'registration' in bindingCheck.value ? bindingCheck.value.registration : undefined
  return store.db?.dealers.find((item) => item.id === registration?.dealerId)
})
const regionContact = computed(() => ({
  name: ownerDealer.value ? (store.locale === 'zh-Hans' ? ownerDealer.value.name : ownerDealer.value.nameEn) : l('鲨鱼妹妹官方客服', 'Shark Sister Support'),
  phone: ownerDealer.value?.phone || '4008820018',
  email: ownerDealer.value?.email || 'support@shark-sister.com',
}))
const createdDevice = computed(() => store.db?.devices.find((item) => item.id === createdId.value))

async function ensureAvailableRegistration() {
  const registration = deviceBindingService.ensureLocalDemoRegistration(currentRegion.value, store.context)
  await store.refresh()
  return registration
}

onLoad(async (query) => {
  await store.init()
  const accountId = store.account?.id || 'guest'
  const locationPermission = store.db?.settings.permissions.location
  const bluetoothPermission = store.db?.settings.permissions.bluetooth
  location.value = locationPermission?.state === 'granted' && locationPermission.accountId === accountId
  bluetoothAllowed.value = bluetoothPermission?.state === 'granted' && bluetoothPermission.accountId === accountId
  const requestedStep = Number(query?.step)
  if (Number.isFinite(requestedStep)) step.value = Math.max(0, Math.min(5, requestedStep))
  const requestedMethod = String(query?.method || '')
  if (['bluetooth', 'qr', 'manual'].includes(requestedMethod)) method.value = requestedMethod as typeof method.value
  if (step.value === 5) {
    const existing = store.db?.devices.find((item) => item.id === String(query?.deviceId || 'dev-01')) || store.db?.devices[0]
    if (existing) { createdId.value = existing.id; serialNumber.value = existing.serialNumber }
    return
  }
  if (step.value === 2 && method.value === 'manual') serialNumber.value = generateDeviceSerial()
  if (step.value >= 3 && !serialNumber.value) {
    const registration = await ensureAvailableRegistration()
    serialNumber.value = registration.serialNumber
  }
  if (step.value === 2 && method.value === 'bluetooth') {
    bluetoothAllowed.value = true
    await scanBluetooth()
  }
  if (step.value === 4 && query?.serial) {
    serialNumber.value = String(query.serial)
  }
  if (step.value === 4) {
    bindingCheck.value = await deviceBindingService.check(serialNumber.value, currentRegion.value)
    if (bindingCheck.value.status === 'regionMismatch') showRegionMismatch.value = true
    else if (bindingCheck.value.status === 'ready') await activate()
  }
})

async function requestBluetooth() {
  bluetoothAllowed.value = await bluetoothAdapter.requestPermission()
  complianceService.recordPermission('bluetooth', bluetoothAllowed.value ? 'granted' : 'denied', store.account?.id || 'guest')
  store.refresh()
  uni.showToast({ title: bluetoothAllowed.value ? l('蓝牙权限已允许', 'Bluetooth allowed') : l('未获得蓝牙权限', 'Bluetooth permission denied'), icon: 'none' })
  return bluetoothAllowed.value
}
async function scanBluetooth() {
  if (!bluetoothAllowed.value && !await requestBluetooth()) return
  step.value = 2
  scanning.value = true
  const registration = await ensureAvailableRegistration()
  const scanned = await bluetoothAdapter.scan()
  nearbyDevices.value = [{ id: registration.serialNumber, name: `Shark ${registration.model}`, model: registration.model, deviceType: registration.category, deviceTypeEn: registration.categoryEn, signal: -34 }, ...scanned.filter((item) => item.id !== registration.serialNumber)]
  scanning.value = false
  serialNumber.value = nearbyDevices.value[0]?.id || ''
}
function requestLocation() {
  const permission = store.db?.settings.permissions.location
  if (permission?.state === 'denied' && permission.accountId === (store.account?.id || 'guest')) {
    uni.showModal({
      title: l('需要定位权限', 'Location permission required'),
      content: l('定位用于设备激活校验与航点定位。请在系统设置中允许后重试。', 'Location supports device activation checks and waypoints. Allow it in system settings and retry.'),
      confirmText: l('去设置', 'Open settings'),
      success: (result) => { if (result.confirm) { complianceService.recordPermission('location', 'granted', store.account?.id || 'guest'); location.value = true; store.refresh(); uni.showToast({ title: l('定位权限已恢复', 'Location restored'), icon: 'success' }) } },
    })
    return
  }
  location.value = true
  complianceService.recordPermission('location', 'granted', store.account?.id || 'guest')
  store.refresh()
  uni.showToast({ title: l('已获取当前位置', 'Current location acquired'), icon: 'success' })
}
async function scanQr() {
  try {
    const scannedSerial = normalizeDeviceSerial(await scanAdapter.scan())
    if (!isDeviceSerialLike(scannedSerial)) throw new Error('INVALID_DEVICE_QR')
    serialNumber.value = scannedSerial
    deviceBindingService.prepareRegistration(serialNumber.value, currentRegion.value, store.context)
    await store.refresh()
    camera.value = true
    complianceService.recordPermission('camera', 'granted', store.account?.id || 'guest')
    store.refresh()
  } catch (cause) {
    if (!(cause instanceof Error && cause.message === 'SCAN_CANCELLED')) {
      complianceService.recordPermission('camera', 'denied', store.account?.id || 'guest')
      store.refresh()
    }
    if (cause instanceof Error && cause.message === 'SCAN_CANCELLED') return
    uni.showModal({ title: l('未识别设备二维码', 'Device QR Not Recognized'), content: l('请扫描包含有效设备 SN 的二维码，或改用手工输入。', 'Scan a QR code containing a valid device SN, or use manual entry.'), showCancel: false })
  }
}
async function chooseMethod(value: typeof method.value) {
  method.value = value
  if (value === 'bluetooth') return scanBluetooth()
  step.value = 2
  if (value === 'qr') await scanQr()
  if (value === 'manual') serialNumber.value = generateDeviceSerial()
}
function regenerateSerial() { serialNumber.value = generateDeviceSerial() }
function updateSerialInput(event: unknown) {
  const payload = event as { detail?: { value?: string }; target?: EventTarget | null }
  const target = payload.target as HTMLInputElement | null
  const value = payload.detail?.value ?? target?.value
  if (typeof value === 'string') serialNumber.value = value
}
async function chooseDesignMethod(value: typeof method.value) {
  store.designCaseId = ''
  await chooseMethod(value)
}
async function validateRegistration() {
  bindingBusy.value = true
  try {
    serialNumber.value = normalizeDeviceSerial(serialNumber.value)
    if (!isDeviceSerialLike(serialNumber.value)) throw new Error('INVALID_DEVICE_SERIAL')
    deviceBindingService.prepareRegistration(serialNumber.value, currentRegion.value, store.context)
    await store.refresh()
    bindingCheck.value = await deviceBindingService.check(serialNumber.value, currentRegion.value)
    step.value = 4
    if (bindingCheck.value.status === 'regionMismatch') showRegionMismatch.value = true
    else if (bindingCheck.value.status === 'ready') await activate()
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error && cause.message === 'INVALID_DEVICE_SERIAL' ? l('请输入字母开头、至少 6 位数字的设备 SN', 'Enter a device SN starting with letters and at least 6 digits') : l('设备登记失败，请重试', 'Device registration failed. Try again'), icon: 'none' })
  } finally { bindingBusy.value = false }
}
async function connect() {
  serialNumber.value = normalizeDeviceSerial(serialNumber.value)
  if (!isDeviceSerialLike(serialNumber.value)) return uni.showToast({ title: l('请输入字母开头、至少 6 位数字的设备 SN', 'Enter a device SN starting with letters and at least 6 digits'), icon: 'none' })
  if (method.value === 'bluetooth') return await connectBluetoothRegistration()
  await validateRegistration()
}
async function connectBluetoothRegistration() {
  connecting.value = true
  step.value = 3
  try {
    const connected = await bluetoothAdapter.connect(serialNumber.value)
    if (!connected) throw new Error('BLUETOOTH_CONNECT_FAILED')
    await validateRegistration()
  } catch {
    step.value = 2
    uni.showToast({ title: l('连接失败，请重新扫描', 'Connection failed. Scan again.'), icon: 'none' })
  } finally { connecting.value = false }
}
async function activate() {
  if (bindingCheck.value?.status !== 'ready') return uni.showToast({ title: l('当前设备不能激活', 'This device cannot be activated'), icon: 'none' })
  bindingBusy.value = true
  try {
    const created = await deviceBindingService.activate(serialNumber.value, store.context, currentRegion.value)
    await store.setWaypointStorage('cloud')
    await store.refresh()
    createdId.value = created.id
    step.value = 5
    uni.redirectTo({ url: `/pages/device/add?step=5&deviceId=${encodeURIComponent(created.id)}` })
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error && cause.message === 'AUTH_REQUIRED' ? l('请登录后继续', 'Sign in to continue') : l('激活失败，请重试', 'Activation failed. Try again'), icon: 'none' })
  } finally { bindingBusy.value = false }
}
async function submitRegionReview() {
  if (bindingCheck.value?.status !== 'regionMismatch' || regionReviewBusy.value || regionReviewSubmitted.value) return
  regionReviewBusy.value = true
  try {
    await deviceBindingService.requestRegionReview(serialNumber.value, currentRegion.value, store.context)
    await store.refresh()
    uni.showToast({ title: l('激活申请已上报', 'Activation request submitted'), icon: 'success' })
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    uni.showToast({ title: code === 'AUTH_REQUIRED' ? l('请登录后继续', 'Sign in to continue') : code === 'FORBIDDEN' ? l('当前账号无绑定权限', 'This account cannot bind devices') : l('审核申请提交失败', 'Could not submit the review request'), icon: 'none' })
  } finally { regionReviewBusy.value = false }
}
async function next() {
  if (step.value === 0) {
    step.value = 1
  } else if (step.value === 2) await connect()
}
function goToPreviousStep() {
  if (store.designCaseId === 'D17') store.designCaseId = ''
  if (step.value === 5 && createdId.value) return uni.redirectTo({ url: `/pages/device/detail?id=${createdId.value}` })
  if (step.value === 4) step.value = 2
  else if (step.value > 0) step.value -= 1
}
function callDealer() {
  const phoneNumber = ownerDealer.value?.phone
  if (!phoneNumber) return uni.showToast({ title: l('未找到所属经销商电话', 'Dealer phone is unavailable'), icon: 'none' })
  uni.makePhoneCall({ phoneNumber, fail: () => uni.showToast({ title: phoneNumber, icon: 'none' }) })
}
function contactRegionSupport() {
  showRegionMismatch.value = false
  const phoneNumber = regionContact.value.phone
  uni.makePhoneCall({ phoneNumber, fail: () => uni.showToast({ title: phoneNumber, icon: 'none' }) })
}
async function handleRegionMismatchConfirm() {
  if (regionReviewSubmitted.value) return contactRegionSupport()
  await submitRegionReview()
}
function requestDealerService() { uni.navigateTo({ url: `/pages/manage/form?entity=tickets&category=message&deviceId=${encodeURIComponent(createdId.value || '')}` }) }
async function chooseNearbyDevice(item: (typeof nearbyDesignRows.value)[number]) {
  if (item.bound) return uni.showToast({ title:l('该设备已绑定','Device already bound'), icon:'none' })
  serialNumber.value = item.id
  deviceBindingService.prepareRegistration(item.id, currentRegion.value, store.context)
  await store.refresh()
  await connectBluetoothRegistration()
}
</script>

<template>
  <view class="page add-page">
    <SsAppBar :title="isBluetoothSearch ? l('搜索附近设备','Search Nearby Devices') : isQrDesignCase ? l('扫描设备二维码','Scan Device QR Code') : isConnectDesignCase ? l('连接设备','Connect Device') : isFlowDesignCase ? designFlowTitle : $t('device.add')" :right-icon="isQrDesignCase ? 'image' : ''" :right-text="isBluetoothSearch ? l('停止','Stop') : ''" :hide-back="store.designCaseId === 'D21'" :intercept-back="step > 0" fallback-url="/pages/shell/index" @back="goToPreviousStep" @right="scanning=false" />
    <view v-if="!isBluetoothSearch && !isQrDesignCase && !isConnectDesignCase && !isFlowDesignCase" class="stepper"><view v-for="index in 5" :key="index" class="step" :class="{ done: (step === 5 ? 5 : step) >= index, active: (step === 5 ? 5 : step) === index - 1 }"><text>{{ (step === 5 ? 5 : step) >= index ? '✓' : index }}</text><i v-if="index < 5" /></view></view>
    <scroll-view v-if="isBluetoothSearch" scroll-y class="nearby-design-scroll">
      <view class="nearby-radar"><i class="ring ring-1"/><i class="ring ring-2"/><i class="ring ring-3"/><span><SsIcon name="bluetooth" :size="38" tone="inverse" /></span></view>
      <view class="nearby-copy"><strong>{{ scanning ? l('正在扫描附近设备','Scanning nearby devices') : l('扫描已完成','Scan complete') }}</strong><text>{{ l('请将手机靠近已通电的设备','Keep the phone close to powered devices') }}</text></view>
      <view class="nearby-heading"><strong>{{ l('发现 3 台设备','3 devices found') }}</strong><text>{{ l('信号由强到弱','Strongest signal first') }}</text></view>
      <view class="nearby-list"><button v-for="item in nearbyDesignRows" :key="item.id" @click="chooseNearbyDevice(item)"><span :class="item.skin"><SsIcon :name="item.icon" :size="25" :tone="item.tone as any" /></span><view><strong>{{ item.name }}</strong><text>{{ l('设备类型','Device type') }}：{{ item.deviceType }}</text><text>{{ item.model }}</text></view><section><SsStatus :status="item.bound ? 'offline' : 'online'" :label="item.bound ? l('已绑定','Bound') : l('可连接','Connect')"/><text>{{ item.signal }} dBm</text></section><SsIcon name="chevron-right" :size="17" tone="muted" /></button></view>
    </scroll-view>
    <scroll-view v-else-if="isQrDesignCase" scroll-y class="qr-design-scroll">
      <view class="qr-stage">
        <view class="qr-code-wrap"><view class="qr-code-pattern"><i v-for="index in 81" :key="index" /></view><i class="corner top-left" /><i class="corner top-right" /><i class="corner bottom-left" /><i class="corner bottom-right" /></view>
        <text>{{ l('将设备铭牌上的二维码放入框内\n系统会自动识别序列号','Place the QR code on the device plate inside the frame\nThe serial number is recognized automatically') }}</text>
      </view>
      <view class="qr-toolbar">
        <view class="button-row"><button class="btn small"><SsIcon name="flashlight" :size="18" tone="default" />{{ l('打开手电筒','Flashlight') }}</button><button class="btn small subtle" @click="method = 'manual'">
          <SsIcon name="keyboard" :size="18" tone="brand" />{{ l('手动输入 SN','Enter SN') }}</button></view>
        <text>{{ l('相机画面仅在本机用于识别，不会上传。','The camera image is processed only on this device and is never uploaded.') }}</text>
      </view>
    </scroll-view>
    <scroll-view v-else-if="isConnectDesignCase" scroll-y class="page-scroll connect-design-scroll">
      <view class="card connect-design-device"><view class="connect-design-device-icon"><SsIcon name="fan" :size="32" tone="brand" /></view><view><strong>{{ l('顶流机 DL-3000','Surface jet DL-3000') }}</strong><text>Shark-DL3000-01 · {{ l('信号强','Strong signal') }}</text></view></view>
      <view class="card connect-design-progress"><view class="connect-progress-head"><view><strong>{{ l('连接中','Connecting') }}</strong><text>{{ l('正在验证设备身份','Verifying device identity') }}</text></view><strong>62%</strong></view><view class="progress"><view class="progress-bar" style="width:62%" /></view><view class="connect-stage-rail"><view v-for="(item,index) in [{icon:'smartphone',label:l('手机','Phone')},{icon:'bluetooth',label:l('蓝牙','Bluetooth')},{icon:'cpu',label:l('设备','Device')},{icon:'cloud',label:l('账号','Account')}]" :key="item.label" :class="{done:index < 2, active:index === 2}"><span><SsIcon :name="item.icon" :size="15" :tone="index < 2 ? 'inverse' : index === 2 ? 'brand' : 'muted'" /></span><text>{{ item.label }}</text></view></view></view>
      <view class="card connect-design-checks"><view v-for="(item,index) in [{icon:'check',tone:'success',title:l('已发现设备','Device discovered'),copy:l('蓝牙信号 -42 dBm','Bluetooth signal -42 dBm')},{icon:'check',tone:'success',title:l('蓝牙连接已建立','Bluetooth connected'),copy:l('加密通道已启用','Encrypted channel enabled')},{icon:'loader-circle',tone:'brand',title:l('正在读取设备信息','Reading device information'),copy:l('请保持手机靠近设备','Keep the phone near the device')}]" :key="item.title" class="connect-check-row"><view :class="index === 2 ? 'loading' : 'done'"><SsIcon :name="item.icon" :size="18" :tone="item.tone as any" /></view><view><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view></view></view>
      <button class="btn connect-cancel"><SsIcon name="x" :size="18" tone="muted" />{{ l('取消连接','Cancel connection') }}</button>
    </scroll-view>
    <scroll-view v-else-if="store.designCaseId === 'D15'" scroll-y class="page-scroll add-ready-design">
      <view class="add-ready-hero"><view><SsIcon name="scan-line" :size="34" tone="brand" /></view><strong>{{ l('准备连接设备','Prepare to connect') }}</strong><text>{{ l('请确保设备已通电，并在手机附近。','Make sure the device is powered on and nearby.') }}</text></view>
      <view class="add-ready-capabilities"><view v-for="item in [{icon:'bluetooth',tone:'muted',skin:'',title:l('蓝牙','Bluetooth'),copy:l('发现并连接附近设备','Discover and connect nearby devices'),state:l('需要','Required')},{icon:'map-pin',tone:'success',skin:'success',title:l('定位','Location'),copy:l('用于设备激活与航点定位','Used for activation and waypoints'),state:l('稍后','Later')},{icon:'camera',tone:'accent',skin:'purple',title:l('相机','Camera'),copy:l('仅在扫码添加时使用','Used only when scanning a QR code'),state:l('可选','Optional')}]" :key="item.title"><span :class="item.skin"><SsIcon :name="item.icon" :size="20" :tone="item.tone as any" /></span><view><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view><em>{{ item.state }}</em></view></view>
      <button class="btn primary add-ready-primary" @click="chooseDesignMethod('bluetooth')"><SsIcon name="bluetooth" :size="18" tone="inverse" />{{ l('开始搜索设备','Search for devices') }}</button><button class="btn add-ready-secondary" @click="chooseDesignMethod('qr')"><SsIcon name="scan-line" :size="18" tone="default" />{{ l('扫描设备二维码','Scan device QR') }}</button><button class="add-ready-link" @click="chooseDesignMethod('manual')">{{ l('手动输入序列号','Enter serial manually') }}</button>
    </scroll-view>
    <scroll-view v-else-if="store.designCaseId === 'D18'" scroll-y class="page-scroll serial-design-page">
      <view class="card serial-design-field"><text>{{ l('设备序列号','Device serial') }}</text><view><SsIcon name="hash" :size="20" tone="muted" /><strong>DL300020240101</strong><button>{{ l('清除','Clear') }}</button></view><span>{{ l('序列号位于设备铭牌或包装标签上。','The serial is printed on the device plate or package label.') }}</span></view>
      <text class="serial-result-label">{{ l('识别结果','Identification result') }}</text><view class="card serial-device-card"><view><SsIcon name="fan" :size="31" tone="brand" /></view><section><strong>{{ l('顶流机 DL-3000','Surface jet DL-3000') }}</strong><text>{{ l('序列号：DL300020240101','Serial: DL300020240101') }}</text></section></view>
      <view class="notice success serial-ready"><SsIcon name="badge-check" :size="18" tone="success" /><view><strong>{{ l('已识别设备','Device recognized') }}</strong><text>{{ l('继续后将自动完成激活。','Continue to activate automatically.') }}</text></view></view><button class="btn primary serial-continue" @click="connect"><SsIcon name="arrow-right" :size="18" tone="inverse" />{{ l('继续','Continue') }}</button>
    </scroll-view>
    <scroll-view v-else-if="store.designCaseId === 'D21'" scroll-y class="page-scroll add-success-design">
      <view class="add-success-check"><SsIcon name="check" :size="38" tone="success" /></view><strong class="add-success-title">{{ l('设备已激活','Device activated') }}</strong><text class="add-success-copy">{{ l('设备已添加到当前账号，可以查看状态和运行数据。','The device is on this account. You can now view its status and operating data.') }}</text><view class="card add-success-device"><view><SsIcon name="fan" :size="31" tone="brand" /></view><section><view><strong>{{ l('顶流机-01','Surface jet-01') }}</strong><SsStatus status="online" :label="l('在线','Online')" /></view><text>DL-3000 · SN DL300020240101</text></section></view><view class="success-storage"><SsIcon name="cloud" :size="20" tone="brand" /><text>{{ l('航点保存设置','Waypoint storage') }}</text><strong>{{ waypointStorageLabel }}</strong></view><button class="btn primary add-success-detail" @click="uni.redirectTo({ url: `/pages/device/detail?id=${createdId}` })"><SsIcon name="arrow-right" :size="18" tone="inverse" />{{ l('进入设备详情','Open device details') }}</button><button class="add-success-more" @click="step = 0"><SsIcon name="plus" :size="18" tone="brand" />{{ l('继续添加设备','Add another device') }}</button>
    </scroll-view>
    <scroll-view v-else scroll-y class="page-scroll" :class="{ 'with-cta': hasFooterAction }">
      <text v-if="step !== 5" class="flow-title">{{ stepTitle }}</text><text v-if="step !== 5" class="flow-copy">{{ step === 0 ? l('使用设备时按需开启蓝牙、定位和相机权限。','Allow Bluetooth, location and camera access when needed.') : step === 1 ? l('选择最适合当前环境的设备识别方式。','Choose the device identification method that fits your environment.') : step === 2 ? l('确认目标设备的序列号后继续。','Confirm the target device serial number to continue.') : step === 3 ? l('请保持手机靠近设备，并确保设备已通电。','Keep the phone near the powered-on device.') : l('请处理下方提示后重试。','Resolve the issue below and try again.') }}</text>

      <template v-if="step === 0">
        <view class="permission-list list-card">
          <view class="list-row" @click="requestBluetooth"><view class="icon-tile"><SsIcon name="bluetooth" :size="23" tone="default" /></view><view class="list-copy"><strong>{{ l('蓝牙服务','Bluetooth service') }}</strong><text>{{ l('用于发现、连接并绑定附近设备','Discover, connect, and bind nearby devices') }}</text></view><text class="capability-state">{{ bluetoothAllowed ? l('已允许','Allowed') : l('使用时申请','Ask when used') }}</text></view>
          <view class="list-row" @click="requestLocation"><view class="icon-tile success"><SsIcon name="locate-fixed" :size="23" tone="default" /></view><view class="list-copy"><strong>{{ l('定位权限','Location access') }}</strong><text>{{ l('用于设备激活与航点定位','Used for activation and waypoints') }}</text></view><text class="capability-state">{{ location ? l('已允许','Allowed') : l('使用时申请','Ask when used') }}</text></view>
          <view class="list-row" @click="scanQr"><view class="icon-tile warning"><SsIcon name="camera" :size="23" tone="default" /></view><view class="list-copy"><strong>{{ l('相机权限','Camera access') }}</strong><text>{{ l('仅在扫描设备二维码时申请','Requested only when scanning a device QR code') }}</text></view><text class="capability-state">{{ camera ? l('已允许','Allowed') : l('使用时申请','Ask when used') }}</text></view>
        </view>
        <view class="notice permission-account-notice"><SsIcon name="shield-check" :size="20" tone="brand" /><text>{{ l('定位与蓝牙授权仅对当前手机和当前账号有效；换手机、退出后换账号或解绑换用户时，需要重新授权。','Location and Bluetooth permissions apply only to this phone and account. A new phone, switched account, or rebound user must grant them again.') }}</text></view>
      </template>

      <view v-else-if="step === 1" class="method-list">
        <button @click="chooseMethod('bluetooth')"><view class="method-icon"><SsIcon name="bluetooth" :size="30" tone="default" /></view><view><strong>{{ $t('device.scan') }}</strong><text>{{ l('自动发现附近已进入配网模式的设备','Discover nearby devices in pairing mode') }}</text></view><SsIcon name="chevron-right" :size="19" tone="default" /></button>
        <button @click="chooseMethod('qr')"><view class="method-icon green"><SsIcon name="scan-line" :size="30" tone="default" /></view><view><strong>{{ $t('device.qr') }}</strong><text>{{ l('扫描机身、包装或相册中的二维码','Scan a QR code on the device, packaging, or photo library') }}</text></view><SsIcon name="chevron-right" :size="19" tone="default" /></button>
        <button @click="chooseMethod('manual')"><view class="method-icon orange"><SsIcon name="keyboard" :size="30" tone="default" /></view><view><strong>{{ $t('device.manual') }}</strong><text>{{ l('输入设备标签上的序列号 SN','Enter the SN printed on the device label') }}</text></view><SsIcon name="chevron-right" :size="19" tone="default" /></button>
      </view>

      <template v-else-if="step === 2 && method === 'bluetooth'">
        <view class="scan-state"><view class="radar" :class="{ scanning }"><SsIcon name="bluetooth" :size="38" tone="default" /></view><text>{{ scanning ? l('正在扫描附近设备…','Scanning nearby devices…') : l(`发现 ${nearbyDevices.length} 台设备`,`Found ${nearbyDevices.length} devices`) }}</text></view>
        <view class="list-card scan-results"><view v-for="item in nearbyDevices" :key="item.id" class="list-row" :class="{ selected: serialNumber === item.id }" @click="serialNumber = item.id"><view class="icon-tile"><SsIcon name="cpu" :size="23" tone="default" /></view><view class="list-copy"><strong>{{ item.name }}</strong><text class="device-type-line">{{ l('设备类型','Device type') }}：{{ store.locale === 'zh-Hans' ? item.deviceType : item.deviceTypeEn }} · {{ item.model }}</text><text>SN {{ item.id }} · {{ item.signal }} dBm</text></view><SsIcon :name="serialNumber === item.id ? 'circle-check' : 'circle'" :size="22" tone="default" /></view></view>
        <button class="btn subtle rescan" :disabled="scanning" @click="scanBluetooth"><SsIcon name="refresh-cw" :size="19" tone="default" />{{ l('重新扫描','Scan again') }}</button>
      </template>

      <template v-else-if="step === 2 && method === 'qr'">
        <view class="scanner"><view class="scan-frame"><i class="c1" /><i class="c2" /><i class="c3" /><i class="c4" /><view class="scan-line" /></view><text>{{ serialNumber ? l(`已识别 ${serialNumber}`,`Recognized ${serialNumber}`) : l('尚未识别设备二维码','No device QR code recognized') }}</text></view>
        <view class="button-row"><button class="btn small subtle" @click="scanQr">{{ l('打开系统扫码','Open scanner') }}</button><button class="btn small subtle" @click="method = 'manual'">{{ l('手动输入','Enter manually') }}</button></view>
      </template>

      <template v-else-if="step === 2">
        <view class="field"><text class="field-label">{{ l('设备序列号','Device serial number') }} SN</text><view class="field-control serial-control"><SsIcon name="hash" :size="20" tone="default" /><input v-model="serialNumber" auto-capitalize="characters" :placeholder="l('例如 DL350020260810','Example: DL350020260810')" @input="updateSerialInput" @blur="updateSerialInput" @confirm="updateSerialInput" /><button class="serial-generate" @click="regenerateSerial">{{ l('随机生成','Generate') }}</button></view><text class="field-hint">{{ l('序列号可直接修改；系统会自动忽略空格和连字符。','You can edit the serial directly. Spaces and hyphens are ignored.') }}</text></view>
        <view class="notice"><SsIcon name="info" :size="20" tone="default" /><text>{{ l('输入设备标签上的 SN，继续后会自动完成激活。','Enter the SN on the device label. Activation continues automatically.') }}</text></view>
      </template>

      <template v-else-if="step === 3"><view class="connect-card card"><view class="connect-device"><SsIcon name="bluetooth" :size="44" tone="default" /></view><text>{{ connecting ? l('正在连接设备','Connecting to device') : l('设备连接成功','Connected') }}</text><span>{{ serialNumber }}</span><view class="connection-rail"><view class="rail done"><span><SsIcon name="smartphone" :size="22" tone="default" /></span><text>{{ l('手机','Phone') }}</text></view><i /><view class="rail active"><span><SsIcon name="bluetooth" :size="22" tone="default" /></span><text>{{ l('蓝牙','Bluetooth') }}</text></view><i /><view class="rail"><span><SsIcon name="cpu" :size="22" tone="default" /></span><text>{{ l('设备','Device') }}</text></view></view><strong>{{ l('连接成功后进入设备激活','Continue to activation after connection') }}</strong></view></template>

      <template v-else-if="step === 4">
        <view class="region-check card" :class="bindingCopy.tone"><view class="region-map"><SsIcon :name="bindingCopy.icon" :size="48" tone="default" /></view><text>{{ bindingCopy.title }}</text><span>{{ bindingCopy.detail }}</span><span v-if="bindingRegistration">{{ bindingRegistration.model }} · SN {{ bindingRegistration.serialNumber }}</span><view v-if="bindingCheck?.status === 'regionMismatch'" class="button-row retry-actions"><button class="btn subtle" @click="step = 2">{{ l('修改序列号','Change serial') }}</button><button class="btn primary" @click="showRegionMismatch = true">{{ regionReviewSubmitted ? l('查看审核信息','Review details') : l('上报异常','Report exception') }}</button></view><view v-else-if="bindingCheck?.status !== 'ready'" class="button-row retry-actions"><button class="btn subtle" @click="step = 2">{{ l('修改序列号','Change serial') }}</button><button class="btn primary" @click="ownerDealer ? callDealer() : requestDealerService()">{{ ownerDealer ? l('联系服务人员','Contact service') : l('联系客服','Contact support') }}</button></view></view>
      </template>

      <template v-else>
        <view class="success-state"><view class="success-icon"><SsIcon name="check-circle-2" :size="54" tone="default" /></view><text>{{ l('设备已激活','Device activated') }}</text><span>{{ l('设备已添加到当前账号，可以开始使用。','The device is now on your account and ready to use.') }}</span><view class="success-summary card"><view><text>{{ l('设备型号','Device model') }}</text><strong>{{ createdDevice?.model || bindingCheck?.registration?.model || '--' }}</strong></view><view><text>{{ l('设备序列号','Device serial') }}</text><strong>{{ serialNumber }}</strong></view><view><text>{{ l('激活状态','Activation status') }}</text><strong>{{ l('已激活','Activated') }}</strong></view><view><text>{{ l('激活时间','Activated at') }}</text><strong>{{ createdDevice?.activatedAt?.slice(0, 16).replace('T', ' ') || '--' }}</strong></view></view><view class="success-storage"><SsIcon name="cloud" :size="20" tone="brand" /><text>{{ l('航点保存设置','Waypoint storage') }}</text><strong>{{ waypointStorageLabel }}</strong></view></view>
      </template>
    </scroll-view>

    <view v-if="!isBluetoothSearch && !isQrDesignCase && !isConnectDesignCase && !isFlowDesignCase && hasFooterAction" class="fixed-cta">
      <button v-if="step === 5" class="btn primary" @click="uni.redirectTo({ url: `/pages/device/detail?id=${createdId}` })">{{ l('查看设备详情','View device details') }}</button>
      <button v-else-if="step !== 1 && step !== 3 && step !== 4" class="btn primary" :disabled="bindingBusy" @click="next">{{ bindingBusy ? l('正在激活…','Activating…') : step === 2 ? l('继续','Continue') : $t('common.next') }}</button>
    </view>
    <SsModal :show="showRegionMismatch" :title="regionReviewSubmitted ? l('激活申请已上报','Activation request submitted') : l('暂时无法激活','Activation unavailable')" :description="regionReviewSubmitted ? l(`预计在 ${regionReviewDeadline} 前完成核验，审核通过后可重新激活。`,`Review is expected by ${regionReviewDeadline}. Try again after approval.`) : l('请上报异常，平台核验后会通知处理结果。','Report this issue. You will be notified after review.')" icon="shield-alert" tone="warning" :confirm-text="regionReviewSubmitted ? (ownerDealer ? l('联系代理商','Call dealer') : l('联系官方客服','Call support')) : (regionReviewBusy ? l('正在上报…','Reporting…') : l('上报异常','Report exception'))" :cancel-text="regionReviewSubmitted ? l('关闭','Close') : l('返回修改','Go back')" @cancel="showRegionMismatch = false" @confirm="handleRegionMismatchConfirm">
      <view class="region-contact-panel"><view v-if="regionReviewSubmitted"><text>{{ l('审核状态','Review status') }}</text><strong>{{ l('待平台核验','Pending platform review') }}</strong><span>{{ l(`预计完成：${regionReviewDeadline}`, `Expected by: ${regionReviewDeadline}`) }}</span></view><view class="contact-owner"><text>{{ ownerDealer ? l('所属代理商','Assigned dealer') : l('官方客服','Official support') }}</text><strong>{{ regionContact.name }}</strong><span>{{ regionContact.phone }} · {{ regionContact.email }}</span></view></view>
    </SsModal>
  </view>
</template>

<style scoped>
.stepper { display: flex; align-items: center; padding: 16rpx 42rpx 24rpx; }.step { display: flex; align-items: center; flex: 1; }.step:last-child { flex: 0 0 40rpx; }.step > text { display: flex; width: 40rpx; height: 40rpx; flex: 0 0 40rpx; align-items: center; justify-content: center; color: var(--color-text-secondary); background: var(--color-bg-subtle); border-radius: 50%; font-size: 20rpx; }.step > i { height: 4rpx; flex: 1; background: var(--color-divider); }.step.done > text, .step.active > text { color: #fff; background: var(--color-action-primary); }.step.done > i { background: var(--color-action-primary); }
.flow-title { display: block; font-size: 38rpx; line-height: 52rpx; font-weight: 600; }.flow-copy { display: block; margin: 10rpx 0 36rpx; color: var(--color-text-secondary); font-size: 25rpx; line-height: 38rpx; }.permission-list { margin-top: 8rpx; }.grant { width: 100%; margin-top: 24rpx; }
.capability-state { color:var(--ss-green-700);font-size:21rpx;font-weight:600;white-space:nowrap; }.capability-state.unavailable { color:var(--ss-orange-700); }
.method-list { display: flex; flex-direction: column; gap: 18rpx; }.method-list button { display: flex; min-height: 148rpx; align-items: center; gap: 22rpx; padding: 24rpx; background: #fff; border: 2rpx solid var(--color-border-subtle); border-radius: 18rpx; text-align: left; }.method-list button > view:nth-child(2) { min-width: 0; flex: 1; }.method-list strong, .method-list text { display: block; }.method-list strong { font-size: 28rpx; }.method-list text { margin-top: 7rpx; color: var(--color-text-secondary); font-size: 22rpx; line-height: 32rpx; }.method-icon { display: flex; width: 88rpx; height: 88rpx; align-items: center; justify-content: center; background: var(--color-action-primary-subtle); border-radius: 18rpx; }.method-icon.green { background: var(--ss-green-50); }.method-icon.orange { background: var(--ss-orange-50); }
.serial-control input { min-width:0;flex:1; }.serial-generate { flex:0 0 auto;padding:12rpx 16rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:0;border-radius:10rpx;font-size:21rpx;font-weight:600;white-space:nowrap; }
.scan-state { display: flex; flex-direction: column; align-items: center; margin-bottom: 28rpx; }.radar { display: flex; width: 120rpx; height: 120rpx; align-items: center; justify-content: center; background: var(--color-action-primary-subtle); border: 4rpx solid var(--ss-brand-200); border-radius: 50%; }.radar.scanning { animation: pulse 1s ease infinite; }.scan-state > text { margin: 18rpx 0; font-size: 25rpx; font-weight: 600; }.selected { background: var(--color-action-primary-subtle); }
.scan-results .list-row{min-height:128rpx}.scan-results .device-type-line{color:var(--color-text-body);font-weight:600}
.nearby-design-scroll { min-height:0;flex:1;padding:38rpx 32rpx 48rpx;box-sizing:border-box; }.nearby-radar { position:relative;width:404rpx;height:404rpx;margin:0 auto; }.nearby-radar .ring { position:absolute;border:2rpx solid var(--ss-brand-300);border-radius:50%; }.nearby-radar .ring-1 { inset:0; }.nearby-radar .ring-2 { inset:56rpx; }.nearby-radar .ring-3 { inset:112rpx; }.nearby-radar > span { position:absolute;inset:144rpx;display:flex;align-items:center;justify-content:center;background:var(--color-action-primary);border-radius:50%;box-shadow:0 12rpx 30rpx rgba(31,96,217,.2); }
.nearby-copy { margin-top:18rpx;text-align:center; }.nearby-copy strong,.nearby-copy text { display:block; }.nearby-copy strong { font-size:28rpx; }.nearby-copy text { margin-top:5rpx;color:var(--color-text-secondary);font-size:21rpx; }.nearby-heading { display:flex;align-items:center;justify-content:space-between;margin-top:50rpx; }.nearby-heading strong { font-size:26rpx; }.nearby-heading text { color:var(--color-text-secondary);font-size:20rpx; }
.nearby-list { display:flex;flex-direction:column;gap:18rpx;margin-top:28rpx; }.nearby-list button { display:grid;min-height:142rpx;grid-template-columns:88rpx minmax(0,1fr) auto 28rpx;align-items:center;gap:18rpx;padding:20rpx 24rpx;color:var(--color-text-primary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx;text-align:left;box-sizing:border-box; }.nearby-list button > span { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.nearby-list button > span.success { background:var(--ss-green-50); }.nearby-list button > span.warning { background:var(--ss-orange-50); }.nearby-list button > view { min-width:0; }.nearby-list button > view strong,.nearby-list button > view text,.nearby-list section text { display:block; }.nearby-list button > view strong { overflow:hidden;font-size:24rpx;text-overflow:ellipsis;white-space:nowrap; }.nearby-list button > view text,.nearby-list section text { margin-top:5rpx;color:var(--color-text-secondary);font-size:19rpx; }.nearby-list section { display:flex;flex-direction:column;align-items:flex-end; }
.demo-notice { margin-bottom:28rpx; }.rescan { width:100%;margin-top:20rpx; }
.scanner { position: relative; display: flex; min-height: 620rpx; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 24rpx; overflow: hidden; color: #fff; background: #152033; border-radius: 20rpx; }.scan-frame { position: relative; width: 420rpx; height: 420rpx; }.scan-frame i { position: absolute; width: 70rpx; height: 70rpx; border-color: #fff; }.c1 { top: 0; left: 0; border-top: 8rpx solid; border-left: 8rpx solid; }.c2 { top: 0; right: 0; border-top: 8rpx solid; border-right: 8rpx solid; }.c3 { bottom: 0; left: 0; border-bottom: 8rpx solid; border-left: 8rpx solid; }.c4 { right: 0; bottom: 0; border-right: 8rpx solid; border-bottom: 8rpx solid; }.scan-line { position: absolute; top: 50%; right: 12rpx; left: 12rpx; height: 4rpx; background: #16c37d; box-shadow: 0 0 20rpx rgba(22,195,125,.8); }.scanner > text { margin-top: 28rpx; font-size: 24rpx; }.flash { display: flex; width: 80rpx; height: 80rpx; align-items: center; justify-content: center; margin-top: 24rpx; color: #fff; background: rgba(255,255,255,.12); border: 2rpx solid rgba(255,255,255,.22); border-radius: 50%; }
.connection-rail { display: flex; align-items: flex-start; justify-content: center; margin: 48rpx 0; }.connection-rail > i { width: 74rpx; height: 4rpx; margin-top: 42rpx; background: var(--color-divider); }.rail { display: flex; width: 80rpx; flex-direction: column; align-items: center; gap: 8rpx; color: var(--color-text-secondary); font-size: 20rpx; }.rail span { display: flex; width: 80rpx; height: 80rpx; align-items: center; justify-content: center; background: var(--color-bg-subtle); border-radius: 50%; }.rail.done span, .rail.active span { background: var(--color-action-primary-subtle); border: 2rpx solid var(--ss-brand-200); }.rail.active span { animation: pulse 1s ease infinite; }.connect-card { text-align: center; }.connect-device { display: flex; width: 144rpx; height: 144rpx; align-items: center; justify-content: center; margin: 0 auto 18rpx; background: var(--color-action-primary-subtle); border-radius: 24rpx; }.connect-card > text,.connect-card > span,.connect-card > strong { display: block; }.connect-card > text { font-size: 28rpx; font-weight: 600; }.connect-card > span { margin: 8rpx 0 28rpx; color: var(--color-text-secondary); font-size: 22rpx; }.connect-card > strong { margin-top: 12rpx; color: var(--color-action-primary); }
.connect-design-device { display:flex;align-items:center;gap:22rpx;padding:26rpx 30rpx;box-shadow:none; }.connect-design-device-icon { display:flex;width:128rpx;height:128rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:16rpx; }.connect-design-device strong,.connect-design-device text { display:block; }.connect-design-device strong { font-size:29rpx; }.connect-design-device text { margin-top:7rpx;color:var(--color-text-secondary);font-size:21rpx; }.connect-design-progress { margin-top:24rpx;padding:30rpx;box-shadow:none; }.connect-progress-head { display:flex;align-items:center;justify-content:space-between;gap:20rpx; }.connect-progress-head > view { display:flex;align-items:baseline;gap:8rpx; }.connect-progress-head strong { font-size:31rpx; }.connect-progress-head > view text { color:var(--color-text-secondary);font-size:20rpx; }.connect-design-progress .progress { margin-top:16rpx; }.connect-stage-rail { position:relative;display:grid;grid-template-columns:repeat(4,1fr);margin-top:24rpx; }.connect-stage-rail::before { position:absolute;top:20rpx;right:12%;left:12%;height:3rpx;content:'';background:var(--color-divider); }.connect-stage-rail > view { position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:7rpx;color:var(--color-text-secondary);font-size:19rpx; }.connect-stage-rail span { display:flex;width:42rpx;height:42rpx;align-items:center;justify-content:center;background:#fff;border:3rpx solid var(--color-border-subtle);border-radius:50%; }.connect-stage-rail .done span { background:var(--ss-green-500);border-color:var(--ss-green-500); }.connect-stage-rail .active span { background:var(--color-action-primary-subtle);border-color:var(--color-action-primary); }.connect-design-checks { margin-top:28rpx;padding:0 28rpx;box-shadow:none; }.connect-check-row { display:flex;align-items:center;gap:20rpx;min-height:114rpx;border-bottom:2rpx solid var(--color-divider); }.connect-check-row:last-child { border-bottom:0; }.connect-check-row > view:first-child { display:flex;width:66rpx;height:66rpx;align-items:center;justify-content:center;border-radius:14rpx; }.connect-check-row > .done { background:var(--ss-green-50); }.connect-check-row > .loading { background:var(--color-action-primary-subtle); }.connect-check-row strong,.connect-check-row text { display:block; }.connect-check-row strong { font-size:25rpx; }.connect-check-row text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.connect-cancel { width:100%;margin-top:28rpx;background:#fff;border:2rpx solid var(--color-border-subtle); }
.add-ready-hero { display:flex;flex-direction:column;align-items:center;padding-top:76rpx;text-align:center; }.add-ready-hero > view { display:flex;width:136rpx;height:136rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:50%; }.add-ready-hero strong { margin-top:28rpx;font-size:31rpx; }.add-ready-hero text { margin-top:10rpx;color:var(--color-text-secondary);font-size:22rpx; }.add-ready-capabilities { margin-top:104rpx; }.add-ready-capabilities > view { display:flex;align-items:center;gap:20rpx;min-height:112rpx;margin-top:16rpx;padding:0 22rpx;background:var(--color-bg-subtle);border-radius:14rpx; }.add-ready-capabilities > view > span { display:flex;width:68rpx;height:68rpx;align-items:center;justify-content:center;background:#fff;border-radius:12rpx; }.add-ready-capabilities > view > span.success { background:var(--ss-green-50); }.add-ready-capabilities > view > span.purple { background:var(--ss-purple-50); }.add-ready-capabilities > view > view { min-width:0;flex:1; }.add-ready-capabilities strong,.add-ready-capabilities text { display:block; }.add-ready-capabilities text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.add-ready-capabilities em { padding:7rpx 12rpx;background:#fff;border-radius:999rpx;font-size:19rpx;font-style:normal; }.add-ready-primary,.add-ready-secondary { width:100%;margin-top:28rpx; }.add-ready-secondary { margin-top:16rpx;background:#fff;border:2rpx solid var(--color-border-subtle); }.add-ready-link { display:block;margin:24rpx auto;color:var(--color-action-primary);background:transparent;border:0;font-size:24rpx; }.serial-design-field { padding:26rpx;box-shadow:none; }.serial-design-field > text,.serial-design-field > span { display:block; }.serial-design-field > text { font-size:22rpx;font-weight:600; }.serial-design-field > view { display:flex;min-height:84rpx;align-items:center;gap:16rpx;margin-top:12rpx;padding:0 20rpx;border:2rpx solid var(--color-action-primary);border-radius:12rpx;box-shadow:0 0 0 6rpx rgba(40,114,248,.08); }.serial-design-field > view strong { min-width:0;flex:1;font-size:23rpx;font-weight:500; }.serial-design-field button { color:var(--color-action-primary);background:transparent;border:0;font-size:21rpx; }.serial-design-field > span { margin-top:10rpx;color:var(--color-text-secondary);font-size:19rpx; }.serial-result-label { display:block;margin:48rpx 0 18rpx;font-size:25rpx;font-weight:600; }.serial-device-card { display:flex;align-items:center;gap:28rpx;padding:28rpx;box-shadow:none; }.serial-device-card > view { display:flex;width:128rpx;height:128rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:16rpx; }.serial-device-card section { min-width:0;flex:1; }.serial-device-card strong,.serial-device-card text { display:block; }.serial-device-card strong { font-size:29rpx; }.serial-device-card text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.serial-ready { margin-top:30rpx; }.serial-ready strong,.serial-ready text { display:block; }.serial-ready text { margin-top:4rpx; }.serial-continue { width:100%;margin-top:28rpx; }.region-design-map { position:relative;height:240rpx;overflow:hidden;border-radius:16rpx; }.region-design-map > image { width:100%;height:100%; }.region-design-map > view { position:absolute;top:82rpx;left:calc(62% - 30rpx);display:flex;width:60rpx;height:60rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border:6rpx solid #fff;border-radius:50% 50% 50% 10rpx;transform:rotate(-45deg); }.region-design-map > view .ss-icon { transform:rotate(45deg); }.region-design-progress { margin-top:20rpx;padding:26rpx;box-shadow:none; }.region-design-progress .section-head strong,.region-design-progress .section-head text { display:block; }.region-design-progress .section-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx; }.region-stage-rail { position:relative;display:grid;grid-template-columns:repeat(4,1fr);margin-top:24rpx; }.region-stage-rail::before { position:absolute;top:19rpx;right:12%;left:12%;height:3rpx;content:'';background:var(--ss-green-500); }.region-stage-rail > view { position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:7rpx;color:var(--color-text-secondary);font-size:18rpx; }.region-stage-rail span { display:flex;width:40rpx;height:40rpx;align-items:center;justify-content:center;background:var(--ss-green-500);border-radius:50%; }.region-stage-rail .active span { background:var(--color-action-primary); }.region-values { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16rpx;margin-top:24rpx; }.region-values > view { padding:22rpx 24rpx;background:rgba(255,255,255,.42);border-radius:12rpx; }.region-values text,.region-values strong { display:block; }.region-values text { color:var(--color-text-secondary);font-size:20rpx; }.region-values strong { margin-top:7rpx;font-size:27rpx; }.region-values > view:last-child strong { color:var(--ss-green-700); }.region-match { margin-top:28rpx; }.region-match strong,.region-match text { display:block; }.region-match text { margin-top:4rpx; }.region-activate { width:100%;margin-top:28rpx; }.add-success-design { text-align:center; }.add-success-check { display:flex;width:136rpx;height:136rpx;align-items:center;justify-content:center;margin:52rpx auto 0;background:var(--ss-green-50);border:2rpx solid var(--ss-green-200);border-radius:50%; }.add-success-title { display:block;margin-top:32rpx;font-size:31rpx; }.add-success-copy { display:block;max-width:590rpx;margin:12rpx auto 40rpx;color:var(--color-text-secondary);font-size:22rpx;line-height:34rpx; }.add-success-device { display:flex;align-items:center;gap:24rpx;max-width:620rpx;margin:0 auto;padding:28rpx;text-align:left;box-shadow:none; }.add-success-device > view { display:flex;width:128rpx;height:128rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.add-success-device section { min-width:0;flex:1; }.add-success-device section > view { display:flex;align-items:center;gap:12rpx; }.add-success-device section strong { font-size:28rpx; }.add-success-device section text { display:block;margin-top:7rpx;color:var(--color-text-secondary);font-size:20rpx; }.add-success-detail { margin-top:32rpx; }.add-success-more { display:flex;align-items:center;gap:10rpx;margin:32rpx auto;color:var(--color-action-primary);background:transparent;border:0;font-size:23rpx; }
.region-check { padding: 40rpx; text-align: center; }.region-map { display: flex; width: 144rpx; height: 144rpx; align-items: center; justify-content: center; margin: 0 auto 24rpx; background: var(--ss-green-50); border-radius: 28rpx; }.region-check > text,.region-check > span { display: block; }.region-check > text { font-size: 32rpx; font-weight: 600; }.region-check > span { margin-top: 12rpx; color: var(--color-text-secondary); font-size: 23rpx; }.region-check .notice { margin-top: 32rpx; text-align: left; }
.region-check.warning .region-map { color:var(--ss-orange-700);background:var(--ss-orange-50); }.region-check.error .region-map { color:var(--ss-red-700);background:var(--ss-red-50); }.retry-check { width:100%;margin-top:24rpx; }
.dealer-contact { display:flex;align-items:center;justify-content:space-between;gap:18rpx;margin-top:24rpx;padding:18rpx 20rpx;text-align:left;background:var(--color-bg-canvas);border-radius:14rpx; }.dealer-contact strong,.dealer-contact text { display:block; }.dealer-contact text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.retry-actions { margin-top:24rpx; }.retry-actions .btn { min-width:0;flex:1; }
.region-contact-panel { display:grid;gap:2rpx;margin-top:24rpx;overflow:hidden;background:var(--color-border-subtle);border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-sm); }.region-contact-panel > view { padding:18rpx 20rpx;background:#fff; }.region-contact-panel text,.region-contact-panel strong,.region-contact-panel span { display:block; }.region-contact-panel text { color:var(--color-text-secondary);font-size:20rpx; }.region-contact-panel strong { margin-top:5rpx;font-size:24rpx; }.region-contact-panel span { margin-top:5rpx;color:var(--color-action-primary);font-size:21rpx;line-height:30rpx;word-break:break-all; }
.waypoint-storage{margin-top:20rpx;padding:24rpx;box-shadow:none}.storage-title{display:flex;align-items:center;justify-content:space-between;gap:18rpx}.storage-title strong,.storage-title text{display:block}.storage-title strong{font-size:25rpx}.storage-title text{margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx}.storage-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14rpx;margin-top:20rpx}.storage-options button{display:flex;min-width:0;min-height:142rpx;align-items:center;gap:12rpx;padding:16rpx;color:var(--color-text-primary);background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:13rpx;text-align:left}.storage-options button.selected{background:var(--color-action-primary-subtle);border-color:var(--color-action-primary)}.storage-options button>span{display:flex;width:54rpx;height:54rpx;flex:0 0 54rpx;align-items:center;justify-content:center;background:#fff;border-radius:10rpx}.storage-options button>view{min-width:0;flex:1}.storage-options strong,.storage-options text{display:block}.storage-options strong{font-size:21rpx}.storage-options text{margin-top:3rpx;color:var(--color-text-secondary);font-size:17rpx;line-height:24rpx}
.success-state { padding-top: 20rpx; text-align: center; }.success-icon { display: flex; width: 160rpx; height: 160rpx; align-items: center; justify-content: center; margin: 0 auto 28rpx; background: var(--ss-green-50); border-radius: 50%; }.success-state > text,.success-state > span { display: block; }.success-state > text { font-size: 40rpx; font-weight: 600; }.success-state > span { max-width: 600rpx; margin: 12rpx auto 40rpx; color: var(--color-text-secondary); font-size: 24rpx; line-height: 38rpx; }.success-summary { display: grid; grid-template-columns: repeat(2,1fr); gap: 28rpx; text-align: left; }.success-summary text,.success-summary strong { display: block; }.success-summary text { color: var(--color-text-secondary); font-size: 22rpx; }.success-summary strong { margin-top: 6rpx; font-size: 26rpx; }.success-summary .green { color: var(--ss-green-700); }
.fixed-cta .btn { width: 100%; }
.success-storage { display:flex;align-items:center;gap:12rpx;margin-top:20rpx;padding:20rpx 24rpx;background:var(--color-action-primary-subtle);border-radius:8rpx;text-align:left; }.success-storage text { flex:1;color:var(--color-text-secondary);font-size:22rpx; }.success-storage strong { color:var(--color-action-primary);font-size:23rpx; }
.qr-design-scroll { min-height:0;flex:1;background:var(--color-bg-canvas); }.qr-stage { display:flex;height:840rpx;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:#1d2633; }.qr-code-wrap { position:relative;display:flex;width:500rpx;height:500rpx;align-items:center;justify-content:center;background:rgba(255,255,255,.04);border:4rpx solid #6c7480;border-radius:20rpx; }.qr-code-pattern { width:416rpx;height:416rpx;background-color:#fff;background-image:linear-gradient(90deg,#172132 14rpx,transparent 14rpx),linear-gradient(#172132 14rpx,transparent 14rpx);background-size:38rpx 38rpx;border:28rpx solid #fff;border-radius:12rpx;box-shadow:inset 60rpx 60rpx 0 #fff; }.qr-code-wrap .corner { position:absolute;width:78rpx;height:78rpx;border-color:#59a0ff; }.qr-code-wrap .top-left { top:-4rpx;left:-4rpx;border-top:8rpx solid;border-left:8rpx solid; }.qr-code-wrap .top-right { top:-4rpx;right:-4rpx;border-top:8rpx solid;border-right:8rpx solid; }.qr-code-wrap .bottom-left { bottom:-4rpx;left:-4rpx;border-bottom:8rpx solid;border-left:8rpx solid; }.qr-code-wrap .bottom-right { right:-4rpx;bottom:-4rpx;border-right:8rpx solid;border-bottom:8rpx solid; }.qr-stage > text { margin-top:52rpx;font-size:24rpx;line-height:40rpx;font-weight:600;text-align:center;white-space:pre-line; }.qr-toolbar { padding:32rpx; }.qr-toolbar .btn { min-width:0; }.qr-toolbar > text { display:block;margin-top:28rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:center; }
@keyframes pulse { 50% { transform: scale(1.05); box-shadow: 0 0 0 24rpx rgba(40,114,248,.08); } }
.qr-code-pattern { display:grid;grid-template-columns:repeat(9,1fr);gap:6rpx;padding:36rpx;background:#fff;background-image:none;border:0;box-shadow:none; }.qr-code-pattern i { background:#142033; }.qr-code-pattern i:nth-child(3n),.qr-code-pattern i:nth-child(5n) { background:transparent; }
.qr-stage { position:relative;display:grid;height:420px;place-items:center; }.qr-code-wrap { width:252px;height:252px;background:transparent;border:2px solid rgba(255,255,255,.32);border-radius:12px; }.qr-code-pattern { width:208px;height:208px;gap:3px;padding:18px;border-radius:8px; }.qr-code-wrap .corner { width:38px;height:38px; }.qr-code-wrap .top-left { top:-2px;left:-2px;border-width:4px 0 0 4px;border-radius:8px 0 0; }.qr-code-wrap .bottom-right { right:-2px;bottom:-2px;border-width:0 4px 4px 0;border-radius:0 0 8px; }.qr-code-wrap .top-right,.qr-code-wrap .bottom-left { display:none; }.qr-stage > text { position:absolute;right:24px;bottom:22px;left:24px;margin:0;font-size:12px;line-height:18px; }

/* Device onboarding stays procedural and avoids stacked promotional cards. */
.method-list { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.method-list button { min-height:124rpx;gap:18rpx;padding:20rpx 22rpx;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0; }
.method-list button:last-child { border-bottom:0; }
.method-icon,.method-icon.green,.method-icon.orange { width:60rpx;height:60rpx;background:transparent;border-radius:var(--radius-sm); }
.nearby-list { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.nearby-list button { min-height:126rpx;grid-template-columns:64rpx minmax(0,1fr) auto 28rpx;padding:18rpx 20rpx;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0; }
.nearby-list button:last-child { border-bottom:0; }.nearby-list button > span,.nearby-list button > span.success,.nearby-list button > span.warning { width:64rpx;height:64rpx;background:transparent;border-radius:var(--radius-sm); }
.connect-device,.connect-design-device-icon { width:88rpx;height:88rpx;background:transparent;border:2rpx solid var(--ss-brand-200);border-radius:50%; }
.connect-check-row > view:first-child,.connect-check-row > .done,.connect-check-row > .loading { width:52rpx;height:52rpx;background:transparent;border-radius:var(--radius-sm); }
.add-ready-capabilities > view { margin-top:0;background:#fff;border-bottom:2rpx solid var(--color-divider);border-radius:0; }.add-ready-capabilities { overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }.add-ready-capabilities > view:last-child { border-bottom:0; }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
