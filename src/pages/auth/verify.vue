<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import { backOrFallback } from '@/utils/navigation'
import { useAppStore } from '@/stores/app'
import { storage } from '@/services/storage'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const target = ref('138****2861')
const purpose = ref('register')
const sessionId = ref('')
const codeInput = ref('82')
const countdown = ref(59)
let timer: ReturnType<typeof setInterval> | null = null
const code = computed(() => codeInput.value.replace(/\D/g, '').slice(0, 6))
const digits = computed(() => Array.from({ length: 6 }, (_, index) => code.value[index] || ''))
const isWechatDesignCase = computed(() => store.designCaseId === 'A09')

onLoad(async (query) => {
  await store.init()
  target.value = String(query?.target || target.value)
  purpose.value = String(query?.purpose || 'register')
  sessionId.value = String(query?.sessionId || '')
  if (purpose.value === 'wechat' && target.value.includes('*')) target.value = '13800002861'
  timer = setInterval(() => { if (countdown.value > 0) countdown.value -= 1 }, 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })

function fillCode() { codeInput.value = '826104' }
async function resend() {
  try {
    const session = await store.startVerification(target.value, purpose.value as 'register' | 'forgot' | 'wechat', purpose.value === 'wechat' ? { provider: 'WeChat', region: 'CN' } : undefined)
    sessionId.value = session.id
    countdown.value = 59
    uni.showToast({ title: l('验证会话已重新创建', 'Verification session recreated'), icon: 'success' })
  } catch {
    uni.showToast({ title: l('当前验证会话已保留', 'The current verification session was retained'), icon: 'none' })
  }
}
async function submit() {
  if (code.value.length !== 6) return uni.showToast({ title: l('请输入 6 位验证码', 'Enter the 6-digit code'), icon: 'none' })
  if (!sessionId.value) {
    return uni.showToast({ title: l('验证会话无效，请重新获取验证码', 'The verification session is invalid. Request a new code.'), icon: 'none' })
  }
  try {
    await store.verify(sessionId.value, code.value)
    uni.showToast({ title: l('验证成功', 'Verified'), icon: 'success' })
    setTimeout(() => {
      if (purpose.value === 'forgot') return uni.redirectTo({ url: `/pages/auth/password?mode=reset&sessionId=${sessionId.value}` })
      const destination = storage.get<string>('shark-sister-login-target') || '/pages/shell/index'
      storage.remove('shark-sister-login-target')
      uni.reLaunch({ url: destination })
    }, 450)
  } catch {
    uni.showToast({ title: l('验证码不正确或已过期', 'The verification code is invalid or expired'), icon: 'none' })
  }
}
</script>

<template>
  <view class="page verify-page">
    <SsAppBar :title="isWechatDesignCase ? l('绑定手机号','Link mobile') : l('验证码确认','Verify code')" fallback-url="/pages/auth/login" :hide-back="isWechatDesignCase" />
    <scroll-view v-if="isWechatDesignCase" scroll-y class="page-scroll wechat-bind-scroll">
      <view class="wechat-success-icon"><SsIcon name="message-circle" :size="38" tone="success" /></view>
      <text class="wechat-bind-title">{{ l('微信授权成功','WeChat authorized') }}</text><text class="wechat-bind-copy">{{ l('绑定手机号后即可完成账号创建，并用于登录验证与售后联系。','Link a mobile number to create the account and use it for sign-in verification and service contact.') }}</text>
      <view class="card wechat-bind-form"><view class="field"><text class="field-label">{{ l('手机号','Mobile') }}</text><view class="field-control active"><SsIcon name="smartphone" :size="18" tone="muted" /><text>138 0000 2861</text><button>{{ l('获取验证码','Get code') }}</button></view></view><view class="field"><text class="field-label">{{ l('短信验证码','SMS code') }}</text><view class="field-control"><SsIcon name="message-square-text" :size="18" tone="muted" /><input v-model="codeInput" :placeholder="l('请输入 6 位验证码','Enter 6-digit code')" /></view></view></view>
      <view class="notice wechat-purpose"><SsIcon name="shield-check" :size="18" tone="brand-strong" /><view><strong>{{ l('手机号用途','How mobile is used') }}</strong><text>{{ l('用于账号安全验证和售后联系，不会公开展示。','Used for account verification and service contact. It is never shown publicly.') }}</text></view></view>
      <button class="btn primary wechat-bind-submit" @click="submit"><SsIcon name="check" :size="18" tone="inverse" />{{ l('绑定并完成注册','Link and finish registration') }}</button>
    </scroll-view>
    <scroll-view v-else scroll-y class="page-scroll">
      <view class="verify-icon"><SsIcon name="shield-check" :size="36" tone="default" /></view>
      <text class="verify-title">{{ l('输入验证码','Enter verification code') }}</text>
      <text class="verify-copy">{{ l('验证账号','Verification target') }}：{{ target }}</text>
      <view class="code-inputs" @click="fillCode"><view v-for="(digit, index) in digits" :key="index" class="code-box" :class="{ focus: index === code.length }">{{ digit }}</view></view>
      <input v-model="codeInput" class="code-native" type="number" maxlength="6" :placeholder="l('输入 6 位验证码','Enter the 6-digit code')" />
      <text class="code-tip" @click="fillCode">{{ l('验证码 826104，点击可自动填入','Verification code 826104. Tap to fill automatically') }}</text>
      <button class="btn primary" :disabled="code.length !== 6" @click="submit">{{ l('确认验证','Verify') }}</button>
      <view class="resend"><text v-if="countdown">{{ l(`${countdown} 秒后可重新发送`,`Resend in ${countdown}s`) }}</text><text v-else class="link" @click="resend">{{ l('重新发送验证码','Resend code') }}</text></view>
      <view class="change-account" @click="backOrFallback('/pages/auth/login')">{{ l('更换账号','Use another account') }}</view>
    </scroll-view>
  </view>
</template>

<style scoped>
.verify-page { background: #fff; }
.page-scroll { padding-top: 64rpx; text-align: center; }
.verify-icon { display: flex; width: 128rpx; height: 128rpx; align-items: center; justify-content: center; margin: 0 auto; background: var(--color-action-primary-subtle); border-radius: 28rpx; }
.verify-title { display: block; margin-top: 32rpx; font-size: 40rpx; line-height: 56rpx; font-weight: 600; }
.verify-copy { display: block; margin-top: 12rpx; color: var(--color-text-secondary); font-size: 26rpx; }
.code-inputs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12rpx; margin: 56rpx 0 16rpx; }
.code-box { display: flex; height: 92rpx; align-items: center; justify-content: center; background: var(--color-bg-canvas); border: 2rpx solid var(--color-border-subtle); border-radius: 14rpx; font-size: 36rpx; font-weight: 600; }
.code-box.focus { border-color: var(--color-action-primary); box-shadow: 0 0 0 6rpx rgba(40,114,248,.09); }
.code-native { width: 100%; height: 88rpx; margin-bottom: 16rpx; text-align: center; background: var(--color-bg-canvas); border: 2rpx solid var(--color-border-subtle); border-radius: 14rpx; font-size: 30rpx; letter-spacing: 0; }
.code-tip { display: block; margin-bottom: 48rpx; color: var(--color-text-secondary); font-size: 22rpx; }
.resend, .change-account { margin-top: 28rpx; color: var(--color-text-secondary); font-size: 24rpx; }
.link, .change-account { color: var(--color-action-primary); }
.wechat-bind-scroll { padding-top:48rpx;text-align:center; }.wechat-success-icon { display:flex;width:136rpx;height:136rpx;align-items:center;justify-content:center;margin:0 auto;background:var(--ss-green-50);border:2rpx solid var(--ss-green-200);border-radius:50%; }.wechat-bind-title { display:block;margin-top:24rpx;font-size:30rpx;font-weight:600; }.wechat-bind-copy { display:block;max-width:600rpx;margin:12rpx auto 44rpx;color:var(--color-text-secondary);font-size:22rpx;line-height:34rpx; }.wechat-bind-form { padding:28rpx;text-align:left;box-shadow:none; }.wechat-bind-form .field { margin-bottom:24rpx; }.wechat-bind-form .field:last-child { margin-bottom:0; }.wechat-bind-form .field-control { min-height:84rpx; }.wechat-bind-form .field-control.active { border-color:var(--color-action-primary);box-shadow:0 0 0 6rpx rgba(40,114,248,.08); }.wechat-bind-form .field-control > text,.wechat-bind-form .field-control > input { min-width:0;flex:1; }.wechat-bind-form .field-control button { padding:0;color:var(--color-action-primary);background:transparent;border:0;font-size:21rpx;font-weight:600; }.wechat-purpose { margin-top:24rpx;text-align:left; }.wechat-purpose strong,.wechat-purpose text { display:block; }.wechat-purpose text { margin-top:4rpx; }.wechat-bind-submit { width:100%;margin-top:30rpx; }
.page-scroll { padding-top:48rpx; }.verify-icon { width:64rpx;height:64rpx;background:transparent;border:2rpx solid var(--ss-brand-200);border-radius:50%; }.verify-title { margin-top:24rpx;font-size:34rpx;line-height:48rpx;font-weight:650; }.code-inputs { margin-top:44rpx; }.code-box,.code-native { border-radius:var(--radius-md); }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
