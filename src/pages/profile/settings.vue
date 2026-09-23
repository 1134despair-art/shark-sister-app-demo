<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsModal from '@/components/SsModal.vue'
import SsStatus from '@/components/SsStatus.vue'
import { brandAssets } from '@/config/iconAssets'
import { appLocales, getLocaleOption } from '@/config/locales'
import { notificationAdapter } from '@/services/adapters'
import { complianceService, type PermissionCapability } from '@/services/compliance'
import { useAppStore } from '@/stores/app'
import type { LocaleCode } from '@/types/models'
import { backOrFallback } from '@/utils/navigation'

type NotificationKey = 'device' | 'ota' | 'service' | 'sync' | 'product'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const section = ref('main')
const legalSource = ref<'login' | 'register' | ''>('')
const logoutModal = ref(false)
const forbidden = ref(false)
const pendingLocale = ref<LocaleCode>('zh-Hans')
const showLanguagePicker = ref(false)
const languageOptions = appLocales
const currentLocaleOption = computed(() => getLocaleOption(store.locale))
const pendingLocaleOption = computed(() => getLocaleOption(pendingLocale.value))
const notificationPrefs = reactive({ device:true, ota:true, service:true, sync:false, product:false })
const title = computed(() => ({ main: l('App 设置', 'App settings'), notifications: l('通知设置', 'Notifications'), language: l('显示语言', 'Display language'), privacy: l('隐私与数据', 'Privacy and data'), 'privacy-policy': l('隐私政策', 'Privacy policy'), 'user-agreement': l('用户协议', 'User agreement'), about: l('关于鲨鱼妹妹', 'About Shark Sister'), 'role-scope': l('角色与数据范围', 'Role & data scope') }[section.value] || l('App 设置', 'App settings')))
const legalDocument = computed(() => section.value === 'privacy-policy' ? {
  updated: l('更新日期：2026年8月14日', 'Updated: August 14, 2026'),
  intro: l('本政策说明鲨鱼妹妹 App 如何在账号、设备、地图与售后服务中处理你的信息。', 'This policy explains how Shark Sister handles information for accounts, devices, maps, and support services.'),
  blocks: [
    [l('我们收集的信息','Information we collect'), l('账号资料包括手机号或邮箱、昵称和所属角色；设备资料包括序列号、型号、连接状态、遥测与故障记录；地图功能可能处理定位、航点和航线；售后功能处理联系人、问题描述、附件和服务记录。','Account data includes a phone number or email, display name, and role. Device data includes serial numbers, models, connectivity, telemetry, and faults. Map features may process location, waypoints, and routes. Support features process contacts, descriptions, attachments, and service history.')],
    [l('使用目的','How information is used'), l('信息用于登录验证、设备绑定与控制、状态提醒、地图导航、固件更新、售后处理、经销商授权范围和安全审计。我们不会将信息用于与这些目的无关的自动决策。','Information is used for sign-in verification, device binding and control, alerts, navigation, firmware updates, support, dealer authorization, and security audits. It is not used for unrelated automated decisions.')],
    [l('设备权限','Device permissions'), l('蓝牙用于发现和连接设备；定位用于地图、附近设备和航点；相机或相册仅在你上传头像、凭证或售后附件时使用。拒绝权限不会影响与该权限无关的功能。','Bluetooth discovers and connects devices. Location supports maps, nearby devices, and waypoints. Camera or photos are used only when you upload an avatar, evidence, or support attachment. Denying a permission does not affect unrelated features.')],
    [l('存储、共享与跨境','Storage, sharing, and transfers'), l('本地草稿、离线航点和业务记录保存在当前设备。正式环境的数据驻留、云端保存期限及跨境传输由部署区域和服务协议决定。只有完成服务所需的授权经销商、地图、支付或云服务方可在最小范围内处理相关数据。','Local drafts, offline waypoints, and business records stay on this device. Production residency, cloud retention, and international transfers depend on deployment region and service terms. Authorized dealers, maps, payments, or cloud providers process only the data needed to deliver their services.')],
    [l('你的权利与联系我们','Your rights and contact'), l('你可以在账号与隐私设置中查看、更正或申请删除个人资料，并可关闭非必要通知或撤回设备权限。正式环境的数据导出、删除和投诉请求由运营主体的隐私联系人受理。','You can review, correct, or request deletion of profile data, disable optional notifications, and withdraw device permissions. In production, export, deletion, and complaint requests are handled by the operator privacy contact.')],
  ],
} : {
  updated: l('更新日期：2026年8月14日', 'Updated: August 14, 2026'),
  intro: l('使用鲨鱼妹妹 App 前，请阅读并理解本协议。登录、注册或继续使用即表示你同意遵守本协议。', 'Read and understand this agreement before using Shark Sister. Signing in, registering, or continuing to use the app means you agree to these terms.'),
  blocks: [
    [l('服务范围','Service scope'), l('鲨鱼妹妹提供船舶设备查看、连接、控制、地图航点、固件更新、售后工单及经销商业务协作功能。部分能力依赖设备型号、账号权限、所在地区和第三方服务。','Shark Sister provides marine device viewing, connectivity, control, map waypoints, firmware updates, support tickets, and dealer collaboration. Availability depends on device model, account permission, region, and third-party services.')],
    [l('账号与安全','Accounts and security'), l('你应提供真实、有效的注册信息，妥善保管验证码和登录凭据，并对账号下的设备控制、航点写入和业务操作负责。发现未经授权的使用时应立即修改密码并联系服务方。','Provide accurate registration information, protect verification codes and credentials, and take responsibility for device control, waypoint changes, and business actions under your account. Change your password and contact support if unauthorized use is suspected.')],
    [l('设备操作与安全','Device operation and safety'), l('远程控制、固件升级和解绑可能影响设备运行。操作前应确认现场环境、设备在线状态和人员安全，不得绕过权限、告警或安全保护。破坏性操作会要求二次确认并保留记录。','Remote control, firmware updates, and unbinding can affect device operation. Confirm field conditions, connectivity, and personnel safety before acting. Do not bypass permissions, alerts, or safeguards. Destructive actions require confirmation and are recorded.')],
    [l('可接受使用','Acceptable use'), l('不得利用本服务侵害他人权益、上传违法内容、干扰设备或平台、冒用账号、绕过数据范围，或对软件和接口进行未经授权的攻击、复制和商业利用。','Do not use the service to violate rights, upload unlawful content, disrupt devices or the platform, impersonate accounts, bypass data scopes, or attack, copy, or commercially exploit software and APIs without authorization.')],
    [l('第三方服务与责任边界','Third-party services and limits'), l('地图、支付、消息推送、云端接口和硬件 SDK 由相应服务方提供并受其规则约束。离线、网络中断、设备故障或外部服务不可用时，部分功能可能延迟或暂停；紧急情况请使用现场安全措施和人工联系方式。','Maps, payments, push notifications, cloud APIs, and hardware SDKs are provided under third-party terms. Features may be delayed or unavailable during outages, network loss, device faults, or external service failures. Use field safety measures and human contacts in emergencies.')],
  ],
})

onLoad(async (query) => {
  await store.init()
  section.value = String(query?.section || 'main')
  legalSource.value = ['login', 'register'].includes(String(query?.from || '')) ? String(query?.from) as 'login' | 'register' : ''
  pendingLocale.value = store.locale
  forbidden.value = store.isGuest && !['language', 'privacy-policy', 'user-agreement', 'about'].includes(section.value)
  const saved = store.db?.settings
  if (saved) {
    notificationPrefs.device = saved.notifications.device
    notificationPrefs.ota = saved.notifications.ota
    notificationPrefs.service = saved.notifications.service
    notificationPrefs.sync = saved.notifications.sync
    notificationPrefs.product = saved.notifications.product
  }
})
async function setLocale(locale: LocaleCode) {
  await store.setLocale(locale)
  uni.showToast({ title: locale === 'zh-Hans' ? '语言已切换，正在重新载入' : 'Language updated. Reloading', icon: 'success' })
  setTimeout(() => uni.reLaunch({ url: '/pages/shell/index?tab=profile' }), 350)
}
function chooseLanguage(locale: LocaleCode) {
  pendingLocale.value = locale
  showLanguagePicker.value = false
}
async function logout() { await store.logout(); logoutModal.value = false; uni.reLaunch({ url: '/pages/auth/login' }) }
const notificationEnabled = computed(() => Boolean(store.db?.settings.notifications.device))
function permissionLabel(capability: PermissionCapability) {
  const state = store.db?.settings.permissions[capability]?.state || 'unknown'
  return ({ granted: l('使用时允许', 'Allowed while using'), denied: l('已拒绝', 'Denied'), unknown: l('尚未询问', 'Not requested') } as const)[state]
}
async function toggleNotifications() {
  const next = !notificationEnabled.value
  if (next) {
    try {
      const result = await notificationAdapter.requestPermission()
      complianceService.recordPermission('notifications', result, store.account?.id || 'guest')
      store.refresh()
      if (result !== 'granted') return
    } catch {
      return uni.showToast({ title: l('通知权限未开启', 'Notification permission denied'), icon: 'none' })
    }
  }
  const keys: NotificationKey[] = ['device', 'ota', 'service', 'sync', 'product']
  for (const key of keys) await store.updateNotifications(key, next)
}
async function toggleNotificationPref(key: NotificationKey) {
  const next = !notificationPrefs[key]
  notificationPrefs[key] = next
  await store.updateNotifications(key, next)
}
function handleSettingsBack() {
  if (['privacy-policy', 'user-agreement'].includes(section.value) && legalSource.value) {
    backOrFallback(`/pages/auth/${legalSource.value}`)
    return
  }
  section.value = ['privacy-policy', 'user-agreement'].includes(section.value) ? 'privacy' : 'main'
}
function showPermission(capability: PermissionCapability, name: string) {
  uni.showActionSheet({
    itemList: [l('使用时允许', 'Allow while using'), l('拒绝', 'Deny')],
    success(result) {
      complianceService.recordPermission(capability, result.tapIndex === 0 ? 'granted' : 'denied', store.account?.id || 'guest')
      store.refresh()
      uni.showToast({ title: `${name}：${permissionLabel(capability)}`, icon: 'none' })
    },
  })
}
function showMapState() {
  uni.showModal({ title: l('本机海图', 'On-device chart'), content: l('当前使用随 App 下发的海图底图。正式地图服务接入后，可由后台切换地图提供方。', 'The app currently uses its bundled chart. The map provider can be configured after the production service is connected.'), showCancel: false })
}
function checkAppUpdate() {
  uni.showModal({ title: l('暂无法检查更新', 'Update check unavailable'), content: l('应用商店版本服务尚未配置，当前版本为 V3.2.0。配置完成前不会返回虚假的更新结果。', 'The app-store version service is not configured. The current version is V3.2.0; no update result is reported until the service is available.'), showCancel: false })
}
</script>

<template>
  <view class="page settings-page">
    <SsAppBar :title="title" :intercept-back="section !== 'main'" fallback-url="/pages/shell/index?tab=profile" @back="handleSettingsBack" />
    <scroll-view v-if="forbidden" scroll-y class="page-scroll"><view class="privacy-hero"><view class="privacy-icon"><SsIcon name="shield-alert" :size="38" tone="default" /></view><text>{{ l('需要登录','Sign in required') }}</text><span>{{ l('游客设置不会持久化，请登录后管理账号、通知和本地数据。','Guest settings are not persisted. Sign in to manage your account, notifications, and local data.') }}</span><button class="btn primary login-required" @click="uni.reLaunch({url:'/pages/auth/login'})">{{ l('去登录','Sign in') }}</button></view></scroll-view>
    <scroll-view v-else scroll-y class="page-scroll">
      <template v-if="section === 'main'">
        <view class="list-card">
          <view class="list-row" @click="section = 'notifications'"><view class="row-icon"><SsIcon name="bell" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('消息通知','Notifications') }}</strong><text>{{ l('设备告警、售后进度','Device alerts and service progress') }}</text></view><SsStatus status="online" :label="l('已开启','Enabled')"/><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
          <view class="list-row" @click="section = 'language'"><view class="row-icon purple"><SsIcon name="languages" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('显示语言','Display language') }}</strong><text>{{ currentLocaleOption.nativeName }}</text></view><text class="row-value">{{ currentLocaleOption.shortCode }}</text><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
          <view class="list-row" @click="showMapState"><view class="row-icon"><SsIcon name="map" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('地图服务','Map service') }}</strong><text>{{ l('本机海图','On-device chart') }}</text></view><text class="row-value">{{ l('本机','Local') }}</text><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
        </view>
        <view class="section list-card">
          <view class="list-row" @click="uni.navigateTo({url:'/pages/process/index?scenario=ota&stage=0'})"><view class="row-icon warning"><SsIcon name="download" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('固件更新','Firmware update') }}</strong><text>{{ l('自动检测可用版本','Check available versions automatically') }}</text></view><SsStatus status="pending" :label="l('有更新','Update')"/><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
          <view class="list-row" @click="showPermission('bluetooth',l('蓝牙权限','Bluetooth'))"><view class="row-icon"><SsIcon name="bluetooth" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('蓝牙权限','Bluetooth permission') }}</strong><text>{{ permissionLabel('bluetooth') }}</text></view><text class="row-value">{{ permissionLabel('bluetooth') }}</text><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
          <view class="list-row" @click="showPermission('location',l('定位权限','Location'))"><view class="row-icon"><SsIcon name="map-pin" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('定位权限','Location permission') }}</strong><text>{{ permissionLabel('location') }}</text></view><text class="row-value">{{ permissionLabel('location') }}</text><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
        </view>
        <view class="section list-card">
          <view class="list-row" @click="section = 'privacy'"><view class="row-icon"><SsIcon name="shield-check" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('隐私与数据','Privacy and data') }}</strong><text>{{ l('权限、缓存与账号数据','Permissions, cache, and account data') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
          <view class="list-row" @click="section = 'about'"><view class="row-icon"><SsIcon name="info" :size="22" tone="brand" /></view><view class="list-copy"><strong>{{ l('关于鲨鱼妹妹','About Shark Sister') }}</strong><text>V3.2.0</text></view><text class="row-value">V3.2.0</text><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
        </view>
        <view class="section list-card">
          <view class="list-row logout" @click="logoutModal = true"><view class="row-icon danger"><SsIcon name="log-out" :size="22" tone="danger" /></view><view class="list-copy"><strong>{{ $t('profile.logout') }}</strong><text>{{ l('待上传航点会继续保留在本机','Pending waypoints remain on this device') }}</text></view><SsIcon name="chevron-right" :size="18" tone="muted" /></view>
        </view>
      </template>

      <template v-else-if="section === 'notifications'">
        <view class="notice success notification-notice"><SsIcon name="bell-ring" :size="19" tone="success" /><view><strong>{{ l('系统通知已开启','System notifications enabled') }}</strong><text>{{ l('重要设备告警仍建议保持开启。','Keep important device alerts enabled.') }}</text></view></view>
        <view class="section list-card notification-list"><view v-for="item in [{key:'device',icon:'triangle-alert',tone:'danger',skin:'danger',label:l('设备异常','Device alerts'),copy:l('未连接、故障与高温告警','Connection, fault, and temperature alerts')},{key:'ota',icon:'download',tone:'brand',skin:'',label:l('固件更新','Firmware updates'),copy:l('发现可用固件时提醒','Notify when firmware is available')},{key:'service',icon:'wrench',tone:'warning',skin:'warning',label:l('售后进度','Service progress'),copy:l('审批、发货与处理状态','Approval, shipping, and service status')},{key:'sync',icon:'cloud-upload',tone:'success',skin:'success',label:l('航点同步','Waypoint sync'),copy:l('网络恢复和上传结果','Network recovery and upload results')},{key:'product',icon:'megaphone',tone:'accent',skin:'purple',label:l('产品与服务消息','Product and service news'),copy:l('活动和功能更新','Campaigns and feature updates')}]" :key="item.key" class="list-row" @click="toggleNotificationPref(item.key as NotificationKey)"><view class="row-icon" :class="item.skin"><SsIcon :name="item.icon" :size="21" :tone="item.tone as any" /></view><view class="list-copy"><strong>{{ item.label }}</strong><text>{{ item.copy }}</text></view><view class="switch" :class="{on:notificationPrefs[item.key as keyof typeof notificationPrefs]}" /></view></view>
      </template>

      <template v-else-if="section === 'language'">
        <view class="card language-select-card">
          <text class="field-label">{{ l('显示语言','Display language') }}</text>
          <button class="language-picker-control" data-language-picker @click="showLanguagePicker = true">
            <view class="language-picker-icon"><SsIcon name="languages" :size="22" tone="brand" /></view>
            <view class="language-picker-copy" :lang="pendingLocaleOption.code" :dir="pendingLocaleOption.direction">
              <strong>{{ pendingLocaleOption.nativeName }}</strong>
              <text>{{ store.locale === 'zh-Hans' ? pendingLocaleOption.nameZh : pendingLocaleOption.nameEn }}</text>
            </view>
            <text class="language-picker-code">{{ pendingLocaleOption.shortCode }}</text>
            <SsIcon name="chevron-down" :size="18" tone="muted" />
          </button>
          <text class="language-select-hint">{{ l('支持 13 种显示语言，点击展开选择。','Choose from 13 display languages.') }}</text>
        </view>
        <view class="notice warning language-notice"><SsIcon name="refresh-cw" :size="19" tone="warning-strong" /><view><strong>{{ l('切换语言','Switch language') }}</strong><text>{{ l('当前版本需要重新启动 App 才能完成切换，未提交内容会先保留。','Restart the app to finish switching. Unsaved content will be preserved first.') }}</text></view></view>
        <view class="section list-card language-options"><view class="list-row"><view class="row-icon"><SsIcon name="calendar-days" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('日期格式','Date format') }}</strong></view><text class="row-value">2026-08-10</text><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="list-row"><view class="row-icon"><SsIcon name="ruler" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('单位制','Units') }}</strong></view><text class="row-value">{{ store.db?.settings.unitSystem === 'imperial' ? l('英制','Imperial') : l('公制','Metric') }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></view><view class="list-row"><view class="row-icon"><SsIcon name="badge-dollar-sign" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('货币','Currency') }}</strong></view><text class="row-value">{{ store.db?.settings.region === 'CN' ? 'CNY ¥' : 'USD $' }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></view></view>
        <button class="btn primary apply-language" @click="setLocale(pendingLocale)"><SsIcon name="refresh-cw" :size="19" tone="inverse" />{{ l('应用并重新启动','Apply and restart') }}</button>
      </template>

      <template v-else-if="section === 'privacy'">
        <view class="card privacy-hero"><view class="privacy-icon"><SsIcon name="shield-check" :size="38" tone="success" /></view><text>{{ l('你的数据由当前账号管理','Your data follows the current account') }}</text><span>{{ l('本机数据按账号和经销商范围隔离；云端数据驻留位置由正式部署区域决定。','On-device data is isolated by account and dealer scope. Cloud residency depends on the deployment region.') }}</span></view>
        <text class="group-label">{{ l('数据与权限','Data and permissions') }}</text>
        <view class="list-card privacy-list">
          <view class="list-row" @click="showPermission('location',l('定位权限','Location'))"><view class="row-icon"><SsIcon name="map-pin" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('定位数据','Location data') }}</strong><text>{{ l('仅在地图、附近设备和航点功能中使用','Used only for maps, nearby devices, and waypoints') }}</text></view><text class="row-value">{{ permissionLabel('location') }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="list-row" @click="showPermission('bluetooth',l('蓝牙权限','Bluetooth'))"><view class="row-icon"><SsIcon name="bluetooth" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('蓝牙与附近设备','Bluetooth and nearby devices') }}</strong><text>{{ l('用于发现、绑定和连接设备','Used to discover, bind, and connect devices') }}</text></view><text class="row-value">{{ permissionLabel('bluetooth') }}</text><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="list-row"><view class="row-icon success"><SsIcon name="check-circle-2" :size="21" tone="success" /></view><view class="list-copy"><strong>{{ l('账号数据范围','Account data scope') }}</strong><text>{{ store.isDealer ? l('当前经销商及授权下属网点','Current dealer and authorized sub-outlets') : l('仅当前账号绑定的数据','Only data bound to this account') }}</text></view><SsStatus status="online" :label="l('已隔离','Isolated')" /></view>
        </view>
        <text class="group-label">{{ l('本地数据','Local data') }}</text>
        <view class="notice warning privacy-notice"><SsIcon name="info" :size="20" tone="warning" /><view><strong>{{ l('离线内容保留在本机','Offline content stays on this device') }}</strong><text>{{ l('待上传航点、表单草稿和业务记录不会因退出登录自动删除。','Pending waypoints, drafts, and business records are not removed automatically when signing out.') }}</text></view></view>
        <text class="group-label">{{ l('协议与政策','Agreements and policies') }}</text>
        <view class="list-card legal-links">
          <view class="list-row" data-legal="user-agreement" @click="section = 'user-agreement'"><view class="row-icon"><SsIcon name="notebook-pen" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('用户协议','User agreement') }}</strong><text>{{ l('账号、设备操作与服务使用规则','Rules for accounts, device actions, and services') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="list-row" data-legal="privacy-policy" @click="section = 'privacy-policy'"><view class="row-icon success"><SsIcon name="shield-check" :size="21" tone="success" /></view><view class="list-copy"><strong>{{ l('隐私政策','Privacy policy') }}</strong><text>{{ l('信息收集、权限用途与用户权利','Collection, permissions, and user rights') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
        </view>
      </template>

      <template v-else-if="section === 'privacy-policy' || section === 'user-agreement'">
        <view class="notice warning legal-review"><SsIcon name="info" :size="19" tone="warning" /><text>{{ l('V3.2 产品文本，正式上线前需由运营主体和法务审核。','V3.2 product copy. The operator and legal counsel must review it before release.') }}</text></view>
        <view class="card legal-document">
          <view class="legal-intro"><text>{{ title }}</text><span>{{ legalDocument.updated }}</span><p>{{ legalDocument.intro }}</p></view>
          <view v-for="(block,index) in legalDocument.blocks" :key="block[0]" class="legal-block"><i>{{ String(index + 1).padStart(2,'0') }}</i><view><strong>{{ block[0] }}</strong><text>{{ block[1] }}</text></view></view>
        </view>
      </template>

      <template v-else-if="section === 'about'">
        <view class="card about about-page"><image :src="brandAssets.logoMark" mode="aspectFit" /><text>{{ l('鲨鱼妹妹','Shark Sister') }}</text><span>V3.2.0</span><p>{{ l('智能船舶设备管理与售后服务','Smart marine device management and service') }}</p></view>
        <view class="section list-card about-list">
          <view class="list-row"><view class="row-icon"><SsIcon name="info" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('当前版本','Current version') }}</strong><text>{{ l('国内版 · 数据保存在本机','China build · data stored on device') }}</text></view><text class="row-value">V3.2.0</text></view>
          <view class="list-row" @click="checkAppUpdate"><view class="row-icon warning"><SsIcon name="download" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('检查更新','Check for updates') }}</strong><text>{{ l('应用商店版本服务未配置','App-store version service not configured') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
          <view class="list-row" @click="section = 'privacy'"><view class="row-icon"><SsIcon name="shield-check" :size="21" tone="brand" /></view><view class="list-copy"><strong>{{ l('隐私与数据说明','Privacy and data notice') }}</strong><text>{{ l('查看数据范围和设备权限用途','Review data scope and device permissions') }}</text></view><SsIcon name="chevron-right" :size="17" tone="muted" /></view>
        </view>
      </template>

      <template v-else-if="section === 'role-scope'">
        <view class="card privacy-hero"><view class="privacy-icon"><SsIcon name="building-2" :size="38" tone="default" /></view><text>{{ store.account?.role === 'dealerAdmin' ? l('一级经销商管理员','Primary dealer administrator') : l('经销商员工','Dealer staff') }}</text><span>{{ store.account?.dealerId }} · {{ l('权限来自当前组织账号配置','Permissions come from the current organization account') }}</span></view>
        <text class="group-label">{{ l('组织层级','Organization hierarchy') }}</text><view class="list-card"><view class="list-row"><view class="row-icon"><SsIcon name="store" :size="22" tone="default" /></view><view class="list-copy"><strong>{{ l('厦门海创一级经销商','Xiamen Hichain Primary Dealer') }}</strong><text>{{ l('可查看本级及下属网点汇总数据','Can view aggregate data for this outlet and sub-dealers') }}</text></view><SsIcon name="chevron-right" :size="18" tone="default" /></view><view class="list-row"><view class="row-icon purple"><SsIcon name="building-2" :size="22" tone="default" /></view><view class="list-copy"><strong>{{ l('泉州远航服务网点','Quanzhou Voyage Service') }}</strong><text>{{ l('下级数据继承上级可见范围','Sub-dealer data inherits the parent visibility scope') }}</text></view><text class="row-value">{{ l('二级','Level 2') }}</text></view></view>
        <text class="group-label">{{ l('当前权限','Current permissions') }}</text><view class="permission-scope card"><view v-for="capability in store.account?.capabilities" :key="capability"><SsIcon name="check-circle-2" :size="18" tone="default" /><text>{{ capability }}</text></view></view>
        <view class="notice warning section"><SsIcon name="shield-alert" :size="20" tone="default" /><text>{{ l('价格、审批和员工管理属于敏感权限。员工无法通过直接链接绕过权限限制。','Pricing, approvals, and staff management are sensitive permissions. Direct links cannot bypass access controls.') }}</text></view>
      </template>

      <view class="safe-bottom" />
    </scroll-view>
    <view v-if="showLanguagePicker" class="language-picker-layer" @click.self="showLanguagePicker = false">
      <view class="language-picker-sheet">
        <view class="language-picker-handle" />
        <view class="language-picker-head">
          <view><strong>{{ l('选择显示语言','Choose display language') }}</strong><text>{{ l('选中后返回设置页确认应用','Select a language, then apply it in settings.') }}</text></view>
          <button class="icon-button language-picker-close" :aria-label="l('关闭','Close')" @click="showLanguagePicker = false"><SsIcon name="x" :size="20" tone="muted" /></button>
        </view>
        <scroll-view scroll-y class="language-picker-list">
          <button v-for="option in languageOptions" :key="option.code" class="language-picker-option" :class="{ selected:pendingLocale === option.code }" :data-locale="option.code" @click="chooseLanguage(option.code)">
            <text class="language-option-code">{{ option.shortCode }}</text>
            <view class="language-option-copy" :lang="option.code" :dir="option.direction"><strong>{{ option.nativeName }}</strong><text>{{ store.locale === 'zh-Hans' ? option.nameZh : option.nameEn }}</text></view>
            <SsIcon v-if="pendingLocale === option.code" name="circle-check" :size="19" tone="brand" />
          </button>
        </scroll-view>
        <button class="btn subtle language-picker-cancel" @click="showLanguagePicker = false">{{ l('取消','Cancel') }}</button>
      </view>
    </view>
    <SsModal :show="logoutModal" :title="l('退出登录','Sign out')" :description="l('当前会话将被清除；设备、项目和待上传航点仍保留在本机。','The session will be cleared. Devices, projects, and pending waypoints remain on this device.')" icon="log-out" tone="warning" :confirm-text="l('退出登录','Sign out')" @cancel="logoutModal = false" @confirm="logout" />
  </view>
</template>

<style scoped>
.row-icon { display:flex;width:68rpx;height:68rpx;flex:0 0 68rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.row-icon.success { background:var(--ss-green-50); }.row-icon.warning { background:var(--ss-orange-50); }.row-icon.purple { background:var(--ss-purple-50); }.row-icon.danger { background:var(--ss-red-50); }.logout strong { color:var(--ss-red-700); }.group-label { display:block;margin:12rpx 4rpx 14rpx;color:var(--color-text-secondary);font-size:22rpx;font-weight:600; }.group-label:not(:first-child) { margin-top:36rpx; }.permission-state { color:var(--ss-green-700);font-size:22rpx;font-weight:600; }.privacy-hero { display:flex;flex-direction:column;align-items:center;padding:48rpx 32rpx;text-align:center; }.privacy-icon { display:flex;width:128rpx;height:128rpx;align-items:center;justify-content:center;background:var(--ss-green-50);border-radius:28rpx; }.privacy-hero > text { margin-top:22rpx;font-size:30rpx;font-weight:600; }.privacy-hero > span { max-width:560rpx;margin-top:10rpx;color:var(--color-text-secondary);font-size:23rpx;line-height:36rpx; }.about { display:flex;flex-direction:column;align-items:center;padding:40rpx 0 56rpx;text-align:center; }.about image { width:144rpx;height:144rpx; }.about > text { margin-top:18rpx;font-size:36rpx;font-weight:600; }.about > span { margin-top:8rpx;color:var(--color-text-secondary);font-size:22rpx; }.about p { margin-top:18rpx;color:var(--color-text-body);font-size:24rpx; }
.permission-scope { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12rpx;padding:22rpx; }.permission-scope view { display:flex;min-width:0;align-items:center;gap:10rpx;color:var(--ss-green-700);font-size:20rpx; }.permission-scope text { min-width:0;overflow:hidden;color:var(--color-text-body);text-overflow:ellipsis;white-space:nowrap; }
.login-required { width:100%;margin-top:30rpx; }
.permission-state.unavailable { color:var(--ss-orange-700); }
.language-select-card { padding:24rpx;box-shadow:none; }.language-select-card > .field-label { display:block;margin-bottom:12rpx;color:var(--color-text-primary);font-size:22rpx;font-weight:600; }.language-picker-control { display:flex;width:100%;min-height:100rpx;align-items:center;gap:16rpx;padding:14rpx 18rpx;color:var(--color-text-primary);background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:14rpx;box-sizing:border-box;text-align:left; }.language-picker-control::after,.language-picker-option::after { display:none; }.language-picker-control:active { background:var(--color-action-primary-subtle);border-color:var(--color-action-primary); }.language-picker-icon { display:flex;width:66rpx;height:66rpx;flex:0 0 66rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:12rpx; }.language-picker-copy { min-width:0;flex:1; }.language-picker-copy strong,.language-picker-copy text { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.language-picker-copy strong { font-size:25rpx;line-height:34rpx; }.language-picker-copy text { margin-top:2rpx;color:var(--color-text-secondary);font-size:19rpx;line-height:28rpx; }.language-picker-code { color:var(--color-action-primary);font-size:18rpx;font-weight:700; }.language-select-hint { display:block;margin-top:12rpx;color:var(--color-text-secondary);font-size:19rpx;line-height:28rpx; }.language-notice { align-items:flex-start;margin-top:26rpx; }.language-notice > view { min-width:0;flex:1; }.language-notice strong,.language-notice text { display:block; }.language-notice strong { font-size:23rpx; }.language-notice text { margin-top:4rpx;font-size:20rpx;line-height:31rpx; }.language-options .list-row { min-height:110rpx; }.apply-language { width:100%;margin-top:30rpx; }
.language-picker-layer { position:fixed;z-index:120;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.42); }.language-picker-sheet { width:100%;max-width:780rpx;padding:12rpx 28rpx calc(24rpx + env(safe-area-inset-bottom));background:#fff;border-radius:24rpx 24rpx 0 0;box-sizing:border-box;direction:ltr;box-shadow:var(--shadow-floating); }.language-picker-handle { width:72rpx;height:8rpx;margin:0 auto 18rpx;background:var(--ss-neutral-300);border-radius:999rpx; }.language-picker-head { display:flex;align-items:center;gap:18rpx;padding-bottom:18rpx;border-bottom:2rpx solid var(--color-divider); }.language-picker-head > view { min-width:0;flex:1; }.language-picker-head strong,.language-picker-head text { display:block; }.language-picker-head strong { font-size:29rpx;line-height:38rpx; }.language-picker-head text { margin-top:4rpx;color:var(--color-text-secondary);font-size:19rpx;line-height:28rpx; }.language-picker-close { flex:0 0 auto; }.language-picker-list { max-height:min(680rpx,56vh); }.language-picker-option { display:flex;width:100%;min-height:94rpx;align-items:center;gap:16rpx;padding:12rpx 10rpx;color:var(--color-text-primary);background:#fff;border:0;border-bottom:2rpx solid var(--color-divider);border-radius:0;box-sizing:border-box;text-align:left; }.language-picker-option.selected { background:var(--color-action-primary-subtle); }.language-option-code { display:flex;width:62rpx;height:52rpx;flex:0 0 62rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:10rpx;font-size:17rpx;font-weight:700; }.language-picker-option.selected .language-option-code { color:#fff;background:var(--color-action-primary); }.language-option-copy { min-width:0;flex:1; }.language-option-copy strong,.language-option-copy text { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.language-option-copy strong { font-size:23rpx;line-height:32rpx; }.language-option-copy text { margin-top:2rpx;color:var(--color-text-secondary);font-size:18rpx;line-height:26rpx; }.language-picker-cancel { width:100%;margin-top:18rpx; }
.notification-notice { align-items:flex-start; }.notification-notice > view { min-width:0;flex:1; }.notification-notice strong,.notification-notice text { display:block; }.notification-notice strong { font-size:23rpx; }.notification-notice text { margin-top:4rpx;font-size:20rpx; }.notification-list .list-row { min-height:116rpx; }.notification-group { margin-top:38rpx!important; }
.privacy-list .list-row,.about-list .list-row { min-height:112rpx; }.privacy-notice { align-items:flex-start; }.privacy-notice > view { min-width:0;flex:1; }.privacy-notice strong,.privacy-notice text { display:block; }.privacy-notice text { margin-top:6rpx;font-size:20rpx;line-height:32rpx; }.about-page { padding:46rpx 28rpx; }
.legal-links .list-row { min-height:112rpx; }.legal-review { align-items:flex-start; }.legal-review text { flex:1;font-size:20rpx;line-height:31rpx; }.legal-document { padding:30rpx;box-shadow:none; }.legal-intro { padding-bottom:26rpx;border-bottom:2rpx solid var(--color-divider); }.legal-intro > text,.legal-intro > span,.legal-intro > p { display:block; }.legal-intro > text { font-size:34rpx;font-weight:600; }.legal-intro > span { margin-top:7rpx;color:var(--color-text-secondary);font-size:19rpx; }.legal-intro > p { margin-top:20rpx;color:var(--color-text-body);font-size:22rpx;line-height:35rpx; }.legal-block { display:grid;grid-template-columns:52rpx minmax(0,1fr);gap:16rpx;padding:26rpx 0;border-bottom:2rpx solid var(--color-divider); }.legal-block:last-child { border-bottom:0; }.legal-block > i { display:flex;width:48rpx;height:48rpx;align-items:center;justify-content:center;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border-radius:10rpx;font-size:18rpx;font-style:normal;font-weight:600; }.legal-block strong,.legal-block text { display:block; }.legal-block strong { font-size:24rpx; }.legal-block text { margin-top:9rpx;color:var(--color-text-body);font-size:21rpx;line-height:34rpx; }
.row-icon,.row-icon.success,.row-icon.warning,.row-icon.purple,.row-icon.danger { width:48rpx;height:48rpx;flex-basis:48rpx;background:transparent;border-radius:var(--radius-sm); }
.privacy-hero { align-items:flex-start;padding:28rpx;text-align:left; }.privacy-icon { width:58rpx;height:58rpx;background:transparent;border:2rpx solid var(--ss-green-200);border-radius:50%; }
.language-select-card { padding:22rpx;border-radius:var(--radius-md); }.language-picker-control { min-height:88rpx;border-radius:var(--radius-md); }
.language-picker-icon { width:52rpx;height:52rpx;flex-basis:52rpx;background:transparent;border-radius:var(--radius-sm); }
.language-picker-sheet { border-radius:16rpx 16rpx 0 0; }
.language-option-code { width:56rpx;height:46rpx;flex-basis:56rpx;background:transparent;border-radius:var(--radius-sm); }
</style>

<style scoped lang="scss">
@import '@/styles/page-surfaces.scss';
@import '@/styles/overlay-surfaces.scss';
</style>
