<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SsIcon from './SsIcon.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const { t } = useI18n()
const emit = defineEmits<{ (e: 'change', value: string): void }>()
interface TabItem { key: string; icon: string; label: string; center?: boolean; fab?: boolean }
const items = computed<TabItem[]>(() => store.isDealer ? [
  { key: 'home', icon: 'panels-top-left', label: t('nav.device') },
  { key: 'workbench', icon: 'briefcase-business', label: t('nav.workbench') },
  { key: 'profile', icon: 'user-round', label: t('nav.profile') },
] : [
  { key: 'home', icon: 'panels-top-left', label: t('nav.device') },
  { key: 'profile', icon: 'user-round', label: t('nav.profile') },
])

function select(key: string) {
  store.activeTab = key as typeof store.activeTab
  emit('change', key)
}

function isActive(key: string) {
  return store.activeTab === key || (key === 'home' && store.activeTab === 'device')
}

</script>

<template>
  <view class="tabbar shared-navigation" :class="store.isDealer ? 'dealer-navigation' : 'user-navigation'">
    <button v-for="item in items" :key="item.key" class="tab-item" :aria-label="item.label" :aria-current="isActive(item.key) ? 'page' : undefined" :class="{ active: isActive(item.key), fab: item.fab, center: item.center }" @click="select(item.key)">
      <view v-if="item.fab" class="fab-icon"><SsIcon :name="item.icon" :size="26" tone="inverse" /></view>
      <view v-else-if="item.center" class="center-icon"><SsIcon :name="item.icon" :size="22" :tone="store.activeTab === item.key ? 'inverse' : 'brand'" /></view>
      <view v-else class="tab-symbol"><SsIcon :name="item.icon" :size="23" :tone="isActive(item.key) ? 'brand' : 'muted'" /></view>
      <text>{{ item.label }}</text>
    </button>
  </view>
</template>

<style scoped>
.tabbar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 50; display: grid; height: calc(120rpx + env(safe-area-inset-bottom)); grid-template-columns: repeat(5, minmax(0, 1fr)); overflow: visible; padding: 6rpx 12rpx calc(6rpx + env(safe-area-inset-bottom)); background: rgba(255,255,255,.98); border-top: 2rpx solid var(--color-divider); box-shadow:0 -8rpx 24rpx rgba(20,49,72,.04); }
.tabbar.shared-navigation { padding-right:28rpx;padding-left:28rpx; }
.tabbar.user-navigation { grid-template-columns:repeat(2,minmax(0,1fr)); }
.tabbar.dealer-navigation { grid-template-columns:repeat(3,minmax(0,1fr)); }
.tab-item { position: relative; display: flex; min-width: 0; height: 106rpx; flex-direction: column; align-items: center; justify-content: center; gap: 7rpx; overflow: visible; color: var(--color-text-secondary); background: transparent; border: 0; font-size: 21rpx; transition:color var(--motion-fast) ease;touch-action:manipulation; }
.tab-item.active { color: var(--color-action-primary); font-weight: 600; }
.tab-item.active::after { display:none; }
.tab-item:active { background:var(--color-bg-subtle); }
.tab-item.fab { padding-top: 52rpx; }
.fab-icon { position: absolute; z-index:2; top: -54rpx; display: flex; width: 104rpx; height: 104rpx; align-items: center; justify-content: center; overflow:visible;color: #fff; background: var(--color-action-primary); border: 8rpx solid #fff; border-radius: 50%; box-shadow: var(--shadow-floating); }
.center-icon { display: flex; width: 68rpx; height: 60rpx; align-items: center; justify-content: center; background: var(--color-action-primary-subtle); border: 2rpx solid var(--ss-brand-200); border-radius: var(--radius-sm); }
.tab-item.center.active .center-icon { background: var(--color-action-primary); border-color: var(--color-action-primary); }
.tabbar { height: calc(72px + env(safe-area-inset-bottom)); padding: 7px 12px calc(7px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(226,235,246,.88); border-radius:22px 22px 0 0;box-shadow:0 -12px 34px rgba(31,79,138,.1); background:rgba(255,255,255,.97);backdrop-filter:blur(18px); }
.tabbar.shared-navigation { padding-right:14px;padding-left:14px; }
.tab-item { height:58px;gap:3px;color:#657590;font-size:12px;line-height:17px; }
.tab-symbol { display:flex;width:48px;height:31px;align-items:center;justify-content:center;border-radius:16px;transition:background .18s ease,transform .18s ease; }
.active .tab-symbol { background:linear-gradient(145deg,#edf5ff,#dcecff);transform:translateY(-1px); }
.tab-item.active::before{position:absolute;bottom:0;width:22px;height:3px;content:'';background:var(--color-action-primary);border-radius:3px}
</style>
