import { databaseService, makeId } from './database'
import { authorizationService } from './authorization'
import { mapAdapter } from './adapters'
import { integrationAvailability, integrationReason } from './adapters'
import type { AccessContext, RoutePlan, Waypoint } from '@/types/models'

function validateRouteInput(name: string, waypointIds: string[], deviceId: string | undefined, context: AccessContext) {
  if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
  if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
  if (!name.trim()) throw new Error('ROUTE_NAME_REQUIRED')
  const uniqueIds = [...new Set(waypointIds)]
  if (uniqueIds.length < 2) throw new Error('ROUTE_REQUIRES_TWO_WAYPOINTS')
  const snapshot = databaseService.snapshot()
  const waypoints = uniqueIds.map((id) => snapshot.waypoints.find((item) => item.id === id))
  if (waypoints.some((item) => !item)) throw new Error('WAYPOINT_NOT_FOUND')
  if (waypoints.some((item) => !authorizationService.isItemVisible(context, 'waypoints', item as unknown as Record<string, unknown>))) throw new Error('FORBIDDEN')
  if (deviceId) {
    const device = snapshot.devices.find((item) => item.id === deviceId)
    if (!device) throw new Error('DEVICE_NOT_FOUND')
    authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
  }
  return { uniqueIds, waypoints: waypoints as Waypoint[] }
}

function routeMetrics(waypoints: Waypoint[]) {
  const radians = (value: number) => value * Math.PI / 180
  let distanceKm = 0
  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1]
    const current = waypoints[index]
    const dLat = radians(current.lat - previous.lat)
    const dLng = radians(current.lng - previous.lng)
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(previous.lat)) * Math.cos(radians(current.lat)) * Math.sin(dLng / 2) ** 2
    distanceKm += 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  }
  const roundedDistance = Math.round(distanceKm * 10) / 10
  return { distanceKm: roundedDistance, estimatedMinutes: Math.max(1, Math.round(roundedDistance / 15 * 60)) }
}

export const routeService = {
  async createWaypoint(input: Pick<Waypoint, 'name' | 'nameEn' | 'lat' | 'lng' | 'note'> & { deviceId?: string }, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    if (!input.name.trim()) throw new Error('WAYPOINT_NAME_REQUIRED')
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error('WAYPOINT_COORDINATE_REQUIRED')
    const snapshot = databaseService.snapshot()
    const storageTarget = snapshot.settings.waypointStorage === 'cloud' ? 'server' : 'local'
    const canSync = storageTarget === 'server' && integrationAvailability.cloudSync.ready && integrationAvailability.cloudSync.mode === 'production'
    const timestamp = new Date().toISOString()
    const waypoint: Waypoint = {
      id: makeId('waypoint'), createdAt: timestamp, updatedAt: timestamp,
      ...input, name: input.name.trim(), nameEn: input.nameEn.trim() || input.name.trim(),
      ownerId: context.accountId, storageTarget,
      source: canSync ? 'cloud' : 'local',
      syncStatus: storageTarget === 'local' || canSync ? 'synced' : 'pending',
      syncAttempts: canSync ? 1 : 0,
    }
    return databaseService.repository<Waypoint>('waypoints', context).create(waypoint)
  },

  async syncWaypoint(id: string, context: AccessContext) {
    return databaseService.transact((db) => {
      const item = db.waypoints.find((entry) => entry.id === id)
      if (!item) throw new Error('ENTITY_NOT_FOUND')
      if (item.ownerId !== context.accountId) throw new Error('FORBIDDEN')
      if ((item.storageTarget ?? (item.source === 'cloud' ? 'server' : 'local')) !== 'server') throw new Error('WAYPOINT_LOCAL_ONLY')
      if (!integrationAvailability.cloudSync.ready || integrationAvailability.cloudSync.mode !== 'production') throw new Error(`INTEGRATION_NOT_CONFIGURED:cloudSync:${integrationReason('cloudSync')}`)
      item.syncAttempts += 1
      item.syncStatus = 'synced'
      item.source = 'cloud'
      item.storageTarget = 'server'
      item.updatedAt = new Date().toISOString()
      return item
    }, { action: 'waypoint-sync', entity: 'waypoints', entityId: id, operator: context.accountId || 'guest', detail: integrationAvailability.cloudSync.mode === 'local-demo' ? 'local-demo-upload' : 'cloud-upload', source: integrationAvailability.cloudSync.mode === 'local-demo' ? 'local' : 'integration' })
  },

  async updateWaypoint(id: string, input: Pick<Waypoint, 'name' | 'nameEn' | 'lat' | 'lng' | 'note'>, context: AccessContext) {
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    if (!input.name.trim()) throw new Error('WAYPOINT_NAME_REQUIRED')
    if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error('WAYPOINT_COORDINATE_REQUIRED')
    const current = await databaseService.repository<Waypoint>('waypoints', context).get(id)
    if (!current) throw new Error('ENTITY_NOT_FOUND')
    const storageTarget = current.storageTarget ?? (current.source === 'cloud' ? 'server' : 'local')
    return databaseService.repository<Waypoint>('waypoints', context).update(id, {
      ...input,
      name: input.name.trim(),
      nameEn: input.nameEn.trim() || input.name.trim(),
      source: 'local',
      storageTarget,
      syncStatus: storageTarget === 'server' ? 'pending' : 'synced',
    })
  },

  async deleteWaypoint(id: string, context: AccessContext) {
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    const snapshot = databaseService.snapshot()
    if (snapshot.routes.some((item) => item.waypointIds.includes(id))) throw new Error('WAYPOINT_IN_ROUTE')
    return databaseService.repository<Waypoint>('waypoints', context).remove(id)
  },

  async createRoute(name: string, waypointIds: string[], deviceId: string | undefined, context: AccessContext) {
    const validated = validateRouteInput(name, waypointIds, deviceId, context)
    const metrics = routeMetrics(validated.waypoints)
    const timestamp = new Date().toISOString()
    const route: RoutePlan = { id: makeId('route'), createdAt: timestamp, updatedAt: timestamp, name: name.trim(), nameEn: name.trim(), ownerId: context.accountId!, deviceId, waypointIds: validated.uniqueIds, ...metrics, status: 'ready', syncStatus: 'pending', syncAttempts: 0 }
    return databaseService.repository<RoutePlan>('routes', context).create(route)
  },

  async reorderRoute(id: string, waypointIds: string[], context: AccessContext) {
    const current = await databaseService.repository<RoutePlan>('routes', context).get(id)
    if (!current) throw new Error('ENTITY_NOT_FOUND')
    return this.updateRoute(id, current.name, waypointIds, current.deviceId, context)
  },

  async updateRoute(id: string, name: string, waypointIds: string[], deviceId: string | undefined, context: AccessContext) {
    const validated = validateRouteInput(name, waypointIds, deviceId, context)
    const metrics = routeMetrics(validated.waypoints)
    return databaseService.repository<RoutePlan>('routes', context).update(id, { name: name.trim(), nameEn: name.trim(), deviceId, waypointIds: validated.uniqueIds, ...metrics, syncStatus: 'pending' })
  },

  async uploadRoute(id: string, context: AccessContext) {
    if (!integrationAvailability.cloudSync.ready) throw new Error(`INTEGRATION_NOT_CONFIGURED:cloudSync:${integrationReason('cloudSync')}`)
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    return databaseService.transact((db) => {
      const route = db.routes.find((item) => item.id === id)
      if (!route) throw new Error('ENTITY_NOT_FOUND')
      if (route.ownerId !== context.accountId) throw new Error('FORBIDDEN')
      route.syncAttempts = Number(route.syncAttempts || 0) + 1
      route.syncStatus = 'synced'
      route.updatedAt = new Date().toISOString()
      return route
    }, { action: 'route-upload', entity: 'routes', entityId: id, operator: context.accountId || 'guest', detail: integrationAvailability.cloudSync.mode === 'local-demo' ? 'local-demo-upload' : 'cloud-upload', source: integrationAvailability.cloudSync.mode === 'local-demo' ? 'local' : 'integration' })
  },

  async setNavigation(id: string, status: RoutePlan['status'], context: AccessContext) {
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    return databaseService.repository<RoutePlan>('routes', context).update(id, { status })
  },

  async moveWaypoint(id: string, deltaX: number, deltaY: number, context: AccessContext) {
    if (!authorizationService.can(context, 'map.edit')) throw new Error('FORBIDDEN')
    const waypoint = await databaseService.repository<Waypoint>('waypoints', context).get(id)
    if (!waypoint) throw new Error('ENTITY_NOT_FOUND')
    const coordinate = await mapAdapter.moveCoordinate(waypoint.lat, waypoint.lng, deltaX, deltaY)
    const storageTarget = waypoint.storageTarget ?? (waypoint.source === 'cloud' ? 'server' : 'local')
    return databaseService.repository<Waypoint>('waypoints', context).update(id, {
      ...coordinate,
      source: 'local',
      storageTarget,
      syncStatus: storageTarget === 'server' ? 'pending' : 'synced',
    })
  },

  visibleWaypoints(context: AccessContext): Waypoint[] {
    return databaseService.snapshot().waypoints.filter((item) => item.ownerId === context.accountId)
  },
}
