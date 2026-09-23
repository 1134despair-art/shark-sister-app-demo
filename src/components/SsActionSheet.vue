<script setup lang="ts">
import SsIcon from './SsIcon.vue'

interface ActionSheetItem {
  key: string
  label: string
  description?: string
  icon: string
  tone?: 'default' | 'warning' | 'danger'
  disabled?: boolean
}

withDefaults(defineProps<{ show: boolean; title: string; items: ActionSheetItem[]; cancelText?: string }>(), { cancelText: '' })
defineEmits<{ (e: 'select', key: string): void; (e: 'cancel'): void }>()
</script>

<template>
  <view v-if="show" class="action-sheet-layer" @click.self="$emit('cancel')">
    <view class="action-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <view class="sheet-handle" />
      <view class="sheet-heading">
        <text>{{ title }}</text>
        <button class="icon-button" :aria-label="$t('common.cancel')" @click="$emit('cancel')"><SsIcon name="x" :size="20" tone="muted" /></button>
      </view>
      <scroll-view scroll-y class="sheet-options">
        <button v-for="item in items" :key="item.key" class="sheet-option" :class="item.tone || 'default'" :data-action-key="item.key" :disabled="item.disabled" @click="$emit('select', item.key)">
          <view class="sheet-option-icon"><SsIcon :name="item.icon" :size="22" :tone="item.tone === 'danger' ? 'danger' : item.tone === 'warning' ? 'warning' : 'brand'" /></view>
          <view class="sheet-option-copy"><text>{{ item.label }}</text><span v-if="item.description">{{ item.description }}</span></view>
          <SsIcon name="chevron-right" :size="18" tone="muted" />
        </button>
      </scroll-view>
      <button class="btn subtle sheet-cancel" @click="$emit('cancel')">{{ cancelText || $t('common.cancel') }}</button>
    </view>
  </view>
</template>

<style scoped>
.action-sheet-layer { position:fixed;z-index:90;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,36,58,.48); }
.action-sheet { width:100%;max-width:780rpx;padding:12rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));background:var(--color-bg-surface);border-radius:20rpx 20rpx 0 0;box-shadow:var(--shadow-modal);box-sizing:border-box; }
.sheet-handle { width:72rpx;height:8rpx;margin:0 auto 18rpx;background:var(--ss-neutral-300);border-radius:999rpx; }
.sheet-heading { display:flex;min-height:82rpx;align-items:center;justify-content:space-between;gap:20rpx;padding:0 0 14rpx;border-bottom:2rpx solid var(--color-divider); }
.sheet-heading > text { min-width:0;overflow:hidden;color:var(--color-text-primary);font-size:30rpx;font-weight:600;text-overflow:ellipsis;white-space:nowrap; }
.sheet-heading .icon-button { display:flex;width:88rpx;height:88rpx;flex:0 0 88rpx;align-items:center;justify-content:flex-end;color:var(--color-icon-secondary); }
.sheet-options { max-height:min(680rpx,52vh); }
.sheet-option { display:flex;width:100%;min-height:112rpx;align-items:center;gap:18rpx;padding:14rpx 8rpx;color:var(--color-text-body);background:transparent;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;text-align:left;box-sizing:border-box;transition:background-color .12s ease; }
.sheet-option:active { background:var(--color-bg-subtle); }
.sheet-option::after { display:none; }
.sheet-option-icon { display:flex;width:52rpx;height:52rpx;flex:0 0 52rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:transparent; }
.sheet-option-copy { min-width:0;flex:1; }
.sheet-option-copy text,.sheet-option-copy span { display:block; }
.sheet-option-copy text { color:var(--color-text-primary);font-size:25rpx;font-weight:600; }
.sheet-option-copy span { margin-top:5rpx;color:var(--color-text-secondary);font-size:20rpx;line-height:30rpx; }
.sheet-option.warning .sheet-option-icon { color:var(--ss-orange-700);background:transparent; }
.sheet-option.danger .sheet-option-icon { color:var(--ss-red-700);background:transparent; }
.sheet-option.danger .sheet-option-copy text { color:var(--ss-red-700); }
.sheet-option:disabled { opacity:.45; }
.sheet-cancel { width:100%;margin-top:20rpx; }
</style>

<style scoped lang="scss">
@import '@/styles/overlay-surfaces.scss';
</style>
