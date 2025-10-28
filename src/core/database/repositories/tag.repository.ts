import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, IsNull } from 'typeorm'
import { BaseRepository } from './base.repository'
import { Tag } from '@modules/tags/entities/tag.entity'
import { CacheService } from '../../cache/services/cache.service'

/**
 * Tag Repository
 * 
 * Handles all database operations for Tag entity with caching.
 */
@Injectable()
export class TagRepository extends BaseRepository<Tag> {
  protected entityName = 'tag'
  protected defaultTTL = 1800 // 30 minutes for tags (relatively static)

  constructor(
    @InjectRepository(Tag)
    protected readonly repository: Repository<Tag>,
    protected readonly cacheService: CacheService,
  ) {
    super(repository, cacheService)
  }

  /**
   * Find tag by name
   */
  async findByName(name: string): Promise<Tag | null> {
    const cacheKey = this.buildCacheKey('name', name.toLowerCase())

    return this.cacheService.wrap<Tag | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: {
            name: name.toLowerCase(),
            deletedAt: IsNull(),
          },
        })
      },
      this.defaultTTL,
    )
  }

  /**
   * Find all active tags with optional sorting
   */
  async findAllActive(options?: {
    sortBy?: 'name' | 'sortOrder' | 'createdAt'
    sortOrder?: 'ASC' | 'DESC'
  }): Promise<Tag[]> {
    const cacheKey = this.buildCacheKey('all-active', JSON.stringify(options || {}))

    return this.cacheService.wrap<Tag[]>(
      cacheKey,
      async () => {
        const sortBy = options?.sortBy || 'sortOrder'
        const sortOrder = options?.sortOrder || 'ASC'

        return this.repository.find({
          where: { deletedAt: IsNull() },
          order: { [sortBy]: sortOrder },
        })
      },
      this.defaultTTL,
    )
  }

  /**
   * Find system tags
   */
  async findSystemTags(): Promise<Tag[]> {
    const cacheKey = this.buildCacheKey('system-tags')

    return this.cacheService.wrap<Tag[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: {
            isSystem: true,
            deletedAt: IsNull(),
          },
          order: { sortOrder: 'ASC' },
        })
      },
      this.defaultTTL,
    )
  }

  /**
   * Override create to invalidate caches
   */
  async create(data: Partial<Tag>): Promise<Tag> {
    // Normalize name to lowercase
    const normalizedName = data.name ? data.name.toLowerCase().trim() : undefined
    if (normalizedName) {
      data.name = normalizedName
    }

    const tag = await super.create(data)
    
    // Invalidate relevant caches
    await Promise.all([
      normalizedName ? this.cacheService.del(this.buildCacheKey('name', normalizedName)) : Promise.resolve(),
      this.cacheService.delPattern(this.buildCacheKey('all-active', '*')),
      this.cacheService.del(this.buildCacheKey('system-tags')),
    ])

    return tag
  }

  /**
   * Override update to invalidate caches
   */
  async update(id: number, data: Partial<Tag>): Promise<Tag> {
    // Normalize name to lowercase if provided
    if (data.name) {
      data.name = data.name.toLowerCase().trim()
    }

    const tag = await super.update(id, data)
    
    // Invalidate relevant caches
    await Promise.all([
      this.cacheService.del(this.buildCacheKey('id', id.toString())),
      this.cacheService.del(this.buildCacheKey('name', tag.name)),
      this.cacheService.delPattern(this.buildCacheKey('all-active', '*')),
      this.cacheService.del(this.buildCacheKey('system-tags')),
    ])

    return tag
  }

  /**
   * Override delete to invalidate caches
   */
  async delete(id: number): Promise<boolean> {
    const tag = await this.findById(id)
    if (!tag) return false

    const result = await super.delete(id)
    
    // Invalidate relevant caches
    await Promise.all([
      this.cacheService.del(this.buildCacheKey('id', id.toString())),
      this.cacheService.del(this.buildCacheKey('name', tag.name)),
      this.cacheService.delPattern(this.buildCacheKey('all-active', '*')),
      this.cacheService.del(this.buildCacheKey('system-tags')),
    ])

    return result
  }
}
