import { databaseService, makeId } from './database'
import { authProviderAdapter, isLocalDemoCapability } from './adapters'
import type { Account, AppDatabase, AuthProvider, Region, VerificationSession } from '@/types/models'

const passwordValid = (password: string) => password.length >= 8 && password.length <= 20 && /[A-Za-z]/.test(password) && /\d/.test(password)
const findAccount = (accounts: Account[], identifier: string) => accounts.find((item) =>
  item.identifier.toLocaleLowerCase() === identifier ||
  item.phone?.toLocaleLowerCase() === identifier ||
  item.email?.toLocaleLowerCase() === identifier,
)

const userCapabilities = ['device.control', 'device.bind', 'map.edit', 'support.create']

export function effectiveAccount(account: Account, db: AppDatabase): Account {
  const dealerDisabled = account.role === 'dealerAdmin' && db.dealers.find((item) => item.id === account.dealerId)?.status === 'disabled'
  const staffDisabled = account.role === 'dealerStaff' && (
    db.employees.find((item) => item.dealerId === account.dealerId && item.phone === account.phone)?.status === 'disabled'
    || db.dealers.find((item) => item.id === account.dealerId)?.status === 'disabled'
  )
  if (!dealerDisabled && !staffDisabled) return account
  return { ...account, role: 'user', dealerId: undefined, active: true, capabilities: [...userCapabilities] }
}

export const authService = {
  async login(identifier: string, password: string) {
    const normalized = identifier.trim().toLocaleLowerCase()
    const snapshot = databaseService.snapshot()
    const account = snapshot.accounts.find((item) => item.identifier.toLocaleLowerCase() === normalized)
    if (!account || account.role === 'guest') throw new Error('INVALID_CREDENTIALS')
    if (effectiveAccount(account, snapshot).active === false) throw new Error('ACCOUNT_DISABLED')
    if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) throw new Error(`ACCOUNT_LOCKED:${account.lockedUntil}`)
    if (account.password !== password) {
      databaseService.transact((db) => {
        const target = db.accounts.find((item) => item.id === account.id)!
        target.failedAttempts = (target.failedAttempts || 0) + 1
        if (target.failedAttempts >= 5) target.lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString()
        target.updatedAt = new Date().toISOString()
        return target
      }, { action: 'login-failed', entity: 'accounts', entityId: account.id, operator: account.id })
      const updated = databaseService.snapshot().accounts.find((item) => item.id === account.id)!
      if (updated.lockedUntil) throw new Error(`ACCOUNT_LOCKED:${updated.lockedUntil}`)
      throw new Error(`INVALID_CREDENTIALS:${Math.max(0, 5 - updated.failedAttempts)}`)
    }
    const authenticated = databaseService.transact((db) => {
      const target = db.accounts.find((item) => item.id === account.id)!
      target.failedAttempts = 0
      delete target.lockedUntil
      target.updatedAt = new Date().toISOString()
      return target
    }, { action: 'login-success', entity: 'accounts', entityId: account.id, operator: account.id })
    await databaseService.setSession(authenticated.id)
    return effectiveAccount(authenticated, databaseService.snapshot())
  },

  async enterGuest() {
    const guest = databaseService.snapshot().accounts.find((item) => item.role === 'guest')
    if (!guest) throw new Error('GUEST_NOT_AVAILABLE')
    await databaseService.setSession(guest.id, true)
    return guest
  },

  async socialLogin(provider: AuthProvider, region: Region) {
    const identity = await authProviderAdapter.authorize(provider, region)
    const account = databaseService.transact((db) => {
      const linked = db.accounts.find((item) => item.providerLinks?.[provider] === identity.providerId)
      if (linked) return linked
      const timestamp = new Date().toISOString()
      const created: Account = {
        id: makeId('acc-social'), createdAt: timestamp, updatedAt: timestamp,
        identifier: identity.identifier, password: '', displayName: identity.displayName, displayNameEn: identity.displayNameEn,
        role: 'user', verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create'],
        providerLinks: { [provider]: identity.providerId },
        email: identity.identifier.includes('@') ? identity.identifier : undefined,
      }
      db.accounts.unshift(created)
      return created
    }, { action: 'social-login', entity: 'accounts', entityId: identity.providerId, detail: isLocalDemoCapability('socialAuth') ? `${provider}:local-demo` : provider, source: isLocalDemoCapability('socialAuth') ? 'local' : 'integration' })
    await databaseService.setSession(account.id)
    return account
  },

  async startVerification(target: string, purpose: VerificationSession['purpose'], payload?: VerificationSession['payload']) {
    const normalized = target.trim().toLocaleLowerCase()
    const db = databaseService.snapshot()
    if (purpose === 'register' && db.accounts.some((item) => item.identifier.toLocaleLowerCase() === normalized)) throw new Error('ACCOUNT_EXISTS')
    if (purpose === 'forgot' && !db.accounts.some((item) => item.identifier.toLocaleLowerCase() === normalized)) throw new Error('ACCOUNT_NOT_FOUND')
    if (purpose === 'login') {
      if (!/^1\d{10}$/.test(normalized)) throw new Error('INVALID_MOBILE')
      const account = findAccount(db.accounts, normalized)
      if (!account || account.role === 'guest') throw new Error('ACCOUNT_NOT_FOUND')
      if (effectiveAccount(account, db).active === false) throw new Error('ACCOUNT_DISABLED')
      if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) throw new Error(`ACCOUNT_LOCKED:${account.lockedUntil}`)
    }
    if (purpose === 'register' && !passwordValid(payload?.password || '')) throw new Error('WEAK_PASSWORD')
    const timestamp = new Date().toISOString()
    const session: VerificationSession = {
      id: makeId('verify'), createdAt: timestamp, updatedAt: timestamp, target: normalized, purpose, code: '826104',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), verified: false, attempts: 0, maxAttempts: 5, payload,
    }
    return databaseService.transact((current) => {
      current.verificationSessions = current.verificationSessions.filter((item) => item.target !== normalized || item.purpose !== purpose)
      current.verificationSessions.unshift(session)
      return session
    }, { action: 'verification-start', entity: 'verificationSessions', entityId: session.id, detail: purpose })
  },

  async verify(sessionId: string, code: string) {
    const session = databaseService.snapshot().verificationSessions.find((item) => item.id === sessionId)
    if (!session) throw new Error('VERIFICATION_NOT_FOUND')
    if (new Date(session.expiresAt).getTime() < Date.now()) throw new Error('VERIFICATION_EXPIRED')
    if (session.attempts >= session.maxAttempts) throw new Error('VERIFICATION_LOCKED')
    if (session.code !== code) {
      databaseService.transact((db) => {
        const target = db.verificationSessions.find((item) => item.id === sessionId)!
        target.attempts += 1
        target.updatedAt = new Date().toISOString()
        return target
      }, { action: 'verification-failed', entity: 'verificationSessions', entityId: sessionId, detail: session.purpose })
      throw new Error('VERIFICATION_INVALID')
    }
    const result = databaseService.transact((db) => {
      const target = db.verificationSessions.find((item) => item.id === sessionId)!
      target.verified = true
      target.updatedAt = new Date().toISOString()
      if (target.purpose === 'register' || target.purpose === 'wechat') {
        const existing = db.accounts.find((item) => item.identifier.toLocaleLowerCase() === target.target)
        if (existing) return { session: target, account: existing }
        const timestamp = new Date().toISOString()
        const isEmail = target.target.includes('@')
        const account: Account = {
          id: makeId('acc'), createdAt: timestamp, updatedAt: timestamp, identifier: target.target,
          password: target.payload?.password || '123456', displayName: isEmail ? '海外用户' : `用户${target.target.slice(-4)}`,
          displayNameEn: isEmail ? 'Global user' : `User ${target.target.slice(-4)}`, role: 'user',
          phone: isEmail ? undefined : target.target, email: isEmail ? target.target : undefined,
          verified: true, failedAttempts: 0, capabilities: ['device.control', 'device.bind', 'map.edit', 'support.create'],
        }
        db.accounts.unshift(account)
        return { session: target, account }
      }
      return { session: target, account: undefined }
    }, { action: 'verification-success', entity: 'verificationSessions', entityId: sessionId, detail: session.purpose })
    if (result.account) await databaseService.setSession(result.account.id)
    return result
  },

  async resetPassword(sessionId: string, password: string) {
    if (!passwordValid(password)) throw new Error('WEAK_PASSWORD')
    return databaseService.transact((db) => {
      const session = db.verificationSessions.find((item) => item.id === sessionId && item.purpose === 'forgot' && item.verified)
      if (!session) throw new Error('VERIFICATION_REQUIRED')
      const account = db.accounts.find((item) => item.identifier.toLocaleLowerCase() === session.target)
      if (!account) throw new Error('ACCOUNT_NOT_FOUND')
      account.password = password
      account.failedAttempts = 0
      delete account.lockedUntil
      account.updatedAt = new Date().toISOString()
      return account
    }, { action: 'password-reset', entity: 'accounts', entityId: sessionId })
  },

  async loginWithCode(sessionId: string, code: string) {
    const pending = databaseService.snapshot().verificationSessions.find((item) => item.id === sessionId && item.purpose === 'login')
    if (!pending || pending.consumedAt) throw new Error('VERIFICATION_REQUIRED')
    await authService.verify(sessionId, code)
    const snapshot = databaseService.snapshot()
    const verification = snapshot.verificationSessions.find((item) => item.id === sessionId && item.purpose === 'login' && item.verified)
    if (!verification || verification.consumedAt) throw new Error('VERIFICATION_REQUIRED')
    const account = findAccount(snapshot.accounts, verification.target)
    if (!account || account.role === 'guest') throw new Error('ACCOUNT_NOT_FOUND')
    if (effectiveAccount(account, snapshot).active === false) throw new Error('ACCOUNT_DISABLED')

    const authenticated = databaseService.transact((db) => {
      const targetSession = db.verificationSessions.find((item) => item.id === sessionId)!
      const targetAccount = db.accounts.find((item) => item.id === account.id)!
      targetSession.consumedAt = new Date().toISOString()
      targetSession.updatedAt = targetSession.consumedAt
      targetAccount.failedAttempts = 0
      delete targetAccount.lockedUntil
      targetAccount.updatedAt = targetSession.consumedAt
      return targetAccount
    }, { action: 'login-code-success', entity: 'accounts', entityId: account.id, operator: account.id })
    await databaseService.setSession(authenticated.id)
    return effectiveAccount(authenticated, databaseService.snapshot())
  },

  async changePassword(accountId: string, currentPassword: string, password: string) {
    if (!passwordValid(password)) throw new Error('WEAK_PASSWORD')
    return databaseService.transact((db) => {
      const account = db.accounts.find((item) => item.id === accountId)
      if (!account) throw new Error('ACCOUNT_NOT_FOUND')
      if (account.password !== currentPassword) throw new Error('CURRENT_PASSWORD_INVALID')
      account.password = password
      account.firstLogin = false
      account.updatedAt = new Date().toISOString()
      return account
    }, { action: 'password-change', entity: 'accounts', entityId: accountId, operator: accountId })
  },
}

export { passwordValid }
