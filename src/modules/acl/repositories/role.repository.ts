import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'

import { CacheService } from '@core/cache/services/cache.service'
import { BaseRepository } from '@core/database/repositories/base.repository'

import { findDefaultRoleId } from '../default-role'
import { Role } from '../entities/role.entity'

@Injectable()
export class RoleRepository extends BaseRepository<Role> {
  protected entityName = 'role'
  protected defaultTTL = 900 // 15 minutes cache

  constructor(
    @InjectRepository(Role)
    repository: Repository<Role>,
    cacheService: CacheService
  ) {
    super(repository, cacheService)
  }

  /**
   * Find role by name
   */
  /** Id of the role given to new users unless one is specified (see default-role.ts) */
  findDefaultRoleId(): Promise<number> {
    return findDefaultRoleId(this.repository)
  }

  async findByName(name: string): Promise<Role | null> {
    const cacheKey = this.buildCacheKey('name', name)

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { name, deletedAt: IsNull() },
          relations: { rolePermissions: { permission: true } }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all active roles
   */
  /** Every role except deleted ones (deleted roles stay in the table for history) */
  async findAll(): Promise<Role[]> {
    return this.cached(this.buildCacheKey('all'), () =>
      this.repository.find({ where: { deletedAt: IsNull() }, order: { priority: 'DESC' } })
    )
  }

  async findActive(): Promise<Role[]> {
    const cacheKey = this.buildCacheKey('active')

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true, deletedAt: IsNull() },
          order: { priority: 'DESC', name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all roles with permissions
   */
  async findAllWithPermissions(): Promise<Role[]> {
    const cacheKey = this.buildCacheKey('all-with-permissions')

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { deletedAt: IsNull() },
          relations: { rolePermissions: { permission: true } },
          order: { priority: 'DESC', name: 'ASC' }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find role with all permissions
   */
  async findByIdWithPermissions(id: number): Promise<Role | null> {
    const cacheKey = this.buildCacheKey('id-with-permissions', id.toString())

    return this.cached(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { id, deletedAt: IsNull() },
          relations: { rolePermissions: { permission: true } }
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissions(roleId: number, permissionIds: number[]): Promise<void> {
    const role = await this.findByIdWithPermissions(roleId)
    if (!role) {
      throw new Error('Role not found')
    }

    // Add new permissions (avoiding duplicates)
    const existingPermissionIds = role.rolePermissions.map(rp => rp.permissionId)
    const newPermissionIds = permissionIds.filter(id => !existingPermissionIds.includes(id))

    if (newPermissionIds.length > 0) {
      await this.repository
        .createQueryBuilder()
        .insert()
        .into('role_permissions')
        .values(
          newPermissionIds.map(permissionId => ({
            roleId,
            permissionId
          }))
        )
        .execute()
    }

    await this.clearCache()
  }

  /**
   * Remove permissions from a role
   */
  async removePermissions(roleId: number, permissionIds: number[]): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .delete()
      .from('role_permissions')
      .where('roleId = :roleId', { roleId })
      .andWhere('permissionId IN (:...permissionIds)', { permissionIds })
      .execute()

    await this.clearCache()
  }

  /**
   * Soft-deletes the role and deactivates it: users who hold it (as primary or additional
   * role) lose its permissions at once, since abilities skip inactive roles
   * @returns false when there was no live role with this id
   */
  async softDelete(id: number): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Role)
      .set({ deletedAt: new Date(), isActive: false })
      .where('id = :id', { id })
      .andWhere('"deletedAt" IS NULL')
      .execute()

    if (!result.affected) return false
    await this.clearCache()
    return true
  }

  /**
   * Drops every cached role entry (rows with their permissions, lists). The raw writes
   * above bypass the base write methods, and del('role:*') never matched anything: del
   * takes a key, not a pattern.
   */
  private async clearCache(): Promise<void> {
    await this.invalidateCacheByTag()
  }
}
