<script setup lang="ts">
import { computed } from 'vue'
import SsIcon from '@/components/SsIcon.vue'
import { getLocaleOption } from '@/config/locales'
import { showAuthRequired } from '@/services/routeGuard'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const appRegion = import.meta.env.VITE_APP_REGION
const account = computed(() => store.account)
const currentLocaleOption = computed(() => getLocaleOption(store.locale))
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const maskedIdentifier = computed(() => {
  const value = account.value?.identifier || ''
  if (value.includes('@')) { const [name, domain] = value.split('@'); return name.slice(0, 2) + '***@' + domain }
  return value.length > 7 ? value.slice(0, 3) + '****' + value.slice(-4) : value
})
const stats = computed(() => store.isDealer ? [
  { value: store.db?.employees.filter(item => store.context.dealerScopeIds.includes(item.dealerId)).length ?? 0, label: l('团队成员', 'Team'), url: '/pages/manage/list?entity=employees' },
  { value: store.db?.projects.filter(item => store.context.dealerScopeIds.includes(item.dealerId)).length ?? 0, label: l('我的项目', 'Projects'), url: '/pages/manage/list?entity=projects' },
  { value: store.db?.tickets.filter(item => Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId))).length ?? 0, label: l('售后工单', 'Service'), url: '/pages/manage/list?entity=tickets' },
] : [
  { value: store.db?.devices.filter(item => item.ownerId === account.value?.id).length ?? 0, label: l('我的设备', 'Devices'), url: '' },
  { value: store.db?.waypoints.filter(item => item.ownerId === account.value?.id).length ?? 0, label: l('我的航点', 'Waypoints'), url: '/pages/manage/list?entity=waypoints' },
  { value: store.db?.tickets.filter(item => item.ownerId === account.value?.id).length ?? 0, label: l('售后记录', 'Service'), url: '/pages/manage/list?entity=tickets' },
])
const personalMenus = [
  ['user-round', 'profile.personal', '/pages/profile/detail?mode=view'],
  ['lock-keyhole', 'profile.security', '/pages/auth/password?mode=reset'],
  ['bell', 'profile.notifications', '/pages/profile/settings?section=notifications'],
  ['languages', 'profile.language', '/pages/profile/settings?section=language'],
]
const navigationMenus = computed(() => [
  { icon: 'map-pinned', label: l('我的航点', 'My waypoints'), url: '/pages/manage/list?entity=waypoints' },
  { icon: 'route', label: l('航迹设置', 'Track settings'), url: '/pages/manage/list?entity=routes' },
])
const serviceMenus = computed(() => [
  { icon: 'clipboard-check', key: 'repair-records', label: l('报修记录', 'Repair records'), url: '/pages/manage/list?entity=tickets&type=repair' },
  { icon: 'refresh-ccw-dot', key: 'cross-region', label: l('跨区转移', 'Cross-region transfer'), url: '/pages/manage/list?entity=tickets&type=transfer' },
  { icon: 'wallet-cards', key: 'payment', label: l('支付记录', 'Payment records'), url: '/pages/manage/list?entity=payments' },
  { icon: 'settings-2', key: 'settings', label: l('App 设置', 'App settings'), url: '/pages/profile/settings' },
])
function openMenu(url: string) {
  if (store.isGuest) return showAuthRequired(url, store.locale)
  if (!url) { store.activeTab = 'home'; return }
  uni.navigateTo({ url })
}
</script>

<template>
  <scroll-view scroll-y class="profile-scroll">
    <view class="profile-content">
      <button class="profile-identity" @click="openMenu('/pages/profile/detail?mode=view')">
        <view class="avatar"><image v-if="account?.avatar" :src="account.avatar" mode="aspectFill" /><SsIcon v-else :name="store.isDealer ? 'store' : 'user-round'" :size="28" tone="brand" /></view>
        <view class="profile-copy"><strong>{{ store.locale !== 'zh-Hans' ? account?.displayNameEn : account?.displayName }}</strong><text>{{ maskedIdentifier }}</text><view v-if="account?.verified" class="verified"><SsIcon name="shield-check" :size="13" tone="success" /><text>{{ store.isDealer ? l('经销商认证', 'Verified dealer') : l('账号已验证', 'Verified account') }}</text></view></view>
        <SsIcon name="chevron-right" :size="19" tone="muted" />
      </button>
      <view class="profile-stats"><button v-for="item in stats" :key="item.label" @click="openMenu(item.url)"><strong>{{ item.value }}</strong><text>{{ item.label }}</text></button></view>
      <view v-if="store.isDealer" class="organization"><button class="profile-row" @click="openMenu('/pages/manage/list?entity=employees')"><view class="profile-row-icon"><SsIcon name="building-2" :size="20" tone="brand" /></view><text>{{ $t('profile.organization') }}</text><text class="row-value">{{ account?.role === 'dealerAdmin' ? l('管理员','Admin') : l('员工','Staff') }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></button></view>

      <button class="service-hub" data-profile-menu="support" @click="openMenu('/pages/manage/list?entity=tickets&mode=hub')"><view class="service-symbol"><SsIcon name="headphones" :size="24" tone="brand" /></view><view><strong>{{ l('售后服务', 'Service & support') }}</strong><text>{{ l('报修、进度与服务记录', 'Repairs, progress and records') }}</text></view><SsIcon name="chevron-right" :size="18" tone="brand" /></button>

      <view class="profile-group"><text class="group-label">{{ l('账号与偏好', 'ACCOUNT & PREFERENCES') }}</text><view class="profile-menu">
        <button v-for="item in personalMenus" :key="item[1]" class="profile-row" @click="item[1] === 'profile.language' ? uni.navigateTo({ url: item[2] }) : openMenu(item[2])"><view class="profile-row-icon"><SsIcon :name="item[0]" :size="19" tone="brand" /></view><text>{{ $t(item[1]) }}</text><text v-if="item[1] === 'profile.language'" class="row-value">{{ currentLocaleOption.nativeName }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
      </view></view>
      <view class="profile-group"><text class="group-label">{{ l('航行资料', 'NAVIGATION') }}</text><view class="profile-menu">
        <button v-for="item in navigationMenus" :key="item.url" class="profile-row" @click="openMenu(item.url)"><view class="profile-row-icon"><SsIcon :name="item.icon" :size="19" tone="brand" /></view><text>{{ item.label }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
      </view></view>
      <view class="profile-group"><text class="group-label">{{ l('服务与设置', 'SERVICE & SETTINGS') }}</text><view class="profile-menu">
        <button v-for="item in serviceMenus" :key="item.key" class="profile-row" :data-profile-menu="item.key" @click="item.key === 'settings' ? uni.navigateTo({ url: item.url }) : openMenu(item.url)"><view class="profile-row-icon"><SsIcon :name="item.icon" :size="19" tone="brand" /></view><text>{{ item.label }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></button>
      </view></view>
      <view class="version">{{ l('鲨鱼妹妹', 'Shark Sister') }} · V3.2.0 · {{ appRegion }}</view>
    </view>
  </scroll-view>
</template>

<style scoped>
.profile-scroll { height: 100%; background: var(--color-bg-canvas); }
.profile-content { padding-bottom: calc(88px + env(safe-area-inset-bottom)); background:var(--color-bg-canvas); }
.profile-identity { display: flex; width: 100%; align-items: center; gap: 16px; padding: 20px 20px 18px; color:#fff; background:#123746; text-align: left; }
.avatar { display: flex; width: 60px; height: 60px; flex: 0 0 60px; align-items: center; justify-content: center; overflow: hidden; background:rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.22); border-radius: 50%; }
.avatar image { width: 100%; height: 100%; }
.profile-copy { min-width: 0; flex: 1; }.profile-copy strong { display: block; font-size: 22px; line-height: 30px; font-weight: 700; overflow-wrap: anywhere; }.profile-copy > text { display: block; margin-top: 3px; color: rgba(255,255,255,.72); font-size: 12px; }
.verified { display: flex; align-items: center; gap: 4px; margin-top: 7px; color: #7ee7c2; font-size: 11px; }
.verified :deep(.ss-icon) { opacity:.82; }
.profile-identity > :deep(.ss-icon:last-child) { opacity:.72; }
.profile-stats { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); padding: 0 18px 21px; color:#fff; background: #123746; }
.profile-stats button { display: flex; min-height: 58px; flex-direction: column; justify-content: center; gap: 5px; border-right: 1px solid rgba(255,255,255,.16); }.profile-stats button:last-child { border: 0; }.profile-stats strong { font-family: var(--ss-font-data); font-size: 25px; line-height: 30px; font-weight: 700; }.profile-stats text { color: rgba(255,255,255,.76); font-size: 12px; }
.organization { padding: 0 18px 18px; background: #123746; }.organization .profile-row { min-height:52px;padding:0 13px;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:8px; }.organization .row-value { color:rgba(255,255,255,.7); }
.service-hub { display: flex; width: calc(100% - 36px); align-items: center; gap: 12px; margin:14px 18px 0;padding: 16px; background:#fff;border:1px solid var(--color-border-subtle);border-radius:8px;box-shadow:var(--shadow-card); text-align: left; }.service-hub > view:nth-child(2) { min-width: 0; flex: 1; }.service-symbol { display: flex; width: 42px; height: 42px; align-items: center; justify-content: center; background: #e6f7f1; border-radius:8px; }.service-hub strong { display: block; font-size: 15px; font-weight: 650; }.service-hub text { display: block; margin-top: 4px; color: var(--color-text-secondary); font-size: 12px; }
.profile-group { margin-top: 0; }.group-label { display: block; padding: 20px 20px 9px; color: var(--color-text-secondary); font-size: 12px; line-height: 18px; }.profile-menu { margin:0 18px;padding: 0 14px; overflow:hidden;background: #fff;border:1px solid var(--color-border-subtle);border-radius:8px; }
.profile-row { display: flex; width: 100%; min-height: 62px; align-items: center; gap: 11px; padding: 10px 0; border-bottom: 1px solid var(--color-divider); text-align: left; }.profile-row:last-child { border: 0; }.profile-row > text:first-of-type { min-width: 0; flex: 1; font-size: 14px; line-height: 22px; }.row-value { max-width: 112px; color: var(--color-text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.profile-row-icon { display:flex;width:34px;height:34px;flex:0 0 34px;align-items:center;justify-content:center;background:var(--ss-brand-50);border-radius:8px; }
.version { padding: 27px 12px 10px; color: var(--color-text-secondary); font-size: 11px; text-align: center; }
button:active { opacity: .75; } button:focus-visible { outline: 2px solid var(--color-action-primary); outline-offset: -2px; }

/* The account header shares the device list's quiet surface and clear actions. */
.profile-scroll,.profile-content { background:var(--ss-brand-canvas); }
.profile-content { padding-top:0; }
.profile-identity { width:100%;min-height:108px;padding:19px 20px;color:var(--color-text-primary);background:#fff;border:0;border-bottom:1px solid var(--color-divider);border-radius:0;box-shadow:none; }
.avatar { width:56px;height:56px;flex-basis:56px;color:var(--color-action-primary);background:var(--ss-brand-50);border:1px solid var(--ss-brand-100);border-radius:8px; }
.avatar :deep(.ss-icon) { filter:none; }
.profile-copy strong { font-size:19px;line-height:27px; }
.profile-copy > text { color:var(--color-text-secondary);font-size:13px; }
.verified { color:var(--ss-green-700);font-size:12px; }
.profile-identity > :deep(.ss-icon:last-child) { color:var(--color-icon-secondary);filter:none; }
.profile-stats { margin:0;padding:12px 16px 16px;color:var(--color-text-primary);background:#fff;border-bottom:1px solid var(--color-divider); }
.profile-stats button { min-height:58px;border-right-color:var(--color-divider); }
.profile-stats strong { color:var(--color-action-primary);font-size:23px; }
.profile-stats text { color:var(--color-text-secondary); }
.organization { padding:14px 16px 0;background:transparent; }
.organization .profile-row { min-height:58px;padding:0 13px;color:var(--color-text-primary);background:#fff;border:1px solid var(--color-border-subtle);border-radius:8px;box-shadow:none; }
.organization .row-value { color:var(--color-text-secondary); }
.service-hub { width:calc(100% - 32px);margin:14px 16px 0;box-shadow:none; }
.service-symbol { background:var(--ss-green-50); }
.profile-group { margin-top:4px; }
.group-label { padding:20px 18px 10px;color:var(--color-text-body);font-size:13px;font-weight:650; }
.profile-menu { margin:0 16px;padding:0 14px; }
.profile-row { min-height:60px; }
.version { padding-bottom:20px; }
</style>
