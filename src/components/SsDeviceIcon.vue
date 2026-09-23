<script setup lang="ts">
import { computed } from 'vue'
import SsIcon from './SsIcon.vue'
import type { IconTone } from '@/config/iconAssets'

const props = withDefaults(defineProps<{ category: string; status?: string; size?: number }>(), {
  status: 'online',
  size: 24,
})

const presentation = computed<{ name: string; tone: IconTone; className: string }>(() => {
  if (props.category.includes('电池') || props.category.toLowerCase().includes('battery')) {
    return { name: 'battery-charging', tone: props.status === 'offline' ? 'offline' : 'warning', className: 'warning' }
  }
  if (props.category.includes('淡化') || props.category.toLowerCase().includes('desal')) {
    return { name: 'droplets', tone: 'success', className: 'success' }
  }
  if (props.category.includes('网络') || props.category.toLowerCase().includes('network')) {
    return { name: 'network', tone: 'accent', className: 'accent' }
  }
  if (props.category.includes('顶流') || props.category.includes('制冰') || props.category.toLowerCase().includes('ice')) {
    return { name: 'fan', tone: props.status === 'warning' ? 'warning' : 'brand', className: props.status === 'warning' ? 'warning' : 'brand' }
  }
  return { name: 'cpu', tone: 'brand', className: 'brand' }
})
</script>

<template>
  <view class="device-icon" :class="presentation.className">
    <SsIcon :name="presentation.name" :size="size" :tone="presentation.tone" />
  </view>
</template>

<style scoped>
.device-icon { display:flex;width:100%;height:100%;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:inherit; }
.device-icon.success { background:var(--ss-green-50); }
.device-icon.warning { background:var(--ss-orange-50); }
.device-icon.accent { background:var(--ss-purple-50); }
</style>
