<script setup lang="ts">
import { computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import HomeView from '@/views/HomeView.vue'
import DeviceListView from '@/views/DeviceListView.vue'
import MapView from '@/views/MapView.vue'
import WorkbenchView from '@/views/WorkbenchView.vue'
import ProfileView from '@/views/ProfileView.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsTabBar from '@/components/SsTabBar.vue'
import SsStatusBar from '@/components/SsStatusBar.vue'
import SsDesignParity from '@/components/SsDesignParity.vue'
import SsAuthRequired from '@/components/SsAuthRequired.vue'
import { brandAssets } from '@/config/iconAssets'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const { t } = useI18n()
const deviceSearch = computed(() => store.activeTab === 'device' && store.shellState === 'filter')
const deviceBrowse = computed(() => store.activeTab === 'device' && store.shellState === 'browse')
const title = computed(() => {
  if (deviceBrowse.value) return store.locale !== 'zh-Hans' ? 'My Devices' : '我的设备'
  if (deviceSearch.value) return store.locale !== 'zh-Hans' ? 'Search Devices' : '搜索设备'
  if (store.activeTab === 'home') return t('home.title')
  if (store.activeTab === 'device') return t('device.title')
  if (store.activeTab === 'workbench') return t('dealer.title')
  if (store.activeTab === 'map') return store.designCaseId === 'B23' ? t('map.title') : t('map.title')
  return t('profile.title')
})

onLoad(async (query) => {
  await store.init()
  if (!store.account) return uni.reLaunch({ url: '/pages/auth/login' })
  if (store.account.firstLogin) return uni.reLaunch({ url: '/pages/auth/password?mode=first' })
  const requestedTab = String(query?.tab || '')
  if (['home', 'device', 'workbench', 'map', 'profile'].includes(requestedTab)) store.activeTab = requestedTab as typeof store.activeTab
  store.shellState = String(query?.state || '')
  store.shellStatus = String(query?.status || '')
  if (!store.isDealer && store.activeTab === 'workbench') store.activeTab = 'home'
  if (!store.isDealer && !store.designCaseId && store.activeTab === 'map') store.activeTab = 'home'
})
onShow(() => {
  store.refresh()
  if (!store.isDealer && store.activeTab === 'workbench') store.activeTab = 'home'
})

</script>

<template>
  <view class="shell page">
    <SsAuthRequired />
    <SsDesignParity v-if="store.designParityVisible && store.designCaseId" :id="store.designCaseId" />
    <SsStatusBar :immersive="['home', 'workbench', 'profile'].includes(store.activeTab) && !store.designCaseId" tone="brand" />
    <view class="shell-bar" :class="{ 'home-bar': store.activeTab === 'home' && !store.designCaseId, 'workbench-bar': store.activeTab === 'workbench' && !store.designCaseId, 'profile-bar': store.activeTab === 'profile' && !store.designCaseId }">
      <view v-if="store.activeTab === 'home' && !store.designCaseId" class="shell-brand">
        <image :src="brandAssets.logoMark" mode="aspectFit" />
        <view class="brand-copy"><text>{{ store.locale === 'zh-Hans' ? '鲨鱼妹妹' : 'Shark Sister' }}</text><span>{{ store.locale === 'zh-Hans' ? '让智能触手可及' : 'Smart control within reach' }}</span></view>
        <text v-if="store.isDealer" class="dealer-label">{{ store.locale === 'zh-Hans' ? '经销商' : 'Dealer' }}</text>
      </view>
      <template v-else>
      <button v-if="deviceBrowse" class="bar-action" :aria-label="$t('common.back')" @click="uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/shell/index?tab=home' }) })"><SsIcon name="chevron-left" :size="20" tone="default" /></button>
      <button v-else-if="deviceSearch" class="bar-action" :aria-label="$t('common.back')" @click="uni.redirectTo({ url: '/pages/shell/index?tab=device' })"><SsIcon name="chevron-left" :size="20" tone="default" /></button>
      <view v-else class="bar-action" />
      <view class="shell-title"><text>{{ title }}</text></view>
      </template>
      <view v-if="store.activeTab === 'home'" />
      <button v-else-if="deviceSearch" class="bar-action search-cancel" @click="uni.redirectTo({ url: '/pages/shell/index?tab=device' })">{{ store.locale !== 'zh-Hans' ? 'Cancel' : '取消' }}</button>
      <view v-else-if="store.activeTab === 'device' && store.isDealer" class="bar-action" />
      <button v-else-if="store.activeTab === 'device'" class="bar-action" :aria-label="$t('device.add')" @click="uni.navigateTo({ url: '/pages/device/add' })"><SsIcon name="plus" :size="20" tone="default" /></button>
      <button v-else-if="store.activeTab === 'map'" class="bar-action" :aria-label="$t('profile.waypoints')" @click="uni.navigateTo({ url: '/pages/manage/list?entity=waypoints' })"><SsIcon :name="store.designCaseId === 'B23' ? 'layers-3' : 'list-restart'" :size="20" tone="default" /></button>
      <button v-else-if="store.activeTab === 'profile'" class="bar-action" :aria-label="$t('profile.settings')" @click="uni.navigateTo({ url: '/pages/profile/settings' })"><SsIcon name="settings-2" :size="20" :tone="store.designCaseId ? 'default' : 'inverse'" /></button>
      <view v-else class="bar-action" />
    </view>

    <view class="shell-content">
      <HomeView v-if="store.activeTab === 'home'" />
      <DeviceListView v-else-if="store.activeTab === 'device'" />
      <WorkbenchView v-else-if="store.activeTab === 'workbench'" />
      <MapView v-else-if="store.activeTab === 'map' && (store.isDealer || Boolean(store.designCaseId))" />
      <ProfileView v-else />
    </view>
    <SsTabBar v-if="!deviceSearch && !deviceBrowse" />
  </view>
</template>

<style scoped>
.shell { display: flex; height: 100vh; flex-direction: column; overflow: hidden; }
.shell-bar { position: relative; z-index: 20; display:grid;height:96rpx;flex:0 0 96rpx;grid-template-columns:96rpx minmax(0,1fr) 96rpx;align-items:center;padding:0;background:rgba(255,255,255,.98);border-bottom:2rpx solid var(--color-divider); }
.shell-title { min-width:0;font-size:32rpx;font-weight:650;text-align:center; }.shell-title text { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.bar-action { position: relative; display: flex; width: 96rpx; height: 96rpx; align-items: center; justify-content: center; color:var(--color-icon-secondary);background: transparent; border: 0; }
.bar-action:active { background:var(--color-bg-subtle); }
.search-cancel { width:auto;padding:0 20rpx;color:var(--color-action-primary);border-radius:10rpx;font-size:23rpx;font-weight:500;white-space:nowrap; }
.shell-content { min-height: 0; flex: 1; overflow: hidden; }
.shell-bar { height: 52px; flex-basis: 52px; grid-template-columns: 48px minmax(0,1fr) 48px; background: #fff; border-bottom: 1px solid var(--color-divider); }
.shell-title { font-size: 17px; font-weight: 650; }
.bar-action { width: 48px; height: 48px; }
.home-bar { height:82px;flex-basis:82px;grid-template-columns:minmax(0,1fr) 0;padding:0 18px 8px;border-bottom:0;background:linear-gradient(135deg,#2872f8 0%,#609bf7 58%,#9ec7ff 100%);box-shadow:none; }
.home-bar::after { position:absolute;right:-20px;bottom:-23px;width:210px;height:72px;content:'';background:rgba(255,255,255,.12);border-radius:50%;transform:rotate(-7deg); }
.shell-brand { position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:10px;color:#fff; }
.shell-brand > image { width:47px;height:47px;filter:drop-shadow(0 5px 10px rgba(13,74,151,.24)); }
.brand-copy { min-width:0; }.brand-copy text,.brand-copy span { display:block; }.brand-copy text { font-size:20px;line-height:26px;font-weight:750; }.brand-copy span { margin-top:2px;color:rgba(255,255,255,.84);font-size:11px;letter-spacing:3px;white-space:nowrap; }
.dealer-label { align-self:flex-start;margin-top:7px;padding:3px 6px;color:#155ab6;background:rgba(255,255,255,.9);border:1px solid rgba(255,255,255,.9);border-radius:4px;font-size:10px;font-weight:650; }
.workbench-bar { color:#fff;background:var(--ss-brand-gradient);border-bottom:0; }
.workbench-bar .shell-title { font-size:20px;font-weight:700;text-align:left; }
.profile-bar { color:#fff;background:var(--ss-brand-gradient);border-bottom:0; }
.profile-bar .shell-title { font-size:20px;font-weight:700;text-align:left; }
.workbench-bar::after,.profile-bar::after { position:absolute;right:-20px;bottom:-24px;width:190px;height:64px;content:'';background:rgba(255,255,255,.11);border-radius:50%;transform:rotate(-7deg); }
.workbench-bar .shell-title,.profile-bar .shell-title,.profile-bar .bar-action { position:relative;z-index:1; }
</style>
