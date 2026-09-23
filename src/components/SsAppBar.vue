<script setup lang="ts">
import SsIcon from './SsIcon.vue'
import SsStatusBar from './SsStatusBar.vue'
import SsDesignParity from './SsDesignParity.vue'
import SsAuthRequired from './SsAuthRequired.vue'
import { useAppStore } from '@/stores/app'
import { backOrFallback } from '@/utils/navigation'

const props = withDefaults(defineProps<{ title: string; back?: boolean; interceptBack?: boolean; fallbackUrl?: string; rightIcon?: string; rightText?: string; rightLabel?: string }>(), { back: true, interceptBack: false, fallbackUrl: '/pages/shell/index', rightIcon: '', rightText: '', rightLabel: '' })
const emit = defineEmits<{ (e: 'right'): void; (e: 'back'): void }>()
const store = useAppStore()
const goBack = () => props.interceptBack ? emit('back') : backOrFallback(props.fallbackUrl)
</script>

<template>
  <SsAuthRequired />
  <SsDesignParity v-if="store.designParityVisible && store.designCaseId" :id="store.designCaseId" />
  <SsStatusBar />
  <view class="app-bar">
    <button v-if="props.back" class="app-action" :aria-label="$t('common.back')" @click="goBack">
      <SsIcon name="chevron-left" :size="20" tone="default" />
    </button>
    <view v-else class="app-action-placeholder" aria-hidden="true" />
    <text class="app-title">{{ title }}</text>
    <button v-if="rightIcon || rightText" class="app-action right" :aria-label="rightLabel || rightText || undefined" @click="emit('right')">
      <SsIcon v-if="rightIcon" :name="rightIcon" :size="20" tone="default" />
      <text v-else-if="rightText">{{ rightText }}</text>
    </button>
    <view v-else class="app-action-placeholder" aria-hidden="true" />
  </view>
</template>

<style scoped lang="scss">
.app-bar { position: relative; z-index: 20; display: grid; height: 52px; flex:0 0 52px; grid-template-columns: 48px minmax(0,1fr) 48px; align-items: center; padding: 0; background: #fff; border-bottom:1px solid var(--color-divider); }
.app-title { overflow: hidden; font-size: 17px; line-height: 24px; font-weight: 650; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.app-action { display: flex; width: 48px; height: 48px; align-items: center; justify-content: center; color: var(--color-text-body); background: transparent; border: 0; }
.app-action:active { background: var(--color-bg-subtle); }
.app-action-placeholder { width: 48px; height: 48px; pointer-events: none; }
.app-action.right { color: var(--color-action-primary); font-size: 13px; font-weight: 600; }
</style>
