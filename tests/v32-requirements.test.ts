import { describe, expect, it } from 'vitest'
import { v32PlatformRequirements, v32RequirementCoverage } from '@/config/requirements'

describe('V3.2 field-level requirement contracts', () => {
  it('materializes every source row from 008 through 146 exactly once', () => {
    expect(v32RequirementCoverage).toHaveLength(139)
    expect(v32RequirementCoverage.map((item) => item.sourceRow)).toEqual(Array.from({ length: 139 }, (_, index) => index + 8))
    expect(new Set(v32RequirementCoverage.map((item) => item.sourceRow)).size).toBe(139)
  })

  it('keeps source fields, actions, states, route and executable evidence', () => {
    for (const item of v32RequirementCoverage) {
      expect(item.requirement.length).toBeGreaterThan(0)
      expect(item.roles.length).toBeGreaterThan(0)
      expect(item.route.startsWith('/pages/')).toBe(true)
      expect(item.evidence).toContain(`xlsx:APP端功能列表:row-${String(item.sourceRow).padStart(3, '0')}`)
      expect(item.evidence.some((value) => value.startsWith('src/'))).toBe(true)
      expect(item.evidence).toContain(`tests/v32-requirements.test.ts#row-${String(item.sourceRow).padStart(3, '0')}`)
    }
  })

  it('separates the two Excel blanks, local simulations and production integrations', () => {
    const emptyRows = [59, 60]
    expect(emptyRows.every((row) => v32RequirementCoverage.find((item) => item.sourceRow === row)?.status === 'source-blank')).toBe(true)
    expect([100, 110, 111, 112].every((row) => v32RequirementCoverage.find((item) => item.sourceRow === row)?.status === 'complete-local')).toBe(true)
    for (const row of [13, 21, 22, 23, 40, 42, 48, 49, 66, 67, 82, 97, 122, 138, 142]) {
      expect(v32RequirementCoverage.find((item) => item.sourceRow === row)?.status, `row ${row}`).toBe('simulated-local')
    }
    for (const row of [16, 53, 54, 55, 56, 57, 65, 73, 78, 79, 81, 87, 93, 94, 119, 132, 133, 134, 135, 144, 145]) {
      expect(v32RequirementCoverage.find((item) => item.sourceRow === row)?.status, `row ${row}`).toBe('integration-required')
    }
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 136)?.status).toBe('demo-exception')
  })

  it('tracks the omitted cross-region and message-transfer rows without overstating coverage', () => {
    const crossRegion = v32RequirementCoverage.find((item) => item.sourceRow === 145)!
    const messageTransfer = v32RequirementCoverage.find((item) => item.sourceRow === 146)!
    expect(crossRegion.status).toBe('integration-required')
    expect(crossRegion.route).toContain('category=transfer')
    expect(messageTransfer.status).toBe('complete-local')
    expect(messageTransfer.route).toContain('transfer-selector')
  })

  it('tracks regional deployment and guest entry rows 004 to 007 separately and honestly', () => {
    expect(v32PlatformRequirements.map((item) => item.sourceRow)).toEqual([4, 5, 6, 7])
    expect(v32PlatformRequirements.find((item) => item.sourceRow === 4)?.status).toBe('complete-local')
    expect(v32PlatformRequirements.filter((item) => [5, 6].includes(item.sourceRow)).every((item) => item.status === 'integration-required')).toBe(true)
    expect(v32PlatformRequirements.find((item) => item.sourceRow === 7)?.status).toBe('complete-local')
  })

  it('maps requirement groups to their exact product routes', () => {
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 55)?.route).toBe('/pages/shell/index?tab=map')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 58)?.route).toContain('scenario=route')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 123)?.route).toContain('state=price-search')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 127)?.route).toContain('entity=shipments')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 131)?.route).toContain('state=unassigned')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 135)?.route).toContain('mode=reallocation')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 100)?.route).toContain('entity=purchases')
    expect(v32RequirementCoverage.find((item) => item.sourceRow === 110)?.fields).toContain('质保期（日期选择器）')
  })

  it('uses Excel provenance and records UI assertions for every nonblank requirement', () => {
    const allRows = [...v32PlatformRequirements, ...v32RequirementCoverage]
    expect(allRows.filter((item) => item.status !== 'source-blank')).toHaveLength(141)
    for (const item of allRows) {
      expect(item.sourceSheet).toBe('APP端功能列表')
      expect(item.evidence).toContain(`xlsx:APP端功能列表:row-${String(item.sourceRow).padStart(3, '0')}`)
      expect(item.conclusion).toBeDefined()
      if (item.status !== 'source-blank') expect(item.uiAssertions?.length).toBeGreaterThan(0)
    }
  })
})
