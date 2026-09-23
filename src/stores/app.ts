import { defineStore } from 'pinia'
import { authService, effectiveAccount } from '@/services/auth'
import { authorizationService } from '@/services/authorization'
import { databaseService } from '@/services/database'
import { workflowService, type WorkflowAction, type WorkflowEntity } from '@/services/workflow'
import { uploadAdapter, type UploadAsset } from '@/services/adapters'
import { profileService, type ProfileUpdateInput } from '@/services/profile'
import { warrantyService } from '@/services/warranty'
import { complianceService } from '@/services/compliance'
import type { AccessContext, Account, AppDatabase, Attachment, AuthProvider, BaseEntity, EntityCollection, LocaleCode, Project, Query, Region, UnitSystem, VerificationSession } from '@/types/models'

interface AppState {
  ready: boolean
  busy: boolean
  db: AppDatabase | null
  activeTab: 'home' | 'device' | 'workbench' | 'map' | 'profile'
  shellState: string
  shellStatus: string
  designCaseId: string
  designParityVisible: boolean
  lastError: string
  projectDraft: Partial<Project>
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({ ready: false, busy: false, db: null, activeTab: 'home', shellState: '', shellStatus: '', designCaseId: '', designParityVisible: false, lastError: '', projectDraft: {} }),
  getters: {
    account(state): Account | null {
      const account = state.db?.accounts.find((item) => item.id === state.db?.session.accountId)
      return account && state.db ? effectiveAccount(account, state.db) : null
    },
    isGuest(): boolean {
      return this.account?.role === 'guest' || Boolean(this.db?.session.guest)
    },
    isDealer(): boolean {
      return this.account?.role === 'dealerAdmin' || this.account?.role === 'dealerStaff'
    },
    isDealerAdmin(): boolean {
      return this.account?.role === 'dealerAdmin'
    },
    context(): AccessContext {
      const root = this.account?.dealerId
      const scope = root ? [root] : []
      let changed = this.account?.role === 'dealerAdmin'
      while (changed) { changed = false; for (const dealer of this.db?.dealers || []) if (dealer.parentId && scope.includes(dealer.parentId) && !scope.includes(dealer.id)) { scope.push(dealer.id); changed = true } }
      const employee = this.account?.role === 'dealerStaff' ? this.db?.employees.find((item) => item.phone === this.account?.phone) : undefined
      const effectiveAccount = this.account && employee ? { ...this.account, capabilities: [...employee.capabilities] } : this.account
      return authorizationService.context(effectiveAccount, scope, employee?.id)
    },
    locale(state): LocaleCode {
      return state.db?.settings.locale ?? (import.meta.env.VITE_APP_DEFAULT_LOCALE === 'en' ? 'en' : 'zh-Hans')
    },
    unitSystem(state): UnitSystem {
      return state.db?.settings.unitSystem ?? 'metric'
    },
    unreadCount(state): number {
      if (!state.db) return 0
      const account = state.db.accounts.find((item) => item.id === state.db?.session.accountId)
      return state.db.messages.filter((item) => !item.read && (item.accountId === account?.id || item.dealerId === account?.dealerId || (!item.accountId && !item.dealerId))).length
    },
  },
  actions: {
    async init() {
      if (this.ready) return
      await databaseService.initialize()
      warrantyService.ensureReminders()
      this.db = databaseService.snapshot()
      this.ready = true
    },
    refresh() {
      this.db = databaseService.snapshot()
    },
    async login(identifier: string, password: string) {
      this.busy = true
      this.lastError = ''
      try {
        const account = await authService.login(identifier, password)
        this.refresh()
        this.activeTab = 'home'
        return account
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'LOGIN_FAILED'
        throw error
      } finally {
        this.busy = false
      }
    },
    async loginWithCode(sessionId: string, code: string) {
      this.busy = true
      this.lastError = ''
      try {
        const account = await authService.loginWithCode(sessionId, code)
        this.refresh()
        this.activeTab = 'home'
        return account
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : 'LOGIN_FAILED'
        throw error
      } finally {
        this.busy = false
      }
    },
    async enterGuest() {
      const account = await authService.enterGuest()
      this.refresh()
      this.activeTab = 'home'
      return account
    },
    async socialLogin(provider: AuthProvider, region?: Region) {
      const account = await authService.socialLogin(provider, region || this.db?.settings.region || 'CN')
      this.refresh()
      return account
    },
    async startVerification(target: string, purpose: VerificationSession['purpose'], payload?: VerificationSession['payload']) {
      return authService.startVerification(target, purpose, payload)
    },
    async verify(sessionId: string, code: string) {
      const result = await authService.verify(sessionId, code)
      this.refresh()
      return result
    },
    async resetPassword(sessionId: string, password: string) {
      const account = await authService.resetPassword(sessionId, password)
      this.refresh()
      return account
    },
    async logout() {
      const accountId = this.account?.id
      if (accountId) await complianceService.resetPermissionsForAccount(accountId)
      this.db = await databaseService.setSession(null)
      this.activeTab = 'home'
      this.shellState = ''
      this.shellStatus = ''
      this.designCaseId = ''
      this.designParityVisible = false
    },
    async setLocale(locale: LocaleCode) {
      this.db = await databaseService.updateSettings({ locale })
    },
    async setUnitSystem(unitSystem: UnitSystem) {
      this.db = await databaseService.updateSettings({ unitSystem })
    },
    async setAutoFirmware(autoFirmware: boolean) {
      this.db = await databaseService.updateSettings({ autoFirmware })
    },
    async setWaypointStorage(waypointStorage: AppDatabase['settings']['waypointStorage']) {
      this.db = await databaseService.updateSettings({ waypointStorage })
    },
    async updateNotifications(key: keyof AppDatabase['settings']['notifications'], value: boolean) {
      if (!this.db) return
      this.db = await databaseService.updateSettings({ notifications: { ...this.db.settings.notifications, [key]: value } })
    },
    async changePassword(currentPassword: string, password: string) {
      if (!this.account) throw new Error('NOT_AUTHENTICATED')
      await authService.changePassword(this.account.id, currentPassword, password)
      this.refresh()
    },
    async updateProfile(patch: Partial<Account>) {
      if (!this.account) throw new Error('NOT_AUTHENTICATED')
      await databaseService.updateAccount(this.account.id, patch)
      this.refresh()
    },
    async saveProfile(input: ProfileUpdateInput) {
      const account = profileService.update(input, this.context)
      this.refresh()
      return account
    },
    async clearGeneratedCache() {
      if (!this.account || this.isGuest) throw new Error('AUTH_REQUIRED')
      this.db = await databaseService.clearGeneratedCache(this.account.id)
    },
    async addAttachment(name: string, kind: Attachment['kind'], entity: string, asset?: Partial<UploadAsset>) {
      if (!this.account || this.isGuest) throw new Error('AUTH_REQUIRED')
      const timestamp = new Date().toISOString()
      const attachment = databaseService.transact((db) => {
        const item: Attachment = { id: `attachment-${Date.now().toString(36)}`, createdAt: timestamp, updatedAt: timestamp, ownerId: this.account!.id, entity, name, kind, localPath: asset?.localPath || '', size: asset?.size || 0, mimeType: asset?.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), persisted: asset?.persisted ?? false }
        db.attachments.unshift(item)
        return item
      }, { action: 'attachment-add', entity: 'attachments', entityId: name, operator: this.account.id })
      this.refresh()
      return attachment
    },
    async pickAttachments(kind: 'image' | 'video', remaining: number, entity: string) {
      if (!this.account || this.isGuest) throw new Error('AUTH_REQUIRED')
      const assets = await uploadAdapter.pick(kind, remaining)
      const created: Attachment[] = []
      for (const asset of assets.slice(0, remaining)) {
        uploadAdapter.validate(asset, { maxBytes: kind === 'image' ? 5 * 1024 * 1024 : 50 * 1024 * 1024, mimeTypes: kind === 'image' ? ['image/jpeg', 'image/png'] : ['video/mp4'] })
        created.push(await this.addAttachment(asset.name, asset.kind, entity, asset))
      }
      return created
    },
    hasCapability(capability: string) {
      return authorizationService.can(this.context, capability)
    },
    requireCapability(capability: string) {
      if (!this.hasCapability(capability)) throw new Error('FORBIDDEN')
    },
    async list<T extends BaseEntity>(collection: EntityCollection, query: Query = {}) {
      return databaseService.repository<T>(collection, this.context).list(query)
    },
    async get<T extends BaseEntity>(collection: EntityCollection, id: string) {
      return databaseService.repository<T>(collection, this.context).get(id)
    },
    async create<T extends BaseEntity>(collection: EntityCollection, input: Omit<T, keyof BaseEntity> & Partial<BaseEntity>) {
      const entity = await databaseService.repository<T>(collection, this.context).create(input)
      this.refresh()
      return entity
    },
    async update<T extends BaseEntity>(collection: EntityCollection, id: string, patch: Partial<T>) {
      const entity = await databaseService.repository<T>(collection, this.context).update(id, patch)
      this.refresh()
      return entity
    },
    async remove(collection: EntityCollection, id: string) {
      await databaseService.repository(collection, this.context).remove(id)
      this.refresh()
    },
    async transition(entity: WorkflowEntity, id: string, action: WorkflowAction, note?: string) {
      const result = await workflowService.transition(entity, id, action, this.context, note)
      this.refresh()
      return result
    },
    async createServiceTransfer(ticketId: string, originRegion: string, targetRegion: string, reason: string) {
      const result = await workflowService.createServiceTransfer(ticketId, originRegion, targetRegion, reason, this.context)
      this.refresh()
      return result
    },
    async escalateMessage(ticketId: string, target: 'dealer' | 'headquarters', targetDealerId: string | undefined, reason: string) {
      const result = await workflowService.escalateMessage(ticketId, target, targetDealerId, reason, this.context)
      this.refresh()
      return result
    },
    async transitionMessageTransfer(id: string, action: 'accept' | 'reject' | 'complete', note?: string) {
      const result = await workflowService.transitionMessageTransfer(id, action, this.context, note)
      this.refresh()
      return result
    },
    async reviewByDemoPlatform(entity: 'serviceTransfer' | 'deviceTransfer' | 'installationTransfer' | 'headquartersMessage', id: string, decision: 'approved' | 'rejected', note?: string) {
      const result = await workflowService.reviewByDemoPlatform(entity, id, decision, note)
      this.refresh()
      return result
    },
  },
})
