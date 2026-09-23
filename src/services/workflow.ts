import { authorizationService } from './authorization'
import { databaseService, makeId } from './database'
import { integrationAvailability, notificationAdapter } from './adapters'
import { demoPlatformApprovalService } from './demoPlatformApproval'
import { createDefaultDeviceControlState, createDefaultDeviceIdentity, createDefaultDeviceSettings, defaultFirmwareForModel } from '@/config/deviceDefaults'
import type { DemoPlatformEntity } from './demoPlatformApproval'
import type { AccessContext, ApprovalEvent, MaterialRequest, MessageTransfer, Payment, PlatformApproval, Purchase, PurchaseLine, ReplacementMaterialLine, ServiceTransfer, Shipment, Ticket, TicketChargeLine, Transfer, WorkflowHistoryItem } from '@/types/models'

export type WorkflowEntity = 'tickets' | 'materials' | 'purchases' | 'transfers' | 'payments' | 'shipments' | 'serviceTransfers'
export type WorkflowAction = 'accept' | 'parts' | 'complete' | 'approve' | 'reject' | 'ship' | 'receive' | 'pay' | 'refund' | 'confirmOrigin' | 'acceptTarget' | 'platformApprove' | 'confirmRd' | 'startProduction' | 'finishProduction'

const event = (status: string, label: string, operator: string, note?: string): WorkflowHistoryItem => ({ id: makeId('history'), status, label, at: new Date().toISOString(), operator, note })
const paymentNo = (orderNo: string, installmentNumber: number) => `${orderNo}-P${String(installmentNumber).padStart(2, '0')}`
const labelFor = (action: WorkflowAction) => ({ accept: '经销商已受理', parts: '等待物料', complete: '处理完成', approve: '审批通过', reject: '已驳回', ship: '已经发货', receive: '确认签收', pay: '支付完成', refund: '已退款', confirmOrigin: '原经销商已确认', acceptTarget: '目标经销商已接收', platformApprove: '平台复核通过', confirmRd: '研发确认完成', startProduction: '已导入生产', finishProduction: '生产完成' }[action])

function requireCapability(context: AccessContext, capability: string) {
  if (!authorizationService.can(context, capability)) throw new Error('FORBIDDEN')
}

type PurchaseInput = Pick<Purchase, 'orderNo' | 'title' | 'titleEn'> & Partial<Pick<Purchase, 'catalogId' | 'quantity' | 'address'>> & {
  items?: Array<{ catalogId: string; quantity: number }>
}

export const workflowService = {
  createMaterialRequest(input: Pick<MaterialRequest, 'projectId' | 'reason'> & Partial<Pick<MaterialRequest, 'catalogId' | 'quantity' | 'source'>> & { items?: Array<{ catalogId: string; quantity: number }> }, context: AccessContext) {
    requireCapability(context, 'material.apply')
    if (!context.accountId || !context.dealerId) throw new Error('AUTH_REQUIRED')
    const requestedLines = input.items?.length ? input.items : input.catalogId ? [{ catalogId: input.catalogId, quantity: Number(input.quantity || 0) }] : []
    if (!requestedLines.length || requestedLines.some((line) => !line.catalogId || !Number.isInteger(line.quantity) || line.quantity <= 0)) throw new Error('QUANTITY_INVALID')
    if (new Set(requestedLines.map((line) => line.catalogId)).size !== requestedLines.length) throw new Error('DUPLICATE_MATERIAL')
    const timestamp = new Date().toISOString()
    const requestId = makeId('material')
    return databaseService.transact((db) => {
      const project = db.projects.find((item) => item.id === input.projectId)
      if (!project || !context.dealerScopeIds.includes(project.dealerId)) throw new Error('PROJECT_NOT_FOUND')
      const lines = requestedLines.map((line) => {
        const catalog = db.materialCatalog.find((item) => item.id === line.catalogId)
        if (!catalog) throw new Error('CATALOG_NOT_FOUND')
        const typeMatches = !catalog.compatibleDeviceTypes?.length || catalog.compatibleDeviceTypes.includes(project.deviceType)
        const modelMatches = !catalog.compatibleDeviceModels?.length || catalog.compatibleDeviceModels.includes(project.deviceModel)
        if (!typeMatches || !modelMatches) throw new Error('MATERIAL_INCOMPATIBLE')
        const reserved = db.materials
          .filter((item) => ['pending', 'approved'].includes(item.status))
          .reduce((sum, item) => sum + (item.items?.length
            ? item.items.filter((entry) => entry.catalogId === catalog.id).reduce((lineSum, entry) => lineSum + Number(entry.quantity || 0), 0)
            : item.catalogId === catalog.id ? Number(item.quantity || 0) : 0), 0)
        if (line.quantity > Math.max(0, catalog.stock - reserved)) throw new Error('INSUFFICIENT_STOCK')
        return { id: makeId('material-line'), catalogId: catalog.id, name: catalog.name, nameEn: catalog.nameEn, sku: catalog.sku, quantity: line.quantity }
      })
      const operator = db.accounts.find((item) => item.id === context.accountId)?.displayName || '本地用户'
      const item: MaterialRequest = {
        id: requestId, createdAt: timestamp, updatedAt: timestamp,
        name: lines.length > 1 ? `${lines.length} 种物料` : lines[0].name, nameEn: lines.length > 1 ? `${lines.length} parts` : lines[0].nameEn,
        catalogId: lines.length === 1 ? lines[0].catalogId : undefined, items: lines, projectId: project.id,
        quantity: lines.reduce((sum, line) => sum + line.quantity, 0), reason: input.reason.trim(), dealerId: project.dealerId, requesterId: context.accountId!, source: input.source || 'standard', status: 'pending',
        history: [event('pending', input.source === 'serviceReplacement' ? '售后物料申请已提交' : '新物料申请已提交', operator, input.reason.trim())],
      }
      db.materials.unshift(item)
      db.approvals.unshift({ id: makeId('approval'), createdAt: timestamp, updatedAt: timestamp, entity: 'material', entityId: item.id, action: 'submit', operator, note: input.reason.trim() })
      db.messages.unshift({ id: makeId('message'), createdAt: timestamp, updatedAt: timestamp, title: '新的物料申请', titleEn: 'New parts request', body: lines.map((line) => `${line.name} × ${line.quantity}`).join('、'), type: 'approval', dealerId: project.dealerId, read: false })
      return item
    }, { action: 'material-request-create', entity: 'materials', entityId: requestId, operator: context.accountId, detail: `${input.projectId}:${requestedLines.map((line) => `${line.catalogId}x${line.quantity}`).join(',')}`, source: 'local' })
  },

  createTransfer(input: Pick<Transfer, 'deviceId' | 'kind' | 'targetEmployeeId' | 'targetDealerId'>, context: AccessContext) {
    requireCapability(context, 'device.assign')
    if (!context.accountId || !context.dealerId) throw new Error('AUTH_REQUIRED')
    const timestamp = new Date().toISOString()
    const transferId = makeId('transfer')
    return databaseService.transact((db) => {
      const device = db.devices.find((item) => item.id === input.deviceId)
      if (!device || device.dealerId !== context.dealerId) throw new Error('DEVICE_NOT_ASSIGNABLE')
      const operator = db.accounts.find((item) => item.id === context.accountId)?.displayName || '本地管理员'
      const source = db.dealers.find((item) => item.id === context.dealerId)?.name || context.dealerId!
      let destination = ''
      let status: Transfer['status'] = 'pending'
      if (input.kind === 'assignment') {
        if (input.targetDealerId) {
          const dealer = db.dealers.find((item) => item.id === input.targetDealerId && item.parentId === context.dealerId && item.level === 2 && item.status === 'enabled')
          if (!dealer) throw new Error('DEALER_NOT_ASSIGNABLE')
          destination = dealer.name
          device.dealerId = dealer.id
          delete device.assignedTo
        } else {
          const employee = db.employees.find((item) => item.id === input.targetEmployeeId && item.dealerId === context.dealerId && item.status === 'enabled')
          if (!employee) throw new Error('EMPLOYEE_NOT_ASSIGNABLE')
          destination = employee.name
          device.assignedTo = employee.id
        }
        device.updatedAt = timestamp
        status = 'completed'
      } else {
        const dealer = db.dealers.find((item) => item.id === input.targetDealerId && item.parentId === context.dealerId && item.status === 'enabled')
        if (!dealer) throw new Error('DEALER_NOT_ASSIGNABLE')
        destination = dealer.name
      }
      const item: Transfer = {
        id: transferId, createdAt: timestamp, updatedAt: timestamp, deviceId: device.id,
        from: source, to: destination, operator, dealerId: context.dealerId!, targetEmployeeId: input.targetEmployeeId,
        targetDealerId: input.targetDealerId, kind: input.kind, status,
        history: [event(status, input.kind === 'assignment' ? `设备已分配给${destination}` : '调货申请已提交，等待平台审批', operator)],
      }
      db.transfers.unshift(item)
      db.approvals.unshift({ id: makeId('approval'), createdAt: timestamp, updatedAt: timestamp, entity: 'transfer', entityId: item.id, action: 'submit', operator })
      return item
    }, { action: input.kind === 'assignment' ? 'device-assignment' : 'device-reallocation-request', entity: 'transfers', entityId: transferId, operator: context.accountId, detail: input.deviceId, source: 'local' })
  },

  completePayment(id: string, method: NonNullable<Payment['method']>, result: { transactionId: string; status: 'paid' | 'failed'; demo?: boolean }, context: AccessContext) {
    if (result.status !== 'paid' || !result.transactionId) throw new Error('PAYMENT_NOT_COMPLETED')
    return databaseService.transactOnce(`payment:${result.transactionId}`, (db) => {
      const item = db.payments.find((entry) => entry.id === id)
      if (!item || item.status !== 'pending') throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', item as unknown as Record<string, unknown>)
      item.method = method
      item.transactionId = result.transactionId
      item.status = 'paid'
      item.updatedAt = new Date().toISOString()
      const purchase = db.purchases.find((entry) => entry.orderNo === item.orderNo)
      if (purchase) { purchase.status = 'paid'; purchase.updatedAt = item.updatedAt }
      return item
    }, { action: 'payment-complete', entity: 'payments', entityId: id, operator: context.accountId || 'guest', detail: result.demo ? `${method}:local-demo-no-charge` : method, source: result.demo ? 'local' : 'integration' })
  },

  submitPaymentProof(id: string, proofAttachmentId: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const timestamp = new Date().toISOString()
    return databaseService.transactOnce(`payment-proof:${id}:${proofAttachmentId}`, (db) => {
      const item = db.payments.find((entry) => entry.id === id)
      if (!item || item.status !== 'pending') throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', item as unknown as Record<string, unknown>)
      const attachment = db.attachments.find((entry) => entry.id === proofAttachmentId && entry.ownerId === context.accountId)
      if (!attachment || attachment.kind !== 'image') throw new Error('ATTACHMENT_NOT_FOUND')
      attachment.entity = 'payments'
      attachment.entityId = item.id
      attachment.persisted = true
      attachment.updatedAt = timestamp
      item.method = 'scanQr'
      item.proofAttachmentId = proofAttachmentId
      item.submittedAt = timestamp
      item.status = 'verifying'
      item.updatedAt = timestamp
      return item
    }, { action: 'payment-proof-submit', entity: 'payments', entityId: id, operator: context.accountId, detail: 'scan-qr-proof-awaiting-finance', source: 'local' })
  },

  verifyPayment(id: string, context: AccessContext) {
    requireCapability(context, 'payment.manage')
    const timestamp = new Date().toISOString()
    return databaseService.transactOnce(`payment-verify:${id}`, (db) => {
      const item = db.payments.find((entry) => entry.id === id)
      if (!item || item.status !== 'verifying' || !item.proofAttachmentId) throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', item as unknown as Record<string, unknown>)
      item.status = 'verified'
      item.verifiedAt = timestamp
      item.updatedAt = timestamp
      return item
    }, { action: 'payment-finance-verify', entity: 'payments', entityId: id, operator: context.accountId || 'finance', detail: 'proof-verified', source: 'local' })
  },

  completePurchasePaymentReview(id: string, context: AccessContext) {
    const accountId = context.accountId
    if (!accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const timestamp = new Date().toISOString()
    return databaseService.transactOnce('purchase-payment-review:' + id, (db) => {
      const payment = db.payments.find((entry) => entry.id === id)
      if (!payment || payment.status !== 'verifying' || !payment.proofAttachmentId) throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', payment as unknown as Record<string, unknown>)
      const purchase = db.purchases.find((entry) => entry.orderNo === payment.orderNo)
      if (!purchase) throw new Error('ENTITY_NOT_FOUND')

      payment.status = 'verified'
      payment.verifiedAt = timestamp
      payment.updatedAt = timestamp
      const paidPayments = db.payments.filter((entry) => entry.orderNo === purchase.orderNo && ['verified', 'paid'].includes(entry.status))
      purchase.paidAmount = Math.min(purchase.amount, paidPayments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0))
      purchase.remainingAmount = Math.max(0, Math.round((purchase.amount - purchase.paidAmount) * 100) / 100)
      purchase.paymentCount = paidPayments.length
      purchase.updatedAt = timestamp
      if (purchase.remainingAmount > 0) {
        purchase.status = 'partiallyPaid'
        purchase.paymentStatus = 'partial'
        purchase.history.push(event('partiallyPaid', `财务已核实第 ${purchase.paymentCount} 笔回款，剩余 ¥${purchase.remainingAmount.toFixed(2)}`, '财务'))
        let nextPayment = db.payments.find((entry) => entry.orderNo === purchase.orderNo && entry.status === 'pending')
        if (!nextPayment) {
          nextPayment = {
            id: makeId('payment'), createdAt: timestamp, updatedAt: timestamp,
            orderNo: purchase.orderNo, paymentNo: paymentNo(purchase.orderNo, purchase.paymentCount + 1), purchaseId: purchase.id, installmentNumber: purchase.paymentCount + 1,
            title: purchase.title, titleEn: purchase.titleEn, amount: purchase.remainingAmount,
            currency: purchase.items[0]?.currency || 'CNY', accountId: payment.accountId,
            dealerId: purchase.dealerId, status: 'pending',
          }
          db.payments.unshift(nextPayment)
        }
        return { payment, purchase, shipment: undefined, nextPayment }
      }

      purchase.status = 'paid'
      purchase.paymentStatus = 'paid'
      purchase.history.push(event('paid', '财务确认全部回款，仓库发货任务已生成', '财务'))

      let shipment = db.shipments.find((entry) => entry.orderNo === purchase.orderNo)
      if (!shipment) {
        for (const line of purchase.items) {
          if (line.itemType === 'device') {
            const model = db.deviceModels.find((entry) => entry.id === line.catalogId)
            if (model) { model.stock = Math.max(0, model.stock - line.quantity); model.updatedAt = timestamp }
          } else {
            const catalog = db.materialCatalog.find((entry) => entry.id === line.catalogId)
            if (catalog) { catalog.stock = Math.max(0, catalog.stock - line.quantity); catalog.updatedAt = timestamp }
          }
        }
        const dispatchAttachmentId = makeId('attachment')
        db.attachments.unshift({
          id: dispatchAttachmentId, createdAt: timestamp, updatedAt: timestamp,
          ownerId: accountId, entity: 'shipments', entityId: purchase.id,
          name: '发货现场-' + purchase.orderNo + '.jpg', kind: 'image',
          localPath: '/static/assest/images/shipment-proof.jpg', size: 286420,
          mimeType: 'image/jpeg', persisted: true,
        })
        shipment = {
          id: makeId('ship'), createdAt: timestamp, updatedAt: timestamp,
          orderNo: purchase.orderNo, dealerId: purchase.dealerId,
          carrier: '顺丰速运', trackingNumber: 'SF' + Date.now().toString().slice(-10),
          items: purchase.items.map((line) => ({
            id: makeId('ship-line'), catalogId: line.catalogId, name: line.name,
            sku: line.sku, quantity: line.quantity, itemType: line.itemType,
            deviceModel: line.deviceModel, specification: line.specification,
          })),
          dispatchAttachmentIds: [dispatchAttachmentId], dispatchedBy: '仓库',
          dispatchedAt: timestamp,
          estimatedAt: new Date(Date.parse(timestamp) + 2 * 86400000).toISOString(),
          status: 'shipping',
          events: [{
            id: makeId('event'), status: '已出库',
            description: '全部付款确认完成，商品清单、现场照片和物流信息已生成',
            at: timestamp,
          }],
        }
        db.shipments.unshift(shipment)
      }
      return { payment, purchase, shipment, nextPayment: undefined }
    }, {
      action: 'purchase-payment-review-complete', entity: 'payments', entityId: id,
      operator: accountId, detail: 'payment-confirmed-and-shipment-created', source: 'local',
    })
  },

  refundPayment(id: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    return databaseService.transactOnce(`payment-refund:${id}`, (db) => {
      const item = db.payments.find((entry) => entry.id === id)
      if (!item || item.status !== 'paid') throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', item as unknown as Record<string, unknown>)
      const timestamp = new Date().toISOString()
      item.status = 'refunded'
      item.updatedAt = timestamp
      const purchase = db.purchases.find((entry) => entry.orderNo === item.orderNo)
      if (purchase) { purchase.status = 'refunded'; purchase.updatedAt = timestamp }
      return item
    }, { action: 'payment-refund', entity: 'payments', entityId: id, operator: context.accountId, detail: 'local-demo-no-funds-moved', source: 'local' })
  },

  async createTicket(input: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    if (!authorizationService.can(context, context.role === 'user' ? 'support.create' : 'support.manage')) throw new Error('FORBIDDEN')
    const accountId = context.accountId
    const now = new Date().toISOString()
    return databaseService.transact((db) => {
      let linkedDevice
      if (input.deviceId) {
        const device = db.devices.find((item) => item.id === input.deviceId)
        if (!device) throw new Error('DEVICE_NOT_FOUND')
        authorizationService.assertItem(context, 'devices', device as unknown as Record<string, unknown>)
        linkedDevice = device
      }
      if (input.orderId) {
        const order = db.orders.find((item) => item.id === input.orderId)
        if (!order) throw new Error('ORDER_NOT_FOUND')
        if (input.deviceId && order.deviceId !== input.deviceId) throw new Error('ORDER_DEVICE_MISMATCH')
      }
      const replacementLines: ReplacementMaterialLine[] = input.replacementRequired
        ? Array.isArray(input.replacementLines) && input.replacementLines.length
          ? input.replacementLines.map((line) => ({ ...line, id: line.id || makeId('replacement-line'), quantity: Number(line.quantity) }))
          : input.originalMaterialId && input.replacementMaterialId
            ? [{ id: makeId('replacement-line'), originalCatalogId: input.originalMaterialId, replacementCatalogId: input.replacementMaterialId, quantity: Number(input.replacementQuantity || 1) }]
            : []
        : []
      const replacementCatalogs = new Map<string, (typeof db.materialCatalog)[number]>()
      const originalCatalogs = new Map<string, (typeof db.materialCatalog)[number]>()
      if (input.replacementRequired) {
        if (!['dealerAdmin', 'dealerStaff'].includes(context.role)) throw new Error('REPLACEMENT_DEALER_ONLY')
        if (!input.projectId) throw new Error('PROJECT_NOT_FOUND')
        const project = db.projects.find((item) => item.id === input.projectId && context.dealerScopeIds.includes(item.dealerId))
        if (!project) throw new Error('PROJECT_NOT_FOUND')
        if (!replacementLines.length) throw new Error('CATALOG_NOT_FOUND')
        if (new Set(replacementLines.map((line) => line.replacementCatalogId)).size !== replacementLines.length) throw new Error('DUPLICATE_MATERIAL')
        for (const line of replacementLines) {
          const originalCatalog = db.materialCatalog.find((item) => item.id === line.originalCatalogId)
          const replacementCatalog = db.materialCatalog.find((item) => item.id === line.replacementCatalogId)
          if (!originalCatalog || !replacementCatalog) throw new Error('CATALOG_NOT_FOUND')
          if (originalCatalog.id === replacementCatalog.id) throw new Error('REPLACEMENT_MUST_DIFFER')
          if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error('QUANTITY_INVALID')
          originalCatalogs.set(line.id, originalCatalog)
          replacementCatalogs.set(line.id, replacementCatalog)
        }
      }
      const chargeLines: TicketChargeLine[] = Array.isArray(input.chargeLines)
        ? input.chargeLines.map((line) => ({ ...line, id: line.id || makeId('charge'), amount: Number(line.amount || 0) }))
        : []
      if (!chargeLines.some((line) => line.type === 'labor') && Number(input.serviceCharge || 0) > 0) {
        chargeLines.push({ id: makeId('charge'), type: 'labor', label: '人工服务费', amount: Number(input.serviceCharge || 0) })
      }
      if (replacementLines.length && !chargeLines.some((line) => line.type === 'material')) {
        for (const line of replacementLines) {
          const replacementCatalog = replacementCatalogs.get(line.id)!
          chargeLines.push({ id: makeId('charge'), type: 'material', label: replacementCatalog.name, catalogId: replacementCatalog.id, quantity: line.quantity, unitPrice: replacementCatalog.dealerPrice, amount: replacementCatalog.dealerPrice * line.quantity })
        }
      }
      const firstReplacement = replacementLines[0]
      const ticket: Ticket = {
        ...input,
        ownerId: input.ownerId || accountId,
        deviceBindingId: linkedDevice?.bindingId,
        customerVisible: true,
        replacementLines,
        originalMaterialId: firstReplacement?.originalCatalogId,
        replacementMaterialId: firstReplacement?.replacementCatalogId,
        replacementQuantity: firstReplacement?.quantity,
        chargeLines,
        serviceCharge: chargeLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
        id: makeId('ticket'), createdAt: now, updatedAt: now,
      }
      let materialRequest: MaterialRequest | undefined
      if (replacementLines.length && ticket.projectId) {
        const operator = db.accounts.find((item) => item.id === context.accountId)?.displayName || '经销商售后'
        const materialRequestId = makeId('material')
        const requestLines = replacementLines.map((line) => {
          const replacementCatalog = replacementCatalogs.get(line.id)!
          return { id: makeId('material-line'), originalCatalogId: line.originalCatalogId, catalogId: replacementCatalog.id, name: replacementCatalog.name, nameEn: replacementCatalog.nameEn, sku: replacementCatalog.sku, quantity: line.quantity }
        })
        const firstOriginal = originalCatalogs.get(replacementLines[0].id)!
        materialRequest = {
          id: materialRequestId, createdAt: now, updatedAt: now,
          name: requestLines.length > 1 ? `${requestLines.length} 种更换物料` : requestLines[0].name,
          nameEn: requestLines.length > 1 ? `${requestLines.length} replacement parts` : requestLines[0].nameEn,
          catalogId: requestLines.length === 1 ? requestLines[0].catalogId : undefined, items: requestLines,
          originalCatalogId: requestLines.length === 1 ? firstOriginal.id : undefined, projectId: ticket.projectId, ticketId: ticket.id,
          quantity: requestLines.reduce((sum, line) => sum + line.quantity, 0), reason: `售后换料：${ticket.description.trim()}`,
          dealerId: ticket.dealerId || context.dealerId!, requesterId: accountId, source: 'serviceReplacement', status: 'pending',
          history: [event('pending', `售后换料申请已提交（${requestLines.length} 组物料）`, operator)],
        }
        db.materials.unshift(materialRequest)
        db.approvals.unshift({ id: makeId('approval'), createdAt: now, updatedAt: now, entity: 'material', entityId: materialRequest.id, action: 'submit', operator, note: ticket.description.trim() })
        ticket.replacementMaterialRequestId = materialRequest.id
        ticket.replacementMaterialRequestIds = [materialRequest.id]
        ticket.status = 'parts'
        ticket.history.push(event('parts', `等待 ${requestLines.length} 组更换物料，共 ${materialRequest.quantity} 件`, operator))
        const project = db.projects.find((item) => item.id === ticket.projectId)
        if (project) { project.status = 'aftersales'; project.updatedAt = now }
      }
      db.tickets.unshift(ticket)
      db.messages.unshift({ id: makeId('message'), createdAt: now, updatedAt: now, title: '服务申请已提交', titleEn: 'Service request submitted', body: `工单 ${ticket.id} 已写入本机并进入待受理状态`, type: 'service', accountId: ticket.ownerId, dealerId: ticket.dealerId, ticketId: ticket.id, read: false })
      for (const attachmentId of ticket.attachmentIds) {
        const attachment = db.attachments.find((item) => item.id === attachmentId && item.ownerId === accountId)
        if (!attachment) throw new Error('ATTACHMENT_NOT_FOUND')
        attachment.entityId = ticket.id
        attachment.persisted = true
        attachment.updatedAt = now
      }
      let serviceTransfer: ServiceTransfer | undefined
      if (ticket.category === 'transfer') {
        const origin = db.dealers.find((item) => item.id === ticket.dealerId)
        const targetRegion = ticket.targetRegion || ''
        const target = db.dealers.find((item) => item.id !== origin?.id && (item.region.includes(targetRegion) || targetRegion.includes(item.region)))
        if (!origin || !target) throw new Error('TARGET_DEALER_NOT_FOUND')
        const transfer: ServiceTransfer = {
          id: makeId('service-transfer'), createdAt: now, updatedAt: now, ticketId: ticket.id, requesterId: accountId,
          originDealerId: origin.id, targetDealerId: target.id, reason: `${ticket.description}（${ticket.originRegion || origin.region} → ${targetRegion}）`, status: 'pendingOrigin',
          history: [event('pendingOrigin', '跨区服务申请已提交，等待原经销商确认', db.accounts.find((item) => item.id === context.accountId)?.displayName || '用户')],
        }
        db.serviceTransfers.unshift(transfer)
        serviceTransfer = transfer
      }
      return { ticket, serviceTransfer, materialRequest }
    }, { action: 'ticket-create', entity: 'tickets', entityId: input.deviceId || input.orderId || accountId, operator: accountId, detail: input.category, source: 'local' })
  },

  async createPurchaseWithPayment(input: PurchaseInput, context: AccessContext, currency: Payment['currency']) {
    requireCapability(context, 'purchase.create')
    if (!context.accountId || !context.dealerId) throw new Error('AUTH_REQUIRED')
    const now = new Date().toISOString()
    return databaseService.transact((db) => {
      if (db.purchases.some((item) => item.orderNo === input.orderNo)) throw new Error('DUPLICATE_ORDER')
      const requestedItems = input.items?.length ? input.items : input.catalogId ? [{ catalogId: input.catalogId, quantity: Number(input.quantity || 0) }] : []
      if (!requestedItems.length) throw new Error('PURCHASE_INVALID')
      const items: PurchaseLine[] = requestedItems.map((requested) => {
        const catalog = db.materialCatalog.find((item) => item.id === requested.catalogId)
        const deviceModel = db.deviceModels.find((item) => item.id === requested.catalogId)
        const product = catalog || deviceModel
        if (!product || !Number.isInteger(requested.quantity) || requested.quantity <= 0 || requested.quantity > Number(product.stock || 0)) throw new Error('PURCHASE_INVALID')
        if (catalog) return {
          id: makeId('purchase-line'), catalogId: catalog.id, name: catalog.name, nameEn: catalog.nameEn, sku: catalog.sku,
          quantity: requested.quantity, unitPrice: catalog.dealerPrice, amount: catalog.dealerPrice * requested.quantity, currency: catalog.currency,
          itemType: 'material',
        }
        return {
          id: makeId('purchase-line'), catalogId: deviceModel!.id, name: `${deviceModel!.name} ${deviceModel!.model}`, nameEn: `${deviceModel!.nameEn} ${deviceModel!.model}`, sku: deviceModel!.model,
          quantity: requested.quantity, unitPrice: deviceModel!.dealerPrice, amount: deviceModel!.dealerPrice * requested.quantity, currency: deviceModel!.currency,
          itemType: 'device', deviceModel: deviceModel!.model, specification: deviceModel!.specifications[0] || '标准型',
        }
      })
      const quantity = items.reduce((sum, item) => sum + item.quantity, 0)
      const amount = items.reduce((sum, item) => sum + item.amount, 0)
      const itemTypes = new Set(items.map((item) => item.itemType))
      const purchase: Purchase = {
        ...input,
        catalogId: items.length === 1 ? items[0].catalogId : undefined,
        quantity,
        amount,
        items,
        purchaseType: itemTypes.size > 1 ? 'mixed' : itemTypes.has('device') ? 'devices' : 'materials',
        paidAmount: 0, remainingAmount: amount, paymentCount: 0,
        dealerId: context.dealerId!, status: 'pendingApproval', paymentStatus: 'notCreated', settlementMode: currency === 'USD' ? 'offlineFx' : 'onlinePending',
        history: [event('pendingApproval', '采购单已提交，等待审批', db.accounts.find((item) => item.id === context.accountId)?.displayName || '经销商')],
        id: makeId('purchase'), createdAt: now, updatedAt: now,
      }
      db.purchases.unshift(purchase)
      db.approvals.unshift({ id: makeId('approval'), createdAt: now, updatedAt: now, entity: 'purchase', entityId: purchase.id, action: 'submit', operator: context.accountId! })
      return { purchase, payment: undefined }
    }, { action: 'purchase-create', entity: 'purchases', entityId: input.orderNo, operator: context.accountId, detail: (input.items || []).map((item) => `${item.catalogId}x${item.quantity}`).join(',') || String(input.catalogId || ''), source: 'local' })
  },

  setPurchasePaymentAmount(id: string, amount: number, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    return databaseService.transact((db) => {
      const payment = db.payments.find((entry) => entry.id === id)
      if (!payment || payment.status !== 'pending') throw new Error('INVALID_TRANSITION')
      authorizationService.assertItem(context, 'payments', payment as unknown as Record<string, unknown>)
      const purchase = db.purchases.find((entry) => entry.orderNo === payment.orderNo)
      if (!purchase) throw new Error('ENTITY_NOT_FOUND')
      const normalizedAmount = Number(amount)
      if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || normalizedAmount > purchase.remainingAmount) throw new Error('PAYMENT_AMOUNT_INVALID')
      payment.amount = Math.round(normalizedAmount * 100) / 100
      payment.updatedAt = new Date().toISOString()
      return payment
    }, { action: 'purchase-installment-amount', entity: 'payments', entityId: id, operator: context.accountId, detail: String(amount), source: 'local' })
  },

  async createServiceTransfer(ticketId: string, originRegion: string, targetRegion: string, reason: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const timestamp = new Date().toISOString()
    return databaseService.transact((db) => {
      const ticket = db.tickets.find((item) => item.id === ticketId)
      if (!ticket) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'tickets', ticket as unknown as Record<string, unknown>)
      const origin = db.dealers.find((item) => item.id === ticket.dealerId) ?? db.dealers[0]
      const target = db.dealers.find((item) => item.region.includes(targetRegion) || targetRegion.includes(item.region)) ?? db.dealers.find((item) => item.id !== origin?.id) ?? origin
      if (!origin || !target) throw new Error('DEALER_NOT_FOUND')
      const item: ServiceTransfer = {
        id: makeId('service-transfer'), createdAt: timestamp, updatedAt: timestamp, ticketId, requesterId: context.accountId!,
        originDealerId: origin.id, targetDealerId: target.id, reason: `${reason}（${originRegion} → ${targetRegion}）`, status: 'pendingOrigin',
        history: [event('pendingOrigin', '跨区服务申请已提交，等待原经销商确认', db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '用户')],
      }
      db.serviceTransfers.unshift(item)
      return item
    }, { action: 'service-transfer-create', entity: 'serviceTransfers', entityId: ticketId, operator: context.accountId })
  },

  async escalateMessage(ticketId: string, target: 'dealer' | 'headquarters', targetDealerId: string | undefined, reason: string, context: AccessContext) {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    const timestamp = new Date().toISOString()
    const transfer = databaseService.transact((db) => {
      const ticket = db.tickets.find((item) => item.id === ticketId && item.category === 'message')
      if (!ticket) throw new Error('ENTITY_NOT_FOUND')
      authorizationService.assertItem(context, 'tickets', ticket as unknown as Record<string, unknown>)
      const dealer = target === 'dealer' ? db.dealers.find((item) => item.id === targetDealerId) : undefined
      if (target === 'dealer' && !dealer) throw new Error('DEALER_NOT_FOUND')
      const targetLabel = dealer?.name || '平台总部客服'
      const item: MessageTransfer = {
        id: makeId('message-transfer'), createdAt: timestamp, updatedAt: timestamp, ticketId, requesterId: context.accountId!,
        fromDealerId: ticket.dealerId, target, targetDealerId: dealer?.id, targetLabel, reason, status: 'pending',
        history: [event('pending', `留言转单申请已提交，等待${targetLabel}接收`, db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '用户', reason)],
      }
      db.messageTransfers.unshift(item)
      ticket.assignmentTarget = target
      ticket.assignedDealerId = dealer?.id
      ticket.assignedLabel = targetLabel
      ticket.escalationStatus = 'pending'
      ticket.history.push(event(ticket.status, `留言转单申请已提交，等待${targetLabel}接收`, db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '用户', reason))
      ticket.updatedAt = timestamp
      db.messages.unshift({ id: makeId('message'), createdAt: timestamp, updatedAt: timestamp, title: '客服留言待接收', titleEn: 'Support transfer awaiting acceptance', body: `工单 ${ticket.id} 等待${targetLabel}接收`, type: 'service', accountId: ticket.ownerId, dealerId: dealer?.id, ticketId: ticket.id, transferId: item.id, assignmentTarget: target, read: false })
      return item
    }, { action: 'message-transfer', entity: 'tickets', entityId: ticketId, operator: context.accountId, detail: `${target}:${targetDealerId || 'headquarters'}` })
    if (integrationAvailability.push.ready) await notificationAdapter.notify('客服留言待接收', transfer.targetLabel)
    return transfer
  },

  async transitionMessageTransfer(id: string, action: 'accept' | 'reject' | 'complete', context: AccessContext, note = '') {
    if (!context.accountId || context.role === 'guest') throw new Error('AUTH_REQUIRED')
    return databaseService.transact((db) => {
      const item = db.messageTransfers.find((entry) => entry.id === id)
      if (!item) throw new Error('ENTITY_NOT_FOUND')
      if (item.target === 'headquarters') throw new Error('PLATFORM_ACTION_REQUIRED')
      if (!context.dealerId || context.dealerId !== item.targetDealerId || !authorizationService.can(context, 'support.manage')) throw new Error('WRONG_WORKFLOW_ACTOR')
      const next = item.status === 'pending' && action === 'accept' ? 'accepted'
        : item.status === 'pending' && action === 'reject' ? 'rejected'
          : item.status === 'accepted' && action === 'complete' ? 'completed' : undefined
      if (!next) throw new Error('INVALID_TRANSITION')
      const timestamp = new Date().toISOString()
      const operator = db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '接收经销商'
      item.status = next
      item.updatedAt = timestamp
      item.history.push(event(next, next === 'accepted' ? `${item.targetLabel}已接收留言` : next === 'rejected' ? `${item.targetLabel}拒绝接收留言` : '留言转单处理完成', operator, note))
      const ticket = db.tickets.find((entry) => entry.id === item.ticketId)
      if (!ticket) throw new Error('ENTITY_NOT_FOUND')
      if (next === 'accepted') {
        ticket.dealerId = item.targetDealerId
        ticket.assignedDealerId = item.targetDealerId
        ticket.escalationStatus = 'transferred'
      } else if (next === 'rejected') {
        ticket.assignedDealerId = item.fromDealerId
        ticket.assignedLabel = db.dealers.find((entry) => entry.id === item.fromDealerId)?.name
        ticket.assignmentTarget = 'dealer'
        ticket.escalationStatus = 'none'
      }
      ticket.history.push(event(ticket.status, item.history[item.history.length - 1].label, operator, note))
      ticket.updatedAt = timestamp
      db.messages.unshift({ id: makeId('message'), createdAt: timestamp, updatedAt: timestamp, title: next === 'accepted' ? '留言转单已接收' : next === 'rejected' ? '留言转单被拒绝' : '留言转单已完成', titleEn: next === 'accepted' ? 'Message transfer accepted' : next === 'rejected' ? 'Message transfer rejected' : 'Message transfer completed', body: `${item.targetLabel} · ${ticket.id}`, type: 'service', accountId: ticket.ownerId, dealerId: item.targetDealerId, ticketId: ticket.id, transferId: item.id, read: false })
      return item
    }, { action: `message-transfer-${action}`, entity: 'messageTransfers', entityId: id, operator: context.accountId, detail: note })
  },

  async reviewByDemoPlatform(entity: DemoPlatformEntity, id: string, decision: 'approved' | 'rejected', note = '') {
    const reviewed = demoPlatformApprovalService.confirm(entity, id, decision)
    return databaseService.transact((db) => {
      const timestamp = reviewed.decidedAt
      let approval = db.platformApprovals.find((item) => item.entity === entity && item.entityId === id)
      if (!approval) {
        approval = { id: makeId('platform-approval'), createdAt: timestamp, updatedAt: timestamp, entity, entityId: id, requestedBy: 'local-workflow', status: 'pending', source: 'demo-exception' }
        db.platformApprovals.unshift(approval)
      }
      approval.status = decision
      approval.decisionAt = timestamp
      approval.decisionNote = note
      approval.updatedAt = timestamp
      approval.source = 'demo-exception'
      if (entity === 'deviceActivation') {
        const registration = db.deviceRegistrations.find((entry) => entry.serialNumber === id)
        if (!registration || approval.serialNumber !== id || !approval.targetRegion) throw new Error('INVALID_TRANSITION')
        db.messages.unshift({
          id: makeId('message'), createdAt: timestamp, updatedAt: timestamp,
          title: decision === 'approved' ? '异地激活审核通过' : '异地激活审核未通过',
          titleEn: decision === 'approved' ? 'Activation region approved' : 'Activation region rejected',
          body: `${id} · ${approval.originRegion} → ${approval.targetRegion}`,
          type: 'approval', accountId: approval.requestedBy, dealerId: approval.dealerId, read: false,
        })
        return approval
      }
      if (entity === 'serviceTransfer') {
        const item = db.serviceTransfers.find((entry) => entry.id === id)
        if (!item || item.status !== 'platformReview') throw new Error('INVALID_TRANSITION')
        item.status = decision === 'approved' ? 'completed' : 'rejected'
        item.platformApprovalId = approval.id
        item.updatedAt = timestamp
        item.history.push(event(item.status, decision === 'approved' ? '平台复核通过' : '平台复核驳回', reviewed.reviewer, note))
        const ticket = db.tickets.find((entry) => entry.id === item.ticketId)
        if (!ticket) throw new Error('ENTITY_NOT_FOUND')
        if (decision === 'approved') {
          if (!ticket.deviceId || !ticket.projectId) throw new Error('TRANSFER_SCOPE_INCOMPLETE')
          const device = db.devices.find((entry) => entry.id === ticket.deviceId)
          const project = db.projects.find((entry) => entry.id === ticket.projectId)
          if (!device) throw new Error('DEVICE_NOT_FOUND')
          if (!project) throw new Error('PROJECT_NOT_FOUND')
          const registration = db.deviceRegistrations.find((entry) => entry.serialNumber === device.serialNumber)
          ticket.dealerId = item.targetDealerId
          ticket.targetDealerId = item.targetDealerId
          ticket.history.push(event(ticket.status, '跨区售后转移完成，服务归属已更新', reviewed.reviewer, note))
          ticket.updatedAt = timestamp
          device.dealerId = item.targetDealerId
          device.salesRegion = ticket.targetRegion || device.salesRegion
          delete device.assignedTo
          device.updatedAt = timestamp
          project.dealerId = item.targetDealerId
          project.region = ticket.targetRegion || project.region
          project.crossRegionRequired = false
          project.crossRegionStatus = 'approved'
          project.updatedAt = timestamp
          if (registration) {
            registration.dealerId = item.targetDealerId
            registration.lastKnownRegion = ticket.targetRegion || registration.lastKnownRegion
            registration.updatedAt = timestamp
          }
          for (const related of db.tickets.filter((entry) => entry.id !== ticket.id && (entry.deviceId === device.id || entry.projectId === project.id) && !['completed', 'rejected'].includes(entry.status))) {
            related.dealerId = item.targetDealerId
            related.history.push(event(related.status, '设备跨区后同步更新服务归属', reviewed.reviewer, note))
            related.updatedAt = timestamp
          }
          db.messages.unshift({
            id: makeId('message'), createdAt: timestamp, updatedAt: timestamp,
            title: '跨区售后转移完成', titleEn: 'Cross-region service transfer completed',
            body: `${device.name} · ${db.dealers.find((entry) => entry.id === item.targetDealerId)?.name || item.targetDealerId}`,
            type: 'service', accountId: ticket.ownerId, dealerId: item.targetDealerId, ticketId: ticket.id, transferId: item.id, read: false,
          })
        } else {
          ticket.history.push(event(ticket.status, '跨区售后平台复核未通过', reviewed.reviewer, note))
          ticket.updatedAt = timestamp
        }
        return item
      }
      if (entity === 'installationTransfer') {
        const project = db.projects.find((entry) => entry.id === id)
        if (!project || project.status !== 'pendingApproval' || project.crossRegionStatus !== 'pending') throw new Error('INVALID_TRANSITION')
        project.crossRegionStatus = decision
        project.status = decision === 'approved' ? 'installing' : 'rejected'
        project.updatedAt = timestamp
        if (decision === 'approved') {
          const registration = db.deviceRegistrations.find((entry) => entry.serialNumber === project.serialNumber)
          const device = db.devices.find((entry) => entry.serialNumber === project.serialNumber)
          if (!registration && !device) throw new Error('DEVICE_NOT_FOUND')
          if (registration) { registration.projectId = project.id; registration.updatedAt = timestamp }
          if (device) { device.projectId = project.id; device.updatedAt = timestamp }
        }
        db.messages.unshift({
          id: makeId('message'), createdAt: timestamp, updatedAt: timestamp,
          title: decision === 'approved' ? '跨区安装审核通过' : '跨区安装审核未通过',
          titleEn: decision === 'approved' ? 'Cross-region installation approved' : 'Cross-region installation rejected',
          body: `${project.vessel} · ${project.factoryRegion} → ${project.region}`,
          type: 'approval', dealerId: project.dealerId, read: false,
        })
        return project
      }
      if (entity === 'headquartersMessage') {
        const item = db.messageTransfers.find((entry) => entry.id === id)
        if (!item || item.target !== 'headquarters' || !['pending', 'accepted'].includes(item.status)) throw new Error('INVALID_TRANSITION')
        const next = decision === 'rejected' ? 'rejected' : 'accepted'
        item.status = next
        item.updatedAt = timestamp
        const alreadyAccepted = item.history.some((entry) => entry.status === 'accepted')
        item.history.push(event(next, next === 'accepted' ? alreadyAccepted ? '总部客服回复用户' : '总部客服已查看并接收' : '总部客服已退回留言', reviewed.reviewer, note))
        const ticket = db.tickets.find((entry) => entry.id === item.ticketId)
        if (!ticket) throw new Error('ENTITY_NOT_FOUND')
        if (next === 'accepted') {
          ticket.assignmentTarget = 'headquarters'
          ticket.assignedDealerId = undefined
          ticket.assignedLabel = item.targetLabel
          ticket.escalationStatus = 'transferred'
        } else {
          ticket.assignmentTarget = 'dealer'
          ticket.assignedDealerId = item.fromDealerId
          ticket.assignedLabel = db.dealers.find((entry) => entry.id === item.fromDealerId)?.name
          ticket.escalationStatus = 'none'
        }
        ticket.updatedAt = timestamp
        ticket.history.push(event(ticket.status, item.history[item.history.length - 1].label, reviewed.reviewer, note))
        db.messages.unshift({
          id: makeId('message'), createdAt: timestamp, updatedAt: timestamp,
          title: next === 'accepted' ? alreadyAccepted ? '总部客服已回复' : '总部客服已查看留言' : '总部客服已退回留言',
          titleEn: next === 'accepted' ? alreadyAccepted ? 'Headquarters replied' : 'Headquarters viewed the message' : 'Headquarters returned the message',
          body: alreadyAccepted && note.trim() ? note.trim() : `${item.targetLabel} · ${ticket.id}`, type: 'service', accountId: ticket.ownerId,
          ticketId: ticket.id, transferId: item.id, assignmentTarget: 'headquarters', read: false,
        })
        return item
      }
      const item = db.transfers.find((entry) => entry.id === id)
      if (!item || item.kind !== 'reallocation' || item.status !== 'pending') throw new Error('INVALID_TRANSITION')
      item.status = decision === 'approved' ? 'completed' : 'rejected'
      item.updatedAt = timestamp
      item.history.push(event(item.status, decision === 'approved' ? '平台调货审批通过，设备归属已更新' : '平台调货审批驳回', reviewed.reviewer, note))
      if (decision === 'approved') {
        const device = db.devices.find((entry) => entry.id === item.deviceId)
        if (!device || !item.targetDealerId) throw new Error('DEVICE_NOT_FOUND')
        device.dealerId = item.targetDealerId
        delete device.assignedTo
        device.updatedAt = timestamp
      }
      return item
    }, { action: `platform-${decision}`, entity, entityId: id, operator: reviewed.reviewer, detail: note, source: 'demo-exception' })
  },

  async transition(entity: WorkflowEntity, id: string, action: WorkflowAction, context: AccessContext, note?: string) {
    return databaseService.transact((db) => {
      const operator = db.accounts.find((item) => item.id === context.accountId)?.displayName || '本地用户'
      const label = labelFor(action)
      if (entity === 'tickets') {
        requireCapability(context, 'support.manage')
        const item = db.tickets.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'tickets', item as unknown as Record<string, unknown>)
        const next: Partial<Record<Ticket['status'], Partial<Record<WorkflowAction, Ticket['status']>>>> = {
          submitted: { accept: 'processing', reject: 'rejected' }, processing: { parts: 'parts', complete: 'completed', reject: 'rejected' }, parts: { complete: 'completed' },
        }
        const status = next[item.status]?.[action]
        if (!status) throw new Error('INVALID_TRANSITION')
        const timestamp = new Date().toISOString()
        if (item.status === 'parts' && action === 'complete' && item.replacementRequired) {
          const requestIds = item.replacementMaterialRequestIds?.length ? item.replacementMaterialRequestIds : item.replacementMaterialRequestId ? [item.replacementMaterialRequestId] : []
          const materialRequests = requestIds.map((requestId) => db.materials.find((entry) => entry.id === requestId)).filter((entry): entry is MaterialRequest => Boolean(entry))
          if (!materialRequests.length || materialRequests.some((request) => request.status !== 'received')) throw new Error('REPLACEMENT_NOT_RECEIVED')
          const project = item.projectId ? db.projects.find((entry) => entry.id === item.projectId) : undefined
          const replacementLines: ReplacementMaterialLine[] = item.replacementLines?.length
            ? item.replacementLines
            : item.originalMaterialId && item.replacementMaterialId
              ? [{ id: `replacement-${item.id}-legacy`, originalCatalogId: item.originalMaterialId, replacementCatalogId: item.replacementMaterialId, quantity: Number(item.replacementQuantity || materialRequests[0].quantity || 1) }]
              : []
          if (!project || !replacementLines.length) throw new Error('PROJECT_NOT_FOUND')
          project.installedMaterials ||= []
          for (const line of replacementLines) {
            const quantity = Number(line.quantity || 1)
            const currentOriginal = project.installedMaterials.find((entry) => entry.catalogId === line.originalCatalogId && entry.status === 'installed')
            if (currentOriginal) {
              currentOriginal.status = 'removed'
              currentOriginal.relatedCatalogId = line.replacementCatalogId
              currentOriginal.ticketId = item.id
              currentOriginal.at = timestamp
            } else {
              project.installedMaterials.push({ id: makeId('project-material'), catalogId: line.originalCatalogId, quantity, status: 'removed', ticketId: item.id, relatedCatalogId: line.replacementCatalogId, at: timestamp })
            }
            project.installedMaterials.push({ id: makeId('project-material'), catalogId: line.replacementCatalogId, quantity, status: 'installed', ticketId: item.id, relatedCatalogId: line.originalCatalogId, at: timestamp })
          }
          project.status = 'active'
          project.updatedAt = timestamp
          for (const materialRequest of materialRequests) {
            materialRequest.status = 'installed'
            materialRequest.updatedAt = timestamp
            materialRequest.history.push(event('installed', '更换物料已安装并关联项目', operator, note))
          }
          item.replacementCompletedAt = timestamp
          item.removedMaterialDisposition = 'returnPending'
          item.history.push(event('replacementCompleted', '物料更换完成，旧件待返还', operator, note))
        }
        item.status = status
        item.history.push(event(status, label, operator, note))
        item.updatedAt = timestamp
        return item
      }
      if (entity === 'materials') {
        if (action === 'approve' || action === 'reject' || action === 'ship') requireCapability(context, 'material.approve')
        if (action === 'receive' && !authorizationService.can(context, 'material.apply') && !authorizationService.can(context, 'material.approve')) throw new Error('FORBIDDEN')
        const item = db.materials.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'materials', item as unknown as Record<string, unknown>)
        const next: Partial<Record<MaterialRequest['status'], Partial<Record<WorkflowAction, MaterialRequest['status']>>>> = {
          pending: { approve: 'approved', reject: 'rejected' }, approved: { ship: 'shipping', reject: 'rejected' }, shipping: { receive: 'received' },
        }
        const status = next[item.status]?.[action]
        if (!status) throw new Error('INVALID_TRANSITION')
        item.status = status
        item.history.push(event(status, label, operator, note))
        item.updatedAt = new Date().toISOString()
        const timestamp = new Date().toISOString()
        const approval: ApprovalEvent = { id: makeId('approval'), createdAt: timestamp, updatedAt: timestamp, entity: 'material', entityId: item.id, action: action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : action === 'ship' ? 'ship' : 'receive', operator, note }
        db.approvals.unshift(approval)
        if (action === 'ship') {
          const lines = item.items?.length ? item.items : item.catalogId ? [{ catalogId: item.catalogId, quantity: item.quantity }] : []
          if (!lines.length) throw new Error('CATALOG_NOT_FOUND')
          for (const line of lines) {
            const catalog = db.materialCatalog.find((entry) => entry.id === line.catalogId)
            if (!catalog) throw new Error('CATALOG_NOT_FOUND')
            if (catalog.stock < line.quantity) throw new Error('INSUFFICIENT_STOCK')
          }
          for (const line of lines) {
            const catalog = db.materialCatalog.find((entry) => entry.id === line.catalogId)!
            catalog.stock -= line.quantity
            catalog.updatedAt = timestamp
          }
          item.trackingNumber ||= `SF${Date.now().toString().slice(-10)}`
          const dispatchAttachmentId = makeId('attachment')
          db.attachments.unshift({ id: dispatchAttachmentId, createdAt: timestamp, updatedAt: timestamp, ownerId: context.accountId || 'warehouse', entity: 'shipments', entityId: item.id, name: `发货现场-${item.id}.jpg`, kind: 'image', localPath: '/static/assest/images/shipment-proof.jpg', size: 286420, mimeType: 'image/jpeg', persisted: true })
          const shipment: Shipment = {
            id: makeId('ship'), createdAt: timestamp, updatedAt: timestamp, orderNo: `SH${Date.now()}`, materialRequestId: item.id, dealerId: item.dealerId,
            carrier: '顺丰速运', trackingNumber: item.trackingNumber, estimatedAt: new Date(Date.now() + 2 * 86400000).toISOString(), status: 'shipping',
            items: (item.items || []).map((line) => ({ id: makeId('ship-line'), catalogId: line.catalogId, name: line.name, sku: line.sku, quantity: line.quantity })),
            dispatchAttachmentIds: [dispatchAttachmentId], dispatchedBy: operator, dispatchedAt: timestamp,
            events: [{ id: makeId('event'), status: '已出库', description: '物料清单、现场照片和物流信息已核验，已交付承运商', at: timestamp }],
          }
          db.shipments.unshift(shipment)
        }
        if (action === 'receive') {
          const shipment = db.shipments.find((entry) => entry.materialRequestId === item.id)
          if (!shipment) throw new Error('SHIPMENT_NOT_FOUND')
          shipment.status = 'received'
          shipment.updatedAt = timestamp
          shipment.events.push({ id: makeId('event'), status: '已签收', description: '收货人已确认签收，物料申请同步完成', at: timestamp })
        }
        return item
      }
      if (entity === 'transfers') {
        requireCapability(context, 'device.assign')
        const item = db.transfers.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'transfers', item as unknown as Record<string, unknown>)
        if (item.kind === 'reallocation' && item.status === 'pending') throw new Error('PLATFORM_ACTION_REQUIRED')
        const next: Partial<Record<Transfer['status'], Partial<Record<WorkflowAction, Transfer['status']>>>> = { pending: { approve: 'approved', reject: 'rejected' }, approved: { complete: 'completed', reject: 'rejected' } }
        const status = next[item.status]?.[action]
        if (!status) throw new Error('INVALID_TRANSITION')
        item.status = status
        item.history.push(event(status, label, operator, note))
        item.updatedAt = new Date().toISOString()
        if (status === 'completed') {
          const device = db.devices.find((entry) => entry.id === item.deviceId)
          if (device) {
            if (item.kind === 'assignment') device.assignedTo = item.targetEmployeeId
            if (item.kind === 'reallocation' && item.targetDealerId) { device.dealerId = item.targetDealerId; delete device.assignedTo }
            device.updatedAt = new Date().toISOString()
          }
        }
        return item
      }
      if (entity === 'purchases') {
        requireCapability(context, 'material.approve')
        const item = db.purchases.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'purchases', item as unknown as Record<string, unknown>)
        const purchaseTransitions: Partial<Record<Purchase['status'], Partial<Record<WorkflowAction, Purchase['status']>>>> = {
          pendingApproval: { approve: 'salesConfirmed', reject: 'rejected' },
          salesConfirmed: { confirmRd: 'rdConfirmed', reject: 'rejected' },
          rdConfirmed: { startProduction: 'production', reject: 'rejected' },
          production: { finishProduction: 'approved', reject: 'rejected' },
        }
        const nextStatus = purchaseTransitions[item.status]?.[action]
        if (!nextStatus) throw new Error('INVALID_TRANSITION')
        item.status = nextStatus
        item.updatedAt = new Date().toISOString()
        if (nextStatus === 'approved') {
          const existingPayment = db.payments.find((entry) => entry.orderNo === item.orderNo)
          if (!existingPayment) {
            const payer = db.accounts.find((entry) => entry.dealerId === item.dealerId && entry.role === 'dealerAdmin')
            db.payments.unshift({
              id: makeId('payment'), createdAt: item.updatedAt, updatedAt: item.updatedAt,
              orderNo: item.orderNo, paymentNo: paymentNo(item.orderNo, 1), purchaseId: item.id, installmentNumber: 1, title: item.title, titleEn: item.titleEn,
              amount: item.amount, currency: item.items[0]?.currency || 'CNY',
              accountId: payer?.id || context.accountId || 'dealer', dealerId: item.dealerId,
              status: 'pending',
            })
          }
          item.paymentStatus = 'pending'
          item.paidAmount = 0
          item.remainingAmount = item.amount
          item.paymentCount = 0
        }
        const historyLabel = nextStatus === 'salesConfirmed'
          ? '销售确认完成，等待研发确认'
          : nextStatus === 'rdConfirmed'
            ? '研发确认完成，等待导入生产'
            : nextStatus === 'production'
              ? '已导入生产，等待生产完成'
              : nextStatus === 'approved'
                ? '生产完成，付款单已生成'
                : '采购审批已驳回'
        item.history.push(event(item.status, historyLabel, operator, note))
        db.approvals.unshift({ id: makeId('approval'), createdAt: item.updatedAt, updatedAt: item.updatedAt, entity: 'purchase', entityId: item.id, action: nextStatus === 'rejected' ? 'reject' : 'approve', operator, note })
        return item
      }
      if (entity === 'payments') {
        if (action === 'pay' || action === 'refund') throw new Error('PAYMENT_ADAPTER_REQUIRED')
        if ((context.role === 'dealerAdmin' || context.role === 'dealerStaff') && !authorizationService.can(context, 'purchase.create')) throw new Error('FORBIDDEN')
        const item = db.payments.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'payments', item as unknown as Record<string, unknown>)
        const next: Partial<Record<Payment['status'], Partial<Record<WorkflowAction, Payment['status']>>>> = {}
        const status = next[item.status]?.[action]
        if (!status) throw new Error('INVALID_TRANSITION')
        item.status = status
        item.updatedAt = new Date().toISOString()
        const purchase = db.purchases.find((entry) => entry.orderNo === item.orderNo)
        if (purchase) { purchase.status = status === 'paid' ? 'paid' : 'refunded'; purchase.updatedAt = item.updatedAt }
        return item
      }
      if (entity === 'shipments') {
        if (!authorizationService.can(context, 'material.apply') && !authorizationService.can(context, 'material.approve')) throw new Error('FORBIDDEN')
        const item = db.shipments.find((entry) => entry.id === id)
        if (!item) throw new Error('ENTITY_NOT_FOUND')
        authorizationService.assertItem(context, 'shipments', item as unknown as Record<string, unknown>)
        if (action !== 'receive' || item.status !== 'shipping') throw new Error('INVALID_TRANSITION')
        item.status = 'received'
        const timestamp = new Date().toISOString()
        item.receivedBy = db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '经销商'
        item.receivedAt = timestamp
        item.events.push({ id: makeId('event'), status: '已签收', description: '收货人已确认签收', at: timestamp })
        item.updatedAt = timestamp
        const request = item.materialRequestId ? db.materials.find((entry) => entry.id === item.materialRequestId) : undefined
        if (request) {
          if (request.status !== 'shipping') throw new Error('INVALID_MATERIAL_STATE')
          request.status = 'received'
          request.updatedAt = timestamp
          request.history.push(event('received', '确认签收', db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '本地用户'))
          db.approvals.unshift({ id: makeId('approval'), createdAt: timestamp, updatedAt: timestamp, entity: 'material', entityId: request.id, action: 'receive', operator: db.accounts.find((entry) => entry.id === context.accountId)?.displayName || '本地用户' })
        }
        const purchase = db.purchases.find((entry) => entry.orderNo === item.orderNo)
        if (purchase && purchase.status === 'paid') {
          const dealer = db.dealers.find((entry) => entry.id === purchase.dealerId)
          let sequence = db.devices.length + 1
          for (const line of purchase.items.filter((entry) => entry.itemType === 'device')) {
            const model = db.deviceModels.find((entry) => entry.id === line.catalogId || entry.model === line.deviceModel)
            if (!model) continue
            for (let index = 0; index < line.quantity; index += 1) {
              let serialNumber = `${model.model.replace(/[^A-Z0-9]/gi, '')}${Date.now().toString().slice(-8)}${String(sequence).padStart(2, '0')}`.toUpperCase()
              while (db.devices.some((entry) => entry.serialNumber === serialNumber)) { sequence += 1; serialNumber = `${model.model.replace(/[^A-Z0-9]/gi, '')}${Date.now().toString().slice(-8)}${String(sequence).padStart(2, '0')}`.toUpperCase() }
              const deviceId = makeId('device')
              const specification = line.specification || model.specifications[0] || '标准型'
              db.devices.unshift({
                id: deviceId, createdAt: timestamp, updatedAt: timestamp,
                name: `${model.name}-${String(sequence).padStart(2, '0')}`, nameEn: `${model.nameEn}-${String(sequence).padStart(2, '0')}`,
                category: model.category, categoryEn: model.categoryEn, model: model.model, specification, serialNumber,
                status: 'offline', dealerId: purchase.dealerId, firmware: defaultFirmwareForModel(model.model),
                salesRegion: dealer?.region || '福建省厦门市', activationStatus: 'registered', connectionState: 'disconnected', bluetoothConnected: false, controllerConnected: false,
                location: { lat: 0, lng: 0, label: '经销商库存', labelEn: 'Dealer inventory' },
                telemetry: { voltage: 0, current: 0, power: 0, temperature: 0, runtime: 0, output: 0 },
                identity: createDefaultDeviceIdentity(serialNumber), settings: createDefaultDeviceSettings(), controlState: createDefaultDeviceControlState(), lastOnline: timestamp,
              })
              db.deviceRegistrations.unshift({
                id: makeId('registration'), createdAt: timestamp, updatedAt: timestamp, serialNumber, model: model.model,
                specification, category: model.category, categoryEn: model.categoryEn, salesRegion: dealer?.region || '福建省厦门市',
                lastKnownRegion: dealer?.region || '福建省厦门市', dealerId: purchase.dealerId, status: 'available',
              })
              sequence += 1
            }
          }
          if (purchase.items.some((entry) => entry.itemType === 'device')) purchase.history.push(event('received', '设备已签收入库，可在未分配设备中继续分配或创建安装项目', item.receivedBy || '经销商'))
        }
        return item
      }
      const item = db.serviceTransfers.find((entry) => entry.id === id)
      if (!item) throw new Error('ENTITY_NOT_FOUND')
      requireCapability(context, 'support.manage')
      if (action === 'platformApprove') throw new Error('PLATFORM_ACTION_REQUIRED')
      if (item.status === 'platformReview') throw new Error('PLATFORM_ACTION_REQUIRED')
      if (item.status === 'pendingOrigin' && context.dealerId !== item.originDealerId) throw new Error('WRONG_WORKFLOW_ACTOR')
      if (item.status === 'pendingTarget' && context.dealerId !== item.targetDealerId) throw new Error('WRONG_WORKFLOW_ACTOR')
      const next: Partial<Record<ServiceTransfer['status'], Partial<Record<WorkflowAction, ServiceTransfer['status']>>>> = {
        pendingOrigin: { confirmOrigin: 'pendingTarget', reject: 'rejected' }, pendingTarget: { acceptTarget: 'platformReview', reject: 'rejected' }, platformReview: { platformApprove: 'completed', reject: 'rejected' },
      }
      const status = next[item.status]?.[action]
      if (!status) throw new Error('INVALID_TRANSITION')
      item.status = status
      item.history.push(event(status, label, operator, note))
      item.updatedAt = new Date().toISOString()
      if (status === 'platformReview') {
        const timestamp = new Date().toISOString()
        const approval: PlatformApproval = { id: makeId('platform-approval'), createdAt: timestamp, updatedAt: timestamp, entity: 'serviceTransfer', entityId: item.id, requestedBy: context.accountId || 'local-workflow', status: 'pending', source: 'demo-exception' }
        db.platformApprovals.unshift(approval)
        item.platformApprovalId = approval.id
      }
      return item
    }, { action, entity, entityId: id, operator: context.accountId || 'guest', detail: note })
  },
}
