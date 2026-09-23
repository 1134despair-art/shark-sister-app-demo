import { databaseService } from './database'

export const CURRENT_POLICY_VERSION = 'V3.2-2026-08-14'
export type PermissionCapability = 'bluetooth' | 'location' | 'camera' | 'notifications'
export type AgreementSource = 'login' | 'register' | 'guest' | 'social'

export const complianceService = {
  recordAgreements(accountId: string, source: AgreementSource) {
    const acceptedAt = new Date().toISOString()
    return databaseService.transact((db) => {
      for (const policy of ['user-agreement', 'privacy-policy'] as const) {
        db.settings.agreements.push({ policy, version: CURRENT_POLICY_VERSION, acceptedAt, accountId, source })
      }
      return db.settings.agreements.filter((item) => item.accountId === accountId)
    }, { action: 'agreement-accept', entity: 'compliance', entityId: accountId, operator: accountId, detail: `${CURRENT_POLICY_VERSION}:${source}` })
  },

  recordPermission(capability: PermissionCapability, state: 'granted' | 'denied', accountId = 'guest') {
    const decidedAt = new Date().toISOString()
    return databaseService.transact((db) => {
      db.settings.permissions[capability] = { state, decidedAt, accountId }
      return db.settings.permissions[capability]
    }, { action: 'permission-decision', entity: 'compliance', entityId: capability, operator: accountId, detail: state })
  },

  resetPermissionsForAccount(accountId: string) {
    return databaseService.transact((db) => {
      for (const capability of Object.keys(db.settings.permissions) as PermissionCapability[]) {
        if (db.settings.permissions[capability].accountId === accountId) db.settings.permissions[capability] = { state: 'unknown' }
      }
      return db.settings.permissions
    }, { action: 'permission-reset', entity: 'compliance', entityId: accountId, operator: accountId, detail: 'logout-or-account-switch' })
  },
}
