import { databaseService } from './database'
import type { AccessContext } from '@/types/models'

export interface ProfileUpdateInput {
  displayName: string
  avatar?: string
  avatarAttachmentId?: string
  phone?: string
  email?: string
  phoneVerificationId?: string
  emailVerificationId?: string
}

function verifiedSession(db: ReturnType<typeof databaseService.snapshot>, id: string | undefined, purpose: 'profile-phone' | 'profile-email', target: string) {
  const session = db.verificationSessions.find((item) => item.id === id && item.purpose === purpose && item.target === target.trim().toLocaleLowerCase())
  if (!session?.verified || session.consumedAt || new Date(session.expiresAt).getTime() < Date.now()) throw new Error('VERIFICATION_REQUIRED')
  return session
}

export const profileService = {
  update(input: ProfileUpdateInput, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const displayName = input.displayName.trim()
    if (displayName.length < 2 || displayName.length > 20) throw new Error('DISPLAY_NAME_INVALID')
    return databaseService.transact((db) => {
      const account = db.accounts.find((item) => item.id === context.accountId)
      if (!account) throw new Error('ACCOUNT_NOT_FOUND')
      const phone = input.phone?.trim() || undefined
      const email = input.email?.trim().toLocaleLowerCase() || undefined
      if (phone && !/^1\d{10}$/.test(phone)) throw new Error('PHONE_INVALID')
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('EMAIL_INVALID')
      if (phone !== account.phone) {
        if (phone && db.accounts.some((item) => item.id !== account.id && item.phone === phone)) throw new Error('CONTACT_EXISTS')
        const session = verifiedSession(db, input.phoneVerificationId, 'profile-phone', phone || '')
        session.consumedAt = new Date().toISOString()
        account.phone = phone
      }
      if (email !== account.email) {
        if (email && db.accounts.some((item) => item.id !== account.id && item.email?.toLocaleLowerCase() === email)) throw new Error('CONTACT_EXISTS')
        const session = verifiedSession(db, input.emailVerificationId, 'profile-email', email || '')
        session.consumedAt = new Date().toISOString()
        account.email = email
      }
      account.displayName = displayName
      account.displayNameEn = displayName
      if (input.avatar) account.avatar = input.avatar
      if (input.avatarAttachmentId) {
        const attachment = db.attachments.find((item) => item.id === input.avatarAttachmentId && item.ownerId === account.id)
        if (!attachment) throw new Error('ATTACHMENT_NOT_FOUND')
        attachment.entityId = account.id
        attachment.persisted = true
      }
      account.updatedAt = new Date().toISOString()
      return account
    }, { action: 'profile-update', entity: 'accounts', entityId: context.accountId, operator: context.accountId })
  },
}
