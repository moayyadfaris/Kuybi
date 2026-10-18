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
 *
 * Values are stored as JSON, like the Redis store: a cache hit returns a plain
 * object (no class prototype, dates as strings), never the instance that was
 * cached. Keeping class instances here hid production-only bugs.
 */
export class InMemoryCacheService implements CacheServiceApi {
  private readonly store = new Map<string, string>()
  private readonly tagIndex = new Map<string, Set<string>>()

  private read<T>(key: string): T | undefined {
    const raw = this.store.get(key)
    return raw === undefined ? undefined : (JSON.parse(raw) as T)
  }

  private write(key: string, value: unknown): void {
    // undefined is not cacheable in the real store either
    if (value !== undefined) this.store.set(key, JSON.stringify(value))
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.read<T>(key)
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.write(key, value)
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return [...this.store.keys()].filter(key => regex.test(key))
  }

  async delPattern(pattern: string): Promise<void> {
    for (const key of await this.scanKeys(pattern)) {
      this.store.delete(key)
    }
  }

  async reset(): Promise<void> {
    this.store.clear()
    this.tagIndex.clear()
  }

  async wrap<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      return this.read<T>(key) as T
    }
    // Like cache-manager: a miss returns the freshly computed value itself
    const value = await fn()
    this.write(key, value)
    return value
  }

  async wrapWithTags<T>(key: string, tags: string[], fn: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) {
      return this.read<T>(key) as T
    }
    const value = await fn()
    await this.setWithTags(key, value, tags)
    return value
  }

  async setWithTags<T>(key: string, value: T, tags: string[]): Promise<void> {
    this.write(key, value)
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
