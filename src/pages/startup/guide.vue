<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsIcon from '@/components/SsIcon.vue'
import SsStatusBar from '@/components/SsStatusBar.vue'
import { launchScreenService } from '@/services/launchScreen'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const current = ref(0)
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const slides = computed(() => [
  { icon: 'link-2', title: l('连接船载设备', 'Connect marine devices'), copy: l('从首页添加设备，连接后即可查看设备状态和控制反馈。', 'Add devices from Home, then view device state and control feedback after connecting.') },
  { icon: 'map-pinned', title: l('海图与航点集中操作', 'Charts and waypoints together'), copy: l('进入设备详情即可在海图上控制设备、记录航点并规划航线。', 'Open device details to control the device, record waypoints, and plan routes on the chart.') },
  { icon: 'wrench', title: l('售后记录全程可查', 'Track service end to end'), copy: l('报修、物料和处理进度与设备关联，历史记录按账号权限隔离。', 'Repairs, parts, and progress stay linked to devices and are isolated by account permissions.') },
])

onLoad(async () => { await store.init() })

function finish() {
  launchScreenService.markGuideSeen()
  const target = store.account?.firstLogin ? '/pages/auth/password?mode=first' : store.account || store.db?.session.guest ? '/pages/shell/index' : '/pages/auth/login'
  uni.reLaunch({ url: target })
}
</script>

<template>
  <view class="page guide-page">
    <SsStatusBar />
    <button class="guide-skip" @click="finish">{{ l('跳过','Skip') }}</button>
    <swiper class="guide-swiper" :current="current" @change="current = $event.detail.current">
      <swiper-item v-for="item in slides" :key="item.title">
        <view class="guide-slide">
          <view class="guide-visual"><SsIcon :name="item.icon" :size="76" tone="brand" /></view>
          <strong>{{ item.title }}</strong>
          <text>{{ item.copy }}</text>
        </view>
      </swiper-item>
    </swiper>
    <view class="guide-footer">
      <view class="guide-dots"><i v-for="(_, index) in slides" :key="index" :class="{ active:current === index }" /></view>
      <button v-if="current < slides.length - 1" class="btn primary" @click="current += 1">{{ l('下一步','Next') }}</button>
      <button v-else class="btn primary" @click="finish">{{ l('开始使用','Get Started') }}</button>
    </view>
  </view>
</template>

<style scoped>
.guide-page{position:relative;display:flex;height:100vh;flex-direction:column;background:var(--color-bg-canvas);overflow:hidden}.guide-skip{position:absolute;z-index:4;top:calc(var(--ss-status-bar-height) + 10rpx);right:28rpx;min-width:92rpx;height:72rpx;color:var(--color-text-secondary);background:transparent;border:0;font-size:23rpx}.guide-swiper{min-height:0;flex:1}.guide-slide{display:flex;height:100%;box-sizing:border-box;align-items:center;flex-direction:column;justify-content:center;padding:80rpx 64rpx 10rpx;text-align:center}.guide-visual{position:relative;display:flex;width:320rpx;height:220rpx;align-items:center;justify-content:center;background:#e5f0f6;border:2rpx solid #bed5e3;border-left:8rpx solid var(--color-action-primary);border-radius:var(--radius-md)}.guide-visual::after{display:none}.guide-slide strong{margin-top:46rpx;color:var(--color-text-primary);font-size:38rpx;line-height:52rpx;font-weight:650}.guide-slide text{max-width:590rpx;margin-top:16rpx;color:var(--color-text-secondary);font-size:24rpx;line-height:38rpx}.guide-footer{padding:20rpx 32rpx calc(32rpx + env(safe-area-inset-bottom))}.guide-dots{display:flex;justify-content:center;gap:10rpx;margin-bottom:26rpx}.guide-dots i{width:12rpx;height:12rpx;background:var(--ss-neutral-300);border-radius:999rpx;transition:width .2s}.guide-dots i.active{width:36rpx;background:var(--color-action-primary)}.guide-footer .btn{width:100%;height:88rpx}
.guide-page { background: #fff; }.guide-skip { top: calc(var(--ss-status-bar-height) + 8px); right: 20px; height: 44px; font-size: 14px; }
.guide-slide { padding: 64px 28px 12px; }.guide-visual { width: 180px; height: 140px; background: var(--ss-brand-50); border: 0; border-radius: 8px; }
.guide-slide strong { margin-top: 28px; font-size: 24px; line-height: 34px; }.guide-slide text { margin-top: 12px; font-size: 14px; line-height: 24px; }
.guide-footer { padding: 20px 20px calc(24px + env(safe-area-inset-bottom)); }.guide-footer .btn { height: 48px; font-size: 15px; border-radius: 8px; }
</style>
