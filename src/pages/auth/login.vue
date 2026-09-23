<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useI18n } from 'vue-i18n'
import SsIcon from '@/components/SsIcon.vue'
import SsStatusBar from '@/components/SsStatusBar.vue'
import SsDesignParity from '@/components/SsDesignParity.vue'
import SsModal from '@/components/SsModal.vue'
import { brandAssets } from '@/config/iconAssets'
import { getLocaleOption } from '@/config/locales'
import { useAppStore } from '@/stores/app'
import { storage } from '@/services/storage'
import { complianceService } from '@/services/compliance'

const store = useAppStore()
const { t } = useI18n()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const forcedRegion = ref<'CN' | 'GLOBAL' | ''>('')
const selectedRegion = ref<'CN' | 'GLOBAL'>(import.meta.env.VITE_APP_REGION === 'GLOBAL' ? 'GLOBAL' : 'CN')
const state = ref('')
const isGlobal = computed(() => (forcedRegion.value || import.meta.env.VITE_APP_REGION) === 'GLOBAL')
const account = ref(import.meta.env.VITE_APP_REGION === 'GLOBAL' ? 'captain@seawind.com' : '13800002861')
const password = ref('123456')
const loginMode = ref<'password' | 'code' | 'email'>('password')
const verificationCode = ref('')
const verificationSessionId = ref('')
const codeCountdown = ref(0)
const visible = ref(false)
const agreed = ref(false)
const showGuestConfirm = ref(false)
const error = ref('')
const lockedUntil = ref('')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
let codeTimer: ReturnType<typeof setInterval> | null = null
const regionLabel = computed(() => isGlobal.value ? t('auth.global') : t('auth.cn'))
const designLogin = computed(() => ['A02', 'A03'].includes(store.designCaseId))
const loginTitle = computed(() => store.designCaseId === 'A03' ? 'Sign in' : t('auth.title'))
const lockSeconds = computed(() => Math.max(0, Math.ceil((new Date(lockedUntil.value).getTime() - now.value) / 1000)))
const lockText = computed(() => `${Math.floor(lockSeconds.value / 60)}:${String(lockSeconds.value % 60).padStart(2, '0')}`)
const mobileValid = computed(() => /^1\d{10}$/.test(account.value.trim()))
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.value.trim()))
const currentLocaleOption = computed(() => getLocaleOption(store.locale))

onLoad(async (query) => {
  await store.init()
  state.value = String(query?.state || '')
  if (query?.region === 'GLOBAL') forcedRegion.value = 'GLOBAL'
  selectedRegion.value = query?.region === 'GLOBAL' ? 'GLOBAL' : import.meta.env.VITE_APP_REGION === 'GLOBAL' ? 'GLOBAL' : 'CN'
  if (query?.region === 'GLOBAL' || import.meta.env.VITE_APP_REGION === 'GLOBAL') loginMode.value = 'email'
  if (state.value === 'role') fill('13800000028', '123456')
  if (store.account && !state.value && !query?.region) uni.reLaunch({ url: '/pages/shell/index' })
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (codeTimer) clearInterval(codeTimer)
})

function fill(identifier: string, credential: string) {
  account.value = identifier
  password.value = credential
  error.value = ''
}

function enterAfterLogin() {
  const target = storage.get<string>('shark-sister-login-target')
  storage.remove('shark-sister-login-target')
  uni.reLaunch({ url: target || '/pages/shell/index' })
}

async function login() {
  if (!account.value || !password.value || !agreed.value) {
    error.value = !agreed.value ? t('auth.agreementRequired') : t('auth.invalid')
    return
  }
  try {
    const result = await store.login(account.value, password.value)
    complianceService.recordAgreements(result.id, 'login')
    store.refresh()
    if (result.firstLogin) {
      uni.navigateTo({ url: '/pages/auth/password?mode=first' })
    } else {
      enterAfterLogin()
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    if (message.startsWith('ACCOUNT_LOCKED:')) {
      lockedUntil.value = message.slice('ACCOUNT_LOCKED:'.length)
      error.value = t('auth.locked', { time: lockText.value })
    } else if (message === 'ACCOUNT_DISABLED') {
      error.value = isGlobal.value ? 'This account has been disabled. Contact your dealer administrator.' : '该账号已停用，请联系经销商管理员。'
    } else if (message.startsWith('INVALID_CREDENTIALS:')) {
      error.value = t('auth.invalidRemaining', { count: message.split(':')[1] })
    } else error.value = t('auth.invalid')
  }
}

function selectLoginMode(mode: 'password' | 'code' | 'email') {
  loginMode.value = mode
  error.value = ''
  lockedUntil.value = ''
  if (mode === 'code' && !mobileValid.value) account.value = '13800002861'
  if (mode === 'email' && !emailValid.value) account.value = 'captain@seawind.com'
}

async function sendLoginCode() {
  if (!mobileValid.value) {
    error.value = l('请输入有效的 11 位手机号码', 'Enter a valid 11-digit mobile number')
    return
  }
  try {
    const session = await store.startVerification(account.value, 'login')
    verificationSessionId.value = session.id
    verificationCode.value = '826104'
    codeCountdown.value = 60
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = setInterval(() => {
      if (codeCountdown.value > 0) codeCountdown.value -= 1
      else if (codeTimer) clearInterval(codeTimer)
    }, 1000)
    error.value = ''
    uni.showToast({ title: l('验证码已发送', 'Code sent'), icon: 'success' })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    if (message === 'ACCOUNT_NOT_FOUND') error.value = l('该手机号尚未注册', 'This mobile number is not registered')
    else if (message === 'ACCOUNT_DISABLED') error.value = l('该账号已停用', 'This account has been disabled')
    else if (message.startsWith('ACCOUNT_LOCKED:')) {
      lockedUntil.value = message.slice('ACCOUNT_LOCKED:'.length)
      error.value = t('auth.locked', { time: lockText.value })
    } else error.value = l('验证码发送失败，请稍后重试', 'Could not send the code. Try again later')
  }
}

async function loginByCode() {
  if (!agreed.value) return error.value = t('auth.agreementRequired')
  if (!mobileValid.value) return error.value = l('请输入有效的 11 位手机号码', 'Enter a valid 11-digit mobile number')
  if (!verificationSessionId.value) return error.value = l('请先获取验证码', 'Request a verification code first')
  if (verificationCode.value.length !== 6) return error.value = l('请输入 6 位验证码', 'Enter the 6-digit code')
  try {
    const result = await store.loginWithCode(verificationSessionId.value, verificationCode.value)
    complianceService.recordAgreements(result.id, 'login')
    store.refresh()
    if (result.firstLogin) uni.navigateTo({ url: '/pages/auth/password?mode=first' })
    else enterAfterLogin()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : ''
    if (message === 'VERIFICATION_EXPIRED') error.value = l('验证码已过期，请重新获取', 'The code has expired. Request a new one')
    else if (message === 'VERIFICATION_LOCKED') error.value = l('验证码错误次数过多，请重新获取', 'Too many incorrect attempts. Request a new code')
    else if (message === 'VERIFICATION_REQUIRED') error.value = l('验证码已使用，请重新获取', 'This code has been used. Request a new one')
    else error.value = l('验证码不正确', 'Incorrect verification code')
  }
}

function submitLogin() {
  if (loginMode.value === 'code' && !isGlobal.value) return loginByCode()
  if (loginMode.value === 'email' && !emailValid.value) {
    error.value = l('请输入有效邮箱地址', 'Enter a valid email address')
    return
  }
  return login()
}

async function social(provider: 'WeChat' | 'Google' | 'Apple') {
  if (!agreed.value) return error.value = t('auth.agreementRequired')
  uni.showLoading({ title: provider })
  try {
    const result = await store.socialLogin(provider, isGlobal.value ? 'GLOBAL' : 'CN')
    complianceService.recordAgreements(result.id, 'social')
    store.refresh()
    uni.hideLoading()
    uni.showToast({ title: t('auth.authorized'), icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/shell/index' }), 350)
  } catch {
    uni.hideLoading()
    error.value = t('auth.authorizationFailed')
  }
}

function requestGuest() {
  showGuestConfirm.value = true
}

async function enterGuest() {
  showGuestConfirm.value = false
  agreed.value = true
  if (!agreed.value) {
    error.value = t('auth.agreementRequired')
    return
  }
  await store.enterGuest()
  complianceService.recordAgreements('acc-guest', 'guest')
  store.refresh()
  enterAfterLogin()
}

function selectRegion(region: 'CN' | 'GLOBAL') {
  selectedRegion.value = region
}

function continueRegion() {
  const region = selectedRegion.value
  forcedRegion.value = region
  account.value = region === 'GLOBAL' ? 'captain@seawind.com' : '13800002861'
  state.value = ''
}
</script>

<template>
  <view class="login-page" :class="{ 'is-region': state === 'region' }">
    <SsDesignParity v-if="store.designParityVisible && store.designCaseId" :id="store.designCaseId" />
    <scroll-view scroll-y class="login-scroll">
      <view class="auth-hero">
      <SsStatusBar class="auth-status" />
      <view class="auth-top"><text class="region-chip">{{ regionLabel }}</text><text class="language" @click="uni.navigateTo({url:'/pages/profile/settings?section=language'})">{{ currentLocaleOption.shortCode }}</text></view>
      <view class="brand-logo"><image :src="brandAssets.logoGlyph" mode="aspectFit" /></view>
      <text class="brand-name">{{ $t('brand') }}</text>
      <text class="brand-copy">{{ $t('tagline') }}</text>
      </view>

      <view v-if="state === 'region'" class="auth-panel region-panel">
        <text class="auth-title">{{ l('选择服务地区', 'Select Service Region') }}</text>
        <text class="auth-subtitle">{{ l('地区决定登录方式、地图服务与数据存储位置。', 'Your region determines sign-in methods, map services, and data storage.') }}</text>
        <view class="choice-grid">
          <button class="region-choice" :class="{ selected: selectedRegion === 'CN' }" @click="selectRegion('CN')"><SsIcon name="map-pin" :size="20" tone="brand" /><strong>{{ l('中国大陆', 'Mainland China') }}</strong><text>{{ l('手机 / 微信登录', 'Mobile / WeChat') }}</text><span v-if="selectedRegion === 'CN'" class="choice-check"><SsIcon name="check" :size="11" tone="inverse" /></span></button>
          <button class="region-choice" :class="{ selected: selectedRegion === 'GLOBAL' }" @click="selectRegion('GLOBAL')"><SsIcon name="globe-2" :size="20" tone="brand" /><strong>{{ l('其他国家或地区', 'Other Regions') }}</strong><text>{{ l('邮箱 / Google 登录', 'Email / Google') }}</text><span v-if="selectedRegion === 'GLOBAL'" class="choice-check"><SsIcon name="check" :size="11" tone="inverse" /></span></button>
        </view>
        <view class="notice region-notice"><SsIcon name="shield-check" :size="18" tone="brand" /><view class="notice-copy"><strong>{{ l('数据服务说明', 'Data Service') }}</strong><text>{{ l('中国大陆账号使用国内服务；海外账号使用美国服务器与全球 CDN。', 'Mainland China accounts use China services; global accounts use US servers and a global CDN.') }}</text></view></view>
        <button class="btn primary" @click="continueRegion"><SsIcon name="arrow-right" :size="18" tone="inverse" />{{ l('继续', 'Continue') }}</button>
        <button class="btn guest-button" @click="requestGuest">{{ l('以游客身份浏览', 'Continue as Guest') }}</button>
        <view class="legal-copy">{{ l('继续即表示你同意','By continuing, you agree to the ') }}<text class="legal-link" @click="uni.navigateTo({url:'/pages/profile/settings?section=user-agreement&from=login'})">{{ l('《用户协议》','Terms') }}</text>{{ l('和',' and ') }}<text class="legal-link" @click="uni.navigateTo({url:'/pages/profile/settings?section=privacy-policy&from=login'})">{{ l('《隐私政策》','Privacy Policy') }}</text></view>
      </view>

      <view v-else class="auth-panel">
      <text class="auth-title">{{ loginTitle }}</text>

      <view class="login-mode-tabs" :class="{ triple: !isGlobal }">
        <button v-if="!isGlobal" :class="{ active: loginMode === 'password' }" @click="selectLoginMode('password')">{{ l('账号密码', 'Password') }}</button>
        <button v-if="!isGlobal" :class="{ active: loginMode === 'code' }" @click="selectLoginMode('code')">{{ l('验证码', 'Code') }}</button>
        <button :class="{ active: loginMode === 'email' || isGlobal }" @click="selectLoginMode('email')">{{ l('邮箱登录', 'Email') }}</button>
      </view>

      <view class="field">
        <text class="field-label">{{ loginMode === 'email' || isGlobal ? l('邮箱地址', 'Email address') : loginMode === 'code' ? l('手机号', 'Mobile number') : $t('auth.account') }}</text>
        <view class="field-control"><SsIcon :name="loginMode === 'email' || isGlobal ? 'mail' : account.includes('@') ? 'mail' : 'smartphone'" :size="20" tone="default" /><input v-model="account" :type="loginMode === 'code' && !isGlobal ? 'number' : 'text'" :maxlength="loginMode === 'code' && !isGlobal ? 11 : 64" :placeholder="loginMode === 'email' || isGlobal ? 'name@example.com' : loginMode === 'code' ? l('请输入手机号', 'Enter mobile number') : $t('auth.account')" /></view>
      </view>
      <view v-if="loginMode !== 'code' || isGlobal" class="field">
        <view class="field-label"><text>{{ $t('auth.password') }}</text><text class="link" @click="uni.navigateTo({ url: '/pages/auth/password?mode=forgot' })">{{ $t('auth.forgot') }}</text></view>
        <view class="field-control"><SsIcon name="lock-keyhole" :size="20" tone="default" /><input v-model="password" :password="!visible" :placeholder="$t('auth.password')" @confirm="login" /><button class="password-toggle" :aria-label="visible ? l('隐藏密码','Hide password') : l('显示密码','Show password')" @click="visible = !visible"><SsIcon name="eye" :size="20" :tone="visible ? 'default' : 'muted'" /></button></view>
      </view>
      <view v-else class="field">
        <text class="field-label">{{ l('短信验证码', 'SMS code') }}</text>
        <view class="field-control"><SsIcon name="message-square-text" :size="20" tone="default" /><input v-model="verificationCode" type="number" maxlength="6" :placeholder="l('请输入 6 位验证码', 'Enter 6-digit code')" @confirm="loginByCode" /><text class="send-login-code" :class="{ disabled: codeCountdown > 0 }" @click="codeCountdown ? undefined : sendLoginCode()">{{ codeCountdown ? `${codeCountdown}s` : l('获取验证码', 'Get code') }}</text></view>
      </view>
      <text v-if="error" class="field-hint login-error error">{{ lockedUntil && lockSeconds ? $t('auth.locked', { time: lockText }) : error }}</text>

      <view class="agreement" @click="agreed = !agreed"><view class="check" :class="{ checked: agreed }"><SsIcon v-if="agreed" name="check" :size="14" tone="inverse" /></view><view class="agreement-copy">{{ l('我已阅读并同意','I have read and agree to the ') }}<text class="legal-link" @click.stop="uni.navigateTo({url:'/pages/profile/settings?section=user-agreement&from=login'})">{{ l('《用户协议》','Terms') }}</text>{{ l('和',' and ') }}<text class="legal-link" @click.stop="uni.navigateTo({url:'/pages/profile/settings?section=privacy-policy&from=login'})">{{ l('《隐私政策》','Privacy Policy') }}</text></view></view>
      <button class="btn primary login-button" :disabled="store.busy" @click="submitLogin"><SsIcon v-if="store.busy" name="loader-circle" :size="20" tone="default" /><text>{{ store.busy ? $t('auth.logging') : loginMode === 'code' && !isGlobal ? l('验证码登录', 'Sign in with code') : $t('auth.login') }}</text></button>

      <view class="auth-actions"><text @click="uni.navigateTo({ url: `/pages/auth/register?method=${loginMode === 'email' || isGlobal ? 'email' : 'mobile'}` })">{{ $t('auth.register') }}</text><text class="guest-entry" @click="requestGuest">{{ l('游客模式', 'Guest mode') }}</text></view>

      <view class="social-separator"><text /> <span>{{ l('其他登录方式', 'Or continue with') }}</span> <text /></view>
      <view class="social-row" :class="{ triple: !isGlobal }">
        <button v-if="!isGlobal" class="social" @click="social('WeChat')"><SsIcon name="message-circle" :size="20" tone="success" /><text>{{ l('微信','WeChat') }}</text></button>
        <button class="social" @click="social('Google')"><span class="google-mark">G</span><text>Google</text></button>
        <button class="social" @click="social('Apple')"><SsIcon name="apple" :size="20" tone="default" /><text>Apple{{ l(' 登录','') }}</text></button>
      </view>
      </view>
    </scroll-view>

    <SsModal :show="showGuestConfirm" :title="l('进入游客模式','Continue as guest')" :description="l('游客可浏览首页、公开设备信息和服务入口；绑定设备、设备控制、提交售后等操作需要登录。','Guests can browse public content. Device binding, controls, and service requests require sign-in.')" icon="user-round" :confirm-text="l('进入游客模式','Continue as guest')" :cancel-text="l('返回登录','Back to sign in')" @cancel="showGuestConfirm = false" @confirm="enterGuest">
      <view class="guest-scope"><view><SsIcon name="eye" :size="17" tone="success" /><text>{{ l('可浏览公开内容','Browse public content') }}</text></view><view><SsIcon name="shield-check" :size="17" tone="muted" /><text>{{ l('操作前会提示登录','Sign in before protected actions') }}</text></view></view>
    </SsModal>

  </view>
</template>

<style scoped lang="scss">
.login-page { display: flex; height: 100vh; min-height: 100vh; flex-direction: column; overflow: hidden; background: #fff; }
.login-scroll { min-height: 0; flex: 1 1 auto; }
.auth-hero { position: relative; display: flex; height: 220px; flex: 0 0 220px; flex-direction: column; align-items: flex-start; padding: calc(var(--ss-status-bar-height) + 36px) 24px 24px; overflow: hidden; background:#e7f1ff; }
.auth-hero::after { position:absolute;right:-70px;bottom:-80px;width:250px;height:170px;content:'';background:#c9ddfb;border-radius:50% 0 0 0;transform:rotate(-8deg); }
.auth-status { position: absolute; top: 0; right: 0; left: 0; width: 100%; background: var(--color-bg-canvas); }
.auth-bg { display:none; }
.auth-top { display:none; }
.region-chip { padding: 10rpx 18rpx; color: #35506f; background: rgba(255,255,255,.72); border: 2rpx solid rgba(184,213,255,.8); border-radius: 999rpx; font-size: 22rpx; }
.language { display: flex; width: 68rpx; height: 56rpx; align-items: center; justify-content: center; color: var(--color-action-primary); background: rgba(255,255,255,.8); border-radius: 12rpx; font-size: 22rpx; font-weight: 600; }
.brand-logo { position: relative; z-index:2; display:flex;width:48px;height:48px;align-items:center;justify-content:center;margin:0;color:#fff;background:var(--color-action-primary);border-radius:8px; }
.brand-name { position: relative; z-index:2; margin-top: 18px; font-size: 24px; line-height: 32px; font-weight: 600; }
.brand-copy { position: relative; z-index:2; margin-top: 6px; color: #506783; font-size: 13px; line-height:20px; }
.auth-panel { position: relative; margin:0; padding: 22px 24px calc(20px + env(safe-area-inset-bottom)); background: #fff; border-radius:0; }
.auth-title { display: block; font-size: 40rpx; line-height: 56rpx; font-weight: 600; }
.login-mode-tabs { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4rpx;margin:24rpx 0 34rpx;padding:6rpx;background:var(--color-bg-canvas);border-radius:14rpx; }
.login-mode-tabs button { display:flex;height:66rpx;align-items:center;justify-content:center;color:var(--color-text-secondary);background:transparent;border:0;border-radius:10rpx;font-size:24rpx;font-weight:600; }
.login-mode-tabs button.active { color:var(--color-action-primary);background:#fff;box-shadow:0 4rpx 14rpx rgba(32,84,150,.1); }
.login-mode-tabs.triple { grid-template-columns:repeat(3,minmax(0,1fr)); }
.send-login-code { flex:0 0 auto;padding-left:18rpx;color:var(--color-action-primary);border-left:2rpx solid var(--color-divider);font-size:23rpx;font-weight:600; }
.send-login-code.disabled { color:var(--color-text-secondary); }
.password-toggle { display:flex;width:40px;height:40px;flex:0 0 40px;align-items:center;justify-content:center;margin-right:-10px;background:transparent;border:0;border-radius:6px; }
.login-error { display:block;margin:-12rpx 0 20rpx; }
.field-label .link, .link { color: var(--color-action-primary); }
.agreement { display: flex; align-items: flex-start; gap: 12rpx; margin: 8rpx 0 28rpx; color: var(--color-text-secondary); font-size: 22rpx; line-height: 32rpx; }
.agreement-copy { min-width:0;flex:1; }.legal-link { color:var(--color-action-primary);font-weight:600; }
.check { display: flex; width: 32rpx; height: 32rpx; flex: 0 0 32rpx; align-items: center; justify-content: center; margin-top: 1rpx; background: #fff; border: 2rpx solid var(--ss-neutral-300); border-radius: 8rpx; }
.check.checked { background: var(--color-action-primary); border-color: var(--color-action-primary); }
.login-button { width: 100%; }
.auth-actions { display: flex; justify-content: space-between; padding: 28rpx 4rpx; color: var(--color-action-primary); font-size: 24rpx; font-weight: 600; }
.social-separator { display: flex; align-items: center; gap: 20rpx; color: var(--color-text-secondary); font-size: 20rpx; }
.social-separator text { height: 2rpx; flex: 1; background: var(--color-divider); }
.social-row { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20rpx;margin-top:24rpx; }
.social-row.triple { grid-template-columns:repeat(3,minmax(0,1fr));gap:12rpx; }
.social { display:flex;width:100%;height:88rpx;align-items:center;justify-content:center;gap:14rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:12rpx;font-weight:600; }
.google-mark { display:flex;width:38rpx;height:38rpx;align-items:center;justify-content:center;color:#4285f4;border:2rpx solid #dadce0;border-radius:50%;font-size:25rpx;font-weight:700; }
.guest-scope { display:grid;gap:12rpx;margin-top:24rpx;padding:20rpx;background:var(--color-bg-canvas);border-radius:var(--radius-sm); }.guest-scope view { display:flex;align-items:center;gap:12rpx;color:var(--color-text-body);font-size:22rpx; }
.demo-card { margin-top: 36rpx; padding: 20rpx 24rpx; background: var(--color-bg-canvas); border-radius: 16rpx; }
.demo-title { display: block; margin-bottom: 12rpx; color: var(--color-text-secondary); font-size: 22rpx; font-weight: 600; }
.demo-row { display: flex; justify-content: space-between; min-height: 48rpx; align-items: center; color: var(--color-text-body); font-size: 22rpx; }
.demo-row span { color: var(--color-action-primary); font-variant-numeric: tabular-nums; }
.region-panel { display:block; }.region-panel .auth-title { font-size:20px;line-height:28px; }.region-panel .auth-subtitle { margin:4px 0 0;font-size:12px;line-height:18px; }.choice-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px; }.region-choice { position:relative;display:flex;min-height:76px;flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;padding:12px;color:var(--color-text-body);background:#fff;border:1px solid var(--color-border-subtle);border-radius:8px;text-align:left; }.region-choice strong { font-size:13px;line-height:16px; }.region-choice text { color:var(--color-text-secondary);font-size:11px;line-height:14px; }.region-choice.selected { background:var(--color-action-primary-subtle);border-color:var(--color-action-primary); }.choice-check { position:absolute;top:8px;right:8px;display:flex;width:18px;height:18px;align-items:center;justify-content:center;color:#fff;background:var(--color-action-primary);border-radius:50%; }
.region-notice { min-height:42px;align-items:flex-start;margin-top:14px;padding:12px;text-align:left; }.notice-copy { min-width:0;flex:1; }.notice-copy strong,.notice-copy text { display:block; }.notice-copy strong { font-size:12px;line-height:18px;font-weight:600; }.notice-copy text { margin-top:2px;color:inherit;font-size:12px;line-height:18px; }.region-panel > .btn { width:100%;min-height:44px; }.region-panel > .btn.primary { margin-top:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18); }.guest-button { margin-top:10px;color:var(--color-action-primary);background:transparent;border-color:transparent; }.legal-copy { display:block;margin-top:14px;color:var(--color-text-secondary);font-size:10px;line-height:15px;text-align:center; }
.login-legal { display:block;margin-top:24rpx;color:var(--color-text-secondary);font-size:19rpx;text-align:center; }

/* Authentication is form-led; the brand band stays compact and factual. */
.auth-hero { height:154px;flex-basis:154px;padding:calc(var(--ss-status-bar-height) + 20px) 24px 18px;background:#fff;border-bottom:1px solid var(--color-divider); }
.auth-hero::after { display:none; }
.auth-bg { display:none; }
.brand-logo { width:42px;height:42px;border-radius:7px;box-shadow:none; }
.brand-name { margin-top:10px;font-size:22px;line-height:28px;font-weight:650; }
.brand-copy { margin-top:4px;color:var(--color-text-secondary); }
.auth-panel { padding:20px 24px calc(20px + env(safe-area-inset-bottom)); }
.auth-title { font-size:40rpx;line-height:52rpx;font-weight:650; }
.login-mode-tabs { margin:20rpx 0 28rpx;padding:4rpx;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-sm); }
.login-mode-tabs button { height:62rpx;border-radius:var(--radius-sm); }
.login-mode-tabs button.active { color:#fff;background:var(--color-action-primary);box-shadow:none; }
.demo-card { margin-top:28rpx;padding:18rpx 20rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-md); }
.auth-actions { justify-content:flex-start;gap:36rpx;padding-top:24rpx; }
.social { border-radius:var(--radius-md); }
.auth-hero { height: 205px; flex-basis: 205px; padding: calc(var(--ss-status-bar-height) + 24px) 28px 18px; background: #fff; }
.auth-hero::after { display: none; }
.brand-logo { width: 42px; height: 42px; background: transparent; }
.brand-logo image { width: 100%; height: 100%; }
.brand-name { margin-top: 13px; color: var(--color-text-primary); font-size: 27px; line-height: 36px; font-weight: 700; }
.brand-copy { margin-top: 5px; color: var(--color-text-secondary); font-size: 13px; }
.auth-panel { padding: 18px 28px calc(28px + env(safe-area-inset-bottom)); }
.auth-title { font-size: 20px; line-height: 28px; }
.login-mode-tabs { margin: 20px 0 25px; padding: 4px; border-radius: 8px; }
.login-mode-tabs button { height: 40px; border-radius: 6px; font-size: 14px; }
.field { margin-bottom: 20px; }.field-label { margin-bottom: 9px; font-size: 13px; }.field-control { min-height: 50px; padding: 0 14px; border-radius: 8px; background: var(--ss-neutral-25); }.field-control input { height: 48px; font-size: 15px; }
.agreement { margin: 7px 0 22px; font-size: 12px; line-height: 20px; }.check { width: 18px; height: 18px; flex-basis: 18px; margin-top: 1px; border-radius: 5px; }.login-button { min-height: 50px; font-size: 16px; border-radius: 8px; }
.auth-actions { padding: 20px 2px; font-size: 14px; }.social-row { gap: 12px; margin-top: 19px; }.social { min-height: 46px; border-radius: 8px; font-size: 14px; }

/* Compact brand header leaves the form and alternate sign-in options visible. */
.login-page,.login-scroll { background:#fff; }
.auth-hero { height:165px;flex-basis:165px;padding:calc(var(--ss-status-bar-height) + 17px) 24px 18px;color:#fff;background:#246bd4;border-bottom:0; }
.auth-hero::after { display:none; }
.auth-status { color:#fff;background:transparent; }
.brand-logo { width:40px;height:40px;background:#fff;border:0;box-shadow:none; }
.brand-name { margin-top:9px;font-size:22px;line-height:29px; }
.brand-name { color:#fff; }
.brand-copy { margin-top:2px;color:rgba(255,255,255,.88); }
.auth-panel { margin:0;padding:24px 20px calc(28px + env(safe-area-inset-bottom));background:#fff;border:0;border-radius:0;box-shadow:none; }
.login-mode-tabs { margin:18px 0 22px; }
.social-row { gap:8px; }
.social { gap:6px;padding:0 6px;white-space:normal; }
.social text { min-width:0;font-size:13px; }
.region-choice { min-width:0; }
.region-choice strong,.region-choice text { overflow-wrap:anywhere; }
</style>
