<script setup lang="ts">
import { computed, ref } from 'vue'
import SsIcon from './SsIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Device } from '@/types/models'
import deviceTopflowImage from '@/static/assest/home/device-topflow-v2.png'

const props = defineProps<{ devices: Device[] }>()
const emit = defineEmits<{ (e: 'devices'): void; (e: 'waypoints'): void; (e: 'service'): void }>()
const store = useAppStore()
const current = ref(0)
const interacting = ref(false)
const l = (zh: string, en: string) => store.locale === 'zh-Hans' ? zh : en
const connected = computed(() => props.devices.filter((item) => item.connectionState === 'connected').length)
const deviceIds = computed(() => new Set(props.devices.map(item => item.id)))
const serviceCount = computed(() => (store.db?.tickets || []).filter(item => item.ownerId === store.account?.id || Boolean(item.deviceId && deviceIds.value.has(item.deviceId))).length)
const slides = computed(() => [
  { key: 'devices', title: l('我的设备', 'My devices'), copy: l('探索智能船舶设备，实时掌握运行状态', 'Explore connected marine devices and live status'), action: l('进入设备', 'Open device'), status: l(`${connected.value} 台设备已连接`, `${connected.value} devices connected`), icon: 'link-2', photo: deviceTopflowImage, skin: 'equipment' },
  { key: 'waypoints', title: l('海图航点', 'Charts and waypoints'), copy: l('查看位置、方向、航点与偏差距离', 'View location, heading, waypoints, and offset'), action: l('查看海图', 'View chart'), status: l('航行信息已同步', 'Navigation data synced'), icon: 'route', photo: '', skin: 'navigation' },
  { key: 'service', title: l('售后服务', 'Service & support'), copy: l('专业售后快速响应，全程跟进处理进度', 'Fast professional support with progress tracking'), action: l('申请报修', 'Request service'), status: l(`${serviceCount.value} 条服务记录`, `${serviceCount.value} service records`), icon: 'wrench', photo: '', skin: 'support' },
])

function open(key: string) {
  if (key === 'devices') emit('devices')
  else if (key === 'waypoints') emit('waypoints')
  else emit('service')
}
function change(event: { detail: { current: number } }) { current.value = event.detail.current }
</script>

<template>
  <view class="home-carousel" role="region" :aria-label="l('首页轮播', 'Home carousel')" @mouseenter="interacting = true" @mouseleave="interacting = false" @touchstart="interacting = true" @touchend="interacting = false">
    <swiper class="home-carousel-track" :current="current" :autoplay="!interacting" :interval="5500" :duration="420" circular @change="change">
      <swiper-item v-for="(slide, index) in slides" :key="slide.key">
        <button class="home-slide" :class="slide.skin" :aria-label="slide.title + '，' + slide.action" :tabindex="current === index ? 0 : -1" @click="open(slide.key)">
          <view class="home-slide-copy">
            <view class="home-slide-status"><i />{{ slide.status }}</view>
            <strong>{{ slide.title }}</strong>
            <text>{{ slide.copy }}</text>
            <view class="home-slide-action"><SsIcon :name="slide.icon" :size="16" tone="inverse" /><text>{{ slide.action }}</text></view>
          </view>
          <view class="home-slide-art" :class="{ 'icon-art': !slide.photo }" aria-hidden="true"><image v-if="slide.photo" :src="slide.photo" mode="aspectFill" /><SsIcon v-else :name="slide.icon" :size="50" :tone="slide.skin === 'support' ? 'warning' : 'brand'" /></view>
        </button>
      </swiper-item>
    </swiper>
    <view class="home-carousel-page"><text>{{ current + 1 }} / {{ slides.length }}</text><view><i v-for="(_, index) in slides" :key="index" :class="{ active: current === index }" /></view></view>
  </view>
</template>

<style scoped>
.home-carousel { position:relative;padding:12px 18px 0;background:linear-gradient(180deg,var(--ss-brand-100) 0%,rgba(238,245,255,0) 100%); }
.home-carousel-track { display:block;width:100%;height:184px;overflow:hidden;border-radius:8px;box-shadow:0 12px 30px rgba(31,96,217,.16); }
.home-slide { position:relative;display:flex;width:100%;height:184px;overflow:hidden;align-items:center;justify-content:space-between;gap:8px;padding:22px 20px;text-align:left;background:linear-gradient(135deg,#f6fbff 0%,#dcecff 54%,#b8d8ff 100%);border:1px solid rgba(255,255,255,.9); }
.home-slide::before { position:absolute;inset:0;content:'';background:url('../static/assest/backgrounds/home-hero.png') right center/cover no-repeat;opacity:.42; }
.home-slide.navigation { background:linear-gradient(135deg,#f5fbff 0%,#e0f0ff 56%,#c9dcff 100%); }.home-slide.support { background:linear-gradient(135deg,#fffdf9 0%,#fff1df 55%,#dcecff 100%); }
.home-slide-copy { position:relative;z-index:2;min-width:0;flex:1; }.home-slide-status { display:flex;align-items:center;gap:7px;color:#1c5cae;font-size:12px;font-weight:600; }.home-slide-status i { width:9px;height:9px;background:#22c58b;border:3px solid rgba(34,197,139,.18);border-radius:50%;box-sizing:content-box; }
.home-slide-copy strong { display:block;margin-top:12px;color:var(--color-text-primary);font-size:27px;line-height:34px;font-weight:750; }.home-slide-copy > text { display:block;max-width:225px;margin-top:5px;color:var(--color-text-secondary);font-size:12px;line-height:18px; }
.home-slide-action { display:inline-flex;height:34px;align-items:center;gap:7px;margin-top:12px;padding:0 14px;color:#fff;background:linear-gradient(100deg,var(--ss-brand-600),var(--ss-brand-400));border-radius:17px;font-size:12px;font-weight:650;box-shadow:0 8px 18px rgba(31,96,217,.20); }
.home-slide-art { position:relative;z-index:2;display:flex;width:120px;height:120px;flex:0 0 120px;align-items:center;justify-content:center;overflow:hidden;background:rgba(255,255,255,.36);border:1px solid rgba(255,255,255,.8);border-radius:50%;box-shadow:0 14px 28px rgba(45,103,181,.15); }.home-slide-art::after { position:absolute;right:10px;bottom:4px;left:10px;height:16px;content:'';background:rgba(55,118,213,.2);border-radius:50%;filter:blur(7px); }.home-slide-art image { position:relative;z-index:1;width:96px;height:96px;border-radius:50%; }.home-slide-art.icon-art { width:102px;height:102px;flex-basis:102px;background:rgba(255,255,255,.74); }.home-slide-art.icon-art :deep(.ss-icon) { position:relative;z-index:1; }
.home-carousel-page { position:absolute;z-index:4;top:24px;right:30px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;color:#fff;font-size:12px;text-shadow:0 1px 4px rgba(31,71,124,.3); }.home-carousel-page > view { display:flex;gap:5px; }.home-carousel-page i { display:block;width:6px;height:6px;background:rgba(255,255,255,.55);border-radius:50%; }.home-carousel-page i.active { width:17px;background:#fff;border-radius:4px; }
@media (max-width:370px) { .home-carousel { padding-right:14px;padding-left:14px; }.home-slide { padding-right:15px;padding-left:17px; }.home-slide-art { width:104px;height:104px;flex-basis:104px; }.home-slide-copy strong { font-size:24px; }.home-slide-copy > text { max-width:195px; } }
</style>
