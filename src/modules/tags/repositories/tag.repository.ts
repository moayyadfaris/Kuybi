import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { startsWithPattern } from '@shared/utils/like.util'
import { IsNull, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Tag } from '../entities/tag.entity'

export interface TagListOptions {
  sortBy?: 'name' | 'sortOrder' | 'createdAt'
  sortOrder?: 'ASC' | 'DESC'
  /** Names starting with this (case-insensitive) */
  search?: string
  limit: number
  offset?: number
}

/** Stored form of a tag name: trimmed and lowercase */
export const normalizeTagName = (name: string): string => name.trim().toLowerCase()

/** Live (not deleted) tags, cached under the cache contract (ADR 0003) */
@Injectable()
export class TagRepository extends BaseRepository<Tag> {
  protected entityName = 'tag'
  protected defaultTTL = 1800 // 30 minutes for tags (relatively static)

  constructor(@InjectRepository(Tag) repository: Repository<Tag>, cacheService: CacheService) {
    super(repository, cacheService)
  }

  /** The live tag with this name (compared in stored form) */
  findByName(name: string): Promise<Tag | null> {
    const normalized = normalizeTagName(name)
    return this.cached(this.buildCacheKey('name', normalized), () =>
      this.repository.findOne({ where: { name: normalized, deletedAt: IsNull() } })
    )
  }

  /** A page of live tags */
  list(options: TagListOptions): Promise<Tag[]> {
    return this.cached(this.buildCacheKey('list', JSON.stringify(options)), () => {
      const query = this.repository
        .createQueryBuilder('tag')
        .where('tag.deletedAt IS NULL')
        .orderBy(`tag.${options.sortBy ?? 'sortOrder'}`, options.sortOrder ?? 'ASC')
        .addOrderBy('tag.id', 'ASC')
        .offset(options.offset ?? 0)
        .limit(options.limit)
      if (options.search) {
        query.andWhere('tag.name LIKE :pattern', {
          pattern: startsWithPattern(normalizeTagName(options.search))
        })
      }
      return query.getMany()
    })
  }

  findSystemTags(): Promise<Tag[]> {
    return this.cached(this.buildCacheKey('system-tags'), () =>
      this.repository.find({
        where: { isSystem: true, deletedAt: IsNull() },
        order: { sortOrder: 'ASC', id: 'ASC' }
      })
    )
  }

  async create(data: Partial<Tag>): Promise<Tag> {
    return super.create(data.name ? { ...data, name: normalizeTagName(data.name) } : data)
  }

  async update(id: number, data: Partial<Tag>): Promise<Tag | null> {
    return super.update(id, data.name ? { ...data, name: normalizeTagName(data.name) } : data)
  }

  async updateIfVersion(id: number, expectedVersion: number, data: Partial<Tag>) {
    return super.updateIfVersion(
      id,
      expectedVersion,
      data.name ? { ...data, name: normalizeTagName(data.name) } : data
    )
  }
}
