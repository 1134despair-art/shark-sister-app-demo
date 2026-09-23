<script setup lang="ts">
import { computed, ref } from 'vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import SsDeviceIcon from '@/components/SsDeviceIcon.vue'
import { backgroundAssets } from '@/config/iconAssets'
import { useAppStore } from '@/stores/app'
import { showAuthRequired } from '@/services/routeGuard'

const store = useAppStore()
const mode = ref('device')
const visibleDevices = computed(() => (store.db?.devices || []).filter((item) => store.isGuest ? item.guestVisible : store.isDealer ? Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) : item.ownerId === store.account?.id))
const visibleWaypoints = computed(() => (store.db?.waypoints || []).filter((item) => item.ownerId === store.account?.id))
const selected = computed(() => visibleDevices.value.find((item) => item.status === 'online') ?? visibleDevices.value[0])
const pending = computed(() => visibleWaypoints.value.filter((item) => item.storageTarget === 'server' && item.syncStatus !== 'synced').length)
const localWaypoints = computed(() => visibleWaypoints.value.filter((item) => (item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) === 'local').length)
const activeRoute = computed(() => store.db?.routes.find((item) => item.ownerId === store.account?.id))
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
function protectedOpen(url: string, capability: string) {
  if (store.isGuest) return showAuthRequired(url, store.locale)
  if (!store.hasCapability(capability)) return uni.showModal({ title: l('无权操作','Action Not Allowed'), content: l('当前账号没有航点或航线编辑权限。','This account cannot edit waypoints or routes.'), showCancel: false })
  uni.navigateTo({ url })
}
</script>

<template>
  <view class="map-view">
    <image class="map-canvas" :src="backgroundAssets.mapCanvas" mode="aspectFill" />
    <view v-if="store.designCaseId !== 'B23'" class="map-segment segment"><view class="segment-item" :class="{ active: mode === 'device' }" @click="mode = 'device'">{{ $t('nav.device') }}</view><view class="segment-item" :class="{ active: mode === 'waypoint' }" @click="mode = 'waypoint'">{{ $t('map.waypoint') }}</view><view class="segment-item" :class="{ active: mode === 'route' }" @click="mode = 'route'">{{ $t('map.route') }}</view></view>
    <view class="route-line one" /><view class="route-line two" />
    <view class="map-pin pin-device"><SsIcon name="ship-wheel" :size="23" tone="inverse" /></view>
    <view class="map-pin pin-a"><SsIcon name="flag" :size="20" tone="warning" /></view>
    <view class="map-pin pin-b"><SsIcon name="anchor" :size="20" tone="accent" /></view>
    <view class="map-controls"><button><SsIcon name="locate-fixed" :size="21" tone="default" /></button><button><SsIcon name="layers-3" :size="21" tone="brand" /></button></view>
    <view v-if="store.designCaseId === 'B23'" class="map-sheet dealer-map-sheet"><view class="dealer-map-head"><view><strong>{{ l('厦门服务区域','Xiamen service area') }}</strong><text>{{ l('本级及下级 · 12 台设备已连接','Current and sub-level · 12 devices connected') }}</text></view><SsStatus status="online" :label="l('服务范围','Service scope')" /></view><view class="dealer-map-stats"><view><SsIcon name="radio-tower" :size="16" tone="brand" /><text>{{ l('已连接 12','Connected 12') }}</text></view><view><SsIcon name="wifi-off" :size="16" tone="brand" /><text>{{ l('未连接 2','Not connected 2') }}</text></view><view><SsIcon name="wrench" :size="16" tone="brand" /><text>{{ l('售后中 3','Service 3') }}</text></view><view><SsIcon name="map-pin" :size="16" tone="brand" /><text>{{ l('航点 18','Waypoints 18') }}</text></view></view><view class="button-row dealer-map-actions"><button class="btn"><SsIcon name="map-pinned" :size="18" tone="brand" />{{ l('查看设备分布','Device distribution') }}</button><button class="btn primary"><SsIcon name="navigation" :size="18" tone="inverse" />{{ l('进入海图','Open chart') }}</button></view></view>
    <view v-else class="map-sheet">
      <view class="sheet-handle" />
      <template v-if="mode === 'device' && selected">
        <view class="sheet-device"><view class="icon-tile device-tile"><SsDeviceIcon :category="selected.category" :status="selected.status" :size="24" /></view><view class="list-copy"><strong>{{ store.locale !== 'zh-Hans' ? selected.nameEn : selected.name }}</strong><text>{{ selected.model }} · {{ store.locale !== 'zh-Hans' ? selected.location.labelEn : selected.location.label }}</text></view><SsStatus :status="selected.status" :label="`${$t(`common.${selected.status}`)} · ${l('记录','recorded')}`" /></view>
        <view class="button-row map-actions"><button class="btn small subtle" @click="uni.navigateTo({ url: `/pages/device/detail?id=${selected.id}` })">{{ $t('device.detail') }}</button><button class="btn small primary" @click="protectedOpen('/pages/process/index?scenario=route', 'map.edit')"><SsIcon v-if="store.designCaseId === 'M01'" name="navigation" :size="17" tone="inverse" />{{ $t('map.plan') }}</button></view>
      </template>
      <template v-else-if="mode === 'waypoint'">
        <view class="sheet-head"><view><strong>{{ visibleWaypoints.length }} {{ $t('map.waypoint') }}</strong><text>{{ pending ? l(`${pending} 条等待同步`, `${pending} awaiting sync`) : l(`${localWaypoints} 条仅保存在本机`, `${localWaypoints} stored locally`) }}</text></view><SsStatus :status="pending ? 'pending' : 'completed'" :label="pending ? l('待同步','Pending sync') : l('保存正常','Saved')" /></view>
        <view class="button-row map-actions"><button class="btn small subtle" @click="protectedOpen('/pages/manage/list?entity=waypoints', 'map.edit')">{{ $t('common.viewAll') }}</button><button class="btn small primary" @click="protectedOpen('/pages/manage/form?entity=waypoints', 'map.edit')">{{ $t('map.savePosition') }}</button></view>
      </template>
      <template v-else>
        <view class="sheet-head"><view><strong>{{ store.isDealer ? l('福建沿海服务范围','Coastal service area') : activeRoute?.name || l('尚未创建航线','No route yet') }}</strong><text>{{ store.isDealer ? `${visibleDevices.length} ${l('台设备','devices')} · ${store.db?.tickets.filter(item => item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)).length || 0} ${l('个售后点','service sites')}` : activeRoute ? `${activeRoute.waypointIds.length} ${l('个航点','waypoints')} · ${activeRoute.distanceKm} km · ${l('预计','ETA')} ${activeRoute.estimatedMinutes} ${l('分钟','min')}` : l('至少选择两个航点后保存','Select at least two waypoints') }}</text></view><SsIcon name="route" :size="26" tone="brand" /></view>
        <view class="route-actions map-actions"><button class="btn small" @click="protectedOpen('/pages/manage/list?entity=routes', 'map.edit')">{{ l('航线列表','Route list') }}</button><button class="btn small subtle" :disabled="!activeRoute" @click="protectedOpen('/pages/process/index?scenario=playback', 'map.edit')">{{ $t('map.playback') }}</button><button class="btn small primary" @click="protectedOpen('/pages/process/index?scenario=route', 'map.edit')">{{ $t('map.plan') }}</button></view>
      </template>
    </view>
  </view>
</template>

<style scoped>
.map-view { position: relative; height: 100%; overflow: hidden; background: #dcecff; }
.map-canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.map-segment { position: absolute; top: 20rpx; right: 32rpx; left: 32rpx; z-index: 5; box-shadow: var(--shadow-card); }
.route-line { position: absolute; z-index: 2; height: 6rpx; background: var(--ss-brand-500); border: 3rpx solid #fff; border-radius: 999rpx; transform-origin: left center; box-shadow: 0 6rpx 16rpx rgba(31,96,217,.18); }.route-line.one { top: 330rpx; left: 264rpx; width: 230rpx; transform: rotate(56deg); }.route-line.two { top: 516rpx; left: 392rpx; width: 188rpx; transform: rotate(138deg); }
.map-pin { position: absolute; z-index: 3; display: flex; width: 72rpx; height: 72rpx; align-items: center; justify-content: center; color: #fff; background: var(--color-action-primary); border: 6rpx solid #fff; border-radius: 50% 50% 50% 10rpx; box-shadow: var(--shadow-floating); transform: rotate(-45deg); }.map-pin :deep(.ss-icon) { transform: rotate(45deg); }.pin-device { top: 270rpx; left: 220rpx; }.pin-a { top: 474rpx; left: 454rpx; background: var(--ss-orange-500); }.pin-b { top: 554rpx; left: 284rpx; background: var(--ss-purple-700); }
.map-controls { position: absolute; top: 230rpx; right: 28rpx; z-index: 5; display: flex; flex-direction: column; gap: 10rpx; }.map-controls button { display: flex; width: 84rpx; height: 84rpx; align-items: center; justify-content: center; background: rgba(255,255,255,.96); border: 2rpx solid var(--color-border-subtle); border-radius: var(--radius-sm); box-shadow: var(--shadow-card); }
.map-sheet { position: absolute; right: 20rpx; bottom: calc(132rpx + env(safe-area-inset-bottom)); left: 20rpx; z-index: 8; padding: 14rpx 26rpx 26rpx; background: rgba(255,255,255,.98); border: 2rpx solid var(--color-border-subtle); border-radius: var(--radius-lg); box-shadow: var(--shadow-floating); }.sheet-handle { width: 72rpx; height: 8rpx; margin: 0 auto 18rpx; background: var(--ss-neutral-300); border-radius: 999rpx; }
.sheet-device { display: flex; align-items: center; gap: 18rpx; }.sheet-head { display: flex; align-items: center; justify-content: space-between; min-height: 88rpx; }.sheet-head strong, .sheet-head text { display: block; }.sheet-head strong { font-size: 28rpx; }.sheet-head text { margin-top: 6rpx; color: var(--color-text-secondary); font-size: 22rpx; }
.device-tile { overflow:hidden;padding:0; }
.map-actions { margin-top: 24rpx; }
.route-actions { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10rpx; }.route-actions .btn { min-width:0;padding:0 10rpx; }
.dealer-map-sheet { bottom:calc(24rpx + env(safe-area-inset-bottom)); }.dealer-map-head { display:flex;align-items:flex-start;justify-content:space-between;gap:16rpx; }.dealer-map-head strong,.dealer-map-head text { display:block; }.dealer-map-head strong { font-size:27rpx; }.dealer-map-head text { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx; }.dealer-map-stats { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14rpx 20rpx;margin-top:22rpx;padding-top:20rpx;border-top:2rpx solid var(--color-divider); }.dealer-map-stats > view { display:flex;align-items:center;gap:9rpx;color:var(--color-text-body);font-size:20rpx; }.dealer-map-actions { margin-top:22rpx; }.dealer-map-actions .btn { min-width:0;padding:0 10rpx;font-size:21rpx; }
.map-segment { top: 16px; left: 20px; right: 20px; padding: 4px; border-radius: 8px; }.map-segment .segment-item { min-height: 40px; font-size: 14px; border-radius: 6px; }
.map-controls { right: 16px; gap: 8px; }.map-controls button { width: 44px; height: 44px; border-radius: 8px; }
.map-sheet { right: 0; left: 0; bottom: calc(68px + env(safe-area-inset-bottom)); padding: 12px 20px 20px; border: 0; border-radius: 16px 16px 0 0; }
.sheet-head strong, .dealer-map-head strong { font-size: 17px; line-height: 25px; }.sheet-head text, .dealer-map-head text { font-size: 12px; line-height: 20px; }
.map-actions .btn, .dealer-map-actions .btn { min-height: 46px; height: auto; padding: 11px 10px; border-radius: 8px; font-size: 13px; line-height: 22px; }
.dealer-map-sheet { bottom: 0; }.dealer-map-stats > view { font-size: 12px; line-height: 20px; }
</style>
