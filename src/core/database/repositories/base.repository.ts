import { SpanStatusCode, trace } from '@opentelemetry/api'
import { errorMessage } from '@shared/utils/error.util'
import {
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOptionsWhere,
  ObjectLiteral,
  type QueryDeepPartialEntity,
  Repository
} from 'typeorm'

import { CacheService } from '../../cache/services/cache.service'

/**
 * The row tag of one entity row (`<entityName>:<id>`). Every write through that entity's
 * repository invalidates it, so another repository can tag an entry that embeds the row
 * with it (dependsOn) and have the entry dropped when the row changes.
 */
export function cacheRowTag(entityName: string, id: string | number): string {
  return `${entityName}:${id}`
}

export interface CacheEntryOptions<V> {
  /** A row picked by a query rather than by its key: also dropped when any row changes */
  selection?: boolean
  /** Row tags (cacheRowTag) of other entities embedded in the value */
  dependsOn?: (value: V) => string[]
}

/**
 * Base Repository Pattern
 *
 * Provides common data access operations with built-in caching support.
 * All entity repositories should extend this class, and services reach the database
 * only through repositories (lint-enforced), so no write can skip cache invalidation.
 *
 * Cache contract
 * - Every cached entry carries the entity tag plus either its row tag (`<entity>:<id>`,
 *   when the value is a single row) or the list tag (`<entity>:list`: lists, counts and
 *   booleans - anything a new or changed row can make wrong). A single row picked by a
 *   query rather than a unique key (the latest, the first match) is a `selection` and
 *   carries both: another row can become the answer. Misses are not cached.
 * - Invalidation is by tag only, never by key pattern (no SCAN of the keyspace).
 * - A write through this class invalidates the row tag of the row it touched and the
 *   list tag. Other rows stay cached.
 * - transaction() cannot know which rows the work touched, so it invalidates the
 *   entity tag (everything for this entity) once the work commits.
 * - Subclasses cache through cached() / cacheSet(), never cacheService.wrap/set
 *   directly (lint-enforced). A cached row that embeds other entities (e.g. a user with
 *   its roles) must be invalidated with invalidateCacheByEntityId() when those change.
 *
 * @template T - Entity type
 */
export abstract class BaseRepository<T extends ObjectLiteral> {
  protected abstract entityName: string
  protected defaultTTL = 3600 // 1 hour default cache TTL

  constructor(
    protected readonly repository: Repository<T>,
    protected readonly cacheService: CacheService
  ) {}

  /**
   * Build a cache key for this entity
   */
  protected buildCacheKey(...parts: (string | number)[]): string {
    return this.cacheService?.buildKey(this.entityName, ...parts) ?? ''
  }

  /**
   * Read-through cache for subclass queries. The value is tagged per the cache
   * contract, so writes through this repository invalidate it. The fence is taken before
   * the load: if a write invalidates the entry's tags while it loads, the (possibly old)
   * value is returned but not cached.
   */
  protected async cached<V>(
    key: string,
    load: () => Promise<V>,
    ttl?: number,
    options?: CacheEntryOptions<V>
  ): Promise<V> {
    if (!this.cacheService) return load()
    const hit = await this.cacheService.get<V>(key)
    if (hit !== undefined && hit !== null) return hit
    const since = await this.cacheService.fence()
    const value = await load()
    // A cached null would read back as a miss, so misses are not stored; without a
    // fence (cache unavailable) a stale fill could not be detected, so nothing is stored
    if (value !== null && since !== undefined) {
      await this.cacheSet(key, value, ttl, { ...options, since })
    }
    return value
  }

  /**
   * Store a value under the cache contract (see cached()). Pass `since` (the fence taken
   * before the value was read) so a value invalidated meanwhile is not kept.
   */
  protected async cacheSet<V>(
    key: string,
    value: V,
    ttl?: number,
    options?: CacheEntryOptions<V> & { since?: number }
  ): Promise<void> {
    if (!this.cacheService || value === undefined) return
    const tags = this.getCacheTags(this.rowIdOf(value))
    if (options?.selection && !tags.includes(this.listTag())) tags.push(this.listTag())
    for (const tag of options?.dependsOn?.(value) ?? []) {
      if (!tags.includes(tag)) tags.push(tag)
    }
    await this.cacheService.setWithTags(key, value, tags, ttl ?? this.defaultTTL, {
      since: options?.since
    })
  }

  /**
   * Find one entity by conditions with caching
   */
  async findOne(
    where: FindOptionsWhere<T>,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<T | null> {
    if (options?.bypassCache) {
      return this.repository.findOne({ where })
    }
    // Any conditions, so possibly not a unique key: a selection
    return this.cached(
      this.buildCacheKey('findOne', JSON.stringify(where)),
      () => this.repository.findOne({ where }),
      options?.ttl,
      { selection: true }
    )
  }

  /**
   * Find entity by ID with caching
   */
  async findById(
    id: string | number,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<T | null> {
    const tracer = trace.getTracer('kuybi-backend')
    return tracer.startActiveSpan(`${this.entityName}.findById`, async span => {
      span.setAttributes({
        'db.system': 'postgresql',
        'db.operation': 'findOne',
        'entity.name': this.entityName,
        'entity.id': String(id),
        'cache.enabled': !options?.bypassCache
      })

      try {
        // Every entity has an id column; TypeScript cannot prove that for a generic T
        const load = () =>
          this.repository.findOne({ where: { id } as unknown as FindOptionsWhere<T> })

        const entity = options?.bypassCache
          ? await load()
          : await this.cached(this.buildCacheKey('id', id), load, options?.ttl)

        span.setStatus({ code: SpanStatusCode.OK })
        return entity
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(error) })
        span.recordException(error instanceof Error ? error : String(error))
        throw error
      } finally {
        span.end()
      }
    })
  }

  /**
   * Find all entities with optional caching
   */
  async findAll(options?: { ttl?: number; bypassCache?: boolean }): Promise<T[]> {
    if (options?.bypassCache) {
      return this.repository.find()
    }
    return this.cached(this.buildCacheKey('all'), () => this.repository.find(), options?.ttl)
  }

  /**
   * Find multiple entities; cached only when a cacheKey is given
   */
  async findMany(
    options?: FindManyOptions<T>,
    cacheOptions?: { ttl?: number; cacheKey?: string; bypassCache?: boolean }
  ): Promise<T[]> {
    if (!cacheOptions?.cacheKey || cacheOptions.bypassCache) {
      return this.repository.find(options)
    }
    return this.cached(cacheOptions.cacheKey, () => this.repository.find(options), cacheOptions.ttl)
  }

  /**
   * Find with pagination
   */
  async findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    return this.repository.findAndCount(options)
  }

  /**
   * Create a new entity
   */
  async create(data: DeepPartial<T>): Promise<T> {
    const saved = await this.repository.save(this.repository.create(data))
    await this.invalidateRowAndLists(this.idOf(saved))
    return saved
  }

  /**
   * Update an entity by ID
   */
  async update(id: string | number, data: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id, data as QueryDeepPartialEntity<T>)
    await this.invalidateRowAndLists(id)
    return this.findById(id, { bypassCache: true })
  }

  /**
   * Optimistic locking: applies `data` only if the row still has `expectedVersion`, and
   * increments the version in the same statement. Null when the row changed meanwhile
   * (or is gone): answer 409 (versionConflict). For entities with a `version` column.
   */
  async updateIfVersion(
    id: string | number,
    expectedVersion: number,
    data: DeepPartial<T>
  ): Promise<T | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update()
      .set({ ...(data as QueryDeepPartialEntity<T>), version: () => '"version" + 1' })
      .where('id = :id AND "version" = :expectedVersion', { id, expectedVersion })
      .execute()
    if (!result.affected) return null
    await this.invalidateRowAndLists(id)
    return this.findById(id, { bypassCache: true })
  }

  /**
   * Delete an entity by ID
   */
  async delete(id: string | number): Promise<boolean> {
    const result = await this.repository.delete(id)
    await this.invalidateRowAndLists(id)
    return (result.affected ?? 0) > 0
  }

  /**
   * Soft-delete an entity by ID. Needs a @DeleteDateColumn on the entity; repositories
   * whose entity keeps deletedAt in a plain column override this.
   */
  async softDelete(id: string | number): Promise<boolean> {
    const result = await this.repository.softDelete(id)
    await this.invalidateRowAndLists(id)
    return (result.affected ?? 0) > 0
  }

  /**
   * Save an entity (create or update)
   */
  async save(entity: T | DeepPartial<T>): Promise<T> {
    const saved = await this.repository.save(entity as DeepPartial<T>)
    await this.invalidateRowAndLists(this.idOf(saved))
    return saved
  }

  /**
   * Count entities
   */
  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where })
  }

  /**
   * Check if entity exists
   */
  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    const count = await this.repository.count({ where })
    return count > 0
  }

  /**
   * Runs work in a transaction and drops this entity's caches once it commits. Writes
   * inside `work` go through the manager; invalidating only after the commit means no
   * reader can re-cache the pre-commit row in between. A rollback leaves the cache as is.
   *
   * Pass `touched` (the ids of this entity's rows the work changed, `[]` when it only
   * inserts) to invalidate just those rows and the lists; without it every cached entry
   * of this entity is dropped. Writes to another repository's entity inside `work` must
   * be followed by that repository's invalidation (or run through its own transaction()).
   */
  async transaction<R>(
    work: (manager: EntityManager) => Promise<R>,
    options?: { touched?: (string | number)[] }
  ): Promise<R> {
    const result = await this.repository.manager.transaction(work)
    if (options?.touched) {
      await this.invalidateRowAndLists(undefined)
      for (const id of options.touched) await this.invalidateRowAndLists(id)
    } else {
      await this.invalidateCacheByTag()
    }
    return result
  }

  private idOf(entity: T): string | number | undefined {
    return (entity as { id?: string | number }).id
  }

  /** The row id when a cached value is a single row, otherwise undefined (list tag) */
  private rowIdOf(value: unknown): string | number | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? id : undefined
  }

  private async invalidateRowAndLists(id: string | number | undefined): Promise<void> {
    if (!this.cacheService) return
    const tags = [this.listTag()]
    if (id !== undefined) tags.push(this.rowTag(id))
    await this.cacheService.invalidateTags(tags)
  }

  private rowTag(id: string | number): string {
    return cacheRowTag(this.entityName, id)
  }

  private listTag(): string {
    return `${this.entityName}:list`
  }

  /**
   * Invalidate cache for a specific entity
   */
  protected async invalidateEntityCache(id: string | number): Promise<void> {
    await this.invalidateCacheByEntityId(id)
  }

  /**
   * Invalidate list caches (and selections)
   */
  protected async invalidateListCaches(): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.invalidateTag(this.listTag())
  }

  /**
   * Invalidate all caches for this entity
   */
  async invalidateAllCaches(): Promise<void> {
    if (!this.cacheService) return

    await this.invalidateCacheByTag()
  }

  /**
   * Cache tags for a value: entity tag plus the row tag (single row) or list tag
   */
  protected getCacheTags(id?: string | number): string[] {
    return [this.entityName, id !== undefined ? this.rowTag(id) : this.listTag()]
  }

  /**
   * Invalidate every cached entry of this entity (entity tag)
   */
  async invalidateCacheByTag(): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.invalidateTag(this.entityName)
  }

  /**
   * Invalidate the cached entries of one row (row tag) and the lists it may appear in
   */
  async invalidateCacheByEntityId(id: string | number): Promise<void> {
    await this.invalidateRowAndLists(id)
  }
}
