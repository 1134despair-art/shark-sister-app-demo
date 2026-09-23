<script setup lang="ts">
import SsIcon from './SsIcon.vue'
withDefaults(defineProps<{ show: boolean; title: string; description?: string; icon?: string; tone?: 'info' | 'danger' | 'success' | 'warning'; confirmText?: string; cancelText?: string; hideCancel?: boolean }>(), { description: '', icon: 'info', tone: 'info', confirmText: '', cancelText: '', hideCancel: false })
defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <view v-if="show" class="modal-layer" @click.self="$emit('cancel')">
    <view class="modal" role="dialog" aria-modal="true" :aria-label="title">
      <view class="modal-icon" :class="tone"><SsIcon :name="icon" :size="30" :tone="tone === 'info' ? 'brand' : tone" /></view>
      <text class="modal-title">{{ title }}</text>
      <text v-if="description" class="modal-copy">{{ description }}</text>
      <slot />
      <view class="button-row modal-actions" :class="{ single: hideCancel }">
        <button v-if="!hideCancel" class="btn" @click="$emit('cancel')">{{ cancelText || $t('common.cancel') }}</button>
        <button class="btn" :class="tone === 'danger' ? 'danger' : 'primary'" @click="$emit('confirm')">{{ confirmText || $t('common.confirm') }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.modal-layer { position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center; padding: 48rpx; background: rgba(15,36,58,.5); }
.modal { width:100%;max-width:620rpx;padding:34rpx 30rpx 30rpx;background:#fff;border:2rpx solid rgba(255,255,255,.7);border-radius:var(--radius-lg);box-shadow:var(--shadow-modal);text-align:left; }
.modal-icon { display:flex;width:64rpx;height:64rpx;align-items:center;justify-content:center;margin:0 0 18rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:var(--radius-sm); }
.modal-icon.danger { background:var(--ss-red-50); }.modal-icon.success { background:var(--ss-green-50); }.modal-icon.warning { background:var(--ss-orange-50); }
.modal-title { display:block;font-size:32rpx;line-height:44rpx;font-weight:650; }
.modal-copy { display:block;margin-top:12rpx;color:var(--color-text-secondary);font-size:24rpx;line-height:36rpx; }
.modal-actions { margin-top:32rpx; }
.modal-actions.single { grid-template-columns: 1fr; }
</style>

<style scoped lang="scss">
@import '@/styles/overlay-surfaces.scss';
</style>
