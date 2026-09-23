import { databaseService } from './database'

const DAY_MS = 24 * 60 * 60 * 1000

export const warrantyService = {
  ensureReminders(now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const snapshot = databaseService.snapshot()
    const candidateIds = snapshot.projects.filter((project) => {
      if (!project.warrantyEnd || snapshot.messages.some((item) => item.id === `warranty-${project.id}-${project.warrantyEnd}`)) return false
      const end = new Date(`${project.warrantyEnd}T00:00:00`).getTime()
      return Number.isFinite(end) && Math.ceil((end - today) / DAY_MS) <= 30
    }).map((project) => project.id)
    if (!candidateIds.length) return 0
    return databaseService.transact((db) => {
      let created = 0
      for (const project of db.projects) {
        if (!candidateIds.includes(project.id)) continue
        if (!project.warrantyEnd) continue
        const end = new Date(`${project.warrantyEnd}T00:00:00`).getTime()
        if (!Number.isFinite(end)) continue
        const days = Math.ceil((end - today) / DAY_MS)
        if (days > 30) continue
        const id = `warranty-${project.id}-${project.warrantyEnd}`
        if (db.messages.some((item) => item.id === id)) continue
        const device = db.devices.find((item) => item.serialNumber === project.serialNumber)
        const timestamp = now.toISOString()
        const expired = days < 0
        db.messages.unshift({
          id,
          createdAt: timestamp,
          updatedAt: timestamp,
          title: expired ? '设备质保已到期' : '设备质保即将到期',
          titleEn: expired ? 'Device warranty expired' : 'Device warranty expiring soon',
          body: expired
            ? `${project.vessel}（${project.serialNumber}）质保已于 ${project.warrantyEnd} 到期`
            : `${project.vessel}（${project.serialNumber}）质保将于 ${project.warrantyEnd} 到期，剩余 ${Math.max(0, days)} 天`,
          type: 'service',
          accountId: device?.ownerId,
          dealerId: project.dealerId,
          read: false,
        })
        created += 1
      }
      return created
    }, { action: 'warranty-reminder-refresh', entity: 'messages', entityId: now.toISOString().slice(0, 10), operator: 'system', detail: 'one-time-warranty-reminders', source: 'local' })
  },
}
