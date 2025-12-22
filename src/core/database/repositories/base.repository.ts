import { SpanStatusCode, trace } from '@opentelemetry/api'
import { DeepPartial, FindManyOptions, FindOptionsWhere, Repository } from 'typeorm'

import { CacheService } from '../../cache/services/cache.service'

/**
 * Base Repository Pattern
 *
 * Provides common data access operations with built-in caching support.
 * All entity repositories should extend this class.
 *
 * @template T - Entity type
 */
export abstract class BaseRepository<T> {
  protected abstract entityName: string
  protected defaultTTL = 3600 // 1 hour default cache TTL

  constructor(
    protected readonly repository: Repository<T>,
    protected readonly cacheService?: CacheService
  ) {}

  /**
   * Build a cache key for this entity
   */
  protected buildCacheKey(...parts: (string | number)[]): string {
    return this.cacheService?.buildKey(this.entityName, ...parts) ?? ''
  }

  /**
   * Find one entity by conditions with caching
   */
  async findOne(
    where: FindOptionsWhere<T>,
    options?: { ttl?: number; bypassCache?: boolean }
  ): Promise<T | null> {
    const cacheKey = this.buildCacheKey('findOne', JSON.stringify(where))

    if (!options?.bypassCache && this.cacheService) {
      const cached = await this.cacheService.get<T>(cacheKey)
      if (cached) return cached
    }

    const entity = await this.repository.findOne({ where })

    if (entity && this.cacheService && !options?.bypassCache) {
      await this.cacheService.set(cacheKey, entity, options?.ttl ?? this.defaultTTL)
    }

    return entity
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
        const cacheKey = this.buildCacheKey('id', id)

        if (!options?.bypassCache && this.cacheService) {
          // Try to get from cache first
          const cached = await this.cacheService.get<T>(cacheKey)
          if (cached) {
            span.setAttribute('cache.hit', true)
            span.setStatus({ code: SpanStatusCode.OK })
            return cached
          }
          span.setAttribute('cache.hit', false)
        }

        // Fetch from DB and cache with tags
        const entity = await this.repository.findOne({ where: { id } as any })

        if (entity) {
          if (!options?.bypassCache && this.cacheService) {
            await this.setCacheWithTags(cacheKey, entity, id, options?.ttl)
          }
        }

        span.setStatus({ code: SpanStatusCode.OK })
        return entity
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
        span.recordException(error)
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
    const cacheKey = this.buildCacheKey('all')

    if (!options?.bypassCache && this.cacheService) {
      return this.cacheService.wrap<T[]>(
        cacheKey,
        async () => {
          return this.repository.find()
        },
        options?.ttl ?? this.defaultTTL
      )
    }

    return this.repository.find()
  }

  /**
   * Find multiple entities with optional caching
   */
  async findMany(
    options?: FindManyOptions<T>,
    cacheOptions?: { ttl?: number; cacheKey?: string; bypassCache?: boolean }
  ): Promise<T[]> {
    const cacheKey =
      cacheOptions?.cacheKey ?? this.buildCacheKey('findMany', JSON.stringify(options ?? {}))

    if (!cacheOptions?.bypassCache && this.cacheService && cacheOptions?.cacheKey) {
      const cached = await this.cacheService.get<T[]>(cacheKey)
      if (cached) return cached
    }

    const entities = await this.repository.find(options)

    if (this.cacheService && !cacheOptions?.bypassCache && cacheOptions?.cacheKey) {
      await this.cacheService.set(cacheKey, entities, cacheOptions?.ttl ?? this.defaultTTL)
    }

    return entities
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
    const entity = this.repository.create(data)
    const saved = await this.repository.save(entity)

    // Invalidate entity-wide cache tag (affects all lists, searches, etc.)
    await this.invalidateCacheByTag()

    return saved
  }

  /**
   * Update an entity by ID
   */
  async update(id: string | number, data: DeepPartial<T>): Promise<T | null> {
    await this.repository.update(id as any, data as any)

    // Invalidate both entity-level and instance-level caches
    await this.invalidateCacheByEntityId(id)
    await this.invalidateCacheByTag()

    return this.findById(id, { bypassCache: true })
  }

  /**
   * Delete an entity by ID
   */
  async delete(id: string | number): Promise<boolean> {
    const result = await this.repository.delete(id as any)

    // Invalidate both entity-level and instance-level caches
    await this.invalidateCacheByEntityId(id)
    await this.invalidateCacheByTag()

    return (result.affected ?? 0) > 0
  }

  /**
   * Save an entity (create or update)
   */
  async save(entity: T | DeepPartial<T>): Promise<T> {
    const saved = await this.repository.save(entity as any)

    // Invalidate caches
    if ((saved as any).id) {
      await this.invalidateCacheByEntityId((saved as any).id)
    }
    await this.invalidateCacheByTag()

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
   * Get the underlying TypeORM repository
   * Use this for complex queries that need QueryBuilder
   */
  getRepository(): Repository<T> {
    return this.repository
  }

  /**
   * Invalidate cache for a specific entity
   */
  protected async invalidateEntityCache(id: string | number): Promise<void> {
    if (!this.cacheService) return

    const patterns = [this.buildCacheKey('id', id), this.buildCacheKey('findOne', '*')]

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        await this.cacheService.delPattern(pattern)
      } else {
        await this.cacheService.del(pattern)
      }
    }
  }

  /**
   * Invalidate list caches
   * Override this in specific repositories to add custom patterns
   */
  protected async invalidateListCaches(): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.delPattern(`${this.entityName}:findMany:*`)
    await this.cacheService.delPattern(`${this.entityName}:list:*`)
    await this.cacheService.delPattern(`${this.entityName}:search:*`)
  }

  /**
   * Invalidate all caches for this entity
   */
  async invalidateAllCaches(): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.delPattern(`${this.entityName}:*`)
  }

  /**
   * Get default cache tags for this entity
   * Override in child repositories to add custom tags
   */
  protected getCacheTags(id?: string | number): string[] {
    const tags = [this.entityName]
    if (id) {
      tags.push(`${this.entityName}:${id}`)
    }
    return tags
  }

  /**
   * Set cached value with entity tags
   */
  protected async setCacheWithTags<V>(
    key: string,
    value: V,
    id?: string | number,
    ttl?: number
  ): Promise<void> {
    if (!this.cacheService) return

    const tags = this.getCacheTags(id)
    await this.cacheService.setWithTags(key, value, tags, ttl ?? this.defaultTTL)
  }

  /**
   * Invalidate cache by entity tag
   * This clears all caches related to this entity type
   */
  async invalidateCacheByTag(): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.invalidateTag(this.entityName)
  }

  /**
   * Invalidate cache by specific entity instance
   * This clears all caches related to a specific entity ID
   */
  async invalidateCacheByEntityId(id: string | number): Promise<void> {
    if (!this.cacheService) return

    await this.cacheService.invalidateTag(`${this.entityName}:${id}`)
  }
}
