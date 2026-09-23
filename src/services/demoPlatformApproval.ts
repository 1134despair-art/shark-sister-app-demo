export type DemoPlatformEntity = 'serviceTransfer' | 'deviceTransfer' | 'installationTransfer' | 'deviceActivation' | 'headquartersMessage'

export const demoPlatformApprovalService = {
  confirm(entity: DemoPlatformEntity, entityId: string, decision: 'approved' | 'rejected') {
    return { entity, entityId, decision, reviewer: '系统演示审批', decidedAt: new Date().toISOString() }
  },
}
