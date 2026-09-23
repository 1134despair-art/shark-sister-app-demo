import { integrationAvailability, integrationReason } from './adapters'
import { authorizationService, type RepositoryAction } from './authorization'
import { databaseService } from './database'
import { storage } from './storage'
import type { EntityCollection, IntegrationCapability, LocaleCode } from '@/types/models'

export type GuardDecision =
  | { type: 'allow' }
  | { type: 'auth-required'; target: string }
  | { type: 'forbidden'; reason: string }
  | { type: 'integration-unavailable'; capability: IntegrationCapability; reason: string }

const publicPrefixes = ['/pages/startup/', '/pages/auth/', '/pages/design-case/']
export interface AuthRequiredRequest { target: string; locale: LocaleCode }
const authRequiredListeners = new Set<(request: AuthRequiredRequest) => void>()

export function onAuthRequired(listener: (request: AuthRequiredRequest) => void) {
  authRequiredListeners.add(listener)
  return () => authRequiredListeners.delete(listener)
}

function parse(url: string) {
  const [path, rawQuery = ''] = url.split('?')
  return { path: `/${path.replace(/^\//, '')}`, query: new URLSearchParams(rawQuery) }
}

function authenticationTarget(path: string, query: URLSearchParams) {
  const raw = query.toString()
  return `${path}${raw ? `?${raw}` : ''}`
}

export function showAuthRequired(target = '', requestedLocale?: LocaleCode) {
  const locale = requestedLocale || databaseService.snapshot().settings.locale
  if (target) storage.set('shark-sister-login-target', target)
  if (authRequiredListeners.size) {
    for (const listener of authRequiredListeners) listener({ target, locale })
    return
  }
  uni.showActionSheet({
    title: locale !== 'zh-Hans' ? 'Sign in to continue' : '登录后继续操作',
    itemList: locale !== 'zh-Hans' ? ['Sign in', 'Create account'] : ['登录账号', '注册账号'],
    success: (result) => {
      if (result.tapIndex === 0) uni.reLaunch({ url: '/pages/auth/login' })
      if (result.tapIndex === 1) uni.reLaunch({ url: '/pages/auth/register' })
    },
  })
}

function unavailable(capability: IntegrationCapability): GuardDecision {
  if (integrationAvailability[capability].ready) return { type: 'allow' }
  return { type: 'integration-unavailable', capability, reason: integrationReason(capability) }
}

function handleDecision(decision: GuardDecision) {
  if (decision.type === 'allow') return true
  if (decision.type === 'auth-required') showAuthRequired(decision.target)
  else if (decision.type === 'forbidden' && decision.reason === '首次登录必须先修改临时密码') uni.reLaunch({ url: '/pages/auth/password?mode=first' })
  else uni.showModal({ title: decision.type === 'forbidden' ? '无权访问' : '功能暂不可用', content: decision.reason, showCancel: false })
  return false
}

export const routeGuard = {
  evaluate(url: string): GuardDecision {
    const { path, query } = parse(url)
    const db = databaseService.snapshot()
    const account = db.accounts.find((item) => item.id === db.session.accountId) ?? null
    if (account?.firstLogin && !(path === '/pages/auth/password' && query.get('mode') === 'first') && path !== '/pages/auth/login') return { type: 'forbidden', reason: '首次登录必须先修改临时密码' }
    if (publicPrefixes.some((prefix) => path.startsWith(prefix))) return { type: 'allow' }
    if (path === '/pages/profile/settings' && ['privacy-policy', 'user-agreement'].includes(query.get('section') || '')) return { type: 'allow' }
    if (!account && !db.session.guest) return { type: 'auth-required', target: authenticationTarget(path, query) }
    const root = account?.dealerId
    const scope = root ? [root] : []
    if (account?.role === 'dealerAdmin') for (const dealer of db.dealers) if (dealer.parentId && scope.includes(dealer.parentId) && !scope.includes(dealer.id)) scope.push(dealer.id)
    const employeeId = account?.role === 'dealerStaff' ? db.employees.find((item) => item.phone === account.phone)?.id : undefined
    const context = authorizationService.context(account, scope, employeeId)
    const guest = context.role === 'guest'

    if (path === '/pages/shell/index' && query.get('tab') === 'workbench') return guest ? { type: 'auth-required', target: authenticationTarget(path, query) } : context.role === 'dealerAdmin' || context.role === 'dealerStaff' ? { type: 'allow' } : { type: 'forbidden', reason: '当前账号不是经销商账号' }
    if (path === '/pages/device/add') return guest ? { type: 'auth-required', target: authenticationTarget(path, query) } : authorizationService.can(context, 'device.bind') ? { type: 'allow' } : { type: 'forbidden', reason: '当前账号没有设备绑定权限' }
    if (path === '/pages/device/detail') {
      const item = db.devices.find((entry) => entry.id === query.get('id'))
      return item && authorizationService.canUseCollection(context, 'devices', 'get') && authorizationService.isItemVisible(context, 'devices', item as unknown as Record<string, unknown>) ? { type: 'allow' } : guest ? { type: 'auth-required', target: authenticationTarget(path, query) } : { type: 'forbidden', reason: '设备不在当前账号的数据范围内' }
    }
    if (path === '/pages/profile/detail') return guest ? { type: 'auth-required', target: authenticationTarget(path, query) } : { type: 'allow' }
    if (path === '/pages/profile/settings') return guest && !['language', 'privacy-policy', 'user-agreement', 'about'].includes(query.get('section') || '') ? { type: 'auth-required', target: authenticationTarget(path, query) } : { type: 'allow' }
    if (path === '/pages/process/index') {
      const scenario = query.get('scenario') || ''
      if (guest && ['control', 'settings', 'ota', 'bluetooth', 'report', 'route', 'playback', 'payment'].includes(scenario)) return { type: 'auth-required', target: authenticationTarget(path, query) }
      if (scenario === 'control') return unavailable('deviceControl')
      if (scenario === 'ota' || scenario === 'bluetooth') return unavailable(scenario === 'ota' ? 'ota' : 'bluetooth')
      if (scenario === 'payment') return { type: 'allow' }
      if (scenario === 'mainboard' && !authorizationService.can(context, 'support.manage')) return { type: 'forbidden', reason: '当前账号没有主板更换登记权限' }
      if (scenario === 'logistics' && query.get('source') === 'support' && context.role === 'user') return { type: 'allow' }
      if ((scenario === 'dealerAnalytics' || scenario === 'logistics') && !['dealerAdmin', 'dealerStaff'].includes(context.role)) return { type: 'forbidden', reason: '仅经销商账号可访问' }
    }
    if (path === '/pages/manage/list' || path === '/pages/manage/form') {
      const entity = query.get('entity') as EntityCollection | null
      if (entity === ('profile' as EntityCollection)) return guest ? { type: 'auth-required', target: authenticationTarget(path, query) } : { type: 'allow' }
      if (guest && path.endsWith('/list') && entity === 'tickets' && query.get('mode') === 'hub') return { type: 'allow' }
      if (!entity) return { type: 'allow' }
      if (guest) return { type: 'auth-required', target: authenticationTarget(path, query) }
      if (entity === 'materials' && query.get('state') === 'price-search' && !authorizationService.can(context, 'price.view')) return { type: 'forbidden', reason: '当前账号没有采购价查看权限' }
      const readOnly = ['detail', 'view', 'permissions'].includes(query.get('mode') || '')
      const action: RepositoryAction = path.endsWith('/form') ? query.get('id') && readOnly ? 'get' : query.get('id') ? 'update' : 'create' : 'list'
      return authorizationService.canUseCollection(context, entity, action) ? { type: 'allow' } : { type: 'forbidden', reason: '当前账号没有该页面或操作权限' }
    }
    return { type: 'allow' }
  },

  canNavigate(url: string) {
    return this.evaluate(url).type === 'allow'
  },

  enforceCurrentPage() {
    const pages = getCurrentPages()
    const current = pages[pages.length - 1] as { route?: string; options?: Record<string, string> } | undefined
    if (!current?.route) return true
    const rawQuery = new URLSearchParams(current.options || {}).toString()
    return handleDecision(this.evaluate(`/${current.route}${rawQuery ? `?${rawQuery}` : ''}`))
  },

  install() {
    const intercept = {
      invoke: (args: { url?: string }) => {
        if (!args.url) return true
        return handleDecision(routeGuard.evaluate(args.url))
      },
    }
    for (const method of ['navigateTo', 'redirectTo', 'reLaunch'] as const) uni.addInterceptor(method, intercept)
  },
}
