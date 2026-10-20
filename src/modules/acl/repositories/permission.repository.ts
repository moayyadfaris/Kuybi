import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { Permission } from '../entities/permission.entity'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

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
  /**
   * The permission with exactly this action, subject and conditions (the same action and
   * subject can exist with different conditions, e.g. update own vs any story)
   */
  findEquivalent(
    action: Action,
    subject: Subject,
    conditions: Record<string, unknown> = {}
  ): Promise<Permission | null> {
    return this.repository
      .createQueryBuilder('permission')
      .where('permission.action = :action', { action })
      .andWhere('permission.subject = :subject', { subject })
      .andWhere(`COALESCE(permission.conditions, '{}'::jsonb) = CAST(:conditions AS jsonb)`, {
        conditions: JSON.stringify(conditions)
      })
      .getOne()
  }

  /** The first permission for this action and subject, whatever its conditions */
  async findByActionAndSubject(action: Action, subject: Subject): Promise<Permission | null> {
    const cacheKey = this.buildCacheKey('action-subject', action, subject)

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { action, subject }
        })
      },
      this.defaultTTL,
      { selection: true }
    )
  }

  /**
   * Find all permissions by action
   */
  async findByAction(action: Action): Promise<Permission[]> {
    const cacheKey = this.buildCacheKey('action', action)

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { action },
          order: { subject: 'ASC' }
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

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { subject },
          order: { action: 'ASC' }
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

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.createQueryBuilder('permission').whereInIds(ids).getMany()
      },
      this.defaultTTL
    )
  }
}
