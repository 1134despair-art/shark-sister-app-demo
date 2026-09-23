<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import { passwordValid } from '@/services/auth'
import { useAppStore } from '@/stores/app'
import { storage } from '@/services/storage'
import { complianceService } from '@/services/compliance'

const store = useAppStore()
const forcedRegion = ref<'CN' | 'GLOBAL' | ''>('')
const global = computed(() => (forcedRegion.value || import.meta.env.VITE_APP_REGION) === 'GLOBAL')
const registrationMethod = ref<'mobile' | 'email'>(import.meta.env.VITE_APP_REGION === 'GLOBAL' ? 'email' : 'mobile')
const isEmail = computed(() => registrationMethod.value === 'email')
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const identifier = ref('')
const code = ref('')
const password = ref('')
const confirm = ref('')
const agreed = ref(false)
const error = ref('')
const passwordVisible = ref(false)
const confirmVisible = ref(false)
const sessionId = ref('')
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
const designRegister = computed(() => store.designCaseId === 'A04' || store.designCaseId === 'A05')
const identifierValid = computed(() => isEmail.value ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.value) : /^1\d{10}$/.test(identifier.value))
const valid = computed(() => identifierValid.value && code.value.length === 6 && passwordValid(password.value) && password.value === confirm.value && agreed.value)

onUnmounted(() => { if (timer) clearInterval(timer) })
onLoad(async (query) => {
  await store.init()
  forcedRegion.value = query?.region === 'GLOBAL' ? 'GLOBAL' : query?.region === 'CN' ? 'CN' : ''
  registrationMethod.value = query?.method === 'email' || query?.region === 'GLOBAL' ? 'email' : 'mobile'
  if (store.designCaseId === 'A04') identifier.value = '13800002861'
  if (store.designCaseId === 'A05') identifier.value = 'captain@seawind.com'
})

async function sendCode() {
  if (!identifierValid.value) return error.value = isEmail.value ? l('请输入有效邮箱地址', 'Enter a valid email address') : l('请输入有效的 11 位手机号码', 'Enter a valid 11-digit mobile number')
  try {
    const session = await store.startVerification(identifier.value, 'register', { password: password.value, region: global.value ? 'GLOBAL' : 'CN' })
    sessionId.value = session.id
    code.value = '826104'
    countdown.value = 60
    if (timer) clearInterval(timer)
    timer = setInterval(() => { if (countdown.value > 0) countdown.value -= 1 }, 1000)
    uni.showToast({ title: l('验证码已发送', 'Verification code sent'), icon: 'success' })
  } catch (cause) {
    error.value = cause instanceof Error && cause.message === 'ACCOUNT_EXISTS' ? l('该账号已经注册', 'This account is already registered') : l('请先设置符合要求的密码', 'Set a password that meets the requirements first')
  }
}

function selectMethod(method: 'mobile' | 'email') {
  registrationMethod.value = method
  identifier.value = method === 'email' ? 'new.user@example.com' : '13900001234'
  code.value = ''
  sessionId.value = ''
  error.value = ''
}

async function social(provider: 'Google' | 'Apple') {
  if (!agreed.value) return error.value = l('请先阅读并同意用户协议和隐私政策', 'Agree to the Terms and Privacy Policy first')
  uni.showLoading({ title: provider })
  try {
    const result = await store.socialLogin(provider, global.value ? 'GLOBAL' : 'CN')
    complianceService.recordAgreements(result.id, 'social')
    store.refresh()
    uni.hideLoading()
    uni.showToast({ title: l('注册并登录成功', 'Account created and signed in'), icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/shell/index' }), 350)
  } catch {
    uni.hideLoading()
    error.value = l('授权未完成，请重试', 'Authorization was not completed. Try again')
  }
}

async function submit() {
  if (!valid.value) {
    error.value = password.value !== confirm.value ? l('两次密码输入不一致', 'Passwords do not match') : l('请完整填写信息，密码需包含字母和数字', 'Complete all fields. The password must contain letters and numbers')
    return
  }
  if (!sessionId.value) return error.value = l('请先获取验证码', 'Request a verification code first')
  try {
    const result = await store.verify(sessionId.value, code.value)
    if (!result.account) throw new Error('ACCOUNT_NOT_CREATED')
    complianceService.recordAgreements(result.account.id, 'register')
    store.refresh()
    uni.showToast({ title: l('注册成功', 'Registration complete'), icon: 'success' })
    setTimeout(() => {
      const destination = storage.get<string>('shark-sister-login-target') || '/pages/shell/index'
      storage.remove('shark-sister-login-target')
      uni.reLaunch({ url: destination })
    }, 450)
  } catch {
    error.value = l('验证码不正确或已经过期', 'The verification code is invalid or expired')
  }
}
</script>

<template>
  <view class="page auth-simple">
    <SsAppBar :title="$t('auth.register')" fallback-url="/pages/auth/login" />
    <scroll-view scroll-y class="page-scroll" :class="{ 'design-register': designRegister }">
      <template v-if="!designRegister">
        <view class="intro-icon"><SsIcon :name="isEmail ? 'mail' : 'smartphone'" :size="32" tone="brand" /></view>
        <text class="intro-title">{{ isEmail ? l('邮箱注册','Email registration') : l('手机号码注册','Mobile registration') }}</text>
        <text class="intro-copy">{{ isEmail ? l('验证邮箱后即可创建账号，并用于后续登录。','Verify your email to create an account and use it for sign-in.') : l('验证手机号码后，即可管理设备与售后服务。','Verify your mobile number to manage devices and service requests.') }}</text>
      </template>
      <view class="register-method-tabs"><button :class="{ active: registrationMethod === 'mobile' }" @click="selectMethod('mobile')">{{ l('手机号注册','Mobile') }}</button><button :class="{ active: registrationMethod === 'email' }" @click="selectMethod('email')">{{ l('邮箱注册','Email') }}</button></view>
      <view :class="{ 'form-card': designRegister }">
        <view class="field"><text class="field-label">{{ isEmail ? l('邮箱地址','Email address') : l('手机号','Mobile number') }}</text><view class="field-control"><SsIcon :name="isEmail ? 'mail' : 'smartphone'" :size="18" tone="muted" /><input v-model="identifier" :type="isEmail ? 'text' : 'number'" :placeholder="isEmail ? 'name@example.com' : l('请输入手机号','Enter mobile number')" /><text class="send-code" :class="{ disabled: countdown }" @click="countdown ? undefined : sendCode()">{{ countdown ? `${countdown}s` : l('获取验证码','Send code') }}</text></view></view>
        <view class="field"><text class="field-label">{{ isEmail ? l('邮箱验证码','Email code') : l('短信验证码','SMS code') }}</text><view class="field-control"><SsIcon :name="isEmail ? 'key-round' : 'message-square-text'" :size="18" tone="muted" /><input v-model="code" maxlength="6" type="number" :placeholder="l('请输入 6 位验证码','Enter 6-digit code')" /></view></view>
        <view class="field"><text class="field-label">{{ global ? 'Password' : l('设置密码','Password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="password" :password="!passwordVisible" maxlength="20" :placeholder="global ? '8-20 characters' : '8-20 位，包含字母和数字'" /><button class="password-toggle" :aria-label="passwordVisible ? l('隐藏密码','Hide password') : l('显示密码','Show password')" @click="passwordVisible = !passwordVisible"><SsIcon name="eye" :size="18" :tone="passwordVisible ? 'default' : 'muted'" /></button></view></view>
        <view class="field"><text class="field-label">{{ l('确认密码','Confirm password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="confirm" :password="!confirmVisible" :placeholder="l('再次输入密码','Enter password again')" /><button class="password-toggle" :aria-label="confirmVisible ? l('隐藏密码','Hide password') : l('显示密码','Show password')" @click="confirmVisible = !confirmVisible"><SsIcon name="eye" :size="18" :tone="confirmVisible ? 'default' : 'muted'" /></button></view><text v-if="error" class="field-hint error">{{ error }}</text></view>
      </view>
      <view v-if="designRegister && !global" class="password-notice notice"><SsIcon name="shield-check" :size="18" tone="brand-strong" /><view><strong>密码要求</strong><text>至少 8 位，同时包含字母和数字。</text></view></view>
      <view class="agreement" @click="agreed = !agreed"><view class="check" :class="{ checked: agreed }"><SsIcon v-if="agreed" name="check" :size="14" tone="inverse" /></view><view class="agreement-copy">{{ l('我已阅读并同意','I have read and agree to the ') }}<text class="legal-link" @click.stop="uni.navigateTo({url:'/pages/profile/settings?section=user-agreement&from=register'})">{{ l('《用户协议》','Terms') }}</text>{{ l('和',' and ') }}<text class="legal-link" @click.stop="uni.navigateTo({url:'/pages/profile/settings?section=privacy-policy&from=register'})">{{ l('《隐私政策》','Privacy Policy') }}</text></view></view>
      <button class="btn primary register-submit" @click="submit">{{ designRegister ? l('创建账号','Create account') : $t('common.next') }}</button>
      <template>
        <view class="divider-text"><text>{{ l('或使用第三方账号注册','or sign up with') }}</text></view>
        <view class="social-register"><button class="btn" @click="social('Google')"><span class="google-mark">G</span>Google</button><button class="btn" @click="social('Apple')"><SsIcon name="apple" :size="18" tone="default" />Apple</button></view>
      </template>
    </scroll-view>
  </view>
</template>

<style scoped>
.auth-simple { background: #fff; }
.page-scroll { padding-top: 48rpx; }
.intro-icon { display: flex; width: 112rpx; height: 112rpx; align-items: center; justify-content: center; background: var(--color-action-primary-subtle); border-radius: 24rpx; }
.intro-title { display: block; margin-top: 24rpx; font-size: 40rpx; line-height: 56rpx; font-weight: 600; }
.intro-copy { display: block; margin: 12rpx 0 48rpx; color: var(--color-text-secondary); font-size: 26rpx; line-height: 40rpx; }
.send-code { flex: 0 0 auto; color: var(--color-action-primary); font-size: 24rpx; font-weight: 600; }
.send-code.disabled { color: var(--color-text-secondary); }
.register-method-tabs { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4rpx;margin:0 0 28rpx;padding:4rpx;background:var(--color-bg-canvas);border:2rpx solid var(--color-border-subtle);border-radius:var(--radius-sm); }.register-method-tabs button { height:68rpx;color:var(--color-text-secondary);background:transparent;border:0;border-radius:var(--radius-sm);font-size:24rpx;font-weight:600; }.register-method-tabs button.active { color:#fff;background:var(--color-action-primary); }
.password-toggle { display:flex;width:40px;height:40px;flex:0 0 40px;align-items:center;justify-content:center;margin-right:-10px;background:transparent;border:0;border-radius:6px; }
.agreement { display: flex; align-items: flex-start; gap: 12rpx; margin: 8rpx 0 28rpx; color: var(--color-text-secondary); font-size: 22rpx; line-height: 32rpx; }
.agreement-copy { min-width:0;flex:1; }.legal-link { color:var(--color-action-primary);font-weight:600; }
.check { display: flex; width: 32rpx; height: 32rpx; flex: 0 0 32rpx; align-items: center; justify-content: center; border: 2rpx solid var(--ss-neutral-300); border-radius: 8rpx; }
.check.checked { background: var(--color-action-primary); border-color: var(--color-action-primary); }
.social-note { margin-top: 28rpx; color: var(--color-text-secondary); font-size: 22rpx; line-height: 34rpx; text-align: center; }
.design-register { padding-top:20rpx; }
.form-card { padding:24rpx 26rpx 4rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }
.form-card .field { margin-bottom:20rpx; }.form-card .field-label { margin-bottom:8rpx; }.form-card .field-control { min-height:88rpx;border-radius:14rpx; }.form-card .field-control input { height:82rpx;font-size:26rpx; }
.password-notice { margin-top:24rpx;align-items:flex-start; }.password-notice view { min-width:0;flex:1; }.password-notice strong,.password-notice text { display:block; }.password-notice strong { font-size:24rpx; }.password-notice text { margin-top:4rpx;font-size:22rpx; }
.register-submit { width:100%;margin-top:34rpx; }.design-register .password-notice + .register-submit { margin-top:34rpx; }
.register-legal { display:block;margin-top:20rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:center; }
.divider-text { display:flex;align-items:center;gap:18rpx;margin:20rpx 0;color:var(--color-text-secondary);font-size:20rpx; }.divider-text::before,.divider-text::after { height:2rpx;flex:1;content:'';background:var(--color-divider); }
.social-register { display:grid;grid-template-columns:1fr 1fr;gap:20rpx; }.social-register .btn { width:100%;gap:12rpx; }
.google-mark { display:flex;width:36rpx;height:36rpx;align-items:center;justify-content:center;color:#4285f4;border:2rpx solid #dadce0;border-radius:50%;font-size:24rpx;font-weight:700; }
.page-scroll { padding-top:32rpx; }
.intro-icon { width:64rpx;height:64rpx;background:transparent;border:2rpx solid var(--ss-brand-200);border-radius:50%; }
.intro-title { margin-top:20rpx;font-size:34rpx;line-height:48rpx;font-weight:650; }
.intro-copy { margin:8rpx 0 36rpx;font-size:24rpx;line-height:36rpx; }
.form-card { padding:22rpx 24rpx 2rpx;border-radius:var(--radius-md); }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
