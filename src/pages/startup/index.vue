<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsStatusBar from '@/components/SsStatusBar.vue'
import { launchScreenService, type LaunchScreenConfig } from '@/services/launchScreen'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const config = ref<LaunchScreenConfig | null>(null)
const showing = ref(false)
const preview = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const title = computed(() => store.locale !== 'zh-Hans' ? config.value?.titleEn : config.value?.title)
const subtitle = computed(() => store.locale !== 'zh-Hans' ? config.value?.subtitleEn : config.value?.subtitle)

onLoad(async (query) => {
  await store.init()
  preview.value = query?.preview === '1'
  config.value = await launchScreenService.getConfig()
  showing.value = launchScreenService.shouldShow(config.value, preview.value)
  if (!showing.value) return finish(false)
  if (!preview.value) timer = setTimeout(() => finish(), config.value.durationMs)
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

function nextRoute() {
  if (store.account?.firstLogin) return '/pages/auth/password?mode=first'
  if (store.account || store.db?.session.guest) return '/pages/shell/index'
  return '/pages/auth/login'
}

function finish(markSeen = true) {
  if (timer) clearTimeout(timer)
  timer = null
  if (config.value && markSeen) launchScreenService.markSeen(config.value)
  if (!preview.value && launchScreenService.shouldShowGuide()) return uni.reLaunch({ url: '/pages/startup/guide' })
  uni.reLaunch({ url: nextRoute() })
}
</script>

<template>
  <view class="page launch-page">
    <image v-if="config" class="launch-background" :src="config.backgroundImage" mode="aspectFill" />
    <SsStatusBar />
    <button v-if="showing && config?.allowSkip" class="launch-skip" @click="finish()">{{ store.locale !== 'zh-Hans' ? 'Skip' : '跳过' }}</button>
    <view v-if="config" class="launch-content">
      <image class="launch-logo" :src="config.logoImage" mode="aspectFit" />
      <text class="launch-title">{{ title }}</text>
      <text class="launch-subtitle">{{ subtitle }}</text>
    </view>
    <view v-if="showing" class="launch-progress" aria-hidden="true"><i /><i /><i /></view>
  </view>
</template>

<style scoped lang="scss">
.launch-page{position:relative;isolation:isolate;align-items:center;justify-content:center;background:#f7f9fc}.launch-background{position:absolute;z-index:-1;inset:0;width:100%;height:100%}.launch-page :deep(.ss-status-bar){position:absolute;z-index:2;top:0;right:0;left:0;width:100%;background:transparent}.launch-skip{position:absolute;z-index:3;top:calc(var(--ss-status-bar-height) + 8rpx);right:28rpx;display:flex;min-width:88rpx;height:88rpx;align-items:center;justify-content:center;padding:0 22rpx;color:var(--color-text-secondary);background:rgba(255,255,255,.78);border:2rpx solid rgba(255,255,255,.9);border-radius:999rpx;font-size:23rpx;backdrop-filter:blur(10px)}.launch-content{display:flex;align-items:center;flex-direction:column;padding:0 54rpx;text-align:center;transform:translateY(-62rpx)}.launch-logo{width:160rpx;height:160rpx;filter:drop-shadow(0 18rpx 34rpx rgba(36,105,224,.18))}.launch-title{margin-top:34rpx;color:var(--color-text-primary);font-size:52rpx;line-height:68rpx;font-weight:700}.launch-subtitle{max-width:590rpx;margin-top:14rpx;color:var(--color-text-secondary);font-size:25rpx;line-height:38rpx}.launch-progress{position:absolute;bottom:calc(66rpx + env(safe-area-inset-bottom));display:flex;gap:12rpx}.launch-progress i{width:12rpx;height:12rpx;background:var(--color-action-primary);border-radius:50%;animation:launch-pulse 1.1s ease-in-out infinite}.launch-progress i:nth-child(2){animation-delay:.15s}.launch-progress i:nth-child(3){animation-delay:.3s}@keyframes launch-pulse{0%,100%{opacity:.28;transform:translateY(0)}50%{opacity:1;transform:translateY(-8rpx)}}
</style>
