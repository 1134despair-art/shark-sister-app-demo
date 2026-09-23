<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const documentId = ref('')
const opening = ref(false)
const frameLoaded = ref(false)
const frameFailed = ref(false)
const frameKey = ref(0)
let frameTimer: ReturnType<typeof setTimeout> | null = null
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const document = computed(() => store.db?.faqDocuments.find((item) => item.id === documentId.value && item.status === 'published'))
const title = computed(() => document.value ? store.locale !== 'zh-Hans' ? document.value.titleEn : document.value.title : l('常见问题', 'FAQ'))

onLoad(async (query) => {
  await store.init()
  documentId.value = String(query?.id || '')
  startFrameTimeout()
})

onUnmounted(() => { if (frameTimer) clearTimeout(frameTimer) })

function startFrameTimeout() {
  frameLoaded.value = false
  frameFailed.value = false
  if (frameTimer) clearTimeout(frameTimer)
  frameTimer = setTimeout(() => { if (!frameLoaded.value) frameFailed.value = true }, 8000)
}

function markFrameLoaded() {
  frameLoaded.value = true
  frameFailed.value = false
  if (frameTimer) clearTimeout(frameTimer)
}

function retryFrame() {
  frameKey.value += 1
  startFrameTimeout()
}

async function openDocument() {
  if (!document.value || opening.value) return
  opening.value = true
  try {
    // #ifdef H5
    window.open(document.value.fileUrl, '_blank', 'noopener,noreferrer')
    // #endif
    // #ifndef H5
    await new Promise<void>((resolve, reject) => uni.openDocument({ filePath: document.value!.fileUrl, fileType: 'pdf', showMenu: true, success: () => resolve(), fail: reject }))
    // #endif
  } catch {
    uni.showModal({ title: l('PDF 无法打开', 'Unable to open PDF'), content: l('请确认文件已由后台发布并随当前版本下发。', 'Confirm that the PDF is published and included in this app version.'), showCancel: false })
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <view class="page pdf-page">
    <SsAppBar :title="title" fallback-url="/pages/manage/list?entity=tickets&mode=hub" />
    <view v-if="!document" class="pdf-empty"><SsIcon name="info" :size="46" tone="default" /><strong>{{ l('PDF 文件不可用','PDF unavailable') }}</strong><text>{{ l('该文档可能已由后台停用或删除。','This document may have been disabled or removed.') }}</text></view>
    <template v-else>
      <!-- #ifdef H5 -->
      <view class="pdf-meta"><view><strong>{{ title }}</strong><text>{{ l('资料版本','Revision') }} {{ document.revision }}</text></view><button @click="openDocument"><SsIcon name="download" :size="17" tone="brand" />{{ l('新窗口打开','Open') }}</button></view>
      <view class="pdf-frame-wrap">
        <iframe :key="frameKey" class="pdf-frame" :src="document.fileUrl" :title="title" @load="markFrameLoaded" />
        <view v-if="!frameLoaded && !frameFailed" class="pdf-state"><SsIcon name="loader-circle" :size="32" tone="brand" /><text>{{ l('正在加载 PDF','Loading PDF') }}</text></view>
        <view v-if="frameFailed" class="pdf-state"><SsIcon name="triangle-alert" :size="38" tone="warning" /><strong>{{ l('PDF 加载时间较长','PDF is taking longer to load') }}</strong><text>{{ l('可重试内嵌预览，或在新窗口打开。','Retry the preview or open it in a new window.') }}</text><button class="btn" @click="retryFrame">{{ l('重新加载','Retry') }}</button></view>
      </view>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <view class="pdf-open-card card"><view class="pdf-icon"><SsIcon name="download" :size="36" tone="brand" /></view><strong>{{ title }}</strong><text>{{ document.fileName }}</text><text>{{ l('资料版本','Document revision') }} {{ document.revision }}</text><button class="btn primary" :disabled="opening" @click="openDocument"><SsIcon name="download" :size="18" tone="inverse" />{{ opening ? l('正在打开','Opening') : l('打开 PDF','Open PDF') }}</button></view>
      <!-- #endif -->
    </template>
  </view>
</template>

<style scoped>
.pdf-page { overflow:hidden;background:#eef3f9; }.pdf-meta{display:flex;height:82rpx;box-sizing:border-box;align-items:center;justify-content:space-between;padding:0 24rpx;background:#fff;border-bottom:2rpx solid var(--color-divider)}.pdf-meta view,.pdf-meta strong,.pdf-meta text{display:block}.pdf-meta strong{max-width:500rpx;overflow:hidden;font-size:22rpx;text-overflow:ellipsis;white-space:nowrap}.pdf-meta text{margin-top:2rpx;color:var(--color-text-secondary);font-size:18rpx}.pdf-meta button{display:flex;height:58rpx;align-items:center;gap:8rpx;padding:0 16rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:0;border-radius:8rpx;font-size:20rpx}.pdf-frame-wrap{position:relative;height:calc(100% - var(--app-bar-height, 104rpx) - 82rpx);background:#fff}.pdf-frame { display:block;width:100%;height:100%;border:0;background:#fff; }.pdf-state{position:absolute;inset:0;display:flex;align-items:center;flex-direction:column;justify-content:center;gap:16rpx;padding:44rpx;background:#fff;text-align:center}.pdf-state strong{font-size:28rpx}.pdf-state text{color:var(--color-text-secondary);font-size:22rpx;line-height:34rpx}.pdf-state .btn{min-width:220rpx}.pdf-empty,.pdf-open-card { display:flex;min-height:520rpx;flex-direction:column;align-items:center;justify-content:center;gap:16rpx;margin:30rpx;padding:36rpx;text-align:center;box-sizing:border-box; }.pdf-empty strong,.pdf-open-card strong { font-size:30rpx; }.pdf-empty text,.pdf-open-card text { color:var(--color-text-secondary);font-size:22rpx;line-height:34rpx; }.pdf-icon { display:flex;width:96rpx;height:96rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:18rpx; }.pdf-open-card .btn { width:100%;margin-top:20rpx; }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
