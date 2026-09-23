<script setup lang="ts">
withDefaults(defineProps<{ status: string; label?: string }>(), { label: '' })
</script>

<template>
  <view class="status" :class="status"><text class="dot" />{{ label || status }}</view>
</template>

<style scoped>
.status { display:inline-flex;height:40rpx;align-items:center;gap:8rpx;padding:0 12rpx;color:var(--color-text-secondary);background:var(--color-bg-subtle);border-radius:999rpx;font-size:20rpx;font-weight:600;white-space:nowrap; }
.dot { width:10rpx;height:10rpx;background:var(--ss-neutral-400);border-radius:50%; }
.status.online, .status.completed, .status.enabled, .status.paid, .status.active, .status.approved, .status.received { color: var(--ss-green-700); background: var(--ss-green-50); }
.status.online .dot, .status.completed .dot, .status.enabled .dot, .status.paid .dot, .status.active .dot, .status.approved .dot, .status.received .dot { background: var(--ss-green-500); }
.status.warning, .status.pending, .status.processing, .status.parts, .status.shipping, .status.pendingPayment, .status.pendingApproval, .status.partiallyPaid, .status.installing { color: var(--ss-orange-700); background: var(--ss-orange-50); }
.status.warning .dot, .status.pending .dot, .status.processing .dot, .status.parts .dot, .status.shipping .dot, .status.pendingPayment .dot, .status.pendingApproval .dot, .status.partiallyPaid .dot, .status.installing .dot { background: var(--ss-orange-500); }
.status.failed, .status.rejected, .status.disabled { color: var(--ss-red-700); background: var(--ss-red-50); }
.status.failed .dot, .status.rejected .dot, .status.disabled .dot { background: var(--ss-red-500); }
</style>
