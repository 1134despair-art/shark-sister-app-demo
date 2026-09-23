import { authorizationService } from './authorization'
import { passwordValid } from './auth'
import { databaseService, makeId } from './database'
import type { AccessContext, Account, DealerOutlet, Employee } from '@/types/models'

type EmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> & { initialPassword?: string }
type DealerInput = Omit<DealerOutlet, 'id' | 'createdAt' | 'updatedAt'> & { initialPassword?: string }

function requireDealerActor(context: AccessContext, capability: string) {
  if (!context.accountId || !context.dealerId) throw new Error('AUTH_REQUIRED')
  if (!authorizationService.can(context, capability)) throw new Error('FORBIDDEN')
}

function validateLoginPhone(phone: string) {
  if (!/^1\d{10}$/.test(phone)) throw new Error('PHONE_INVALID')
}

function staffAccount(employee: Employee, password: string, timestamp: string): Account {
  return {
    id: makeId('acc-staff'), createdAt: timestamp, updatedAt: timestamp,
    identifier: employee.phone, password, displayName: employee.name, displayNameEn: employee.nameEn,
    role: 'dealerStaff', dealerId: employee.dealerId, firstLogin: true, phone: employee.phone,
    verified: true, active: employee.status === 'enabled', failedAttempts: 0, capabilities: [...employee.capabilities],
  }
}

function dealerAccount(dealer: DealerOutlet, password: string, timestamp: string): Account {
  return {
    id: makeId('acc-dealer'), createdAt: timestamp, updatedAt: timestamp,
    identifier: dealer.phone, password, displayName: dealer.name, displayNameEn: dealer.nameEn,
    role: 'dealerAdmin', dealerId: dealer.id, firstLogin: true, phone: dealer.phone, email: dealer.email,
    verified: true, active: dealer.status === 'enabled', failedAttempts: 0, capabilities: [...dealer.capabilities],
  }
}

export const dealerService = {
  saveEmployee(input: EmployeeInput, id: string | undefined, context: AccessContext) {
    requireDealerActor(context, 'staff.manage')
    validateLoginPhone(input.phone)
    if (!input.name.trim() || !input.roleName.trim()) throw new Error('EMPLOYEE_INVALID')
    if (!id && !passwordValid(input.initialPassword || '')) throw new Error('WEAK_PASSWORD')
    const timestamp = new Date().toISOString()
    const employeeId = id || makeId('employee')
    return databaseService.transact((db) => {
      const existing = id ? db.employees.find((item) => item.id === id) : undefined
      if (id && (!existing || existing.dealerId !== context.dealerId)) throw new Error('ENTITY_NOT_FOUND')
      if (db.employees.some((item) => item.id !== id && item.phone === input.phone)) throw new Error('ACCOUNT_EXISTS')
      if (db.accounts.some((item) => item.identifier.toLocaleLowerCase() === input.phone.toLocaleLowerCase() && item.id !== db.accounts.find((account) => account.role === 'dealerStaff' && account.dealerId === context.dealerId && account.phone === existing?.phone)?.id)) throw new Error('ACCOUNT_EXISTS')

      const employee: Employee = {
        id: employeeId, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp,
        name: input.name.trim(), nameEn: input.nameEn || input.name.trim(), phone: input.phone,
        roleName: input.roleName.trim(), dealerId: context.dealerId!, status: input.status, capabilities: [...new Set(input.capabilities)],
      }
      if (existing) Object.assign(existing, employee)
      else db.employees.unshift(employee)

      const account = db.accounts.find((item) => item.role === 'dealerStaff' && item.dealerId === context.dealerId && (item.phone === existing?.phone || item.phone === input.phone))
      if (account) {
        Object.assign(account, {
          identifier: employee.phone, phone: employee.phone, displayName: employee.name, displayNameEn: employee.nameEn,
          active: employee.status === 'enabled', capabilities: [...employee.capabilities], updatedAt: timestamp,
        })
      } else {
        db.accounts.unshift(staffAccount(employee, input.initialPassword!, timestamp))
      }
      return employee
    }, { action: id ? 'employee-update' : 'employee-create', entity: 'employees', entityId: employeeId, operator: context.accountId!, detail: `account:${input.phone}`, source: 'local' })
  },

  setEmployeeStatus(id: string, status: Employee['status'], context: AccessContext) {
    requireDealerActor(context, 'staff.manage')
    return databaseService.transact((db) => {
      const employee = db.employees.find((item) => item.id === id && item.dealerId === context.dealerId)
      if (!employee) throw new Error('ENTITY_NOT_FOUND')
      employee.status = status
      employee.updatedAt = new Date().toISOString()
      const account = db.accounts.find((item) => item.role === 'dealerStaff' && item.dealerId === employee.dealerId && item.phone === employee.phone)
      if (account) { account.active = status === 'enabled'; account.updatedAt = employee.updatedAt }
      return employee
    }, { action: status === 'enabled' ? 'employee-enable' : 'employee-disable', entity: 'employees', entityId: id, operator: context.accountId!, source: 'local' })
  },

  saveDealer(input: DealerInput, id: string | undefined, context: AccessContext) {
    requireDealerActor(context, 'dealer.manage')
    validateLoginPhone(input.phone)
    if (!input.name.trim() || !input.manager.trim() || !input.region.trim()) throw new Error('DEALER_INVALID')
    if (!id && !passwordValid(input.initialPassword || '')) throw new Error('WEAK_PASSWORD')
    const timestamp = new Date().toISOString()
    const dealerId = id || makeId('dealer')
    return databaseService.transact((db) => {
      const existing = id ? db.dealers.find((item) => item.id === id) : undefined
      if (id && (!existing || existing.parentId !== context.dealerId)) throw new Error('ENTITY_NOT_FOUND')
      if (db.dealers.some((item) => item.id !== id && item.phone === input.phone)) throw new Error('ACCOUNT_EXISTS')
      const existingAccount = db.accounts.find((item) => item.role === 'dealerAdmin' && item.dealerId === dealerId)
      if (db.accounts.some((item) => item.identifier.toLocaleLowerCase() === input.phone.toLocaleLowerCase() && item.id !== existingAccount?.id)) throw new Error('ACCOUNT_EXISTS')

      const dealer: DealerOutlet = {
        id: dealerId, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp,
        name: input.name.trim(), nameEn: input.nameEn || input.name.trim(), parentId: context.dealerId, level: 2,
        manager: input.manager.trim(), phone: input.phone, email: input.email, region: input.region.trim(),
        status: input.status === 'disabled' ? 'disabled' : 'enabled', defaultWarrantyYears: Number(input.defaultWarrantyYears || existing?.defaultWarrantyYears || 2), capabilities: [...new Set(input.capabilities)],
      }
      if (existing) Object.assign(existing, dealer)
      else db.dealers.unshift(dealer)

      if (existingAccount) {
        Object.assign(existingAccount, {
          identifier: dealer.phone, phone: dealer.phone, email: dealer.email, displayName: dealer.name, displayNameEn: dealer.nameEn,
          active: dealer.status === 'enabled', capabilities: [...dealer.capabilities], updatedAt: timestamp,
        })
      } else {
        db.accounts.unshift(dealerAccount(dealer, input.initialPassword!, timestamp))
      }
      return dealer
    }, { action: id ? 'dealer-update' : 'dealer-create', entity: 'dealers', entityId: dealerId, operator: context.accountId!, detail: `account:${input.phone}`, source: 'local' })
  },
}
