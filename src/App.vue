<script setup lang="ts">
import { watch } from 'vue'
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { localeDirection, runtimeLocaleFor } from '@/config/locales'
import { i18n } from '@/i18n'
import { routeGuard } from '@/services/routeGuard'
import { useAppStore } from '@/stores/app'
import type { LocaleCode } from '@/types/models'

const store = useAppStore()

function syncRuntimeLocale(locale: LocaleCode) {
  if (typeof uni.setLocale === 'function') uni.setLocale(runtimeLocaleFor(locale))
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
    document.documentElement.dir = localeDirection(locale)
  }
}

onLaunch(async () => {
  await store.init()
  i18n.global.locale.value = store.locale
  syncRuntimeLocale(store.locale)
  routeGuard.install()
})

onShow(async () => {
  await store.init()
  setTimeout(() => routeGuard.enforceCurrentPage(), 0)
})

watch(() => store.locale, (locale) => {
  i18n.global.locale.value = locale
  syncRuntimeLocale(locale)
})
</script>

<style lang="scss">
@import './styles/tokens.scss';
@import './styles/iconfont.scss';
@import './styles/global.scss';
@import './styles/dealer-workspace.scss';

/* #ifdef H5 */
@import './styles/h5-frame.scss';
@import './styles/h5-overlays.scss';
/* #endif */
</style>
