import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
export function createApp() {
  const app = createSSRApp(App)
  app.config.globalProperties.uni = uni
  app.use(createPinia())
  app.use(i18n)
  return { app }
}
