<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ id: string }>()
const host = ref<HTMLElement | null>(null)
let shadow: ShadowRoot | null = null
let disposed = false

function hostElement() {
  const candidate = host.value as (HTMLElement & { $el?: HTMLElement }) | null
  return candidate?.$el || candidate
}

async function render() {
  const element = hostElement()
  if (!element || typeof element.attachShadow !== 'function' || !props.id) return
  try {
    shadow ||= element.attachShadow({ mode: 'open' })
    const [screensResponse, cssResponse] = await Promise.all([
      fetch('/static/design-parity/screens.json'),
      fetch('/static/design-parity/design.css'),
    ])
    if (!screensResponse.ok || !cssResponse.ok) throw new Error(`DESIGN_PARITY_ASSET_FAILED:${screensResponse.status}:${cssResponse.status}`)
    const screens = await screensResponse.json() as Record<string, string>
    const css = await cssResponse.text()
    if (disposed || !shadow) return
    const markup = screens[props.id]
    if (!markup) throw new Error(`DESIGN_PARITY_CASE_MISSING:${props.id}`)
    shadow.innerHTML = `<style>${css}</style><div class="phone-screen ss-app-parity" data-design-case="${props.id}">${markup}</div>`
    await Promise.all(Array.from(shadow.querySelectorAll('img')).map((image) => image.decode().catch(() => undefined)))
    element.setAttribute('data-ready', 'true')
    element.removeAttribute('data-error')
  } catch (error) {
    element.setAttribute('data-error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

onMounted(() => nextTick(render))
watch(() => props.id, () => nextTick(render))
onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <!-- #ifdef H5 -->
  <div ref="host" class="ss-design-parity" aria-hidden="true" />
  <!-- #endif -->
</template>

<style scoped>
.ss-design-parity { position:fixed;inset:0;z-index:9999;display:block;width:390px;height:844px;overflow:hidden;pointer-events:none; }
</style>
