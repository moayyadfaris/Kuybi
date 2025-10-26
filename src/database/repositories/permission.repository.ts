import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from './base.repository'
import { CacheService } from '../../cache/services/cache.service'
import { Permission } from '../../acl/entities/permission.entity'
import { Action } from '../../acl/types/actions.enum'
import { Subject } from '../../acl/types/subjects.enum'

@Injectable()
export class PermissionRepository extends BaseRepository<Permission> {
  protected entityName = 'permission'
  protected defaultTTL = 900 // 15 minutes cache

  constructor(
    @InjectRepository(Permission)
    repository: Repository<Permission>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find permission by action and subject
   */
  async findByActionAndSubject(action: Action, subject: Subject): Promise<Permission | null> {
    const cacheKey = this.buildCacheKey('action-subject', action, subject)
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { action, subject },
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all permissions by action
   */
  async findByAction(action: Action): Promise<Permission[]> {
    const cacheKey = this.buildCacheKey('action', action)
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { action },
          order: { subject: 'ASC' },
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all permissions by subject
   */
  async findBySubject(subject: Subject): Promise<Permission[]> {
    const cacheKey = this.buildCacheKey('subject', subject)
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { subject },
          order: { action: 'ASC' },
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find permissions by multiple IDs
   */
  async findByIds(ids: number[]): Promise<Permission[]> {
    if (ids.length === 0) {
      return []
    }

    const cacheKey = this.buildCacheKey('ids', ids.join(','))
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository
          .createQueryBuilder('permission')
          .whereInIds(ids)
          .getMany()
      },
      this.defaultTTL
    )
  }

  /**
   * Clear all permission-related caches
   */
  async clearCache(): Promise<void> {
    const pattern = this.buildCacheKey('*')
    await this.cacheService.del(pattern)
  }
}
