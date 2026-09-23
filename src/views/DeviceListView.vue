<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsEmpty from '@/components/SsEmpty.vue'
import SsDeviceIcon from '@/components/SsDeviceIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Device } from '@/types/models'

const store = useAppStore()
const search = ref('')
const active = ref('all')
const showFilter = ref(false)
const category = ref('all')
const designCategory = ref('fan')
const designStatus = ref('all')
const isSearchMode = computed(() => store.shellState === 'filter')
const isDealerManagementMode = computed(() => store.isDealer && store.shellState === 'manage')
const tabs = computed(() => store.isDealerAdmin ? [
  ['all', store.locale !== 'zh-Hans' ? 'All' : '全部'], ['unassigned', store.locale !== 'zh-Hans' ? 'Unassigned' : '未分配'], ['subordinate', store.locale !== 'zh-Hans' ? 'Sub-dealers' : '下级'], ['warning', store.locale !== 'zh-Hans' ? 'Alerts' : '异常'],
] : store.isDealer ? [
  ['all', store.locale !== 'zh-Hans' ? 'All' : '全部'], ['warning', store.locale !== 'zh-Hans' ? 'Alerts' : '异常'],
] : [])
const baseDevices = computed(() => {
  const all = store.db?.devices ?? []
  if (/^D0[1-4]$/.test(store.designCaseId)) return all
  if (store.isGuest) return all.filter((item) => item.guestVisible)
  if (store.account?.role === 'dealerStaff') return all.filter((item) => item.assignedTo === store.context.employeeId)
  return store.isDealer ? all.filter((item) => item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) : all.filter((item) => item.ownerId === store.account?.id)
})
const devices = computed(() => baseDevices.value.filter((item) => {
  if (active.value === 'unassigned' && (item.projectId || item.assignedTo)) return false
  if (active.value === 'subordinate' && item.dealerId === store.account?.dealerId) return false
  if (active.value === 'warning' && item.status !== 'warning') return false
  if (category.value !== 'all' && item.category !== category.value) return false
  const q = search.value.trim().toLowerCase()
  return !q || `${item.name}${item.nameEn}${item.model}${item.serialNumber}`.toLowerCase().includes(q)
}))
const categories = computed(() => Array.from(new Set(baseDevices.value.map((item) => item.category))))
const deviceName = (item: Device) => store.locale !== 'zh-Hans' ? item.nameEn : item.name
const deviceCategory = (item: Device) => store.locale !== 'zh-Hans' ? item.categoryEn : item.category
const deviceConnected = (item: Device) => item.connectionState === 'connected'
const categoryLabel = (categoryName: string) => store.locale !== 'zh-Hans' ? baseDevices.value.find((item) => item.category === categoryName)?.categoryEn || categoryName : categoryName
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
watchEffect(() => {
  if (store.shellStatus && tabs.value.some((item) => item[0] === store.shellStatus)) active.value = store.shellStatus
  if (store.shellState === 'filter') showFilter.value = true
})
const designSearchRows = computed(() => {
  const rows = [baseDevices.value.find((item) => item.id === 'dev-01'), baseDevices.value.find((item) => item.id === 'dev-07')].filter(Boolean) as Device[]
  return rows.filter((item) => {
    if (designCategory.value !== 'all' && !item.category.includes('顶流机') && !item.categoryEn.toLowerCase().includes('surface')) return false
    if (designStatus.value === 'online') return item.id === 'dev-01'
    if (designStatus.value === 'offline') return item.id === 'dev-07'
    return true
  })
})
function setDesignCategory(value: string) { designCategory.value = value }
function setDesignStatus(value: string) { designStatus.value = value }
function openDevice(item: Device) {
  const suffix = isDealerManagementMode.value ? '&mode=manage' : ''
  uni.navigateTo({ url: `/pages/device/detail?id=${encodeURIComponent(item.id)}${suffix}` })
}
</script>

<template>
  <view v-if="isSearchMode" class="device-search-view">
    <view class="design-search-box"><SsIcon name="search" :size="19" tone="muted" /><input v-model="search" placeholder="DL-3" /><button aria-label="clear" @click="search = ''"><SsIcon name="x" :size="18" tone="muted" /></button></view>
    <view class="design-result-head"><strong>{{ l('搜索结果','Search results') }}</strong><text>2 {{ l('台设备','devices') }}</text></view>
    <view class="design-results">
      <view v-for="item in designSearchRows" :key="item.id" class="design-result-card" @click="openDevice(item)">
        <view class="device-thumb"><SsDeviceIcon :category="item.category" :status="item.id === 'dev-07' ? 'offline' : 'online'" :size="25" /></view>
        <view class="list-copy"><strong>{{ item.id === 'dev-07' ? l('顶流机-07','Surface Jet-07') : l('顶流机-01','Surface Jet-01') }}</strong><text>{{ l('顶流机 / 制冰机','Surface jet / ice maker') }}</text></view>
        <view class="device-meta"><SsStatus :status="item.id === 'dev-07' ? 'offline' : 'online'" :label="item.id === 'dev-07' ? l('离线','Offline') : l('在线','Online')" /><text>{{ item.model }}</text></view>
        <SsIcon name="chevron-right" :size="17" tone="muted" />
      </view>
    </view>
    <text class="design-filter-title">{{ l('筛选条件','Filters') }}</text>
    <view class="design-filter-card">
      <view class="design-filter-label"><strong>{{ l('设备类型','Device type') }}</strong><text>{{ l('可多选','Multiple') }}</text></view>
      <view class="design-chip-row category-chips"><button v-for="item in [['fan',l('顶流机','Surface jet')],['ice',l('制冰机','Ice maker')],['water',l('海水淡化器','Desalinator')],['battery',l('电池组','Battery')],['network',l('网络检测仪','Network monitor')]]" :key="item[0]" :class="{active:designCategory===item[0]}" @click="setDesignCategory(item[0])">{{ item[1] }}</button></view>
      <view class="design-filter-label status-label"><strong>{{ l('状态','Status') }}</strong></view>
      <view class="design-chip-row"><button v-for="item in [['all',l('全部','All')],['online',l('在线','Online')],['offline',l('离线','Offline')],['warning',l('异常','Alert')]]" :key="item[0]" :class="{active:designStatus===item[0]}" @click="setDesignStatus(item[0])">{{ item[1] }}</button></view>
    </view>
    <button class="design-apply-filter" @click="uni.showToast({ title:l('筛选已应用','Filters applied'), icon:'none' })"><SsIcon name="list-filter" :size="18" tone="inverse" />{{ l('应用筛选','Apply filters') }}</button>
  </view>
  <view v-else class="device-view">
    <view v-if="isDealerManagementMode" class="dealer-device-note">
      <SsIcon name="search" :size="19" tone="default" />
      <view><strong>{{ l('名下设备查询','Dealer device lookup') }}</strong><text>{{ l('按类型、型号或 SN 查询，可反查项目、客户、质保与售后信息','Search by type, model or SN and view linked project, customer, warranty and service records') }}</text></view>
      <span>{{ l('只读','Read only') }}</span>
    </view>
    <view class="device-toolbar">
      <view class="search-box"><SsIcon name="search" :size="20" tone="muted" /><input v-model="search" :placeholder="l('搜索名称 / 型号 / SN','Search name / model / SN')" /><SsIcon v-if="search" name="x" :size="18" @click="search = ''" tone="muted" /><button class="category-filter" :class="{active:showFilter || category !== 'all'}" :aria-label="l('设备分类','Device category')" @click="showFilter=!showFilter"><SsIcon name="list-filter" :size="19" tone="brand" /></button></view>
    </view>
    <scroll-view v-if="store.isDealer" scroll-x class="tab-scroll"><view class="segment tabs"><view v-for="tab in tabs" :key="tab[0]" class="segment-item" :class="{ active: active === tab[0] }" @click="active = tab[0]">{{ tab[1] }}</view></view></scroll-view>
    <view v-if="store.designCaseId === 'D03'" class="notice offline-notice"><SsIcon name="unplug" :size="19" tone="warning-strong" /><view><strong>{{ l('3 台设备当前离线','3 devices are offline') }}</strong><text>{{ l('离线设备仍可查看缓存信息与发起报修。','Cached data and service requests remain available offline.') }}</text></view></view>
    <view v-if="showFilter" class="filter-panel card">
      <view class="filter-head"><text>{{ $t('device.type') }}</text><text @click="category = 'all'">{{ $t('common.reset') }}</text></view>
      <view class="filter-chips"><text :class="{ active: category === 'all' }" @click="category = 'all'">{{ l('全部类型','All types') }}</text><text v-for="item in categories" :key="item" :class="{ active: category === item }" @click="category = item">{{ categoryLabel(item) }}</text></view>
    </view>

    <scroll-view scroll-y class="device-list-scroll">
      <view v-if="devices.length" class="device-list">
        <view v-for="item in devices" :key="item.id" class="device-item" @click="openDevice(item)">
          <view class="device-thumb"><SsDeviceIcon :category="item.category" :status="item.status" :size="25" /></view>
          <view class="list-copy"><strong>{{ deviceName(item) }}</strong><text>{{ deviceCategory(item) }} · {{ item.model }}</text><span v-if="store.isDealer" class="device-serial">SN {{ item.serialNumber }}</span></view>
          <view class="device-meta"><SsStatus :status="deviceConnected(item) ? 'online' : 'offline'" :label="deviceConnected(item) ? l('已连接','Connected') : l('未连接','Not connected')" /><text v-if="store.isDealer">{{ item.assignedTo ? l('已分配','Assigned') : l('未分配','Unassigned') }}</text><text v-else>{{ item.model }}</text><span v-if="!deviceConnected(item)">{{ l('最后连接','Last connected') }} {{ item.lastOnline.slice(5, 16).replace('T', ' ') }}</span></view>
          <SsIcon name="chevron-right" :size="18" tone="muted" />
        </view>
        <view v-if="store.designCaseId === 'D03'" class="device-item design-extra-device"><view class="device-thumb"><SsIcon name="fan" :size="25" tone="brand" /></view><view class="list-copy"><strong>{{ l('顶流机-07','Surface jet-07') }}</strong><text>{{ l('顶流机','Surface jet') }}</text></view><view class="device-meta"><SsStatus status="offline" :label="l('未连接','Not connected')" /><text>DL-3500</text><span>{{ l('最后连接 8月8日','Last connected Aug 8') }}</span></view><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
      </view>
      <SsEmpty v-else :title="l('没有匹配的设备','No matching devices')" :description="l('调整设备分类或搜索关键词后重试。','Change the device category or search terms and try again.')" icon="folder-search" :action="l('清除筛选','Clear filters')" @action="search = ''; active = 'all'; category = 'all'" />
      <view class="safe-bottom" />
    </scroll-view>
  </view>
</template>

<style scoped>
.device-view { display: flex; height: 100%; flex-direction: column; padding: 8rpx 32rpx 0; overflow: hidden; }
.dealer-device-note { display:grid;grid-template-columns:40rpx minmax(0,1fr) auto;align-items:start;gap:12rpx;margin-bottom:18rpx;padding:16rpx 18rpx;background:var(--color-action-primary-subtle);border-left:6rpx solid var(--color-action-primary);border-radius:6rpx; }
.dealer-device-note view { min-width:0; }.dealer-device-note strong,.dealer-device-note text { display:block; }.dealer-device-note strong { font-size:22rpx; }.dealer-device-note text { margin-top:3rpx;color:var(--color-text-secondary);font-size:17rpx;line-height:25rpx; }.dealer-device-note>span { color:var(--color-action-primary);font-size:18rpx;white-space:nowrap; }
.device-toolbar { width:100%;margin-bottom:20rpx; }
.search-box { display: flex; height: 88rpx; align-items: center; gap: 16rpx; padding: 0 24rpx; background: #fff; border: 2rpx solid var(--color-border-subtle); border-radius: 16rpx; }
.search-box input { min-width: 0; height: 80rpx; flex: 1; font-size: 26rpx; }
.category-filter{display:flex;width:44px;height:44px;flex:0 0 44px;align-items:center;justify-content:center;background:transparent;border:0}.category-filter.active{background:var(--ss-brand-50);border-radius:8px}
.tab-scroll { flex:0 0 auto;margin:-2rpx 0 18rpx;white-space:nowrap; }.tabs { display:inline-flex;min-width:100%; }.tabs .segment-item { min-width:0;padding:0 16rpx; }.filter-segment { gap:8rpx; }
.filter-panel { margin-bottom: 16rpx; padding: 24rpx; }.filter-head { display: flex; justify-content: space-between; font-size: 24rpx; font-weight: 600; }.filter-head text:last-child { color: var(--color-action-primary); }
.filter-chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; }.filter-chips text { padding: 12rpx 18rpx; color: var(--color-text-secondary); background: var(--color-bg-subtle); border-radius: 12rpx; font-size: 22rpx; }.filter-chips text.active { color: var(--color-action-primary); background: var(--color-action-primary-subtle); outline: 2rpx solid var(--ss-brand-200); }
.device-list-scroll { min-height: 0; flex: 1; padding-bottom: calc(160rpx + env(safe-area-inset-bottom)); }
.device-list { display:flex;flex-direction:column;gap:20rpx; }
.offline-notice { margin-bottom:20rpx; }.offline-notice strong,.offline-notice text { display:block; }.offline-notice text { margin-top:4rpx; }.design-extra-device { flex:0 0 auto; }
.device-item { display:grid;min-height:152rpx;grid-template-columns:88rpx minmax(0,1fr) auto 32rpx;align-items:center;gap:20rpx;padding:24rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx;box-shadow:var(--shadow-card); }
.device-thumb { display:flex;width:88rpx;height:88rpx;flex:0 0 88rpx;align-items:center;justify-content:center;border-radius:16rpx; }
.list-copy span { display: block; margin-top: 4rpx; color: var(--color-action-primary); font-size: 20rpx; }
.list-copy .device-serial { color:var(--color-text-secondary);font-family:var(--ss-font-data);font-size:18rpx;letter-spacing:0; }
.device-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 7rpx; }.device-meta > text, .device-meta > span { color: var(--color-text-secondary); font-size: 21rpx; }.device-meta > span { color: var(--ss-orange-700); }
.device-search-view { position:relative;height:100%;padding:16rpx 32rpx 150rpx;overflow-y:auto;box-sizing:border-box; }
.design-search-box { display:flex;height:84rpx;align-items:center;gap:16rpx;padding:0 22rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }
.design-search-box input { min-width:0;height:76rpx;flex:1;font-size:25rpx; }.design-search-box button { display:flex;width:56rpx;height:56rpx;align-items:center;justify-content:center;background:var(--color-bg-subtle);border:0;border-radius:50%; }
.design-result-head { display:flex;align-items:center;justify-content:space-between;margin-top:52rpx;font-size:23rpx; }.design-result-head text { color:var(--color-text-secondary); }
.design-results { display:flex;flex-direction:column;gap:18rpx;margin-top:30rpx; }.design-result-card { display:grid;min-height:144rpx;grid-template-columns:88rpx minmax(0,1fr) auto 28rpx;align-items:center;gap:18rpx;padding:22rpx 24rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx;box-sizing:border-box; }
.design-filter-title { display:block;margin-top:54rpx;font-size:26rpx;font-weight:600; }.design-filter-card { margin-top:40rpx;padding:30rpx 32rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx; }
.design-filter-label { display:flex;align-items:center;justify-content:space-between;font-size:22rpx; }.design-filter-label text { color:var(--color-text-secondary);font-size:19rpx; }.design-filter-label.status-label { margin-top:28rpx; }
.design-chip-row { display:flex;flex-wrap:wrap;gap:10rpx;margin-top:14rpx; }.design-chip-row button { min-height:50rpx;padding:0 18rpx;color:var(--color-text-secondary);background:var(--color-bg-subtle);border:0;border-radius:999rpx;font-size:20rpx; }.design-chip-row button.active { color:var(--color-action-primary);background:var(--color-action-primary-subtle);box-shadow:inset 0 0 0 2rpx var(--ss-brand-300); }
.category-chips { max-width:560rpx; }
.design-apply-filter { display:flex;width:100%;height:84rpx;align-items:center;justify-content:center;gap:12rpx;margin-top:40rpx;color:#fff;background:var(--color-action-primary);border:0;border-radius:14rpx;font-size:25rpx;font-weight:600;box-sizing:border-box; }

/* Device inventory is a continuous ledger, optimized for vertical scanning. */
.device-view { padding:8rpx 28rpx 0; }
.device-toolbar { margin-bottom:16rpx; }
.search-box { height:84rpx;gap:14rpx;padding:0 22rpx;border-radius:var(--radius-sm);box-shadow:none; }
.device-list { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.device-item { min-height:132rpx;grid-template-columns:72rpx minmax(0,1fr) auto 28rpx;gap:16rpx;padding:18rpx 20rpx;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-shadow:none; }
.device-item:last-child { border-bottom:0; }
.device-thumb { width:68rpx;height:68rpx;flex-basis:68rpx;border-radius:var(--radius-sm); }
.design-results { gap:0;overflow:hidden;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.design-result-card { border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0; }.design-result-card:last-child { border-bottom:0; }
.device-view { padding: 12px 20px 0; }
.device-view .tabs { padding: 4px; border-radius: 8px; }.device-view .segment-item { min-height: 40px; padding: 9px 12px; font-size: 13px; line-height: 20px; border-radius: 6px; }
.search-box { height: 46px; padding: 0 12px; border-radius: 8px; }.search-box input { height: 44px; font-size: 14px; }
.device-item { min-height: 88px; grid-template-columns: 36px minmax(0,1fr) auto 14px; gap: 10px; padding: 16px 12px; }
.device-thumb { width: 36px; height: 36px; }.list-copy strong { font-size: 14px; line-height: 22px; }.list-copy text, .device-serial { font-size: 11px; line-height: 18px; }
.device-meta > text, .device-meta > span { font-size: 11px; line-height: 18px; }
.filter-panel.card { padding: 16px 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; }.filter-head { font-size: 13px; }.filter-head > text { min-height: 36px; line-height: 36px; }
.filter-chips { gap: 8px; }.filter-chips > text { display: flex; min-height: 40px; align-items: center; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
.dealer-device-note { padding: 14px 12px; }.dealer-device-note strong { font-size: 14px; }.dealer-device-note text, .dealer-device-note > span { font-size: 12px; line-height: 20px; }
</style>
