import { backgroundAssets, brandAssets } from '@/config/iconAssets'
import { storage } from './storage'

export interface LaunchScreenConfig {
  enabled: boolean
  revision: string
  title: string
  titleEn: string
  subtitle: string
  subtitleEn: string
  backgroundImage: string
  logoImage: string
  durationMs: number
  allowSkip: boolean
}

const SEEN_KEY = 'shark-sister-launch-screen-revision'
const GUIDE_SEEN_KEY = 'shark-sister-onboarding-seen-v1'

const fallbackConfig: LaunchScreenConfig = {
  enabled: true,
  revision: 'v3.2-default',
  title: '鲨鱼妹妹',
  titleEn: 'Shark Sister',
  subtitle: '连接海上设备，掌握每一次运行状态',
  subtitleEn: 'Connected control for every journey',
  backgroundImage: backgroundAssets.splashBackground,
  logoImage: brandAssets.logoMark,
  durationMs: 1800,
  allowSkip: true,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  return record.data && typeof record.data === 'object' && !Array.isArray(record.data) ? record.data as Record<string, unknown> : record
}

function normalize(value: unknown): LaunchScreenConfig {
  const input = asRecord(value)
  const duration = Number(input.durationMs ?? fallbackConfig.durationMs)
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : fallbackConfig.enabled,
    revision: String(input.revision || fallbackConfig.revision),
    title: String(input.title || fallbackConfig.title),
    titleEn: String(input.titleEn || fallbackConfig.titleEn),
    subtitle: String(input.subtitle || fallbackConfig.subtitle),
    subtitleEn: String(input.subtitleEn || fallbackConfig.subtitleEn),
    backgroundImage: String(input.backgroundImage || fallbackConfig.backgroundImage),
    logoImage: String(input.logoImage || fallbackConfig.logoImage),
    durationMs: Math.max(800, Math.min(5000, Number.isFinite(duration) ? duration : fallbackConfig.durationMs)),
    allowSkip: typeof input.allowSkip === 'boolean' ? input.allowSkip : fallbackConfig.allowSkip,
  }
}

async function requestRemoteConfig(url: string): Promise<LaunchScreenConfig> {
  const data = await new Promise<unknown>((resolve, reject) => {
    uni.request({ url, timeout: 2500, success: (response) => resolve(response.data), fail: reject })
  })
  return normalize(data)
}

export const launchScreenService = {
  async getConfig(): Promise<LaunchScreenConfig> {
    const url = String(import.meta.env.VITE_LAUNCH_CONFIG_URL || '').trim()
    if (!url) return { ...fallbackConfig }
    try {
      return await requestRemoteConfig(url)
    } catch {
      return { ...fallbackConfig }
    }
  },

  shouldShow(config: LaunchScreenConfig, force = false) {
    return config.enabled || force
  },

  markSeen(config: LaunchScreenConfig) {
    storage.set(SEEN_KEY, config.revision)
  },

  shouldShowGuide(force = false) {
    return force || storage.get<boolean>(GUIDE_SEEN_KEY) !== true
  },

  markGuideSeen() {
    storage.set(GUIDE_SEEN_KEY, true)
  },
}
