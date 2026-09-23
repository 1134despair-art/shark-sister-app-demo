/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_REGION: 'CN' | 'GLOBAL'
  readonly VITE_APP_DEFAULT_LOCALE: 'zh-Hans' | 'en'
  readonly VITE_APP_TITLE: string
  readonly VITE_LAUNCH_CONFIG_URL?: string
}

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
