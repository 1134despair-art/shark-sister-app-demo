import type { AccessContext, Account, EntityCollection } from '@/types/models'

export type RepositoryAction = 'list' | 'get' | 'create' | 'update' | 'remove'

const capabilitiesByCollection: Partial<Record<EntityCollection, string[]>> = {
  devices: ['device.assign', 'support.manage', 'project.manage'],
  waypoints: ['map.edit'], routes: ['map.edit'], projects: ['project.manage'], tickets: ['support.manage'],
  employees: ['staff.manage'], dealers: ['dealer.manage'], materials: ['material.apply', 'material.approve'],
  shipments: ['material.apply', 'material.approve'], transfers: ['device.assign'], purchases: ['purchase.create'],
  payments: ['price.view'], orders: ['price.view', 'support.manage'], messages: ['support.manage'],
}

export const authorizationService = {
  context(account: Account | null, dealerScopeIds?: string[], employeeId?: string): AccessContext {
    return {
      accountId: account?.id ?? null,
      role: account?.role ?? 'guest',
      dealerId: account?.dealerId,
      employeeId,
      dealerScopeIds: dealerScopeIds ?? (account?.dealerId ? [account.dealerId] : []),
      capabilities: account?.capabilities ?? [],
    }
  },

  can(context: AccessContext, capability: string) {
    return context.capabilities.includes(capability)
  },

  canUseCollection(context: AccessContext, collection: EntityCollection, action: RepositoryAction) {
    if (context.role === 'guest') return (action === 'list' || action === 'get') && collection === 'devices'
    if (context.role === 'user') {
      if (action === 'list' || action === 'get') return ['devices', 'waypoints', 'routes', 'tickets', 'payments', 'orders', 'messages'].includes(collection)
      if (action === 'create') return ['waypoints', 'routes', 'tickets'].includes(collection)
      if (action === 'update') return ['waypoints', 'routes', 'tickets', 'messages'].includes(collection)
      return ['waypoints', 'routes'].includes(collection)
    }
    const capabilities = capabilitiesByCollection[collection] || []
    if (collection === 'messages' && action === 'update') return capabilities.some((capability) => this.can(context, capability))
    if (action === 'remove') return collection === 'messages' && capabilities.some((capability) => this.can(context, capability))
    return capabilities.some((capability) => this.can(context, capability))
  },

  assertCollection(context: AccessContext, collection: EntityCollection, action: RepositoryAction) {
    if (!this.canUseCollection(context, collection, action)) throw new Error('FORBIDDEN')
  },

  isItemVisible(context: AccessContext, collection: EntityCollection, item: Record<string, unknown>) {
    if (context.role === 'guest') return collection === 'devices' && item.guestVisible === true
    if (context.role === 'user') {
      if (collection === 'tickets') return item.ownerId === context.accountId && item.customerVisible !== false
      if (collection === 'devices' || collection === 'waypoints' || collection === 'routes') return item.ownerId === context.accountId
      if (collection === 'payments') return item.accountId === context.accountId
      if (collection === 'orders') return item.ownerId === context.accountId
      if (collection === 'messages') return item.accountId === context.accountId || (!item.accountId && !item.dealerId)
      return false
    }
    if (context.role === 'dealerStaff' && collection === 'devices') return Boolean(context.employeeId) && item.assignedTo === context.employeeId
    if (collection === 'dealers') return context.dealerScopeIds.includes(String(item.id)) || context.dealerScopeIds.includes(String(item.parentId))
    if (collection === 'payments') return context.dealerScopeIds.includes(String(item.dealerId)) || item.accountId === context.accountId
    if (collection === 'messages') return context.dealerScopeIds.includes(String(item.dealerId)) || item.accountId === context.accountId || (!item.accountId && !item.dealerId)
    if ('dealerId' in item) return context.dealerScopeIds.includes(String(item.dealerId))
    if (collection === 'devices') return context.dealerScopeIds.includes(String(item.dealerId))
    return true
  },

  assertItem(context: AccessContext, collection: EntityCollection, item: Record<string, unknown>) {
    if (!this.isItemVisible(context, collection, item)) throw new Error('FORBIDDEN')
  },
}
