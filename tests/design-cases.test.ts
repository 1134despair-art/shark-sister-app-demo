import { describe, expect, it } from 'vitest'
import { designCaseRegistry, requirementCases } from '@/config/designCases'

const supportedQuery: Record<string, string[]> = {
  '/pages/auth/login': ['state', 'region'], '/pages/auth/register': ['region'], '/pages/auth/verify': ['purpose'], '/pages/auth/password': ['mode'],
  '/pages/shell/index': ['tab', 'state', 'status'], '/pages/device/detail': ['id', 'trend'], '/pages/device/add': ['step', 'method'],
  '/pages/manage/list': ['entity', 'state', 'type', 'mode', 'id', 'status', 'deviceId'], '/pages/manage/form': ['entity', 'id', 'step', 'mode', 'type', 'deviceId', 'category'],
  '/pages/process/index': ['scenario', 'deviceId', 'stage', 'state', 'routeId', 'paymentId', 'shipmentId'], '/pages/profile/settings': ['section'], '/pages/profile/detail': ['mode'], '/pages/design-case/index': ['id'],
}

describe('V3.2 requirement and design case contract', () => {
  it('registers 115 visual cases while keeping 105 strict V3.2 states', () => {
    expect(designCaseRegistry).toHaveLength(115)
    expect(requirementCases).toHaveLength(105)
    expect(new Set(designCaseRegistry.map((item) => item.id)).size).toBe(115)
    expect(designCaseRegistry.filter((item) => item.scope === 'required')).toHaveLength(105)
    expect(designCaseRegistry.filter((item) => item.scope === 'derived')).toHaveLength(5)
    expect(designCaseRegistry.filter((item) => item.scope === 'extended')).toHaveLength(5)
  })

  it('declares role, expected state, anchor and executable test scenario', () => {
    for (const item of designCaseRegistry) {
      expect(item.route.startsWith('/pages/')).toBe(true)
      expect(['none', 'user', 'dealer']).toContain(item.role)
      expect(['anonymous', 'user', 'dealer']).toContain(item.session)
      expect(['CN', 'GLOBAL']).toContain(item.region)
      expect(item.fixtureKey).toBe(`v32-${item.id.toLowerCase()}`)
      expect(item.expectedState.length).toBeGreaterThan(0)
      expect(item.screenAnchor).toContain(`#${item.id.toLowerCase()}`)
      expect(item.testScenario).toBe(`design-case-${item.id.toLowerCase()}`)
    }
  })

  it('only registers query parameters consumed by the target page', () => {
    for (const item of designCaseRegistry) {
      const [path, rawQuery = ''] = item.route.split('?')
      expect(supportedQuery[path], `${item.id} uses an unknown route`).toBeDefined()
      for (const key of new URLSearchParams(rawQuery).keys()) expect(supportedQuery[path], `${item.id} query ${key} is ignored`).toContain(key)
    }
  })

  it('retains the complete module inventory', () => {
    expect(designCaseRegistry.filter((item) => item.module === 'auth')).toHaveLength(10)
    expect(designCaseRegistry.filter((item) => item.module === 'home')).toHaveLength(5)
    expect(designCaseRegistry.filter((item) => item.module === 'device')).toHaveLength(22)
    expect(designCaseRegistry.filter((item) => item.module === 'map')).toHaveLength(13)
    expect(designCaseRegistry.filter((item) => item.module === 'profile')).toHaveLength(8)
    expect(designCaseRegistry.filter((item) => item.module === 'support')).toHaveLength(11)
    expect(designCaseRegistry.filter((item) => item.module === 'dealer')).toHaveLength(30)
    expect(designCaseRegistry.filter((item) => item.module === 'dialog')).toHaveLength(16)
  })

})
