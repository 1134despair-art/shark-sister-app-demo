import 'vue'
import 'vue-i18n'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    uni: typeof uni
  }
}

export {}
