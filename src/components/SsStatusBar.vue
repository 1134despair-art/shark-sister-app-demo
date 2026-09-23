<script setup lang="ts">
withDefaults(defineProps<{ immersive?: boolean; tone?: 'brand' | 'navy' }>(), { immersive: false, tone: 'brand' })
</script>

<template>
  <view class="ss-status-bar" :class="[{ immersive }, tone]" aria-hidden="true">
    <!-- #ifdef H5 -->
    <text class="status-time">9:41</text>
    <view class="status-system">
      <i class="signal"><b /><b /><b /><b /></i>
      <i class="wifi" />
      <i class="battery"><b /></i>
    </view>
    <!-- #endif -->
  </view>
</template>

<style scoped>
.ss-status-bar { position: relative; z-index: 24; display: flex; height: var(--ss-status-bar-height); flex: 0 0 var(--ss-status-bar-height); align-items: flex-end; justify-content: space-between; padding: 0 22px 5px; box-sizing: border-box; color: var(--color-text-primary); background: #fff; }
.status-time { font-size: 12px; line-height: 1; font-weight: 700; letter-spacing: 0; }
.status-system { display: flex; height: 12px; align-items: center; gap: 5px; }
.status-system i { position: relative; display: block; box-sizing: border-box; }
.signal { display: flex !important; height: 10px; align-items: flex-end; gap: 1px; }
.signal b { display: block; width: 2px; background: currentColor; border-radius: 1px; }
.signal b:nth-child(1) { height: 3px; }.signal b:nth-child(2) { height: 5px; }.signal b:nth-child(3) { height: 7px; }.signal b:nth-child(4) { height: 9px; }
.wifi { width: 11px; height: 8px; overflow: hidden; border: 1.5px solid currentColor; border-top-color: transparent; border-left-color: transparent; border-radius: 0 0 10px 0; transform: rotate(45deg); }
.wifi::after { position: absolute; right: -1px; bottom: -1px; width: 3px; height: 3px; content: ''; background: currentColor; border-radius: 50%; }
.battery { width: 18px; height: 9px; padding: 1px; border: 1px solid currentColor; border-radius: 2px; }
.battery::after { position: absolute; top: 2px; right: -3px; width: 2px; height: 4px; content: ''; background: currentColor; border-radius: 0 1px 1px 0; }
.battery b { display: block; width: 12px; height: 5px; background: currentColor; border-radius: 1px; }
.ss-status-bar.immersive { color:#fff;background:var(--ss-brand-gradient); }
.ss-status-bar.immersive.navy { background:var(--ss-brand-gradient); }
</style>
