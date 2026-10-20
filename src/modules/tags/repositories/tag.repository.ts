import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Tag } from '../entities/tag.entity'

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
    protected readonly cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find tag by name
   */
  async findByName(name: string): Promise<Tag | null> {
    const cacheKey = this.buildCacheKey('name', name.toLowerCase())

    return this.cached<Tag | null>(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: {
            name: name.toLowerCase(),
            deletedAt: IsNull()
          }
        })
      },
      this.defaultTTL
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

    return this.cached<Tag[]>(
      cacheKey,
      async () => {
        const sortBy = options?.sortBy || 'sortOrder'
        const sortOrder = options?.sortOrder || 'ASC'

        return this.repository.find({
          where: { deletedAt: IsNull() },
          order: { [sortBy]: sortOrder }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find system tags
   */
  async findSystemTags(): Promise<Tag[]> {
    const cacheKey = this.buildCacheKey('system-tags')

    return this.cached<Tag[]>(
      cacheKey,
      async () => {
        return this.repository.find({
          where: {
            isSystem: true,
            deletedAt: IsNull()
          },
          order: { sortOrder: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /** Tag names are stored lowercase */
  async create(data: Partial<Tag>): Promise<Tag> {
    // Normalize name to lowercase
    const normalizedName = data.name ? data.name.toLowerCase().trim() : undefined
    if (normalizedName) {
      data.name = normalizedName
    }

    return super.create(data)
  }

  /** Tag names are stored lowercase */
  async update(id: number, data: Partial<Tag>): Promise<Tag | null> {
    // Normalize name to lowercase if provided
    if (data.name) {
      data.name = data.name.toLowerCase().trim()
    }

    return super.update(id, data)
  }
}
