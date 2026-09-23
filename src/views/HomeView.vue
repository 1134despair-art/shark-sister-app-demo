<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SsIcon from '@/components/SsIcon.vue'
import SsDeviceIcon from '@/components/SsDeviceIcon.vue'
import SsEmpty from '@/components/SsEmpty.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsDeviceOverview from '@/components/SsDeviceOverview.vue'
import { useAppStore } from '@/stores/app'
import { showAuthRequired } from '@/services/routeGuard'
import type { Device } from '@/types/models'
import type { IconTone } from '@/config/iconAssets'

const store = useAppStore()
const { t } = useI18n()
const caseId = computed(() => store.designCaseId)
const showDevicePicker = ref(false)
const devices = computed(() => {
  const all = store.db?.devices ?? []
  if (store.shellState === 'empty') return []
  if (['H01', 'H02'].includes(caseId.value)) return all
  if (store.isGuest) return all.filter((item) => item.guestVisible)
  if (store.isDealer) return all.filter((item) => item.dealerId && store.context.dealerScopeIds.includes(item.dealerId))
  return all.filter((item) => item.ownerId === store.account?.id)
})
const total = computed(() => devices.value.length)
const connectedCount = computed(() => devices.value.filter((item) => item.connectionState === 'connected').length)
const disconnectedCount = computed(() => total.value - connectedCount.value)
const typeCount = computed(() => new Set(devices.value.map((item) => item.category)).size)
const recentDevices = computed(() => devices.value.slice(0, 2))
const deviceIds = computed(() => new Set(devices.value.map((item) => item.id)))
const waypointCount = computed(() => (store.db?.waypoints || []).filter((item) => item.ownerId === store.account?.id || Boolean(item.deviceId && deviceIds.value.has(item.deviceId))).length)
const serviceCount = computed(() => (store.db?.tickets || []).filter((item) => item.ownerId === store.account?.id || Boolean(item.deviceId && deviceIds.value.has(item.deviceId))).length)
const stats = computed<Array<{ label: string; value: number; note: string; icon: string; tone: IconTone; className: string }>>(() => caseId.value === 'H02' ? [
  { label: l('设备总数','Total devices'), value: 128, note: '', icon: 'cpu', tone: 'brand', className: '' },
  { label: l('已连接设备','Connected devices'), value: 95, note: '74.2%', icon: 'radio-tower', tone: 'success', className: 'green' },
  { label: l('未连接设备','Not connected'), value: 32, note: '25.0%', icon: 'unplug', tone: 'warning', className: 'orange' },
  { label: l('设备异常','Device alerts'), value: 1, note: l('立即处理','Handle now'), icon: 'triangle-alert', tone: 'warning', className: 'orange' },
] : caseId.value === 'H01' ? [
  { label: l('设备总数','Total devices'), value: 128, note: l('较昨日 +12','+12 since yesterday'), icon: 'cpu', tone: 'brand', className: '' },
  { label: l('已连接设备','Connected devices'), value: 96, note: l('较昨日 +8','+8 since yesterday'), icon: 'radio-tower', tone: 'success', className: 'green' },
  { label: l('未连接设备','Not connected'), value: 32, note: l('较昨日 -4','-4 since yesterday'), icon: 'unplug', tone: 'warning', className: 'orange' },
  { label: l('设备类型','Device types'), value: 6, note: l('查看分布','View distribution'), icon: 'boxes', tone: 'accent', className: 'purple' },
] : [
  { label: l('设备总数','Total devices'), value: total.value, note: l('当前账号','Current account'), icon: 'cpu', tone: 'brand', className: '' },
  { label: l('已连接设备','Connected devices'), value: connectedCount.value, note: total.value ? `${Math.round(connectedCount.value / total.value * 100)}%` : '0%', icon: 'radio-tower', tone: 'success', className: 'green' },
  { label: l('未连接设备','Not connected'), value: disconnectedCount.value, note: disconnectedCount.value ? l('可进入详情连接','Connect from details') : l('全部已连接','All connected'), icon: 'unplug', tone: 'warning', className: 'orange' },
  { label: l('设备类型','Device types'), value: typeCount.value, note: l('已绑定类型','Bound categories'), icon: 'boxes', tone: 'accent', className: 'purple' },
])
const abnormalDevice = computed(() => devices.value.find((item) => item.id === 'dev-03'))
const otherDevices = computed(() => devices.value.filter((item) => ['dev-01', 'dev-04'].includes(item.id)))

function deviceName(item: Device) { return store.locale !== 'zh-Hans' ? item.nameEn : item.name }
function category(item: Device) { return store.locale !== 'zh-Hans' ? item.categoryEn : item.category }
function deviceConnected(item: Device) { return item.connectionState === 'connected' }
function connectionLabel(item: Device) { return deviceConnected(item) ? l('已连接', 'Connected') : l('未连接', 'Not connected') }
function l(zh: string, en: string) { return store.locale !== 'zh-Hans' ? en : zh }
function openDevice(id: string) { uni.navigateTo({ url: `/pages/device/detail?id=${id}` }) }
function addDevice() {
  const target = '/pages/device/add'
  if (store.isGuest) return showAuthRequired(target, store.locale)
  uni.navigateTo({ url: target })
}
function openPrimaryDevice() {
  if (!devices.value.length) return addDevice()
  if (devices.value.length === 1) return openDevice(devices.value[0].id)
  showDevicePicker.value = true
}
function openDeviceArea() {
  if (store.isDealer) store.activeTab = 'device'
  else uni.navigateTo({ url: '/pages/shell/index?tab=device&state=browse' })
}
function openServiceRequest() {
  const first = recentDevices.value[0]
  const target = `/pages/manage/form?entity=tickets&category=repair${first ? `&deviceId=${first.id}` : ''}`
  if (store.isGuest) return showAuthRequired(target, store.locale)
  uni.navigateTo({ url: target })
}
function openHomeBanner(action: 'device' | 'route' | 'service') {
  if (action === 'service') return openServiceRequest()
  if (action === 'route') return openPrimaryDevice()
  openDeviceArea()
}
const homeBanners = computed(() => [
  { key: 'device', action: 'device' as const, skin: 'primary', icon: 'radio-tower', reading: `${connectedCount.value}/${total.value}`, unit: l('台已连接','connected'), title: l('设备连接\n运行尽在掌握', 'Device connections\noperations in view'), description: l('查看设备实时状态与连接情况', 'View live status and connection') },
  { key: 'route', action: 'route' as const, skin: 'route', icon: 'route', reading: `${waypointCount.value}`, unit: l('个航点','waypoints'), title: l('海图航迹\n清晰掌握', 'Charts and tracks\nat a glance'), description: l('查看设备位置、航点与已保存航迹', 'View device location, waypoints, and saved tracks') },
  { key: 'service', action: 'service' as const, skin: 'service', icon: 'wrench', reading: `${serviceCount.value}`, unit: l('条记录','records'), title: l('售后服务\n快速响应', 'Service support\nwhen needed'), description: l('提交设备报修并跟踪处理进度', 'Request service and track repair progress') },
])
</script>

<template>
  <scroll-view scroll-y class="home-scroll" :class="{ 'overview-scroll': !caseId && !store.shellState }">
    <SsDeviceOverview v-if="!caseId && !store.shellState" :devices="devices" @open="openDevice" @add="addDevice" @browse="openDeviceArea" @service="openServiceRequest" />
    <template v-else-if="store.shellState === 'abnormal'">
      <view class="notice danger alert-notice"><SsIcon name="triangle-alert" :size="20" tone="danger" /><view><strong>{{ l('1 台设备需要处理','1 device needs attention') }}</strong><text>{{ l('电池组-03 已超过 2 小时未连接，建议检查供电与通信。','Battery-03 has not been connected for over 2 hours. Check power and communication.') }}</text></view></view>
      <view class="stats-grid">
        <view v-for="item in stats" :key="item.label" class="stat-card">
          <view class="stat-icon" :class="item.className"><SsIcon :name="item.icon" :size="22" :tone="item.tone" /></view>
          <view><text>{{ item.label }}</text><strong>{{ item.value }}</strong><span>{{ item.note }}</span></view>
        </view>
      </view>
      <view class="section">
        <view class="section-head"><text class="section-title">{{ l('异常设备','Abnormal device') }}</text><text class="section-link">{{ l('实时更新','Live') }}</text></view>
        <view class="recent-list">
          <view v-if="abnormalDevice" class="device-row" @click="openDevice(abnormalDevice.id)">
            <view class="device-thumb"><SsDeviceIcon :category="abnormalDevice.category" :status="abnormalDevice.status" :size="23" /></view>
            <view class="list-copy"><strong>{{ deviceName(abnormalDevice) }}</strong><text>{{ category(abnormalDevice) }} · {{ l('最后连接 07:32','Last connected 07:32') }}</text></view>
            <view class="device-side"><text class="device-status warning">{{ l('设备异常','Alert') }}</text><text>{{ abnormalDevice.model }}</text></view>
            <SsIcon name="chevron-right" :size="18" tone="muted" />
          </view>
        </view>
      </view>
      <view class="section">
        <view class="section-head"><text class="section-title">{{ l('其他设备','Other devices') }}</text></view>
        <view class="recent-list">
          <view v-for="item in otherDevices" :key="item.id" class="device-row" @click="openDevice(item.id)">
            <view class="device-thumb"><SsDeviceIcon :category="item.category" :status="item.status" :size="23" /></view>
            <view class="list-copy"><strong>{{ deviceName(item) }}</strong><text>{{ category(item) }}</text></view>
            <view class="device-side"><text class="device-status" :class="deviceConnected(item) ? 'online' : 'offline'">{{ connectionLabel(item) }}</text><text>{{ item.model }}</text></view>
            <SsIcon name="chevron-right" :size="18" tone="muted" />
          </view>
        </view>
      </view>
    </template>
    <view v-else-if="store.shellState === 'empty'" class="home-empty">
      <view class="empty-icon"><SsIcon name="scan-line" :size="34" tone="brand" /></view>
      <strong>{{ l('还没有绑定设备','No devices bound') }}</strong>
      <text>{{ l('添加设备后，可查看实时状态、远程控制并保存航点。','Add a device to view live status, control it remotely, and save waypoints.') }}</text>
      <button class="btn primary small" @click="uni.navigateTo({ url: '/pages/device/add' })"><SsIcon name="plus" :size="18" tone="inverse" />{{ l('添加第一台设备','Add first device') }}</button>
      <button class="empty-link">{{ l('查看支持的设备','View supported devices') }}</button>
    </view>
    <template v-else-if="devices.length">
      <swiper class="hero-swiper" circular autoplay :interval="4500" :duration="420" indicator-dots indicator-color="rgba(84,111,151,.28)" indicator-active-color="#2568df">
        <swiper-item v-for="banner in homeBanners" :key="banner.key">
          <view class="hero" :class="`hero-${banner.skin}`" @click="openHomeBanner(banner.action)"><view class="hero-copy"><text>{{ banner.title }}</text><span>{{ banner.description }}</span></view><view class="hero-reading"><SsIcon :name="banner.icon" :size="18" tone="brand" /><strong>{{ banner.reading }}</strong><text>{{ banner.unit }}</text></view></view>
        </swiper-item>
      </swiper>
      <view class="home-device-actions">
        <button class="home-device-action primary-action" @click="addDevice"><span><SsIcon name="plus" :size="21" tone="inverse" /></span><view><strong>{{ l('添加设备','Add device') }}</strong><text>{{ l('蓝牙、扫码或输入 SN','Bluetooth, scan, or enter SN') }}</text></view><SsIcon name="chevron-right" :size="17" tone="inverse" /></button>
      </view>
      <view class="section device-section"><view class="section-head"><view><text class="section-title">{{ $t('home.recent') }}</text><text class="section-caption">{{ l(`${connectedCount} 台已连接，共 ${total} 台`,`${connectedCount} connected · ${total} total`) }}</text></view></view><view class="recent-list"><view v-for="item in recentDevices" :key="item.id" class="device-row" @click="openDevice(item.id)"><view class="device-thumb"><SsDeviceIcon :category="item.category" :status="item.status" :size="23" /></view><view class="list-copy"><strong>{{ deviceName(item) }}</strong><text>{{ category(item) }}</text></view><view class="device-side"><text class="device-status" :class="deviceConnected(item) ? 'online' : 'offline'">{{ connectionLabel(item) }}</text><text>{{ item.model }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></view></view></view>
    </template>
    <SsEmpty v-else :title="l('还没有设备','No devices yet')" :description="l('添加第一台设备后，运行状态和趋势会显示在这里。','Add your first device to see its status and trends.')" icon="panels-top-left" :action="$t('device.add')" @action="uni.navigateTo({ url: '/pages/device/add' })" />
  </scroll-view>
  <view v-if="showDevicePicker" class="device-picker-layer" @click.self="showDevicePicker = false">
    <view class="device-picker-sheet">
      <view class="device-picker-handle" />
      <view class="device-picker-head"><view><strong>{{ l('选择设备','Choose a device') }}</strong><text>{{ l(`当前账号共 ${devices.length} 台设备`,`This account has ${devices.length} devices`) }}</text></view><button aria-label="close" @click="showDevicePicker = false"><SsIcon name="x" :size="20" tone="muted" /></button></view>
      <scroll-view scroll-y class="device-picker-list"><view v-for="item in devices" :key="item.id" class="device-picker-row" @click="showDevicePicker = false; openDevice(item.id)"><view class="device-thumb"><SsDeviceIcon :category="item.category" :status="item.status" :size="23" /></view><view class="list-copy"><strong>{{ deviceName(item) }}</strong><text>{{ category(item) }} · {{ item.model }}</text></view><SsStatus :status="deviceConnected(item) ? 'online' : 'offline'" :label="connectionLabel(item)" /><SsIcon name="chevron-right" :size="17" tone="muted" /></view></scroll-view>
      <button v-if="!store.isDealer && !store.isGuest" class="btn primary device-picker-add" @click="showDevicePicker = false; addDevice()"><SsIcon name="plus" :size="18" tone="inverse" />{{ l('添加其他设备','Add another device') }}</button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.home-scroll { height:100%;padding:16rpx 28rpx 156rpx; }
.hero-swiper { width:100%;height:216rpx;overflow:hidden;border-radius:var(--radius-md); }
.hero { position:relative;width:100%;height:216rpx;overflow:hidden;background:#e5f0f6;border:2rpx solid #bed5e3;border-left:8rpx solid var(--color-action-primary);border-radius:var(--radius-md);box-sizing:border-box; }
.hero-primary { background:#e5f0f6; }
.hero::after { position:absolute;right:112rpx;top:0;width:2rpx;height:100%;content:'';background:rgba(18,95,145,.12); }
.hero-route { background:#eaf2f4;border-color:#c9dce3;border-left-color:#337b91; }
.hero-service { background:#edf2f4;border-color:#d2dfe4;border-left-color:#4f6f7f; }
.hero-copy { position:absolute;top:34rpx;left:28rpx;z-index:2;max-width:440rpx; }
.hero-copy text, .hero-copy span { display: block; }
.hero-copy text { color:#17384d;font-size:34rpx;line-height:40rpx;font-weight:650;white-space:pre-line; }
.hero-copy span { margin-top:8rpx;color:#466272;font-size:22rpx; }
.hero-visual { position:absolute;right:22rpx;top:50%;z-index:1;display:flex;width:86rpx;height:86rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:transparent;opacity:.9;transform:translateY(-50%); }
.home-device-actions { display:grid;grid-template-columns:minmax(0,1fr);gap:12rpx;margin-top:16rpx; }
.home-device-action { display:grid;min-width:0;min-height:104rpx;grid-template-columns:48rpx minmax(0,1fr) 24rpx;align-items:center;gap:12rpx;padding:16rpx 20rpx;color:var(--color-text-primary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md);text-align:left;box-shadow:none; }
.home-device-action > span { display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:var(--radius-sm); }
.home-device-action view { min-width:0; }.home-device-action strong,.home-device-action text { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.home-device-action strong { font-size:23rpx; }.home-device-action text { margin-top:4rpx;color:var(--color-text-secondary);font-size:18rpx; }
.home-device-action.primary-action { color:#fff;background:var(--color-action-primary);border-color:var(--color-action-primary); }.home-device-action.primary-action > span { background:rgba(255,255,255,.18); }.home-device-action.primary-action text { color:rgba(255,255,255,.78); }
.alert-notice { align-items: center; margin-top: 24rpx; }
.alert-notice view { min-width: 0; flex: 1; }
.alert-notice strong, .alert-notice text { display: block; }
.alert-notice text { margin-top: 4rpx; font-size: 22rpx; }
.stats-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;margin-top:16rpx;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.stat-card { display:flex;min-height:138rpx;align-items:center;gap:14rpx;padding:18rpx;background:#fff;border:0;border-right:2rpx solid var(--color-divider);border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none; }
.stat-card:nth-child(2n) { border-right:0; }.stat-card:nth-last-child(-n+2) { border-bottom:0; }
.stat-icon { display:flex;width:52rpx;height:52rpx;flex:0 0 52rpx;align-items:center;justify-content:center;background:transparent;border-radius:var(--radius-sm); }
.stat-icon.green { background: var(--ss-green-50); }.stat-icon.orange { background: var(--ss-orange-50); }.stat-icon.purple { background: var(--ss-purple-50); }
.stat-card view:last-child { min-width: 0; }.stat-card text, .stat-card strong, .stat-card span { display: block; }
.stat-card text { color:var(--color-text-secondary);font-size:20rpx; }.stat-card strong { margin-top:2rpx;font-size:32rpx;line-height:40rpx;font-weight:650;font-variant-numeric:tabular-nums; }.stat-card span { overflow:hidden;color:var(--ss-green-700);font-size:18rpx;text-overflow:ellipsis;white-space:nowrap; }
.recent-list { display:flex;flex-direction:column;gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.device-row { display:grid;width:100%;min-height:124rpx;grid-template-columns:72rpx minmax(0,1fr) auto 28rpx;align-items:center;gap:16rpx;padding:18rpx 20rpx;background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none;box-sizing:border-box; }
.device-row:last-child { border-bottom:0; }
.device-thumb { display:flex;width:72rpx;height:72rpx;align-items:center;justify-content:center;border-radius:var(--radius-sm); }
.device-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }.device-side > text { color: var(--color-text-secondary); font-size: 22rpx; }
.device-side .device-status { position:relative;padding-left:20rpx;color:var(--color-text-secondary);font-weight:600; }.device-side .device-status::before { position:absolute;top:50%;left:0;width:12rpx;height:12rpx;content:'';background:var(--ss-neutral-400);border-radius:50%;transform:translateY(-50%); }.device-side .device-status.online { color:var(--ss-green-700); }.device-side .device-status.online::before { background:var(--ss-green-500); }.device-side .device-status.warning { color:var(--ss-orange-700); }.device-side .device-status.warning::before { background:var(--ss-orange-500); }
.chart-card { margin-bottom: 32rpx; }
.chart-summary { display: grid; grid-template-columns: 120rpx 1fr; align-items: end; min-height: 180rpx; }.chart-summary > view:first-child strong, .chart-summary > view:first-child text { display: block; }.chart-summary strong { font-size: 44rpx; font-weight: 600; }.chart-summary text { color: var(--color-text-secondary); font-size: 22rpx; }
.chart-bars { display: flex; height: 150rpx; align-items: flex-end; justify-content: space-between; gap: 8rpx; padding-bottom: 8rpx; border-bottom: 2rpx solid var(--color-divider); }.chart-bars text { width: 20rpx; min-height: 16rpx; background: linear-gradient(180deg, #2872f8, #b8d5ff); border-radius: 6rpx 6rpx 2rpx 2rpx; }
.chart-legend { display: flex; justify-content: space-between; margin-top: 24rpx; color: var(--color-text-secondary); font-size: 21rpx; }.chart-legend span { display: flex; align-items: center; gap: 8rpx; }.chart-legend i { width: 14rpx; height: 14rpx; background: var(--ss-neutral-400); border-radius: 4rpx; }.chart-legend .blue { background: var(--ss-brand-500); }.chart-legend .orange { background: var(--ss-orange-500); }
.shortcut-grid { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:14rpx 0;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }.shortcut-grid button { display:flex;min-width:0;min-height:100rpx;flex-direction:column;align-items:center;justify-content:center;gap:8rpx;color:var(--color-action-primary);background:transparent;border:0;border-right:2rpx solid var(--color-divider);font-size:20rpx; }.shortcut-grid button:last-child { border-right:0; }.shortcut-grid text { width:100%;overflow:hidden;color:var(--color-text-body);text-overflow:ellipsis;white-space:nowrap; }
.home-empty { display:flex;min-height:920rpx;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:160rpx;text-align:center; }.empty-icon { display:flex;width:144rpx;height:144rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:50%; }.home-empty strong { margin-top:34rpx;font-size:32rpx; }.home-empty > text { max-width:500rpx;margin-top:12rpx;color:var(--color-text-secondary);font-size:23rpx;line-height:36rpx; }.home-empty .btn { margin-top:30rpx; }.empty-link { margin-top:28rpx;color:var(--color-action-primary);background:transparent;border:0;font-size:24rpx;font-weight:600; }
.dealer-banner { display:flex;min-height:136rpx;align-items:center;gap:18rpx;padding:24rpx;background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:16rpx; }.dealer-banner-icon { display:flex;width:88rpx;height:88rpx;flex:0 0 88rpx;align-items:center;justify-content:center;background:var(--color-action-primary);border-radius:14rpx; }.dealer-banner > view:nth-child(2) { min-width:0;flex:1; }.dealer-banner strong,.dealer-banner text { display:block; }.dealer-banner strong { font-size:27rpx; }.dealer-banner text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.dealer-home-stats { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18rpx;margin-top:28rpx; }.dealer-home-stats > view { display:flex;min-height:182rpx;align-items:center;gap:18rpx;padding:22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.dealer-home-stats i,.dealer-shortcuts i,.dealer-tasks .row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.dealer-home-stats i.green,.dealer-shortcuts i.green { background:var(--ss-green-50); }.dealer-home-stats i.orange,.dealer-shortcuts i.orange,.dealer-tasks .row-icon.warning { background:var(--ss-orange-50); }.dealer-home-stats i.purple,.dealer-shortcuts i.purple { background:var(--ss-purple-50); }.dealer-home-stats text,.dealer-home-stats strong,.dealer-home-stats span { display:block; }.dealer-home-stats text { color:var(--color-text-secondary);font-size:21rpx; }.dealer-home-stats strong { margin-top:2rpx;font-size:38rpx; }.dealer-home-stats span { color:var(--ss-green-700);font-size:19rpx; }.dealer-shortcuts { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10rpx; }.dealer-shortcuts button { display:flex;min-width:0;flex-direction:column;align-items:center;gap:12rpx;background:transparent;border:0;font-size:20rpx; }.dealer-shortcuts text { width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.dealer-tasks .row-icon.danger { background:var(--ss-red-50); }.dealer-tasks .list-row { min-height:112rpx; }.dealer-banner ~ .section .device-row { min-height:112rpx;grid-template-columns:72rpx minmax(0,1fr) 28rpx;padding:16rpx 22rpx; }.dealer-banner ~ .section .device-thumb { width:72rpx;height:72rpx; }
.device-picker-layer { position:fixed;z-index:80;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.42); }
.device-picker-sheet { width:100%;max-width:780rpx;padding:12rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));background:var(--color-bg-surface);border-radius:16rpx 16rpx 0 0;box-sizing:border-box; }
.device-picker-handle { width:72rpx;height:8rpx;margin:0 auto 18rpx;background:var(--ss-neutral-300);border-radius:999rpx; }
.device-picker-head { display:flex;min-height:82rpx;align-items:center;justify-content:space-between;gap:20rpx;border-bottom:2rpx solid var(--color-divider); }.device-picker-head strong,.device-picker-head text { display:block; }.device-picker-head strong { font-size:29rpx; }.device-picker-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.device-picker-head button { display:flex;width:64rpx;height:64rpx;align-items:center;justify-content:center;margin:0;padding:0;background:transparent;border:0; }.device-picker-head button::after { display:none; }
.device-picker-list { max-height:620rpx; }.device-picker-row { display:grid;min-height:116rpx;grid-template-columns:72rpx minmax(0,1fr) auto 28rpx;align-items:center;gap:14rpx;border-bottom:2rpx solid var(--color-divider); }.device-picker-row .device-thumb { width:72rpx;height:72rpx; }.device-picker-add { width:100%;margin-top:22rpx; }

/* Operational home: scan first, with one restrained maritime signature. */
.home-scroll { padding:20rpx 28rpx 148rpx; }
.hero-swiper,.hero { height:184rpx;border-radius:var(--radius-md); }
.hero { background:#fff;border:2rpx solid var(--color-border-subtle);border-left:8rpx solid var(--color-action-primary);box-shadow:none; }
.hero-primary { background:#fff; }
.hero-route { background:#fff;border-color:var(--color-border-subtle);border-left-color:#237660; }
.hero-service { background:#fff;border-color:var(--color-border-subtle);border-left-color:#a86616; }
.hero::after { display:none; }
.hero-copy { top:28rpx;left:28rpx;max-width:470rpx; }
.hero-copy text { color:var(--ss-brand-900);font-size:31rpx;line-height:38rpx;font-weight:650; }
.hero-copy span { max-width:440rpx;margin-top:8rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:28rpx; }
.hero-visual { right:26rpx;top:50%;bottom:auto;width:72rpx;height:72rpx;background:transparent;border:0;border-radius:0;box-shadow:none;opacity:.88;transform:translateY(-50%); }
.home-device-actions { gap:12rpx;margin-top:18rpx; }
.home-device-action { min-height:104rpx;grid-template-columns:52rpx minmax(0,1fr) 28rpx;padding:15rpx 20rpx;border-radius:var(--radius-md);box-shadow:none; }
.home-device-action > span { width:52rpx;height:52rpx;border-radius:var(--radius-sm); }
.stats-grid { gap:0;margin-top:16rpx;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.stat-card { min-height:138rpx;gap:14rpx;padding:18rpx;border:0;border-right:2rpx solid var(--color-divider);border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none; }
.stat-card:nth-child(2n) { border-right:0; }.stat-card:nth-last-child(-n+2) { border-bottom:0; }
.stat-icon { width:52rpx;height:52rpx;flex-basis:52rpx;background:transparent;border-radius:var(--radius-sm); }
.stat-icon.green,.stat-icon.orange,.stat-icon.purple { background:transparent; }
.stat-card text { font-size:20rpx; }.stat-card strong { font-size:32rpx;line-height:40rpx;font-weight:650; }.stat-card span { font-size:18rpx; }
.recent-list { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md);box-shadow:none; }
.device-row { min-height:120rpx;grid-template-columns:72rpx minmax(0,1fr) auto 28rpx;gap:16rpx;padding:18rpx 20rpx;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none; }
.device-row:last-child { border-bottom:0; }.device-thumb { width:72rpx;height:72rpx;border-radius:var(--radius-sm); }
.shortcut-grid { gap:0;padding:14rpx 0;border-radius:var(--radius-md); }
.shortcut-grid button { min-height:100rpx;gap:8rpx;border-right:2rpx solid var(--color-divider); }.shortcut-grid button:last-child { border-right:0; }
.dealer-banner { min-height:124rpx;padding:22rpx;background:#fff;border-color:var(--color-border-subtle);border-left:8rpx solid var(--color-action-primary);border-radius:var(--radius-md);box-shadow:none; }
.dealer-banner-icon { width:64rpx;height:64rpx;flex-basis:64rpx;color:var(--color-action-primary);background:#fff;border-radius:var(--radius-sm); }
.dealer-home-stats { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md);box-shadow:none; }
.dealer-home-stats > view { min-height:138rpx;padding:18rpx;border:0;border-right:2rpx solid var(--color-divider);border-bottom:2rpx solid var(--color-divider);border-radius:0; }
.dealer-home-stats > view:nth-child(2n) { border-right:0; }.dealer-home-stats > view:nth-last-child(-n+2) { border-bottom:0; }
.dealer-home-stats i,.dealer-shortcuts i,.dealer-tasks .row-icon { width:56rpx;height:56rpx;flex-basis:56rpx;background:var(--color-action-primary-subtle);border-radius:var(--radius-sm); }
.dealer-home-stats i.green,.dealer-shortcuts i.green { background:var(--ss-green-50); }.dealer-home-stats i.orange,.dealer-shortcuts i.orange,.dealer-tasks .row-icon.warning { background:var(--ss-orange-50); }.dealer-home-stats i.purple,.dealer-shortcuts i.purple { background:var(--color-action-primary-subtle); }
.device-picker-sheet { border-radius:20rpx 20rpx 0 0; }

/* Maritime operations home: calm hierarchy and field-readable targets. */
.home-scroll { padding: 24rpx 28rpx 164rpx; }
.hero-swiper, .hero { height: 208rpx; }
.hero { border-left-width: 6rpx; border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
.hero-copy { top: 34rpx; left: 30rpx; max-width: 460rpx; }
.hero-copy text { font-size: 34rpx; line-height: 42rpx; font-weight: 650; }
.hero-copy span { margin-top: 12rpx; font-size: 22rpx; line-height: 32rpx; }
.hero-visual { right: 30rpx; width: 82rpx; height: 82rpx; opacity: .92; }
.home-device-actions { margin-top: 20rpx; }
.home-device-action { min-height: 112rpx; padding: 18rpx 22rpx; box-shadow: var(--shadow-card); }
.home-device-action strong { font-size: 25rpx; line-height: 34rpx; }
.home-device-action text { font-size: 21rpx; line-height: 28rpx; }
.recent-list { box-shadow: var(--shadow-card); }
.device-row { min-height: 138rpx; padding: 20rpx 22rpx; }
.device-thumb { width: 76rpx; height: 76rpx; }
.device-row .list-copy strong { font-size: 29rpx; }
.device-row .list-copy text { font-size: 22rpx; }

/* Production pass: one continuous operational canvas instead of stacked promo cards. */
.home-scroll { padding: 0 0 164rpx; background: #f5f7f9; }
.hero-swiper { height: 194rpx; border-radius: 0; background: #fff; border-bottom: 2rpx solid var(--color-divider); }
.hero { height: 194rpx; padding: 0 32rpx; background: #fff; border: 0; border-radius: 0; box-shadow: none; }
.hero-primary,.hero-route,.hero-service { background: #fff; border: 0; }
.hero-copy { top: 30rpx; left: 32rpx; max-width: 470rpx; }
.hero-copy::before { display: block; width: 42rpx; height: 5rpx; margin-bottom: 16rpx; content: ''; background: var(--color-action-primary); }
.hero-route .hero-copy::before { background: var(--color-status-success); }
.hero-service .hero-copy::before { background: var(--color-status-warning); }
.hero-copy text { color: #142b3d; font-size: 31rpx; line-height: 38rpx; font-weight: 650; }
.hero-copy span { max-width: 455rpx; margin-top: 7rpx; font-size: 19rpx; line-height: 27rpx; }
.hero-visual { right: 36rpx; width: 72rpx; height: 72rpx; opacity: .76; }
.hero-reading { position: absolute; top: 41rpx; right: 34rpx; display: flex; min-width: 126rpx; flex-direction: column; align-items: flex-end; color: #17384d; }
.hero-reading strong,.hero-reading text { display: block; }
.hero-reading strong { margin-top: 8rpx; font-family: var(--ss-font-data); font-size: 36rpx; line-height: 42rpx; font-weight: 650; }
.hero-reading text { margin-top: 1rpx; color: var(--color-text-secondary); font-size: 18rpx; }
.home-device-actions { margin: 0; padding: 20rpx 28rpx 6rpx; background: #fff; }
.home-device-action { min-height: 94rpx; border: 0; border-radius: 8rpx; box-shadow: none; }
.home-device-action.primary-action { background: #1765cf; }
.home-device-action.primary-action > span { background: rgba(255,255,255,.12); border: 2rpx solid rgba(255,255,255,.24); }
.device-section { margin: 0; padding: 28rpx 28rpx 0; }
.device-section .section-head { min-height: 74rpx; align-items: flex-end; }
.section-caption { display: block; margin-top: 4rpx; color: var(--color-text-secondary); font-size: 21rpx; font-weight: 400; }
.recent-list { overflow: visible; background: transparent; border: 0; border-radius: 0; box-shadow: none; }
.device-row { min-height: 124rpx; margin-top: 12rpx; padding: 18rpx 12rpx; background: #fff; border: 0; border-radius: 6rpx; box-shadow: 0 2rpx 0 rgba(17,46,69,.05); }
.device-thumb { width: 64rpx; height: 64rpx; background: #edf4fb; border-radius: 6rpx; }
.device-row .list-copy strong { font-size: 27rpx; line-height: 36rpx; }
.device-row .list-copy text { margin-top: 2rpx; font-size: 22rpx; }
.device-side { gap: 5rpx; }
.device-side > text { font-size: 21rpx; }
.home-scroll.overview-scroll { padding: 0; background: var(--color-bg-canvas); }
</style>

<style scoped lang="scss">
@import '@/styles/overlay-surfaces.scss';
</style>
