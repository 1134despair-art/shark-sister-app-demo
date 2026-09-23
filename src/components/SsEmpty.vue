<script setup lang="ts">
import SsIcon from './SsIcon.vue'
withDefaults(defineProps<{ title?: string; description?: string; icon?: string; action?: string }>(), { title: '', description: '', icon: 'inbox', action: '' })
defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <view class="empty">
    <view class="empty-icon"><SsIcon :name="icon" :size="34" tone="brand" /></view>
    <text class="empty-title">{{ title || $t('common.noData') }}</text>
    <text v-if="description" class="empty-copy">{{ description }}</text>
    <button v-if="action" class="btn subtle small" @click="$emit('action')">{{ action }}</button>
  </view>
</template>

<style scoped>
.empty { display: flex; min-height: 360rpx; flex-direction: column; align-items: center; justify-content: center; padding: 52rpx 32rpx; text-align: center; }
.empty-icon { display: flex; width: 72rpx; height: 72rpx; align-items: center; justify-content: center; margin-bottom: 20rpx; color:var(--color-action-primary);background:transparent;border:2rpx solid var(--ss-brand-200);border-radius:50%; }
.empty-title { font-size: 30rpx; font-weight: 600; }
.empty-copy { max-width: 540rpx; margin: 12rpx 0 28rpx; color: var(--color-text-secondary); font-size: 24rpx; line-height: 36rpx; }
</style>

<style scoped lang="scss">
@import '@/styles/overlay-surfaces.scss';
</style>
