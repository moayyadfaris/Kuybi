import { CacheService } from '@core/cache/services/cache.service'

/**
 * Public surface of CacheService. Typing the stub against it means a new
 * CacheService method breaks the test build instead of surfacing as a
 * runtime "is not a function" 500 inside integration tests.
 */
type CacheServiceApi = Pick<CacheService, keyof CacheService>

/**
 * In-memory CacheService replacement for integration tests.
 * Shared by every spec so it stays in sync with the real service.
 */
export class InMemoryCacheService implements CacheServiceApi {
  private readonly store = new Map<string, unknown>()
  private readonly tagIndex = new Map<string, Set<string>>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value)
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async delPattern(pattern: string): Promise<void> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
      }
    }
  }

  async reset(): Promise<void> {
    this.store.clear()
    this.tagIndex.clear()
  }

  async wrap<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      return this.store.get(key) as T
    }
    const value = await fn()
    this.store.set(key, value)
    return value
  }

  async wrapWithTags<T>(key: string, tags: string[], fn: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      return this.store.get(key) as T
    }
    const value = await fn()
    await this.setWithTags(key, value, tags)
    return value
  }

  async setWithTags<T>(key: string, value: T, tags: string[]): Promise<void> {
    this.store.set(key, value)
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag) ?? new Set<string>()
      keys.add(key)
      this.tagIndex.set(tag, keys)
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    for (const key of this.tagIndex.get(tag) ?? []) {
      this.store.delete(key)
    }
    this.tagIndex.delete(tag)
  }

  async invalidateTags(tags: string[]): Promise<void> {
    await Promise.all(tags.map(tag => this.invalidateTag(tag)))
  }

  async isHealthy(): Promise<boolean> {
    return true
  }

  buildKey(namespace: string, ...parts: (string | number)[]): string {
    return [namespace, ...parts].join(':')
  }
}
