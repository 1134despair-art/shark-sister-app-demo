<script setup lang="ts">
import { computed } from 'vue'
import { resolveIconAsset, type IconTone } from '@/config/iconAssets'
import { resolveIconfontGlyph } from '@/config/iconfontMap'
import { resolveIconfontVector } from '@/config/iconfontVectorMap'

const props = withDefaults(defineProps<{ name: string; size?: number; alt?: string; tone?: IconTone }>(), {
  size: 24,
  alt: '',
  tone: undefined,
})
const iconfontGlyph = computed(() => resolveIconfontGlyph(props.name))
const iconfontVector = computed(() => resolveIconfontVector(props.name))
const iconSrc = computed(() => iconfontGlyph.value || iconfontVector.value ? '' : resolveIconAsset(props.name, props.tone))
const iconStyle = computed(() => ({
  width: `${props.size * 2}rpx`,
  height: `${props.size * 2}rpx`,
  fontSize: `${props.size * 2}rpx`,
  lineHeight: `${props.size * 2}rpx`,
  transform: iconfontGlyph.value?.rotate ? `rotate(${iconfontGlyph.value.rotate}deg)` : undefined,
}))
</script>

<template>
  <svg
    v-if="iconfontVector"
    class="ss-icon ss-iconfont-vector"
    :class="`tone-${tone || 'default'}`"
    :viewBox="iconfontVector.viewBox"
    :style="iconStyle"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
  >
    <path v-for="path in iconfontVector.paths" :key="path" :d="path" fill="currentColor" />
  </svg>
  <text
    v-else-if="iconfontGlyph"
    class="ss-icon ss-iconfont"
    :class="[`tone-${tone || 'default'}`, iconfontGlyph.className]"
    :data-glyph="iconfontGlyph.char"
    :style="iconStyle"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
  />
  <image
    v-else
    class="ss-icon"
    :src="iconSrc"
    mode="aspectFit"
    :style="{ width: `${size * 2}rpx`, height: `${size * 2}rpx` }"
    :role="alt ? 'img' : undefined"
    :aria-label="alt || undefined"
    :aria-hidden="alt ? undefined : 'true'"
  />
</template>

<style scoped>
.ss-icon { display: block; flex: 0 0 auto; object-fit: contain; }
.ss-iconfont { display:inline-flex;align-items:center;justify-content:center;color:#344054;font-family:'SharkIconfont' !important;font-style:normal;font-weight:normal;text-align:center;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale; }
.ss-iconfont-vector { color:#344054; }
.ss-iconfont::before { content:attr(data-glyph); }
.tone-muted,.tone-disabled,.tone-offline { color:#667085; }
.tone-inverse { color:#fff; }
.tone-brand,.tone-accent,.tone-support { color:#1f60d9; }
.tone-brand-strong { color:#194db0; }
.tone-success { color:#087a4e; }
.tone-warning,.tone-warning-strong { color:#9a5200; }
.tone-danger { color:#b4232d; }
.is-loading { animation:ss-icon-spin .9s linear infinite; }
@keyframes ss-icon-spin { to { transform:rotate(360deg); } }
</style>
