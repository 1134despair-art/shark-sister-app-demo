import type { AppDatabase } from '@/types/models'

export function summarizeDealerYear(db: Pick<AppDatabase, 'orders' | 'tickets' | 'dealers'> | null, scopeIds: string[], year: number) {
  const scope = new Set(scopeIds)
  const monthOf = (value: string) => {
    const date = new Date(value)
    return date.getFullYear() === year ? date.getMonth() : -1
  }
  const orders = (db?.orders || []).filter(item => item.dealerId && scope.has(item.dealerId) && !['cancelled', 'refunded'].includes(String(item.status)) && monthOf(item.createdAt) >= 0)
  const tickets = (db?.tickets || []).filter(item => item.dealerId && scope.has(item.dealerId) && monthOf(item.createdAt) >= 0)
  const months = Array.from({ length: 12 }, (_, month) => ({ month: month + 1, sales: 0, service: 0 }))
  const revenue = { CNY: 0, USD: 0 }
  for (const order of orders) {
    months[monthOf(order.createdAt)].sales++
    revenue[order.currency] += order.amount
  }
  for (const ticket of tickets) months[monthOf(ticket.createdAt)].service++
  const dealers = (db?.dealers || []).filter(item => scope.has(item.id)).map(dealer => {
    const records = tickets.filter(item => item.dealerId === dealer.id)
    return {
      id: dealer.id, name: dealer.name, nameEn: dealer.nameEn, count: records.length,
      completed: records.filter(item => item.status === 'completed').length,
      processing: records.filter(item => !['completed', 'rejected'].includes(item.status)).length,
      rejected: records.filter(item => item.status === 'rejected').length,
    }
  }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
  const completed = tickets.filter(item => item.status === 'completed').length
  return { salesCount: orders.length, serviceCount: tickets.length, revenue, months, dealers, completionRate: tickets.length ? Math.round(completed / tickets.length * 100) : 0 }
}
