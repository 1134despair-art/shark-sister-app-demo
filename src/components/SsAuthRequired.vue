<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import SsModal from './SsModal.vue'
import { onAuthRequired } from '@/services/routeGuard'
import type { LocaleCode } from '@/types/models'

const show = ref(false)
const locale = ref<LocaleCode>('zh-Hans')
const unsubscribe = onAuthRequired((request) => {
  locale.value = request.locale
  show.value = true
})

function continueTo(path: '/pages/auth/login' | '/pages/auth/register') {
  show.value = false
  uni.reLaunch({ url: path })
}

onBeforeUnmount(unsubscribe)
</script>

<template>
  <SsModal
    :show="show"
    :title="locale !== 'zh-Hans' ? 'Sign In Required' : '需要登录'"
    :description="locale !== 'zh-Hans' ? 'Sign in to continue this operation. Public devices, maps, and help remain available in guest mode.' : '当前操作需要登录账号；游客仍可查看公开设备、地图和帮助。'"
    icon="circle-help"
    tone="warning"
    :confirm-text="locale !== 'zh-Hans' ? 'Sign in' : '登录账号'"
    :cancel-text="locale !== 'zh-Hans' ? 'Create account' : '注册账号'"
    @confirm="continueTo('/pages/auth/login')"
    @cancel="continueTo('/pages/auth/register')"
  />
</template>
