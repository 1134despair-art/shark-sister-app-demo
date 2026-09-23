const memory = new Map<string, unknown>()

const uniApi = () => (globalThis as { uni?: typeof uni }).uni

export const storage = {
  get<T>(key: string): T | null {
    const api = uniApi()
    if (api?.getStorageSync) {
      const value = api.getStorageSync(key)
      return value === '' || value == null ? null : (value as T)
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) as T : null
    }
    return (memory.get(key) as T | undefined) ?? null
  },
  set<T>(key: string, value: T) {
    const api = uniApi()
    if (api?.setStorageSync) return api.setStorageSync(key, value)
    if (typeof localStorage !== 'undefined') return localStorage.setItem(key, JSON.stringify(value))
    memory.set(key, value)
  },
  remove(key: string) {
    const api = uniApi()
    if (api?.removeStorageSync) return api.removeStorageSync(key)
    if (typeof localStorage !== 'undefined') return localStorage.removeItem(key)
    memory.delete(key)
  },
}
