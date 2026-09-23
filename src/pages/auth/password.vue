<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import { passwordValid } from '@/services/auth'
import { useAppStore } from '@/stores/app'
import { storage } from '@/services/storage'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const mode = ref('forgot')
const sessionId = ref('')
const identifier = ref('')
const current = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const strength = computed(() => Math.min(100, (password.value.length * 8) + (/[A-Z]/.test(password.value) ? 12 : 0) + (/\d/.test(password.value) ? 12 : 0)))
const fallbackUrl = computed(() => mode.value === 'first' || mode.value === 'forgot' || sessionId.value ? '/pages/auth/login' : '/pages/shell/index?tab=profile')
const isPasswordDesignCase = computed(() => ['A07', 'A08', 'P04'].includes(store.designCaseId))
const designTitle = computed(() => store.designCaseId === 'A07' ? l('重置密码','Reset password') : store.designCaseId === 'A08' ? l('设置新密码','Set new password') : l('修改密码','Change password'))

onLoad(async (query) => {
  await store.init()
  mode.value = String(query?.mode || 'forgot')
  sessionId.value = String(query?.sessionId || '')
  if (['A07', 'P04'].includes(store.designCaseId)) password.value = confirm.value = 'Shark@2026'
  if (['A08', 'P04'].includes(store.designCaseId)) current.value = 'Temp@2026'
})

async function submit() {
  if (mode.value === 'forgot') {
    if (!identifier.value) return error.value = l('请输入需要找回的账号', 'Enter the account to recover')
    try {
      const session = await store.startVerification(identifier.value, 'forgot')
      return uni.navigateTo({ url: `/pages/auth/verify?target=${encodeURIComponent(identifier.value)}&purpose=forgot&sessionId=${session.id}` })
    } catch {
      return error.value = l('没有找到该账号，请检查后重试', 'Account not found. Check it and try again')
    }
  }
  if (!passwordValid(password.value) || password.value !== confirm.value) return error.value = l('密码需为 8–20 位并包含字母和数字，且两次输入必须一致', 'Use 8–20 characters with letters and numbers, and make both entries match')
  try {
    if (sessionId.value) await store.resetPassword(sessionId.value, password.value)
    else if (store.account) await store.changePassword(current.value, password.value)
    else throw new Error('VERIFICATION_REQUIRED')
    uni.showToast({ title: l('密码设置成功', 'Password updated'), icon: 'success' })
    setTimeout(() => {
      if (!store.account) return uni.reLaunch({ url: '/pages/auth/login' })
      const destination = storage.get<string>('shark-sister-login-target') || '/pages/shell/index'
      storage.remove('shark-sister-login-target')
      uni.reLaunch({ url: destination })
    }, 600)
  } catch (cause) {
    error.value = cause instanceof Error && cause.message === 'CURRENT_PASSWORD_INVALID' ? l('当前密码不正确', 'Current password is incorrect') : l('密码修改失败，请重新验证身份', 'Password update failed. Verify your identity again')
  }
}
</script>

<template>
  <view class="page password-page">
    <SsAppBar :title="isPasswordDesignCase ? designTitle : mode === 'first' ? l('首次登录修改密码','Change temporary password') : mode === 'forgot' ? l('找回密码','Recover password') : sessionId ? l('重置密码','Reset password') : l('修改登录密码','Change password')" :fallback-url="fallbackUrl" :hide-back="store.designCaseId === 'A08'" />
    <scroll-view v-if="store.designCaseId === 'A07'" scroll-y class="page-scroll password-design-scroll">
      <view class="notice password-verified"><SsIcon name="shield-check" :size="18" tone="brand-strong" /><view><strong>{{ l('身份已验证','Identity verified') }}</strong><text>{{ l('验证将在 04:18 后失效','Verification expires in 04:18') }}</text></view></view>
      <view class="card password-design-form"><view class="field"><text class="field-label">{{ l('新密码','New password') }}</text><view class="field-control active"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="password" password /><SsIcon name="eye" :size="18" tone="muted" /></view></view><view class="field"><text class="field-label">{{ l('确认新密码','Confirm new password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="confirm" password /><SsIcon name="eye" :size="18" tone="muted" /></view></view></view>
      <view class="notice success password-strength"><SsIcon name="circle-check" :size="18" tone="success" /><view><strong>{{ l('密码强度：安全','Password strength: secure') }}</strong><text>{{ l('包含 10 个字符、字母和数字。','Includes 10 characters, letters, and numbers.') }}</text></view></view>
      <button class="btn primary password-design-submit" @click="submit">{{ l('保存新密码','Save new password') }}</button>
    </scroll-view>

    <scroll-view v-else-if="store.designCaseId === 'A08'" scroll-y class="page-scroll password-design-scroll first-password-design">
      <view class="notice warning"><SsIcon name="shield-alert" :size="18" tone="warning-strong" /><view><strong>{{ l('首次登录需要修改密码','Password change required') }}</strong><text>{{ l('为保护经销商项目与客户数据，请先设置个人密码。','Set a personal password to protect dealer projects and customer data.') }}</text></view></view>
      <view class="card password-design-form"><view class="field"><text class="field-label">{{ l('经销商账号','Dealer account') }}</text><view class="field-control readonly"><SsIcon name="badge-check" :size="18" tone="muted" /><text>DLR-SH-0028</text></view></view><view class="field"><text class="field-label">{{ l('临时密码','Temporary password') }}</text><view class="field-control"><SsIcon name="key-round" :size="18" tone="muted" /><input v-model="current" password /></view></view><view class="field"><text class="field-label">{{ l('新密码','New password') }}</text><view class="field-control active"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="password" password :placeholder="l('请输入新密码','Enter new password')" /><SsIcon name="eye" :size="18" tone="muted" /></view></view><view class="field"><text class="field-label">{{ l('确认新密码','Confirm new password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="confirm" password :placeholder="l('再次输入新密码','Confirm new password')" /><SsIcon name="eye" :size="18" tone="muted" /></view></view></view>
      <button class="btn primary password-design-submit" @click="submit">{{ l('保存并进入工作台','Save and enter workspace') }}</button>
    </scroll-view>

    <scroll-view v-else-if="store.designCaseId === 'P04'" scroll-y class="page-scroll password-design-scroll">
      <view class="card password-design-form"><view class="field"><text class="field-label">{{ l('当前密码','Current password') }}</text><view class="field-control"><SsIcon name="key-round" :size="18" tone="muted" /><input v-model="current" password /><SsIcon name="eye" :size="18" tone="muted" /></view></view><view class="field"><text class="field-label">{{ l('新密码','New password') }}</text><view class="field-control active"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="password" password /><SsIcon name="eye" :size="18" tone="muted" /></view></view><view class="field"><text class="field-label">{{ l('确认新密码','Confirm new password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="18" tone="muted" /><input v-model="confirm" password /><SsIcon name="eye" :size="18" tone="muted" /></view></view></view>
      <view class="notice success password-strength"><SsIcon name="shield-check" :size="18" tone="success" /><view><strong>{{ l('密码强度：安全','Password strength: secure') }}</strong><text>{{ l('包含 10 个字符、字母和数字。','Includes 10 characters, letters, and numbers.') }}</text></view></view>
      <button class="btn primary password-design-submit" @click="submit"><SsIcon name="save" :size="18" tone="inverse" />{{ l('保存新密码','Save new password') }}</button><text class="password-footnote">{{ l('修改成功后，其他设备上的登录会话将失效。','Other device sessions expire after the change.') }}</text>
    </scroll-view>

    <scroll-view v-else scroll-y class="page-scroll">
      <view class="notice" :class="mode === 'first' ? 'warning' : ''"><SsIcon :name="mode === 'first' ? 'shield-alert' : 'key-round'" :size="22" tone="default" /><text>{{ mode === 'first' ? l('临时密码仅供首次登录使用，必须设置个人密码后才能进入经销商工作台。','The temporary password is for first sign-in only. Set a personal password before entering the dealer workspace.') : l('验证账号身份后可重新设置登录密码。','Verify your identity before setting a new password.') }}</text></view>
      <template v-if="mode === 'forgot'">
        <view class="field form-top"><text class="field-label">{{ l('手机号 / 邮箱 / 经销商账号','Mobile / email / dealer account') }}</text><view class="field-control"><SsIcon name="user-round" :size="20" tone="default" /><input v-model="identifier" :placeholder="l('请输入账号','Enter account')" /></view></view>
      </template>
      <template v-else>
        <view v-if="!sessionId" class="field form-top"><text class="field-label">{{ mode === 'first' ? l('当前临时密码','Current temporary password') : l('当前密码','Current password') }}</text><view class="field-control"><SsIcon name="lock-keyhole" :size="20" tone="default" /><input v-model="current" password :placeholder="mode === 'first' ? l('请输入临时密码','Enter temporary password') : l('请输入当前密码','Enter current password')" /></view></view>
        <view class="field" :class="{ 'form-top': Boolean(sessionId) }"><text class="field-label">{{ l('新密码','New password') }}</text><view class="field-control"><SsIcon name="key-round" :size="20" tone="default" /><input v-model="password" password maxlength="20" :placeholder="l('8–20 位，包含字母和数字','8–20 characters with letters and numbers')" /></view><view class="strength"><view class="progress"><view class="progress-bar" :style="{ width: `${strength}%` }" /></view><text>{{ strength < 45 ? l('弱','Weak') : strength < 80 ? l('中','Medium') : l('强','Strong') }}</text></view></view>
        <view class="field"><text class="field-label">{{ l('确认新密码','Confirm new password') }}</text><view class="field-control"><SsIcon name="shield-check" :size="20" tone="default" /><input v-model="confirm" password :placeholder="l('再次输入新密码','Enter the new password again')" /></view></view>
      </template>
      <text v-if="error" class="field-hint error">{{ error }}</text>
      <button class="btn primary submit" @click="submit">{{ mode === 'forgot' ? l('发送验证码','Send verification code') : l('保存新密码','Save new password') }}</button>
    </scroll-view>
  </view>
</template>

<style scoped>
.password-page { background: #fff; }
.form-top { margin-top: 48rpx; }
.notice { font-size: 24rpx; line-height: 36rpx; }
.strength { display: flex; align-items: center; gap: 16rpx; margin-top: 12rpx; color: var(--color-text-secondary); font-size: 22rpx; }
.strength .progress { flex: 1; }
.submit { width: 100%; margin-top: 36rpx; }
.password-design-scroll { padding-top:20rpx; }.password-design-scroll .notice { align-items:flex-start; }.password-design-scroll .notice strong,.password-design-scroll .notice text { display:block; }.password-design-scroll .notice text { margin-top:4rpx; }.password-design-form { margin-top:24rpx;padding:26rpx;box-shadow:none; }.first-password-design .password-design-form { margin-top:16rpx; }.password-design-form .field { margin-bottom:24rpx; }.password-design-form .field:last-child { margin-bottom:0; }.password-design-form .field-control { min-height:84rpx; }.password-design-form .field-control.active { border-color:var(--color-action-primary);box-shadow:0 0 0 6rpx rgba(40,114,248,.08); }.password-design-form .field-control.readonly { color:var(--color-text-secondary); }.password-design-form .field-control > text { flex:1; }.password-strength { margin-top:24rpx; }.password-design-submit { width:100%;margin-top:28rpx; }.password-footnote { display:block;margin-top:22rpx;color:var(--color-text-secondary);font-size:20rpx;text-align:center; }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
