import { databaseService } from './database'
import type { ExportRecord, LocaleCode } from '@/types/models'

declare const plus: any

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function buildCsv(deviceName: string, range: string, metrics: Array<{ label: string; value: string; note: string }>, events: string[]) {
  const rows = [
    ['Device', deviceName],
    ['Range', range],
    [],
    ['Metric', 'Value', 'Status'],
    ...metrics.map((item) => [item.label, item.value, item.note]),
    [],
    ['Events'],
    ...events.map((item) => [item]),
  ]
  return `\uFEFF${rows.map((row) => row.map((cell) => csvCell(String(cell ?? ''))).join(',')).join('\r\n')}`
}

function downloadOnH5(name: string, content: string) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') throw new Error('FILE_EXPORT_NOT_SUPPORTED')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return { path: name, size: blob.size }
}

function writeOnApp(name: string, content: string): Promise<{ path: string; size: number }> {
  return new Promise((resolve, reject) => {
    if (typeof plus === 'undefined' || !plus.io) return reject(new Error('FILE_EXPORT_NOT_SUPPORTED'))
    plus.io.requestFileSystem(plus.io.PRIVATE_DOC, (fileSystem: any) => {
      fileSystem.root.getDirectory('exports', { create: true }, (directory: any) => {
        directory.getFile(name, { create: true }, (entry: any) => {
          entry.createWriter((writer: any) => {
            writer.onwrite = () => resolve({ path: entry.toLocalURL(), size: new Blob([content]).size })
            writer.onerror = () => reject(new Error('FILE_EXPORT_FAILED'))
            writer.write(content)
          }, () => reject(new Error('FILE_EXPORT_FAILED')))
        }, () => reject(new Error('FILE_EXPORT_FAILED')))
      }, () => reject(new Error('FILE_EXPORT_FAILED')))
    }, () => reject(new Error('FILE_EXPORT_FAILED')))
  })
}

function removeOnApp(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!path || typeof plus === 'undefined' || !plus.io) return resolve()
    plus.io.resolveLocalFileSystemURL(path, (entry: any) => {
      entry.remove(() => resolve(), () => reject(new Error('FILE_CACHE_DELETE_FAILED')))
    }, () => resolve())
  })
}

export const exportService = {
  async clearLocalFiles(paths: string[]) {
    // H5 exports are browser downloads and their object URLs are revoked immediately.
    // #ifdef APP-PLUS
    await Promise.all(paths.filter(Boolean).map((path) => removeOnApp(path)))
    // #endif
  },

  async exportDeviceReport(input: {
    ownerId: string
    deviceId: string
    deviceName: string
    range: string
    metrics: Array<{ label: string; value: string; note: string }>
    events: string[]
    locale: LocaleCode
  }): Promise<ExportRecord> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const name = `device-report-${input.deviceId}-${timestamp}.csv`
    const content = buildCsv(input.deviceName, input.range, input.metrics, input.events)
    let file: { path: string; size: number }
    // #ifdef APP-PLUS
    file = await writeOnApp(name, content)
    // #endif
    // #ifndef APP-PLUS
    file = downloadOnH5(name, content)
    // #endif
    const now = new Date().toISOString()
    return databaseService.transact((db) => {
      const record: ExportRecord = { id: `export-${Date.now()}`, ownerId: input.ownerId, deviceId: input.deviceId, name, mimeType: 'text/csv', localPath: file.path, size: file.size, createdAt: now, updatedAt: now }
      db.exports.unshift(record)
      return record
    }, { action: 'export', entity: 'deviceReport', entityId: input.deviceId, operator: input.ownerId, detail: `${name}:${input.locale}`, source: 'local' })
  },
}
