import { mapAdapter } from './adapters'
import { databaseService } from './database'
import type { AccessContext, ChartPreferences } from '@/types/models'

const validValues = {
  displayMode: new Set(['basic', 'standard', 'all']),
  theme: new Set(['day', 'dusk', 'night']),
  boundaryStyle: new Set(['simple', 'symbolized']),
  pointSymbol: new Set(['simple', 'paper']),
  depthColors: new Set([2, 4]),
  zoomLevel: new Set([1, 2, 3, 4, 5]),
} as const

function validatePreferences(value: ChartPreferences) {
  for (const [key, accepted] of Object.entries(validValues)) {
    if (!(accepted as Set<unknown>).has(value[key as keyof ChartPreferences])) throw new Error(`INVALID_CHART_PREFERENCE:${key}`)
  }
}

export const chartService = {
  capabilities() {
    return { ...mapAdapter.capabilities }
  },

  savePreferences(patch: Partial<ChartPreferences>, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const current = databaseService.snapshot().settings.chartPreferences
    const next = { ...current, ...patch }
    validatePreferences(next)
    return databaseService.transact((db) => {
      db.settings.chartPreferences = next
      return db.settings.chartPreferences
    }, {
      action: 'chart-preferences-save',
      entity: 'settings',
      entityId: 'chartPreferences',
      operator: context.accountId,
      detail: Object.keys(patch).join(','),
    })
  },

  requireCapability(capability: 'chartImport' | 'measurement') {
    if (!mapAdapter.capabilities[capability]) throw new Error(`INTEGRATION_NOT_CONFIGURED:${capability}:未接入电子海图引擎`)
  },

  previewCapability(capability: 'chartImport' | 'measurement', context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    if (mapAdapter.capabilities[capability]) return { demo: false, capability }
    if (mapAdapter.availability().mode !== 'local-demo') throw new Error(`INTEGRATION_NOT_CONFIGURED:${capability}:未接入电子海图引擎`)
    return databaseService.transact(() => ({ demo: true, capability }), {
      action: `chart-${capability}-demo-preview`,
      entity: 'settings',
      entityId: 'chartPreferences',
      operator: context.accountId,
      detail: 'local-demo-preview',
      source: 'local',
    })
  },
}
