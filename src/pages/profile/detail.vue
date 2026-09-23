<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsStatus from '@/components/SsStatus.vue'
import { authService } from '@/services/auth'
import { showAuthRequired } from '@/services/routeGuard'
import { useAppStore } from '@/stores/app'
import type { VerificationSession } from '@/types/models'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const editing = ref(false)
const saving = ref(false)
const avatarAttachmentId = ref('')
const phoneSession = ref<VerificationSession | null>(null)
const emailSession = ref<VerificationSession | null>(null)
const phoneCode = ref('')
const emailCode = ref('')
const form = reactive({ displayName: '', phone: '', email: '', avatar: '' })
const account = computed(() => store.account)
const title = computed(() => editing.value ? l('编辑资料', 'Edit Profile') : l('个人资料', 'Profile'))

function maskPhone(value?: string) { return value && value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value || l('未绑定', 'Not linked') }
function maskEmail(value?: string) {
  if (!value?.includes('@')) return l('未绑定', 'Not linked')
  const [name, domain] = value.split('@')
  return `${name.slice(0, 2)}***@${domain}`
}
function hydrate() {
  if (!account.value) return
  form.displayName = store.locale !== 'zh-Hans' ? account.value.displayNameEn : account.value.displayName
  form.phone = account.value.phone || ''
  form.email = account.value.email || ''
  form.avatar = account.value.avatar || ''
  avatarAttachmentId.value = ''
  phoneSession.value = null
  emailSession.value = null
  phoneCode.value = ''
  emailCode.value = ''
}

onLoad(async (query) => {
  await store.init()
  if (store.isGuest) {
    showAuthRequired('/pages/profile/detail?mode=view', store.locale)
    return
  }
  editing.value = String(query?.mode || 'view') === 'edit'
  hydrate()
  if (editing.value && store.designCaseId === 'P03') form.displayName = l('海风船长','Captain Seawind')
})

async function chooseAvatar() {
  try {
    const [attachment] = await store.pickAttachments('image', 1, 'profile-avatar')
    if (!attachment) return
    form.avatar = attachment.localPath
    avatarAttachmentId.value = attachment.id
  } catch (cause) {
    const message = cause instanceof Error && cause.message === 'FILE_TOO_LARGE'
      ? l('头像不能超过 5MB', 'Avatar must be 5 MB or smaller')
      : l('请选择 JPG 或 PNG 图片', 'Choose a JPG or PNG image')
    uni.showToast({ title: message, icon: 'none' })
  }
}

async function sendVerification(kind: 'phone' | 'email') {
  const value = form[kind].trim().toLocaleLowerCase()
  if (kind === 'phone' && !/^1\d{10}$/.test(value)) return uni.showToast({ title: l('请输入有效手机号', 'Enter a valid phone number'), icon: 'none' })
  if (kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return uni.showToast({ title: l('请输入有效邮箱', 'Enter a valid email'), icon: 'none' })
  try {
    const session = await authService.startVerification(value, kind === 'phone' ? 'profile-phone' : 'profile-email')
    if (kind === 'phone') phoneSession.value = session
    else emailSession.value = session
    uni.showToast({ title: l('本机验证会话已创建', 'Local verification session created'), icon: 'success' })
  } catch { uni.showToast({ title: l('验证码发送失败', 'Could not send the code'), icon: 'none' }) }
}

async function save() {
  const name = form.displayName.trim()
  if (name.length < 2 || name.length > 20) return uni.showToast({ title: l('昵称需为 2–20 个字符', 'Display name must be 2–20 characters'), icon: 'none' })
  saving.value = true
  try {
    if (form.phone.trim() !== (account.value?.phone || '')) {
      if (!phoneSession.value || phoneCode.value.length !== 6) throw new Error('PHONE_VERIFICATION_REQUIRED')
      await authService.verify(phoneSession.value.id, phoneCode.value)
    }
    if (form.email.trim().toLocaleLowerCase() !== (account.value?.email || '').toLocaleLowerCase()) {
      if (!emailSession.value || emailCode.value.length !== 6) throw new Error('EMAIL_VERIFICATION_REQUIRED')
      await authService.verify(emailSession.value.id, emailCode.value)
    }
    await store.saveProfile({
      displayName: name,
      avatar: form.avatar || undefined,
      avatarAttachmentId: avatarAttachmentId.value || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim().toLocaleLowerCase() || undefined,
      phoneVerificationId: phoneSession.value?.id,
      emailVerificationId: emailSession.value?.id,
    })
    editing.value = false
    hydrate()
    uni.showToast({ title: l('个人资料已保存', 'Profile saved'), icon: 'success' })
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : ''
    const message = code.includes('VERIFICATION') ? l('请获取并输入有效验证码', 'Get and enter a valid verification code') : code === 'CONTACT_EXISTS' ? l('手机号或邮箱已被使用', 'Phone number or email is already in use') : l('资料保存失败，请检查输入', 'Could not save profile. Check your entries.')
    uni.showToast({ title: message, icon: 'none' })
  } finally { saving.value = false }
}

function cancelEdit() { editing.value = false; hydrate() }
</script>

<template>
  <view class="page profile-detail-page">
    <SsAppBar :title="title" fallback-url="/pages/shell/index?tab=profile" :intercept-back="editing" :right-text="editing ? l('保存','Save') : l('编辑','Edit')" @back="cancelEdit" @right="editing ? save() : editing = true" />
    <scroll-view scroll-y class="page-scroll">
      <view class="identity-panel" :class="{ compact:!editing }">
        <button v-if="editing" class="avatar-button" @click="chooseAvatar">
          <image v-if="form.avatar" :src="form.avatar" mode="aspectFill" />
          <SsIcon v-else name="user-round" :size="40" tone="inverse" />
        </button>
        <view v-else class="avatar-large"><image v-if="account?.avatar" :src="account.avatar" mode="aspectFill" /><SsIcon v-else name="user-round" :size="42" tone="default" /></view>
        <button v-if="editing" class="change-avatar" @click="chooseAvatar">{{ l('更换头像','Change avatar') }}</button><text v-if="editing" class="file-rule">{{ l('JPG / PNG，最大 5MB', 'JPG / PNG, up to 5 MB') }}</text>
      </view>

      <template v-if="!editing">
        <view class="profile-icon-list list-card">
          <view class="profile-icon-row"><i><SsIcon name="image" :size="21" tone="brand" /></i><strong>{{ l('头像','Avatar') }}</strong><span>{{ l('已设置','Set') }}</span><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="profile-icon-row"><i><SsIcon name="user-round" :size="21" tone="brand" /></i><strong>{{ l('昵称','Display name') }}</strong><span>{{ store.locale !== 'zh-Hans' ? account?.displayNameEn : account?.displayName }}</span><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="profile-icon-row"><i><SsIcon name="smartphone" :size="21" tone="brand" /></i><strong>{{ l('手机号','Phone') }}</strong><span>{{ maskPhone(account?.phone) }}</span><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="profile-icon-row"><i><SsIcon name="mail" :size="21" tone="brand" /></i><strong>{{ l('邮箱','Email') }}</strong><span>{{ maskEmail(account?.email) }}</span><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="profile-icon-row"><i><SsIcon name="calendar-days" :size="21" tone="brand" /></i><strong>{{ l('注册时间','Registered') }}</strong><span>{{ store.designCaseId === 'P02' ? '2025-06-18' : account?.createdAt.slice(0, 10) }}</span></view>
        </view>
        <view class="section profile-section"><text class="section-label">{{ l('账号安全','Account security') }}</text><view class="profile-icon-list list-card"><view class="profile-icon-row" @click="uni.navigateTo({url:'/pages/auth/password?mode=reset'})"><i><SsIcon name="lock-keyhole" :size="21" tone="brand" /></i><view><strong>{{ l('修改密码','Change password') }}</strong><text>{{ l('上次修改：2026-07-20','Last changed: 2026-07-20') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="profile-icon-row"><i class="success"><SsIcon name="shield-check" :size="21" tone="success" /></i><view><strong>{{ l('登录保护','Sign-in protection') }}</strong><text>{{ l('异常登录会触发验证','Unusual sign-ins require verification') }}</text></view><view class="profile-protection-state"><SsIcon v-if="store.designCaseId === 'P02'" name="circle-check" :size="16" tone="success" /><SsStatus status="online" :label="l('已开启','Enabled')" /></view></view></view></view>
      </template>

      <template v-else>
        <view class="edit-form">
          <view class="field"><view class="field-label"><text>{{ l('昵称', 'Display name') }}</text><text>{{ form.displayName.length }}/20</text></view><view class="field-control active"><input v-model="form.displayName" maxlength="20" /></view></view>
          <view class="field"><text class="field-label">{{ l('手机号', 'Phone number') }}</text><view class="field-control"><SsIcon name="smartphone" :size="20" tone="muted" /><text class="masked-contact">{{ maskPhone(form.phone) }}</text><button class="inline-action" @click="sendVerification('phone')">{{ l('更换', 'Change') }}</button></view><view v-if="phoneSession" class="field-control code-field"><SsIcon name="shield-check" :size="20" tone="brand-strong" /><input v-model="phoneCode" maxlength="6" type="number" :placeholder="l('输入 6 位验证码', 'Enter the 6-digit code')" /><button class="inline-action" @click="phoneCode='826104'">{{ l('填入验证码', 'Fill code') }}</button></view></view>
          <view class="field"><text class="field-label">{{ l('邮箱', 'Email') }}</text><view class="field-control"><SsIcon name="mail" :size="20" tone="muted" /><text class="masked-contact">{{ maskEmail(form.email) }}</text><button class="inline-action" @click="sendVerification('email')">{{ l('绑定', 'Link') }}</button></view><view v-if="emailSession" class="field-control code-field"><SsIcon name="shield-check" :size="20" tone="default" /><input v-model="emailCode" maxlength="6" type="number" :placeholder="l('输入 6 位验证码', 'Enter the 6-digit code')" /><button class="inline-action" @click="emailCode='826104'">{{ l('填入验证码', 'Fill code') }}</button></view></view>
        </view>
        <view class="notice profile-visibility"><SsIcon name="shield-check" :size="19" tone="brand-strong" /><view><strong>{{ l('资料可见范围','Profile visibility') }}</strong><text>{{ l('昵称和头像仅对授权经销商与售后人员可见。', 'Your name and avatar are visible only to authorized dealers and service staff.') }}</text></view></view>
      </template>
    </scroll-view>
  </view>
</template>

<style scoped>
.identity-panel { display:flex;min-height:332rpx;flex-direction:column;align-items:center;justify-content:center;padding:28rpx 0;text-align:center; }.identity-panel > text { margin-top:18rpx;font-size:34rpx;font-weight:600; }.identity-panel > span { margin:6rpx 0 12rpx;color:var(--color-text-secondary);font-size:22rpx; }.avatar-large,.avatar-button { position:relative;display:flex;width:132rpx;height:132rpx;align-items:center;justify-content:center;overflow:hidden;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:6rpx solid #fff;border-radius:28rpx;box-shadow:var(--shadow-card); }.avatar-large image,.avatar-button image { width:100%;height:100%; }.avatar-button { width:164rpx;height:164rpx;color:#fff;background:var(--color-action-primary);border-radius:50%; }.change-avatar { margin-top:18rpx;color:var(--color-action-primary);background:transparent;border:0;font-size:22rpx;font-weight:600; }.file-rule { margin-top:14rpx!important;color:var(--color-text-secondary);font-size:21rpx!important;font-weight:400!important; }.profile-section { margin-top:24rpx; }.section-label { display:block;margin:0 4rpx 12rpx;color:var(--color-text-secondary);font-size:22rpx;font-weight:600; }.info-row { display:flex;min-height:94rpx;align-items:center;justify-content:space-between;gap:24rpx;padding:20rpx 24rpx;border-bottom:2rpx solid var(--color-divider); }.info-row:last-child { border-bottom:0; }.info-row text { color:var(--color-text-secondary);font-size:23rpx; }.info-row strong { min-width:0;overflow-wrap:anywhere;font-size:24rpx;text-align:right; }.info-row .success { color:var(--ss-green-700); }.edit-form { display:flex;flex-direction:column;gap:16rpx;margin-top:14rpx;padding:28rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.edit-form .field { margin-bottom:0; }.edit-form .field-label text:last-child { margin-left:auto;color:var(--color-text-secondary);font-size:20rpx;font-weight:400; }.field-control { min-height:88rpx; }.field-control.active { border-color:var(--color-action-primary);box-shadow:0 0 0 5rpx rgba(40,114,248,.08); }.field-control input { min-width:0; }.masked-contact { min-width:0;flex:1;font-size:24rpx; }.inline-action { min-width:100rpx;height:64rpx;padding:0 10rpx;color:var(--color-action-primary);background:transparent;border:0;font-size:21rpx;font-weight:600; }.code-field { margin-top:12rpx; }.profile-visibility { margin-top:24rpx;align-items:flex-start; }.profile-visibility > view { min-width:0;flex:1; }.profile-visibility strong,.profile-visibility text { display:block; }.profile-visibility text { margin-top:5rpx; }
.identity-panel.compact { min-height:216rpx;padding:20rpx 0 32rpx; }.identity-panel.compact .avatar-large { width:164rpx;height:164rpx;color:#fff;background:var(--color-action-primary);border-radius:50%; }.profile-icon-list { box-shadow:none; }.profile-icon-row { display:flex;min-height:116rpx;align-items:center;gap:18rpx;padding:16rpx 24rpx;border-bottom:2rpx solid var(--color-divider); }.profile-icon-row:last-child { border-bottom:0; }.profile-icon-row > i { display:flex;width:72rpx;height:72rpx;flex:0 0 72rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.profile-icon-row > i.success { background:var(--ss-green-50); }.profile-icon-row > strong,.profile-icon-row > view { min-width:0;flex:1; }.profile-icon-row strong { display:block;font-size:25rpx; }.profile-icon-row > span { max-width:230rpx;overflow:hidden;color:var(--color-text-secondary);font-size:22rpx;text-overflow:ellipsis;white-space:nowrap; }.profile-icon-row view text { display:block;margin-top:4rpx;color:var(--color-text-secondary);font-size:20rpx; }.profile-protection-state { display:flex;align-items:center;gap:8rpx; }
.identity-panel { min-height:260rpx;padding:24rpx 0; }.identity-panel.compact { min-height:188rpx; }
.avatar-large,.avatar-button,.identity-panel.compact .avatar-large { width:112rpx;height:112rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:50%;box-shadow:none; }
.avatar-button { width:132rpx;height:132rpx; }
.edit-form { padding:24rpx;border-radius:var(--radius-md); }
.profile-icon-row { min-height:104rpx;gap:14rpx;padding:14rpx 22rpx; }
.profile-icon-row > i,.profile-icon-row > i.success { width:50rpx;height:50rpx;flex-basis:50rpx;background:transparent;border-radius:var(--radius-sm); }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
