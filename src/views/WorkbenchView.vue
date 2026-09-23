<script setup lang="ts">
import { computed } from 'vue'
import SsIcon from '@/components/SsIcon.vue'
import { useAppStore } from '@/stores/app'
import type { IconTone } from '@/config/iconAssets'

const store = useAppStore()
const l = (zh: string, en: string) => store.locale !== 'zh-Hans' ? en : zh
const dealerScope = computed(() => store.context.dealerScopeIds)
const dealer = computed(() => store.db?.dealers.find((item) => item.id === store.account?.dealerId))
const scopedTickets = computed(() => store.db?.tickets.filter((item) => Boolean(item.dealerId && dealerScope.value.includes(item.dealerId))) || [])
const activeTickets = computed(() => scopedTickets.value.filter((item) => !['completed', 'rejected'].includes(item.status)))
const pendingMaterials = computed(() => store.db?.materials.filter((item) => dealerScope.value.includes(item.dealerId) && item.status === 'pending') || [])
const pendingShipments = computed(() => store.db?.shipments.filter((item) => dealerScope.value.includes(item.dealerId) && item.status === 'shipping') || [])
const pendingTransfers = computed(() => store.db?.transfers.filter((item) => dealerScope.value.includes(item.dealerId) && item.status === 'pending') || [])
const pendingPurchases = computed(() => store.db?.purchases.filter((item) => dealerScope.value.includes(item.dealerId) && item.status === 'pendingApproval') || [])
const unassignedDevices = computed(() => (store.db?.devices || []).filter((item) => item.dealerId === store.account?.dealerId && item.activationStatus === 'registered' && !item.ownerId && !item.projectId && !item.assignedTo))
const primaryMenus = computed<Array<{ url: string; icon: string; iconTone: IconTone; label: string; capability: string; tone: string; count?: number }>>(() => [
  { url: '/pages/manage/list?entity=projects', icon: 'folder-search', iconTone: 'brand', label: l('安装管理', 'Installation management'), capability: 'project.manage', tone: 'brand' },
  { url: '/pages/manage/list?entity=purchases', icon: 'shopping-cart', iconTone: 'success', label: l('设备与配件采购', 'Equipment purchasing'), capability: 'purchase.create', tone: 'success', count: pendingPurchases.value.length },
  { url: '/pages/manage/list?entity=tickets', icon: 'wrench', iconTone: 'warning', label: l('售后管理', 'Service management'), capability: 'support.manage', tone: 'warning', count: activeTickets.value.length },
  { url: '/pages/manage/list?entity=shipments', icon: 'truck', iconTone: 'success', label: l('物流订单', 'Logistics'), capability: 'material.apply', tone: 'success', count: pendingShipments.value.length },
])
const visiblePrimaryMenus = computed(() => primaryMenus.value.filter((item) => store.hasCapability(item.capability)))
const secondaryMenus = computed(() => [
  { url: '/pages/manage/list?entity=projects', icon: 'folder-search', label: l('安装管理', 'Installation management'), description: l('按船名、设备 SN 或客户查询安装项目', 'Search installations by vessel, device SN, or customer'), capability: 'project.manage' },
  { url: '/pages/manage/list?entity=tickets', icon: 'wrench', label: l('售后管理', 'Service management'), description: l('处理报修、投诉和跨区服务', 'Handle repairs, complaints, and regional service'), capability: 'support.manage' },
  { url: '/pages/manage/list?entity=purchases', icon: 'shopping-cart', label: l('设备与配件采购', 'Equipment purchasing'), description: l('采购设备或配件，跟踪审批、分次付款与发货', 'Purchase equipment or parts and track approval, installments, and delivery'), capability: 'purchase.create', count: pendingPurchases.value.length },
  { url: '/pages/manage/form?entity=materials&source=serviceReplacement', icon: 'package-plus', label: l('售后物料', 'Service parts'), description: l('独立提交售后更换物料申请', 'Submit service replacement requests separately'), capability: 'material.apply' },
  { url: store.hasCapability('material.approve') ? '/pages/manage/list?entity=materials&state=approval' : '/pages/manage/list?entity=materials', icon: 'package-plus', label: store.hasCapability('material.approve') ? l('审批中心', 'Approval center') : l('物料申请', 'Parts requests'), description: store.hasCapability('material.approve') ? l('统一审核物料与采购申请', 'Review parts and purchase requests together') : l('提交并查询物料申请', 'Submit and track parts requests'), capability: store.hasCapability('material.approve') ? 'material.approve' : 'material.apply', count: pendingMaterials.value.length + pendingPurchases.value.length },
  { url: '/pages/manage/list?entity=shipments', icon: 'truck', label: l('物流订单', 'Logistics'), description: l('查看发货、运输与签收进度', 'Track shipping, transit, and receipt'), capability: 'material.apply', count: pendingShipments.value.length },
  { url: '/pages/manage/list?entity=orders', icon: 'receipt-text', label: l('客户订单', 'Customer orders'), description: l('跟踪销售、研发、生产、财务和发货节点', 'Track sales, R&D, production, finance, and shipping'), capability: 'price.view', count: (store.db?.orders || []).filter((item) => Boolean(item.dealerId && store.context.dealerScopeIds.includes(item.dealerId)) && !['completed','cancelled'].includes(item.status)).length },
  { url: '/pages/manage/list?entity=devices&state=unassigned', icon: 'package-search', label: l('设备分配', 'Device assignment'), description: l('查看采购后尚未分配给二级经销商的设备', 'View purchased devices not yet assigned to a sub-dealer'), capability: 'device.assign', count: unassignedDevices.value.length, levelOneOnly: true },
  { url: '/pages/manage/list?entity=transfers', icon: 'shuffle', label: l('分配与调拨记录', 'Assignment & transfer records'), description: l('查询设备分配记录和待审核调货申请', 'Review assignments and transfer requests'), capability: 'device.assign' },
  { url: '/pages/manage/list?entity=payments', icon: 'wallet-cards', label: l('支付记录', 'Payments'), description: l('查询采购与售后付款记录', 'Review purchase and service payments'), capability: 'price.view' },
  { url: '/pages/process/index?scenario=dealerAnalytics', icon: 'chart-no-axes-combined', label: l('数据统计', 'Data statistics'), description: l('查看年度销售与售后数据', 'View annual sales and service data'), capability: 'support.manage' },
  { url: '/pages/manage/list?entity=employees', icon: 'users-round', label: l('员工账号', 'Staff accounts'), description: l('维护员工账号及业务权限', 'Manage staff accounts and permissions'), capability: 'staff.manage' },
  { url: '/pages/manage/list?entity=dealers', icon: 'store', label: l('二级经销商', 'Sub-dealers'), description: l('维护下级经销商与负责范围', 'Manage sub-dealers and service scope'), capability: 'dealer.manage' },
])
const visibleSecondaryMenus = computed(() => {
  const commonUrls = new Set(visiblePrimaryMenus.value.map((item) => item.url))
  return secondaryMenus.value.filter((item) => store.hasCapability(item.capability) && !commonUrls.has(item.url) && (!('levelOneOnly' in item) || !item.levelOneOnly || dealer.value?.level === 1))
})

const todoItems = computed(() => {
  const result: Array<{ key: string; icon: string; tone: string; title: string; count: number; url: string; capability: string }> = []
  if (pendingMaterials.value.length) result.push({ key: 'materials', icon: 'clipboard-check', tone: 'warning', title: l('物料申请审批', 'Parts approvals'), count: pendingMaterials.value.length, url: '/pages/manage/list?entity=materials', capability: 'material.approve' })
  if (pendingPurchases.value.length) result.push({ key: 'purchases', icon: 'shopping-cart', tone: 'warning', title: l('采购审批', 'Purchase approvals'), count: pendingPurchases.value.length, url: '/pages/manage/list?entity=purchases&status=pendingApproval', capability: 'material.approve' })
  if (pendingShipments.value.length) result.push({ key: 'shipments', icon: 'truck', tone: 'success', title: l('物流签收', 'Shipment receipts'), count: pendingShipments.value.length, url: '/pages/manage/list?entity=shipments', capability: 'material.apply' })
  if (pendingTransfers.value.length) result.push({ key: 'transfers', icon: 'shuffle', tone: 'purple', title: l('调拨进度', 'Transfer progress'), count: pendingTransfers.value.length, url: '/pages/manage/list?entity=transfers', capability: 'device.assign' })
  if (activeTickets.value.length) result.push({ key: 'tickets', icon: 'wrench', tone: 'brand', title: l('售后工单', 'Service tickets'), count: activeTickets.value.length, url: '/pages/manage/list?entity=tickets', capability: 'support.manage' })
  return result.filter((item) => store.hasCapability(item.capability))
})
const visibleTodoItems = computed(() => todoItems.value.slice(0, 3))
const pendingCount = computed(() => todoItems.value.reduce((total, item) => total + item.count, 0))

function open(url: string, capability: string) {
  if (!store.hasCapability(capability)) {
    uni.showModal({
      title: l('权限受限', 'Access restricted'),
      content: l('当前账号无法访问此业务，请联系经销商管理员开通权限。', 'This account cannot access the service. Contact your dealer administrator.'),
      showCancel: false,
    })
    return
  }
  uni.navigateTo({ url })
}
function openTodoCenter() { uni.navigateTo({ url: '/pages/manage/list?entity=materials&state=todo' }) }
</script>

<template>
  <scroll-view scroll-y class="workbench-scroll">
    <view class="workspace-hero">
      <view class="workspace-identity">
        <view class="identity-line"><view><strong>{{ store.locale === 'zh-Hans' ? dealer?.name : dealer?.nameEn }}</strong></view><view class="outlet-mark"><SsIcon name="store" :size="25" tone="inverse" /></view></view>
        <view class="workspace-scope"><text>{{ l(`${dealer?.level || 1} 级经销商`, `Level ${dealer?.level || 1} dealer`) }}</text><i /><text>{{ store.locale === 'zh-Hans' ? dealer?.region : dealer?.id }}</text></view>
      </view>
      <view class="workspace-section workspace-todo">
        <view class="workspace-section-head"><view><strong>{{ l('待办事项','Pending tasks') }}</strong><text v-if="pendingCount">{{ pendingCount }} {{ l('项待处理','pending') }}</text></view><button class="todo-all" @click="openTodoCenter">{{ l('查看全部','View all') }}<SsIcon name="chevron-right" :size="15" tone="brand" /></button></view>
        <view class="workspace-queue">
          <button v-for="item in visibleTodoItems" :key="item.key" class="queue-row" :aria-label="l(`${item.title}，${item.count} 项待处理`, `${item.title}, ${item.count} pending`)" @click="open(item.url,item.capability)"><view class="queue-overview"><view class="queue-symbol" :class="item.tone"><SsIcon :name="item.icon" :size="19" :tone="item.tone === 'warning' ? 'warning' : item.tone === 'success' ? 'success' : 'brand'" /></view><view class="queue-value"><strong class="queue-count">{{ item.count }}</strong><text>{{ l('项','') }}</text></view></view><view class="queue-copy"><strong>{{ item.title }}</strong><text class="queue-status">{{ l('待处理','Pending') }}</text></view></button>
          <view v-if="!visibleTodoItems.length" class="queue-empty"><SsIcon name="circle-check" :size="24" tone="success" /><text>{{ l('当前没有待处理业务','No pending tasks') }}</text></view>
        </view>
      </view>
    </view>
    <view v-if="visiblePrimaryMenus.length" class="workspace-common"><view class="workspace-section-head"><strong>{{ l('常用功能','Common functions') }}</strong></view><view class="workspace-shortcuts">
      <button v-for="item in visiblePrimaryMenus" :key="item.url" class="workspace-shortcut" @click="open(item.url,item.capability)"><view class="shortcut-icon" :class="item.tone"><SsIcon :name="item.icon" :size="23" :tone="item.iconTone" /></view><view class="shortcut-copy"><text>{{ item.label }}</text><span v-if="item.count" class="pending">{{ l(`${item.count} 项待处理`,`${item.count} pending`) }}</span><span v-else>{{ l('进入办理','Open') }}</span></view><SsIcon name="chevron-right" :size="15" tone="muted" /></button>
    </view></view>
    <view v-if="visibleSecondaryMenus.length" class="workspace-section">
      <view class="workspace-section-head"><strong>{{ l('全部业务','All business') }}</strong></view>
      <view class="workspace-menu">
        <button v-for="item in visibleSecondaryMenus" :key="item.url" class="business-row list-row" @click="open(item.url,item.capability)"><view class="business-icon"><SsIcon :name="item.icon" :size="21" :tone="item.icon === 'truck' ? 'success' : 'brand'" /></view><view class="business-copy"><strong>{{ item.label }}</strong><text>{{ item.description }}</text></view><i v-if="item.count" class="business-badge">{{ item.count }}</i><SsIcon name="chevron-right" :size="16" tone="muted" /></button>
      </view>
    </view>
  </scroll-view>
</template>

<style scoped>
.workbench-scroll { height:100%; padding:0 0 calc(90px + env(safe-area-inset-bottom)); background:var(--color-bg-canvas); }
.workspace-identity { padding:20px; background:linear-gradient(145deg,#e9f4ff,#f8fbff); border-bottom:1px solid #dce9f8; }
.identity-line { display:flex; justify-content:space-between; align-items:center; gap:14px; }.identity-line > view:first-child { min-width:0; flex:1; }.workspace-caption { display:block; margin-bottom:6px; color:var(--color-text-secondary); font-size:12px; line-height:18px; }.identity-line strong { display:block; font-size:21px; line-height:30px; font-weight:650; overflow-wrap:anywhere; }.outlet-mark { display:flex; width:44px; height:44px; flex:0 0 44px; align-items:center; justify-content:center; background:var(--ss-brand-50); border-radius:8px; }
.workspace-scope { display:flex; align-items:center; gap:8px; margin-top:8px; color:var(--color-text-secondary); font-size:12px; line-height:20px; }.workspace-scope i { width:3px; height:3px; flex:0 0 3px; border-radius:50%; background:var(--ss-neutral-300); }
.workspace-common{margin-top:16px;padding:18px 20px 20px;background:#fff;border-top:1px solid var(--color-divider);border-bottom:1px solid var(--color-divider)}.workspace-common .workspace-section-head{padding-bottom:14px}.workspace-shortcuts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px;background:#fff; }.workspace-shortcut { display:flex; min-width:0; flex-direction:column; align-items:center; gap:9px; padding:0; font-size:12px; line-height:19px; text-align:center; }.workspace-shortcut > view { position:relative;display:flex; width:44px; height:44px; align-items:center; justify-content:center; background:var(--ss-brand-50); border-radius:8px; }.workspace-shortcut i{position:absolute;top:-6px;right:-7px;display:flex;min-width:18px;height:18px;align-items:center;justify-content:center;padding:0 4px;color:#fff;background:var(--ss-red-600);border:2px solid #fff;border-radius:10px;font-size:10px;font-style:normal}.workspace-shortcut .success { background:var(--ss-green-50); }.workspace-shortcut .warning { background:var(--ss-orange-50); }
.workspace-section { padding:20px 20px 0; }.workspace-section-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-bottom:12px; }.workspace-section-head strong { font-size:17px; line-height:25px; }.workspace-section-head > text { font-size:12px; color:var(--color-text-secondary); }.todo-all{display:flex;min-height:36px;align-items:center;gap:2px;padding:0;color:var(--color-action-primary);background:transparent;border:0;font-size:12px}
.workspace-queue,.workspace-menu { overflow:hidden;background:rgba(255,255,255,.98);border:1px solid var(--color-border-subtle);border-radius:8px;box-shadow:0 8px 24px rgba(37,91,155,.06); }.queue-row,.business-row { display:flex; width:100%; min-height:60px; align-items:center; gap:10px; padding:10px 12px; border:0; border-bottom:1px solid var(--color-divider); border-radius:0; background:transparent; text-align:left; }.queue-row:last-child,.business-row:last-child { border:0; }.queue-symbol,.business-icon { display:flex; width:30px; height:34px; flex:0 0 30px; align-items:center; justify-content:center; }.queue-copy,.business-copy { min-width:0; flex:1; }.queue-copy strong,.business-copy strong { display:block; font-size:14px; line-height:22px; font-weight:600; }.queue-copy text,.business-copy text { display:block; margin-top:4px; color:var(--color-text-secondary); font-size:12px; line-height:19px; overflow-wrap:anywhere; }.queue-copy .queue-status{margin-top:1px;font-size:11px;line-height:15px}.queue-count { min-width:26px; color:var(--ss-orange-700); font-family:var(--ss-font-data); font-size:19px; text-align:right; }.queue-empty { display:flex; min-height:80px; align-items:center; justify-content:center; gap:10px; font-size:14px; color:var(--color-text-secondary); }
.queue-row:active,.business-row:active { background:var(--ss-brand-50); }
.business-badge{display:flex;min-width:20px;height:20px;align-items:center;justify-content:center;padding:0 6px;color:#fff;background:var(--ss-red-600);border-radius:10px;font-size:11px;font-style:normal;font-weight:650}
.workspace-queue{height:180px;overflow:hidden}

/* Visual system shared with the refreshed device home. */
.workbench-scroll { background:linear-gradient(180deg,#edf6ff 0,#f7fbff 300px,#f5f8fc 100%); }
.workspace-identity { position:relative;overflow:hidden;margin:12px 18px 0;padding:20px;color:#fff;background:linear-gradient(125deg,#1765dc 0%,#4c96ed 63%,#9cccf8 100%);border:1px solid rgba(255,255,255,.75);border-radius:8px;box-shadow:0 16px 36px rgba(31,96,181,.2); }
.workspace-identity::after { position:absolute;right:-30px;bottom:-38px;width:170px;height:92px;content:'';background:rgba(255,255,255,.14);border-radius:50%;transform:rotate(-10deg); }
.identity-line,.workspace-scope { position:relative;z-index:1; }.identity-line strong { font-size:22px;font-weight:700; }.workspace-scope { color:rgba(255,255,255,.82); }.workspace-scope i { background:rgba(255,255,255,.58); }.outlet-mark { color:#fff;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.26);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06); }.outlet-mark :deep(.ss-icon) { filter:brightness(0) invert(1); }
.workspace-section { padding-top:22px; }.workspace-section-head strong { color:#132540;font-size:18px;font-weight:700; }.workspace-queue,.workspace-menu { border-color:rgba(220,232,245,.9);box-shadow:0 13px 32px rgba(42,91,151,.085); }
.queue-row { min-height:60px;padding-right:15px;padding-left:14px; }.queue-symbol { width:36px;height:36px;flex-basis:36px;background:var(--ss-brand-50);border-radius:8px; }.queue-symbol.warning { background:var(--ss-orange-50); }.queue-symbol.success { background:var(--ss-green-50); }.queue-symbol.purple { background:#f2edff; }
.workspace-common { margin-top:18px;padding:20px 18px 21px;background:rgba(255,255,255,.96);border-color:rgba(224,234,245,.9);box-shadow:0 10px 28px rgba(45,92,151,.055); }.workspace-shortcuts { gap:10px;background:transparent; }.workspace-shortcut { gap:10px;color:#24344f;font-weight:600; }.workspace-shortcut > view { width:50px;height:50px;background:linear-gradient(145deg,#edf6ff,#dcecff);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }.workspace-shortcut .success { background:linear-gradient(145deg,#e9fbf4,#d5f6e9); }.workspace-shortcut .warning { background:linear-gradient(145deg,#fff5e9,#ffead2); }.workspace-shortcut .purple { background:linear-gradient(145deg,#f4efff,#e8ddff); }
.business-row { min-height:66px;padding:11px 14px; }.business-icon { width:38px;height:38px;flex-basis:38px;background:linear-gradient(145deg,#edf6ff,#dcecff);border-radius:8px; }.business-copy strong { color:#172842;font-size:14px;font-weight:650; }

/* Figma B01: keep identity and the first three tasks in one compact operational header. */
.workbench-scroll { background:var(--color-bg-canvas); }
.workspace-hero { padding:2px 18px 18px;color:#fff;background:#123746; }
.workspace-identity { margin:0;padding:8px 0 14px;background:transparent;border:0;border-radius:0;box-shadow:none; }
.workspace-identity::after { display:none; }
.identity-line strong { font-size:18px;line-height:26px; }
.outlet-mark { width:40px;height:40px;flex-basis:40px;background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.16);box-shadow:none; }
.workspace-todo { padding:0; }
.workspace-todo .workspace-section-head { padding:0 0 10px; }
.workspace-todo .workspace-section-head strong { color:#fff;font-size:13px;line-height:20px; }
.workspace-todo .todo-all { color:rgba(255,255,255,.82); }
.workspace-queue { display:grid;height:92px;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;overflow:visible;background:transparent;border:0;border-radius:0;box-shadow:none; }
.queue-row { min-width:0;height:92px;min-height:92px;flex-direction:column;justify-content:center;gap:3px;padding:9px 6px;color:#fff;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);border-radius:8px;text-align:center; }
.queue-row:last-child { border:1px solid rgba(255,255,255,.14); }
.queue-row:active { background:rgba(255,255,255,.15); }
.queue-symbol { width:28px;height:28px;flex:0 0 28px;background:rgba(255,255,255,.12) !important;border-radius:7px; }
.queue-symbol :deep(.ss-icon) { filter:brightness(0) invert(1); }
.queue-copy { min-width:0;width:100%; }
.queue-copy strong { overflow:hidden;color:#fff;font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap; }
.queue-copy .queue-status { display:none; }
.queue-count { position:absolute;top:7px;right:8px;display:flex;min-width:18px;height:18px;align-items:center;justify-content:center;padding:0 4px;color:#fff;background:#e5484d;border:2px solid #123746;border-radius:10px;font-size:10px;line-height:1; }
.queue-row { position:relative; }
.queue-empty { grid-column:1 / -1;height:92px;min-height:92px;color:rgba(255,255,255,.78);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:8px; }
.workspace-common { margin-top:0; }

/* Brand-blue operational surface shared with the device home. */
.workbench-scroll { background:var(--ss-brand-canvas); }
.workspace-hero { padding:12px 18px 18px;color:var(--color-text-primary);background:transparent; }
.workspace-identity { position:relative;overflow:hidden;margin:0;padding:18px 18px 16px;color:#fff;background:var(--ss-brand-gradient-strong);border:1px solid rgba(255,255,255,.7);border-radius:8px;box-shadow:0 14px 32px rgba(31,96,181,.18); }
.workspace-identity::after { display:block;position:absolute;right:-34px;bottom:-42px;width:174px;height:96px;content:'';background:rgba(255,255,255,.13);border-radius:50%;transform:rotate(-10deg); }
.identity-line,.workspace-scope { position:relative;z-index:1; }
.identity-line strong { font-size:20px;line-height:28px; }
.workspace-scope { color:rgba(255,255,255,.82); }
.workspace-scope i { background:rgba(255,255,255,.56); }
.outlet-mark { background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24); }
.workspace-todo { padding:18px 0 0; }
.workspace-todo .workspace-section-head { padding:0 2px 10px; }
.workspace-todo .workspace-section-head strong { color:#172842;font-size:15px; }
.workspace-todo .todo-all { color:var(--color-action-primary); }
.workspace-queue { height:96px;gap:8px; }
.queue-row { height:96px;min-height:96px;color:var(--color-text-primary);background:#fff;border:1px solid rgba(220,232,245,.95);box-shadow:0 8px 20px rgba(42,91,151,.07); }
.queue-row:last-child { border:1px solid rgba(220,232,245,.95); }
.queue-row:active { background:var(--ss-brand-50); }
.queue-symbol { width:32px;height:32px;flex-basis:32px;background:var(--ss-brand-50) !important; }
.queue-symbol :deep(.ss-icon) { filter:none; }
.queue-copy strong { color:#172842; }
.queue-count { top:6px;right:7px;border-color:#fff; }
.queue-empty { height:96px;min-height:96px;color:var(--color-text-secondary);background:#fff;border:1px solid var(--color-border-subtle); }
.workspace-common { margin-top:0;background:rgba(255,255,255,.98); }

/* Operational workbench: numbers scan first, labels remain readable at 375 px. */
.workbench-scroll{background:#f4f7fb}
.workspace-hero{padding:12px 16px 18px;background:linear-gradient(180deg,#edf5ff 0,#f4f7fb 100%)}
.workspace-identity{min-height:92px;padding:17px 18px 15px;border:0;background:linear-gradient(128deg,#226ce0 0%,#4d94ee 68%,#88baf3 100%);box-shadow:0 10px 24px rgba(37,103,187,.18)}
.workspace-identity::after{right:-42px;bottom:-47px;width:190px;height:112px;background:rgba(255,255,255,.12)}
.identity-line strong{font-size:19px;line-height:27px}.outlet-mark{width:42px;height:42px;flex-basis:42px;border-radius:8px}
.workspace-todo{padding:18px 0 0}.workspace-todo .workspace-section-head{padding:0 1px 10px}.workspace-todo .workspace-section-head strong{font-size:16px;line-height:24px}
.workspace-queue{height:106px;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.queue-row,.queue-row:last-child{height:106px;min-height:106px;align-items:stretch;justify-content:flex-start;gap:7px;padding:10px 9px 9px;border:1px solid #dce7f4;border-radius:8px;background:#fff;box-shadow:0 5px 14px rgba(38,84,137,.065);text-align:left}
.queue-overview{display:flex;width:100%;align-items:center;justify-content:space-between;gap:6px}
.queue-symbol{width:32px;height:32px;flex:0 0 32px;border-radius:8px!important;background:#edf5ff!important}
.queue-value{display:flex;min-width:0;align-items:baseline;justify-content:flex-end;gap:2px}.queue-value>text{color:#718096;font-size:10px;line-height:14px}
.queue-count{position:static;display:block;min-width:0;height:auto;padding:0;color:#172842;background:transparent;border:0;border-radius:0;font-family:var(--ss-font-data);font-size:25px;line-height:30px;font-weight:750;text-align:right}
.queue-copy{width:100%}.queue-copy strong{display:-webkit-box;overflow:hidden;color:#283a54;font-size:12px;line-height:16px;font-weight:650;white-space:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2}.queue-copy .queue-status{display:none}
.queue-empty{height:106px;min-height:106px;border-color:#dce7f4;background:#fff}
.workspace-common{margin:0;padding:20px 16px 22px;border-top:1px solid #e5edf6;border-bottom:1px solid #e5edf6;background:#fff;box-shadow:none}.workspace-common .workspace-section-head{padding:0 0 13px}
.workspace-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.workspace-shortcut{display:grid;min-height:72px;grid-template-columns:42px minmax(0,1fr) 16px;align-items:center;gap:10px;padding:11px 10px;border:1px solid #e0e9f3;border-radius:8px;background:#fbfdff;text-align:left}
.workspace-shortcut:active{border-color:#bcd3ee;background:#eff6ff}
.workspace-shortcut>.shortcut-icon{display:flex;width:42px;height:42px;align-items:center;justify-content:center;border-radius:8px;background:#eaf3ff;box-shadow:none}.workspace-shortcut>.shortcut-icon.success{background:#e8f8f0}.workspace-shortcut>.shortcut-icon.warning{background:#fff2e3}.workspace-shortcut>.shortcut-icon.purple{background:#f1edff}
.workspace-shortcut>.shortcut-copy{display:block;width:auto;height:auto;min-width:0;background:transparent;box-shadow:none}.shortcut-copy text,.shortcut-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.shortcut-copy text{color:#1d2f49;font-size:13px;line-height:20px;font-weight:650}.shortcut-copy span{margin-top:2px;color:#7a8799;font-size:10px;line-height:15px;font-weight:500}.shortcut-copy span.pending{color:#c23b47}
.workspace-section{padding:21px 16px 0}.workspace-section-head strong{font-size:17px}.workspace-menu{border-color:#e0e8f2;border-radius:8px;box-shadow:0 5px 16px rgba(36,73,116,.055)}
.business-row{min-height:68px;padding:11px 12px}.business-icon{width:38px;height:38px;flex-basis:38px;border-radius:8px;background:#edf5ff}.business-copy strong{font-size:14px;line-height:21px}.business-copy text{margin-top:2px;line-height:18px}
.business-badge{min-width:22px;height:22px;padding:0 6px;border-radius:11px;font-family:var(--ss-font-data);font-size:11px}

/* Compact dashboard summary: one surface, stable count hierarchy and readable labels. */
.workspace-hero{padding:12px 16px 16px}
.workspace-identity{min-height:0;padding:16px 17px 14px;box-shadow:0 8px 20px rgba(37,103,187,.15)}
.workspace-todo{padding-top:16px}
.workspace-todo .workspace-section-head{padding:0 1px 9px}
.workspace-queue{display:grid;height:102px;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;overflow:hidden;background:#fff;border:1px solid #dce7f4;border-radius:8px;box-shadow:0 5px 16px rgba(38,84,137,.06)}
.queue-row,.queue-row:last-child{position:relative;display:flex;height:102px;min-height:102px;align-items:flex-start;justify-content:flex-start;gap:0;padding:12px 10px 10px;background:#fff;border:0;border-right:1px solid var(--color-divider);border-radius:0;box-shadow:none;text-align:left}
.queue-row:last-child{border-right:0}
.queue-row:active{background:var(--ss-brand-50)}
.queue-overview{display:block;width:auto;flex:0 0 auto}
.queue-symbol{width:32px;height:32px;flex:0 0 32px;background:transparent!important;border-radius:7px!important}
.queue-value{position:absolute;right:10px;bottom:11px;display:flex;align-items:baseline;gap:2px}
.queue-count{position:static;display:block;min-width:0;height:auto;padding:0;color:#162944;background:transparent;border:0;border-radius:0;font-size:27px;line-height:30px;font-weight:750}
.queue-value>text{color:#8190a4;font-size:10px}
.queue-copy{min-width:0;width:auto;flex:1;padding:2px 0 30px}
.queue-copy strong{display:-webkit-box;overflow:hidden;color:#263b58;font-size:11px;line-height:16px;font-weight:650;white-space:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.queue-empty{grid-column:1/-1;height:102px;min-height:102px;border:0}

/* Final workbench surface */
.workbench-scroll{background:#f3f6fa}
.workspace-hero{padding:14px 16px 22px;background:#fff;border-bottom:1px solid #e3eaf2}
.workspace-identity{display:flex;min-height:78px;flex-direction:column;justify-content:center;padding:15px 17px;color:#fff;background:linear-gradient(118deg,#1259c7 0%,#2877e2 58%,#54a4ef 100%);border:0;border-radius:8px;box-shadow:0 9px 22px rgba(25,91,176,.2)}
.workspace-identity::after{right:-46px;bottom:-52px;width:184px;height:116px;background:rgba(255,255,255,.11)}
.identity-line strong{font-size:19px;line-height:27px;font-weight:700;letter-spacing:0}.workspace-scope{margin-top:5px;color:rgba(255,255,255,.82);font-size:11px}.outlet-mark{width:39px;height:39px;flex-basis:39px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);border-radius:8px}
.workspace-todo{padding:17px 0 0}.workspace-todo .workspace-section-head{padding:0 1px 10px}.workspace-todo .workspace-section-head strong{color:#172842;font-size:16px}.workspace-todo .todo-all{min-height:30px;color:#266bd3;font-weight:600}
.workspace-queue{height:98px;border:1px solid #dce5f0;border-radius:8px;background:#fff;box-shadow:0 7px 20px rgba(30,66,107,.07)}
.queue-row,.queue-row:last-child{height:98px;min-height:98px;padding:12px 10px 10px;border:0;border-right:1px solid #e6ecf3;background:#fff}.queue-row:last-child{border-right:0}.queue-overview{display:block}.queue-symbol{width:30px;height:30px;flex-basis:30px;background:#eef5ff!important}.queue-copy{padding:2px 0 27px}.queue-copy strong{color:#263a56;font-size:11px;line-height:16px;font-weight:650}.queue-value{right:10px;bottom:10px}.queue-count{color:#10243f;font-size:25px;line-height:29px}.queue-value>text{color:#7b8ba0}
.workspace-common{margin:12px 0 0;padding:19px 16px 20px;background:#fff;border:0;border-top:1px solid #e4ebf3;border-bottom:1px solid #e4ebf3}.workspace-common .workspace-section-head{padding-bottom:14px}.workspace-section-head strong{color:#162944;font-size:17px;font-weight:700}
.workspace-shortcuts{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.workspace-shortcut{display:flex;min-height:94px;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;padding:9px 3px 5px;border:0;border-radius:7px;background:transparent;text-align:center}.workspace-shortcut:active{background:#eef5ff}.workspace-shortcut>.shortcut-icon{width:43px;height:43px;flex:0 0 43px;border-radius:9px;background:#eaf3ff}.workspace-shortcut>.shortcut-copy{width:100%;text-align:center}.shortcut-copy text{display:-webkit-box;overflow:hidden;color:#20334e;font-size:11px;line-height:16px;font-weight:650;white-space:normal;-webkit-box-orient:vertical;-webkit-line-clamp:2}.shortcut-copy span{margin-top:2px;font-size:9px;line-height:13px}.workspace-shortcut>.ss-icon{display:none}
.workspace-section{padding:21px 16px 0}.workspace-section-head>text{color:#8190a4;font-size:11px}.workspace-menu{overflow:hidden;border:1px solid #dfe7f0;border-radius:8px;background:#fff;box-shadow:0 5px 16px rgba(30,66,107,.05)}.business-row{min-height:70px;padding:12px 13px;border-bottom:1px solid #e7edf4}.business-icon{width:38px;height:38px;flex-basis:38px;border-radius:8px;background:#edf5ff}.business-copy strong{color:#1c304b;font-size:14px}.business-copy text{margin-top:2px;color:#748399;font-size:11px;line-height:17px}.business-badge{background:#e5484d;border:2px solid #fff}

/* Dealer workbench: a readable task queue and restrained operational hierarchy. */
.workbench-scroll{background:#f4f7f9}
.workspace-hero{padding:0 0 16px;background:#fff;border-bottom:1px solid #e0e8ed}
.workspace-identity{min-height:0;margin:0;padding:18px 20px 14px;color:#173347;background:#fff;border:0;border-bottom:1px solid #e8eef2;border-radius:0;box-shadow:none}
.workspace-identity::after{display:none}
.identity-line strong{color:#173347;font-size:18px;line-height:26px}
.outlet-mark{width:38px;height:38px;flex-basis:38px;color:#1d6d9d;background:#e6f4f8;border:0;box-shadow:none}
.outlet-mark :deep(.ss-icon){filter:none}
.workspace-scope{margin-top:4px;color:#607583;font-size:11px}.workspace-scope i{background:#a7bbc5}
.workspace-todo{padding:14px 16px 0}.workspace-todo .workspace-section-head{padding:0 2px 9px}.workspace-todo .workspace-section-head>view{display:flex;align-items:baseline;gap:8px}.workspace-todo .workspace-section-head strong{color:#173347;font-size:15px;line-height:22px}.workspace-todo .workspace-section-head text{color:#627785;font-size:11px}.workspace-todo .todo-all{color:#176c9f}
.workspace-queue{display:block;height:auto;max-height:174px;overflow-y:auto;background:#fff;border:1px solid #dce7ed;border-radius:7px;box-shadow:none}
.queue-row,.queue-row:last-child{position:relative;display:flex;width:100%;height:56px;min-height:56px;flex-direction:row;align-items:center;justify-content:flex-start;gap:10px;padding:8px 12px;color:#173347;background:#fff;border:0;border-bottom:1px solid #e8eef2;border-radius:0;box-shadow:none;text-align:left}
.queue-row:last-child{border-bottom:0}.queue-row:active{background:#eef7fa}
.queue-overview{display:contents}.queue-symbol{width:34px;height:34px;flex:0 0 34px;background:#e9f4f8!important;border-radius:7px!important}.queue-symbol.warning{background:#fff2e3!important}.queue-symbol.success{background:#e8f8f0!important}
.queue-copy{order:1;min-width:0;flex:1;width:auto;padding:0}.queue-copy strong{display:block;overflow:hidden;color:#243d4e;font-size:13px;line-height:19px;text-overflow:ellipsis;white-space:nowrap}.queue-copy .queue-status{display:block;margin-top:1px;color:#7a8d99;font-size:10px;line-height:14px}
.queue-value{position:static;order:2;flex:0 0 auto;align-items:baseline;gap:3px}.queue-count{color:#154d6e;font-size:21px;line-height:25px}.queue-value>text{color:#748998;font-size:10px}
.queue-empty{height:56px;min-height:56px;border:0;border-radius:0}
.workspace-common{margin:0;padding:17px 16px 18px;background:#fff;border:0;border-bottom:1px solid #e0e8ed;box-shadow:none}.workspace-common .workspace-section-head{padding-bottom:10px}
.workspace-section-head strong{color:#173347;font-size:16px}.workspace-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.workspace-shortcut{display:grid;min-height:66px;grid-template-columns:38px minmax(0,1fr);align-items:center;gap:9px;padding:8px 10px;border:1px solid #e1eaf0;border-radius:7px;background:#fbfdfe;text-align:left}
.workspace-shortcut>.shortcut-icon{width:38px;height:38px;flex:0 0 38px;background:#e8f4f9;border-radius:7px}.workspace-shortcut>.shortcut-copy{min-width:0;text-align:left}.shortcut-copy text{display:block;overflow:hidden;color:#243d4e;font-size:12px;line-height:17px;text-overflow:ellipsis;white-space:nowrap}.shortcut-copy span{font-size:10px;line-height:14px}.workspace-shortcut>.ss-icon{display:none}
.workspace-section{padding:18px 16px 0}.workspace-menu{border-color:#dce7ed;box-shadow:none}.business-row{min-height:64px}.business-icon{background:#edf5f7}.business-copy strong{color:#243d4e}.business-copy text{color:#718592}
@media(max-width:370px){.workspace-shortcuts{gap:6px}.workspace-shortcut{gap:6px;padding:7px}.queue-row{padding-right:9px;padding-left:9px}}

.identity-line strong { overflow-wrap:anywhere; }
.workspace-scope { flex-wrap:wrap; }
.workspace-queue { max-height:180px;scrollbar-width:thin; }
.queue-copy strong { white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2; }
.workspace-shortcut { min-height:72px; }
.workspace-shortcut>.shortcut-copy text { white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2; }
.workspace-shortcut>.shortcut-copy span { color:#607583;font-size:11px;line-height:16px; }
.business-copy text { font-size:12px;line-height:19px; }
</style>
