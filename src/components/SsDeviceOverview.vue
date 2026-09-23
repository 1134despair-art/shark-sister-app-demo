<script setup lang="ts">
import { computed, ref } from 'vue'
import SsIcon from './SsIcon.vue'
import SsDeviceIcon from './SsDeviceIcon.vue'
import SsHomeCarousel from './SsHomeCarousel.vue'
import { useAppStore } from '@/stores/app'
import type { Device } from '@/types/models'
import deviceTopflowImage from '@/static/assest/home/device-topflow-v2.png'
import deviceWaterImage from '@/static/assest/home/device-water-v2.png'

const props = defineProps<{ devices: Device[] }>()
const emit = defineEmits<{ (e: 'open', id: string): void; (e: 'add'): void; (e: 'service'): void; (e: 'browse'): void }>()
const store = useAppStore()
const l = (zh: string, en: string) => store.locale === 'zh-Hans' ? zh : en
const connectedCount = computed(() => props.devices.filter((item) => item.connectionState === 'connected').length)
const activeCategory = ref('')
const categoryScrollLeft = ref(0)
const deviceCategories = computed(() => Array.from(new Set(props.devices.map((item) => item.category))).map((key) => {
  const devices = props.devices.filter((item) => item.category === key)
  const sample = devices[0]
  return { key, label: store.locale === 'zh-Hans' ? key : sample?.categoryEn || key, devices, sample }
}))
const selectedCategory = computed(() => deviceCategories.value.find((item) => item.key === activeCategory.value) || deviceCategories.value[0])
const previewDevices = computed(() => (selectedCategory.value?.devices || props.devices).slice(0, 2))

function scrollCategories(direction: -1 | 1) {
  categoryScrollLeft.value = Math.max(0, categoryScrollLeft.value + direction * 116)
}

function connectionLabel(device: Device) {
  return ({ connected: l('已连接', 'Connected'), disconnected: l('未连接', 'Disconnected'), connecting: l('连接中', 'Connecting'), failed: l('连接失败', 'Failed') })[device.connectionState]
}

function deviceStatusLabel(device: Device) {
  return ({ online: l('在线', 'Online'), offline: l('离线', 'Offline'), warning: l('异常', 'Alert') })[device.status]
}

function deviceImage(device: Device) {
  if (device.category.includes('顶流') || device.category.includes('制冰')) return deviceTopflowImage
  if (device.category.includes('淡化')) return deviceWaterImage
  return ''
}
</script>

<template>
  <view class="overview">
    <SsHomeCarousel
      :devices="devices"
      @devices="devices[0] ? emit('open', devices[0].id) : emit('add')"
      @waypoints="devices[0] ? emit('open', devices[0].id) : emit('add')"
      @service="emit('service')"
    />

    <view class="overview-shortcuts" :aria-label="l('常用服务', 'Common services')">
      <button @click="emit('add')"><view class="shortcut-icon blue"><SsIcon name="scan-line" :size="25" tone="brand" /></view><text>{{ l('绑定设备', 'Bind device') }}</text></button>
      <button @click="emit('service')"><view class="shortcut-icon orange"><SsIcon name="wrench" :size="25" tone="warning" /></view><text>{{ l('故障报修', 'Repair') }}</text></button>
    </view>

    <view id="overview-device-list" class="overview-devices">
      <view class="overview-heading">
        <view>
          <text class="overview-title">{{ l('我的设备', 'My devices') }}</text>
          <text class="overview-count">{{ l(`${connectedCount} 台已连接，共 ${devices.length} 台`, `${connectedCount} connected · ${devices.length} total`) }}</text>
        </view>
        <button class="browse-button" @click="emit('browse')"><text>{{ l('查看全部', 'View all') }}</text><SsIcon name="chevron-right" :size="17" tone="brand" /></button>
      </view>

      <view v-if="deviceCategories.length > 1" class="device-categories">
        <view class="category-heading"><strong>{{ l('我的分类','My categories') }}</strong><view class="category-heading-side"><text>{{ deviceCategories.length }} {{ l('类','types') }}</text><view v-if="deviceCategories.length > 3" class="category-pager"><button :aria-label="l('上一组分类','Previous categories')" @click="scrollCategories(-1)"><SsIcon name="chevron-left" :size="15" tone="brand" /></button><button :aria-label="l('下一组分类','Next categories')" @click="scrollCategories(1)"><SsIcon name="chevron-right" :size="15" tone="brand" /></button></view></view></view>
        <scroll-view scroll-x :scroll-left="categoryScrollLeft" :show-scrollbar="false" enhanced class="category-scroll"><view class="category-list"><button v-for="item in deviceCategories" :key="item.key" :class="{ active:selectedCategory?.key === item.key }" @click="activeCategory = item.key"><span><SsDeviceIcon v-if="item.sample" :category="item.sample.category" :status="item.sample.status" :size="19" /></span><view><strong>{{ item.label }}</strong><text>{{ item.devices.length }} {{ l('台设备','devices') }}</text></view></button></view></scroll-view>
      </view>

      <view v-if="previewDevices.length" class="device-cards">
        <button v-for="device in previewDevices" :key="device.id" class="equipment" :aria-label="l('查看设备 ', 'View device ') + (store.locale === 'zh-Hans' ? device.name : device.nameEn)" @click="emit('open', device.id)">
          <view class="equipment-main">
            <view class="equipment-image"><image v-if="deviceImage(device)" :src="deviceImage(device)" mode="aspectFill" /><SsDeviceIcon v-else :category="device.category" :status="device.status" :size="30" /></view>
            <view class="equipment-name"><strong>{{ store.locale === 'zh-Hans' ? device.name : device.nameEn }}</strong><text>{{ device.model }} · {{ store.locale === 'zh-Hans' ? device.category : device.categoryEn }}</text></view>
            <view class="status-badge" :class="device.status">{{ deviceStatusLabel(device) }}</view>
            <SsIcon name="chevron-right" :size="18" tone="muted" />
          </view>
          <view class="equipment-bottom"><text class="equipment-status" :class="device.connectionState"><i class="status-dot" :class="device.connectionState" />{{ connectionLabel(device) }}</text><view class="equipment-link"><text>{{ l('查看设备', 'View device') }}</text><SsIcon name="chevron-right" :size="15" tone="muted" /></view></view>
        </button>
        <button v-if="(selectedCategory?.devices.length || devices.length) > 2" class="device-list-end" @click="emit('browse')">{{ l(`查看该分类全部 ${selectedCategory?.devices.length || devices.length} 台设备`, `View all ${selectedCategory?.devices.length || devices.length} in this category`) }}<SsIcon name="chevron-right" :size="16" tone="brand" /></button>
      </view>

      <view v-else class="devices-empty">
        <view class="empty-symbol"><SsIcon name="scan-line" :size="32" tone="brand" /></view>
        <strong>{{ l('从第一台设备开始', 'Start with your first device') }}</strong>
        <text>{{ l('绑定后即可查看状态、远程控制并管理售后服务', 'Bind a device to view status, control it remotely, and manage support') }}</text>
        <button class="btn primary" @click="emit('add')"><SsIcon name="plus" :size="18" tone="inverse" />{{ l('添加设备', 'Add device') }}</button>
      </view>
    </view>
  </view>
</template>

<style scoped>
.overview { min-height:100%;padding:0 0 calc(92px + env(safe-area-inset-bottom));background:linear-gradient(180deg,var(--ss-brand-50) 0,var(--color-bg-canvas) 260px,var(--color-bg-canvas) 100%); }
.overview-shortcuts { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:16px 18px 8px; }
.overview-shortcuts button { display:flex;min-width:0;height:104px;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:7px 2px;color:var(--color-text-primary);background:rgba(255,255,255,.97);border:1px solid var(--color-border-subtle);border-radius:8px;font-size:13px;font-weight:600;box-shadow:var(--shadow-card); }
.shortcut-icon { display:flex;width:54px;height:54px;align-items:center;justify-content:center;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.7); }
.shortcut-icon.blue { background:linear-gradient(145deg,#eaf4ff,#dcecff); }.shortcut-icon.orange { background:linear-gradient(145deg,#fff5e9,#ffead2); }.shortcut-icon.green { background:linear-gradient(145deg,#e9fbf4,#d5f6e9); }.shortcut-icon.purple { background:linear-gradient(145deg,#f4efff,#e8ddff); }
.device-categories{padding:19px 0 0}.category-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:0 20px 11px}.category-heading strong,.category-heading text{display:block}.category-heading strong{font-size:17px;line-height:24px}.category-heading>view>text{margin-top:3px;color:var(--color-text-secondary);font-size:11px;line-height:16px}.category-heading-side{display:flex;flex:0 0 auto;align-items:center;gap:7px}.category-heading-side>text{color:var(--color-action-primary);font-size:12px}.category-pager{display:flex;gap:4px}.category-pager button{display:flex;width:28px;height:28px;align-items:center;justify-content:center;background:#fff;border:1px solid var(--ss-blue-200);border-radius:6px}.category-scroll{width:100%;white-space:nowrap}.category-list{display:grid;width:100%;grid-auto-columns:calc((100% - 16px)/3);grid-auto-flow:column;gap:8px;padding:0 20px 4px;box-sizing:border-box}.category-list button{display:grid;width:100%;min-width:0;height:74px;grid-template-columns:32px minmax(0,1fr);align-items:center;gap:7px;padding:0 8px;color:var(--color-text-primary);background:#fff;border:1px solid var(--color-border-subtle);border-radius:8px;text-align:left}.category-list button.active{border-color:var(--ss-blue-300);background:var(--ss-blue-50);box-shadow:0 6px 16px rgba(37,91,155,.08)}.category-list button>span{display:flex;width:32px;height:32px;align-items:center;justify-content:center;background:#fff;border-radius:7px}.category-list button>view{min-width:0}.category-list button strong,.category-list button text{display:block;overflow:hidden}.category-list button strong{font-size:12px;line-height:15px;white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}.category-list button text{margin-top:4px;color:var(--color-text-secondary);font-size:10px;line-height:14px;text-overflow:ellipsis;white-space:nowrap}
.overview-devices .device-categories{margin:0 -20px 12px;padding:0}.overview-devices .category-heading{padding:0 20px 8px}.overview-devices .category-heading strong{color:var(--color-text-secondary);font-size:12px;line-height:18px}.overview-devices .category-list button{height:62px}.overview-shortcuts button{height:74px;flex-direction:row;gap:10px;font-size:14px}.overview-shortcuts .shortcut-icon{width:42px;height:42px}
.overview-devices { padding:25px 20px 0; }
.overview-heading { display:flex;min-height:48px;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:13px; }
.overview-heading > view { min-width:0; }.overview-title { display:block;color:var(--color-text-primary);font-size:24px;line-height:31px;font-weight:750; }.overview-title::after { display:block;width:24px;height:3px;margin-top:8px;content:'';background:var(--ss-brand-500);border-radius:3px; }.overview-count { display:block;margin-top:6px;color:var(--color-text-secondary);font-size:11px;line-height:16px; }
.browse-button { display:flex;height:36px;flex-shrink:0;align-items:center;gap:3px;color:var(--color-action-primary);font-size:13px;font-weight:600; }
.device-cards { display:grid;gap:12px; }
.equipment { display:block;width:100%;padding:14px 15px 0;background:rgba(255,255,255,.98);border:1px solid var(--color-border-subtle);border-radius:8px;text-align:left;box-shadow:var(--shadow-card); }
.equipment-main { display:grid;grid-template-columns:66px minmax(0,1fr) auto 18px;align-items:center;gap:12px;padding-bottom:13px; }
.equipment-image { display:flex;width:66px;height:66px;overflow:hidden;align-items:center;justify-content:center;background:linear-gradient(145deg,#eef7ff,#dcecff);border:1px solid #d9e9fb;border-radius:8px; }.equipment-image image { width:100%;height:100%; }
.equipment-name { min-width:0; }.equipment-name strong { display:block;overflow:hidden;color:var(--color-text-primary);font-size:16px;line-height:23px;font-weight:700;text-overflow:ellipsis;white-space:nowrap; }.equipment-name > text { display:block;overflow:hidden;margin-top:5px;color:var(--color-text-secondary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap; }
.status-badge { padding:5px 9px;color:#70809c;background:#eef3f8;border-radius:13px;font-size:11px;white-space:nowrap; }.status-badge.online { color:#098361;background:#e6f8f1; }.status-badge.warning { color:#b36b12;background:#fff3df; }
.equipment-bottom { display:flex;min-height:39px;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #e8f0f8; }
.equipment-status,.equipment-link { display:flex;align-items:center;gap:6px;color:#71809b;font-size:12px; }.equipment-status.connected { color:#0b936c; }.equipment-status.failed { color:#b33c48; }.equipment-status.connecting { color:#1765dc; }
.status-dot { display:inline-block;width:7px;height:7px;flex:0 0 7px;background:#8a9ab5;border-radius:50%; }.status-dot.connected { background:#16b884;box-shadow:0 0 0 3px rgba(22,184,132,.1); }.status-dot.connecting { background:#2e7bea; }.status-dot.failed { background:#d84b57; }
.device-list-end { display:flex;width:100%;height:45px;align-items:center;justify-content:center;gap:4px;color:var(--color-action-primary);font-size:13px;font-weight:600; }
.devices-empty { display:flex;min-height:270px;flex-direction:column;align-items:center;justify-content:center;gap:11px;padding:28px;text-align:center;background:#fff;border:1px dashed #cbdcf0;border-radius:8px; }.devices-empty strong { font-size:17px; }.devices-empty > text { max-width:260px;color:var(--color-text-secondary);font-size:12px;line-height:19px; }.empty-symbol { display:flex;width:66px;height:66px;align-items:center;justify-content:center;background:var(--color-action-primary-subtle);border-radius:50%; }
button:active { opacity:.82; } button:focus-visible { outline:2px solid var(--color-action-primary);outline-offset:3px; }
@media (max-width:370px) { .overview-shortcuts { gap:7px;padding-right:14px;padding-left:14px; }.overview-shortcuts button { height:96px;font-size:12px; }.shortcut-icon { width:49px;height:49px; }.overview-devices { padding-right:16px;padding-left:16px; }.status-badge { display:none; }.equipment-main { grid-template-columns:62px minmax(0,1fr) 18px; } }
</style>
