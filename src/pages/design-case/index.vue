<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SsAppBar from '@/components/SsAppBar.vue'
import SsIcon from '@/components/SsIcon.vue'
import SsModal from '@/components/SsModal.vue'
import { getDesignCase } from '@/config/designCases'
import { useAppStore } from '@/stores/app'
import { databaseService } from '@/services/database'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const id = ref('X15')
const show = ref(true)
const item = computed(() => getDesignCase(id.value))
const dialog = computed(() => ({
  X01: { title: l('账号暂时锁定', 'Account Temporarily Locked'), description: l('密码连续错误 5 次，请 14 分 32 秒后重试，或立即找回密码。', 'Five incorrect password attempts. Try again in 14:32 or reset your password now.'), icon: 'lock-keyhole', tone: 'danger' },
  X02: { title: l('需要登录', 'Sign In Required'), description: l('当前操作需要登录账号。可前往登录或注册新账号。', 'This action requires an account. Sign in or create a new account to continue.'), icon: 'circle-help', tone: 'warning' },
  X03: { title: l('设备地区不匹配', 'Device Region Mismatch'), description: l('登记销售地区为福建厦门，当前位置为广东汕头。请联系原经销商处理跨区服务。', 'The device is registered in Xiamen while the current location is Shantou. Contact the original dealer for cross-region service.'), icon: 'map-pin-x', tone: 'danger' },
  X04: { title: l('设备已绑定', 'Device Already Bound'), description: l('该设备已绑定其他账号。如为二手机，请由原用户解绑或联系所属经销商。', 'This device belongs to another account. Ask the previous owner to unbind it or contact the assigned dealer.'), icon: 'link-2-off', tone: 'warning' },
  X05: { title: l('设备尚未建立项目', 'Project Required'), description: l('SN DL350020260810 尚未关联安装项目，经销商需先完成项目建档。', 'SN DL350020260810 is not linked to an installation project. The dealer must create the project first.'), icon: 'folder-x', tone: 'warning' },
  X06: { title: l('发现固件更新', 'Firmware Update Available'), description: l('版本 3.3.0，固件 18.6 MB，预计需要 4 分钟。', 'Version 3.3.0 is 18.6 MB and takes about 4 minutes.'), icon: 'refresh-ccw-dot', tone: 'info' },
  X07: { title: l('删除航点', 'Delete Waypoint'), description: l('“返航检查点”删除后无法恢复，待上传队列中的记录也会一并移除。', 'Return Checkpoint cannot be restored after deletion. Its pending upload record will also be removed.'), icon: 'trash-2', tone: 'danger' },
  X08: { title: l('解绑设备', 'Unbind Device'), description: l('解绑会移除控制权限，历史运行数据仍会保留。此操作不可撤销。', 'Unbinding removes control access but keeps operating history. This action cannot be undone.'), icon: 'unlink', tone: 'danger' },
  X09: { title: l('确认危险控制', 'Confirm Hazardous Control'), description: l('螺旋桨即将启动，请确认周边无人、无绳索和障碍物。', 'The propeller is about to start. Keep people, ropes, and obstacles clear.'), icon: 'triangle-alert', tone: 'danger' },
  X10: { title: l('退出登录', 'Sign Out'), description: l('当前会话将被清除，本地待上传航点仍会保留。', 'The current session will be cleared. Pending local waypoints will be kept.'), icon: 'log-out', tone: 'warning' },
  X13: { title: l('设备指令超时', 'Command Timed Out'), description: l('指令已发送但设备未回执。可立即急停、重试或检查蓝牙连接。', 'The device did not acknowledge the command. Stop, retry, or check Bluetooth.'), icon: 'timer-off', tone: 'danger' },
  X14: { title: l('支付成功', 'Payment Successful'), description: l('订单 PO202608100028 已确认，支付金额 ¥1,280.00。', 'Order PO202608100028 is confirmed. Amount paid: $1,280.00.'), icon: 'check-circle-2', tone: 'success' },
  X16: { title: l('经销商权限受限', 'Dealer Permission Required'), description: l('当前员工缺少物料审批权限，请联系经销商管理员调整角色。', 'This staff account cannot approve parts. Contact the dealer administrator to change the role.'), icon: 'shield-alert', tone: 'warning' },
}[id.value] || { title: l('需要登录', 'Sign In Required'), description: l('该操作需要登录。', 'Sign in to continue.'), icon: 'circle-help', tone: 'warning' }) as { title: string; description: string; icon: string; tone: 'info' | 'danger' | 'success' | 'warning' })

onLoad(async (query) => {
  id.value = String(query?.id || 'X15')
  const designCase = getDesignCase(id.value)
  store.db = await databaseService.reset()
  store.ready = true
  store.shellState = ''
  store.shellStatus = ''
  store.designCaseId = designCase?.id || ''
  store.designParityVisible = query?.parity !== '0'
  if (!designCase || designCase.module === 'dialog') {
    if (designCase?.id === 'X06') await store.login('13800002861', '123456')
    return
  }
  store.db = await databaseService.updateSettings({ region: designCase.region, locale: designCase.region === 'GLOBAL' ? 'en' : 'zh-Hans' })
  if (designCase.session === 'user') await store.login('13800002861', '123456')
  if (designCase.session === 'dealer') await store.login('13800000028', '123456')
  const tab = new URLSearchParams(designCase.route.split('?')[1] || '').get('tab')
  if (tab) store.activeTab = tab as typeof store.activeTab
  uni.redirectTo({ url: designCase.route })
})
function openFirmwareUpdate() {
  show.value = false
  uni.redirectTo({ url: '/pages/process/index?scenario=ota&stage=0' })
}
</script>

<template>
  <view class="page case-page">
    <SsAppBar :title="id === 'X15' ? l('页面状态','Page states') : id === 'X06' ? l('设备详情','Device details') : `${id} · ${store.locale !== 'zh-Hans' ? 'Design State' : item?.title || '设计状态'}`" fallback-url="/pages/shell/index?tab=home" />
    <scroll-view v-if="id === 'X15'" scroll-y class="page-scroll"><view class="state-grid"><view v-for="item in [{icon:'loader-circle',tone:'brand',skin:'',title:l('加载中','Loading'),copy:l('保持页面结构','Keep page structure')},{icon:'inbox',tone:'brand',skin:'',title:l('暂无记录','No records'),copy:l('提供下一步动作','Provide next action')},{icon:'circle-x',tone:'danger',skin:'error',title:l('加载失败','Load failed'),copy:l('说明原因并重试','Explain and retry')},{icon:'wifi-off',tone:'warning',skin:'warning',title:l('当前离线','Offline'),copy:l('保留可用内容','Keep available content')},{icon:'check',tone:'success',skin:'success',title:l('操作完成','Completed'),copy:l('说明具体结果','Describe the result')},{icon:'shield-alert',tone:'brand',skin:'',title:l('权限受限','Permission limited'),copy:l('解释角色与申请路径','Explain role and request path')}]" :key="item.title" class="state-card" :class="item.skin"><view class="state-icon"><SsIcon :name="item.icon" :size="34" :tone="item.tone as any" /></view><strong>{{ item.title }}</strong><text>{{ item.copy }}</text></view></view><view class="notice state-rule"><SsIcon name="info" :size="18" tone="brand-strong" /><view><strong>{{ l('状态规则','State rules') }}</strong><text>{{ l('状态必须同时使用图标、文字和语义色；不能只显示色点。','Use icons, labels, and semantic colors together, never color alone.') }}</text></view></view></scroll-view>
    <template v-else-if="id === 'X06'">
      <scroll-view scroll-y class="page-scroll modal-backdrop-content firmware-backdrop">
        <view class="permission-hero"><view><strong>{{ l('顶流机-01','Surface Jet-01') }}</strong><text>{{ l('当前页面内容保留在弹窗后方','The current page remains behind the dialog') }}</text></view><view><SsIcon name="waves" :size="48" tone="brand" /></view></view>
        <view class="skeleton"><i/><i/><i/></view>
        <view class="device-preview"><view class="device-preview-icon"><SsIcon name="fan" :size="24" tone="brand" /></view><view><strong>{{ l('顶流机-01','Surface Jet-01') }}</strong><text>{{ l('顶流机 / 制冰机','Surface jet / ice maker') }}</text></view><span>{{ l('在线','Online') }}</span><SsIcon name="chevron-right" :size="16" tone="disabled" /></view>
      </scroll-view>
      <view v-if="show" class="modal-layer firmware-layer"><view class="firmware-dialog"><view class="firmware-dialog-icon"><SsIcon name="download" :size="22" tone="brand" /></view><strong>{{ l('发现新固件 V2.4.1','New firmware V2.4.1') }}</strong><text>{{ l('提升自动模式稳定性并新增电机温度保护，预计需要 8 分钟。','Improves automatic-mode stability and adds motor temperature protection. About 8 minutes.') }}</text><view class="firmware-version">{{ l('当前版本 V2.3.8 · 更新包 18.6MB\n更新前请保持设备供电和蓝牙连接。','Current V2.3.8 · Package 18.6 MB\nKeep the device powered and Bluetooth connected.') }}</view><view class="button-row"><button class="btn" @click="show=false">{{ l('稍后','Later') }}</button><button class="btn primary" @click="openFirmwareUpdate">{{ l('立即更新','Update now') }}</button></view></view></view>
    </template>
    <template v-else-if="id === 'X11' || id === 'X12'">
      <scroll-view scroll-y class="page-scroll permission-backdrop-content">
        <view class="permission-hero"><view><strong>{{ id === 'X11' ? l('准备连接设备','Prepare to connect') : l('准备保存位置','Prepare to save location') }}</strong><text>{{ l('当前页面内容保留在弹窗后方','The current page remains behind the sheet') }}</text></view><view><SsIcon :name="id === 'X11' ? 'waves' : 'map-pinned'" :size="48" tone="brand" /></view></view>
        <view class="skeleton"><i/><i/><i/></view>
        <view class="device-preview"><view class="device-preview-icon"><SsIcon name="fan" :size="24" tone="brand" /></view><view><strong>{{ l('顶流机-01','Surface Jet-01') }}</strong><text>{{ l('顶流机 / 制冰机','Surface jet / ice maker') }}</text></view><span>{{ l('在线','Online') }}</span><SsIcon name="chevron-right" :size="16" tone="disabled" /></view>
      </scroll-view>
      <view class="sheet-layer"><view class="permission-sheet detailed"><view class="sheet-handle" /><text>{{ id === 'X11' ? l('允许使用蓝牙','Allow Bluetooth') : l('允许使用定位','Allow Location') }}</text><span>{{ id === 'X11' ? l('蓝牙用于发现并连接附近设备，不会读取其他蓝牙设备的数据。','Bluetooth discovers and connects nearby devices without reading data from other Bluetooth devices.') : l('定位用于地区校验、设备地图和保存航点，可稍后在系统设置中修改。','Location is used for region checks, the device map, and saved waypoints.') }}</span><view class="permission-rows">
        <view><i><SsIcon :name="id === 'X11' ? 'bluetooth' : 'locate-fixed'" :size="20" tone="muted" /></i><view><strong>{{ id === 'X11' ? l('发现设备','Discover devices') : l('获取当前位置','Get current location') }}</strong><text>{{ id === 'X11' ? l('扫描附近鲨鱼妹妹设备','Scan nearby Shark Sister devices') : l('校验销售地区与地图位置','Verify sales region and map location') }}</text></view><b>{{ l('需要','Required') }}</b></view>
        <view><i class="green"><SsIcon :name="id === 'X11' ? 'radio-tower' : 'map-pin-check'" :size="20" tone="success" /></i><view><strong>{{ id === 'X11' ? l('发送控制指令','Send control commands') : l('保存航点','Save waypoints') }}</strong><text>{{ id === 'X11' ? l('连接后与设备安全通信','Communicate securely after connecting') : l('位置只保存在当前设备','Location remains on this device') }}</text></view><b>{{ l('需要','Required') }}</b></view>
      </view><view class="sheet-buttons"><button class="btn" @click="show = false">{{ id === 'X11' ? l('手动输入 SN','Enter SN') : l('暂不允许','Not Now') }}</button><button class="btn primary" @click="show = false">{{ l('前往授权','Continue') }}</button></view></view></view>
    </template>
    <template v-else>
      <scroll-view scroll-y class="page-scroll modal-backdrop-content">
        <view class="permission-hero"><view><strong>{{ dialog.title }}</strong><text>{{ l('当前页面内容保留在弹窗后方','The current page remains behind the dialog') }}</text></view><view><SsIcon name="waves" :size="48" tone="brand" /></view></view>
        <view class="skeleton"><i/><i/><i/></view>
        <view class="device-preview"><view class="device-preview-icon"><SsIcon name="fan" :size="24" tone="brand" /></view><view><strong>{{ l('顶流机-01','Surface Jet-01') }}</strong><text>{{ l('顶流机 / 制冰机','Surface jet / ice maker') }}</text></view><span>{{ l('在线','Online') }}</span><SsIcon name="chevron-right" :size="16" tone="disabled" /></view>
      </scroll-view>
      <SsModal :show="show" :title="dialog.title" :description="dialog.description" :icon="dialog.icon" :tone="dialog.tone" :confirm-text="l('确认','Confirm')" @cancel="show = false" @confirm="show = false" />
    </template>
  </view>
</template>

<style scoped>
.case-page { min-height:100vh; }.state-grid { display:flex;flex-direction:column;gap:18rpx; }.state-grid :deep(.empty) { min-height:320rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:18rpx; }.state-card { display:flex;min-height:130rpx;align-items:center;gap:20rpx;padding:24rpx;color:var(--color-action-primary);background:var(--color-action-primary-subtle);border:2rpx solid var(--ss-brand-200);border-radius:16rpx; }.state-card text { min-width:0;flex:1;color:var(--color-text-body); }.state-card.error { background:var(--ss-red-50);border-color:#f8c8cd; }.state-card.offline { background:var(--color-bg-subtle);border-color:var(--ss-neutral-300); }.state-card.success { background:var(--ss-green-50);border-color:#bdebd6; }.state-card.permission { background:var(--ss-orange-50);border-color:#ffdca8; }.sheet-layer { position:fixed;inset:0;z-index:80;display:flex;align-items:flex-end;background:rgba(18,23,34,.45); }.permission-sheet { width:100%;padding:18rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));background:#fff;border-radius:28rpx 28rpx 0 0;text-align:center; }.sheet-handle { width:72rpx;height:8rpx;margin:0 auto 22rpx;background:var(--ss-neutral-300);border-radius:999rpx; }.permission-sheet > text { display:block;font-size:34rpx;font-weight:600;text-align:left; }.permission-sheet > span { display:block;margin:10rpx auto 24rpx;color:var(--color-text-secondary);font-size:23rpx;line-height:36rpx;text-align:left; }.permission-backdrop-content { padding-top:20rpx; }.permission-hero { display:flex;min-height:264rpx;align-items:center;justify-content:space-between;padding:34rpx;background:#e4efff;border:2rpx solid #c7ddff;border-radius:16rpx; }.permission-hero > view:first-child { min-width:0;flex:1; }.permission-hero strong,.permission-hero text { display:block; }.permission-hero strong { color:#17366e;font-size:36rpx; }.permission-hero text { margin-top:8rpx;color:#506783;font-size:22rpx; }.permission-hero > view:last-child { display:flex;width:128rpx;height:128rpx;align-items:center;justify-content:center;background:rgba(255,255,255,.78);border-radius:20rpx; }.skeleton { display:flex;flex-direction:column;gap:16rpx;margin:32rpx 0; }.skeleton i { width:100%;height:20rpx;background:var(--ss-neutral-200);border-radius:999rpx; }.skeleton i:first-child { width:76%; }.skeleton i:last-child { width:56%; }.device-preview { display:flex;align-items:center;gap:18rpx;padding:24rpx;background:#fff;border:2rpx solid var(--color-border-subtle);border-radius:16rpx; }.device-preview-icon { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.device-preview > view:nth-child(2) { min-width:0;flex:1; }.device-preview strong,.device-preview text { display:block; }.device-preview text { color:var(--color-text-secondary);font-size:22rpx; }.device-preview > span { color:var(--ss-green-700);font-size:22rpx; }.permission-rows { display:flex;flex-direction:column;gap:14rpx; }.permission-rows > view { display:flex;align-items:center;gap:16rpx;padding:18rpx 16rpx;background:var(--color-bg-subtle);border-radius:14rpx;text-align:left; }.permission-rows i { display:flex;width:64rpx;height:64rpx;align-items:center;justify-content:center;background:#fff;border-radius:12rpx; }.permission-rows i.green { background:var(--ss-green-50); }.permission-rows > view > view { min-width:0;flex:1; }.permission-rows strong,.permission-rows text { display:block; }.permission-rows strong { font-size:24rpx; }.permission-rows text { margin-top:3rpx;color:var(--color-text-secondary);font-size:20rpx; }.permission-rows b { padding:8rpx 14rpx;color:var(--ss-orange-700);background:var(--ss-orange-50);border-radius:999rpx;font-size:20rpx;font-weight:600; }.sheet-buttons { display:grid;grid-template-columns:176rpx minmax(0,1fr);gap:14rpx;margin-top:22rpx; }.sheet-buttons .btn { min-width:0;padding:0 18rpx; }
.modal-backdrop-content { padding-top:20rpx; }
.firmware-dialog { width:100%;max-width:640rpx;padding:38rpx;background:#fff;border-radius:16rpx;box-shadow:var(--shadow-modal);text-align:left; }.firmware-dialog-icon { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:14rpx; }.firmware-dialog > strong,.firmware-dialog > text { display:block; }.firmware-dialog > strong { margin-top:28rpx;font-size:32rpx;line-height:44rpx; }.firmware-dialog > text { margin-top:10rpx;color:var(--color-text-secondary);font-size:24rpx;line-height:36rpx; }.firmware-version { margin-top:22rpx;padding:20rpx 24rpx;color:var(--color-text-body);background:var(--color-bg-subtle);border-radius:14rpx;font-size:22rpx;line-height:32rpx;white-space:pre-line; }.firmware-dialog .button-row { margin-top:34rpx; }.firmware-dialog .btn { min-width:0;padding:0 18rpx; }.firmware-layer { position:fixed;z-index:80;inset:0;display:flex;align-items:center;justify-content:center;padding:67rpx;background:rgba(18,23,34,.45); }.firmware-backdrop { padding-right:30rpx;padding-left:30rpx; }.firmware-backdrop .permission-hero { min-height:252rpx; }.firmware-backdrop .skeleton i:first-child { width:75%; }.firmware-backdrop .device-preview { min-height:144rpx; }
.state-grid { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20rpx; }.state-card { min-height:272rpx;flex-direction:column;justify-content:center;padding:24rpx;text-align:center;background:#fff;border-color:var(--color-border-subtle); }.state-icon { display:flex;width:88rpx;height:88rpx;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:16rpx; }.state-card strong { display:block;margin-top:16rpx;color:var(--color-text-primary);font-size:25rpx; }.state-card text { display:block;margin-top:7rpx;color:var(--color-text-secondary);font-size:21rpx; }.state-card.error .state-icon { background:var(--ss-red-50); }.state-card.warning .state-icon { background:var(--ss-orange-50); }.state-card.success .state-icon { background:var(--ss-green-50); }.state-rule { margin-top:24rpx; }.state-rule strong,.state-rule text { display:block; }.state-rule text { margin-top:4rpx; }
</style>
