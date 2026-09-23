import { describe, expect, it } from 'vitest'
import { createSeedDatabase } from '@/services/seed'
import { summarizeDealerYear } from '@/services/dealerAnalytics'

describe('dealer annual reporting', () => {
  it('reconciles summary, monthly trend and outlet distribution within the selected scope', () => {
    const db = createSeedDatabase()
    const result = summarizeDealerYear(db, ['dealer-01', 'dealer-02'], 2026)
    expect(result.salesCount).toBe(2)
    expect(result.revenue.CNY).toBe(65400)
    expect(result.months.reduce((sum, item) => sum + item.sales, 0)).toBe(result.salesCount)
    expect(result.months.reduce((sum, item) => sum + item.service, 0)).toBe(result.serviceCount)
    expect(result.dealers.reduce((sum, item) => sum + item.count, 0)).toBe(result.serviceCount)
    expect(result.dealers.every(item => item.completed + item.processing + item.rejected === item.count)).toBe(true)
    const child = summarizeDealerYear(db, ['dealer-02'], 2026)
    expect(child.dealers.map(item => item.id)).toEqual(['dealer-02'])
    expect(child.serviceCount).toBe(db.tickets.filter(item => item.dealerId === 'dealer-02').length)
  })

  it('excludes refunded, other-year and out-of-scope sales and never adds unlike currencies', () => {
    const db = createSeedDatabase()
    const order = db.orders[0]
    db.orders = [
      { ...order, id: 'cny', amount: 100, currency: 'CNY', createdAt: '2026-02-03T12:00:00Z' },
      { ...order, id: 'usd', amount: 25, currency: 'USD', createdAt: '2026-05-03T12:00:00Z' },
      { ...order, id: 'refund', status: 'refunded' },
      { ...order, id: 'old', createdAt: '2025-08-03T12:00:00Z' },
      { ...order, id: 'outside', dealerId: 'other' },
    ]
    const result = summarizeDealerYear(db, ['dealer-01'], 2026)
    expect(result.salesCount).toBe(2)
    expect(result.revenue).toEqual({ CNY: 100, USD: 25 })
    expect(result.months[1].sales).toBe(1)
    expect(result.months[4].sales).toBe(1)
    expect(summarizeDealerYear(db, [], 2026).salesCount).toBe(0)
  })

  it('returns empty years and missing data without fabricated charts or invalid rates', () => {
    const result = summarizeDealerYear(createSeedDatabase(), ['dealer-01'], 2020)
    expect(result.salesCount + result.serviceCount).toBe(0)
    expect(result.completionRate).toBe(0)
    expect(result.months.every(item => item.sales === 0 && item.service === 0)).toBe(true)
    expect(summarizeDealerYear(null, [], 2026).dealers).toEqual([])
  })
})
