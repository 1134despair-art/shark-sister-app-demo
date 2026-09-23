import { describe, expect, it } from 'vitest'
import { launchScreenService, type LaunchScreenConfig } from '@/services/launchScreen'

describe('launch screen configuration', () => {
  it('shows the short splash on every launch and the guide once per installation', () => {
    const config: LaunchScreenConfig = {
      enabled: true,
      revision: `test-${Date.now()}`,
      title: '鲨鱼妹妹',
      titleEn: 'Shark Sister',
      subtitle: '设备智能管理',
      subtitleEn: 'Smart device management',
      backgroundImage: '/launch.png',
      logoImage: '/logo.png',
      durationMs: 1200,
      allowSkip: true,
    }

    expect(launchScreenService.shouldShow(config)).toBe(true)
    launchScreenService.markSeen(config)
    expect(launchScreenService.shouldShow(config)).toBe(true)
    expect(launchScreenService.shouldShow(config, true)).toBe(true)
    expect(launchScreenService.shouldShowGuide(true)).toBe(true)
    launchScreenService.markGuideSeen()
    expect(launchScreenService.shouldShowGuide()).toBe(false)
  })
})
