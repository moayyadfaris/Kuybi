import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsRelations, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { UserRole } from '../entities/user-role.entity'

/**
 * Role assignments. Nothing is cached here, but the users module caches each user
 * together with its roles: whoever changes an assignment must also invalidate that
 * user (UserRepository.invalidateCacheByEntityId).
 */
@Injectable()
export class UserRoleRepository extends BaseRepository<UserRole> {
  protected entityName = 'user_role'

  constructor(
    @InjectRepository(UserRole)
    repository: Repository<UserRole>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  findAssignment(
    userId: string,
    roleId: number,
    relations?: FindOptionsRelations<UserRole>
  ): Promise<UserRole | null> {
    return this.repository.findOne({ where: { userId, roleId }, relations })
  }

  async remove(userRole: UserRole): Promise<void> {
    await this.delete(userRole.id)
  }
}
