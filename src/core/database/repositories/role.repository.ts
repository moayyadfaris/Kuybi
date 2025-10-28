import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BaseRepository } from './base.repository'
import { CacheService } from '../../cache/services/cache.service'
import { Role } from '@modules/acl/entities/role.entity'

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
  async findByName(name: string): Promise<Role | null> {
    const cacheKey = this.buildCacheKey('name', name)
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { name, deletedAt: null },
          relations: ['rolePermissions', 'rolePermissions.permission'],
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all active roles
   */
  async findActive(): Promise<Role[]> {
    const cacheKey = this.buildCacheKey('active')
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isActive: true, deletedAt: null },
          order: { priority: 'DESC', name: 'ASC' },
        })
      },
      this.defaultTTL
    )
  }

  /**
   * Find all system roles
   */
  async findSystemRoles(): Promise<Role[]> {
    const cacheKey = this.buildCacheKey('system')
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.find({
          where: { isSystem: true, deletedAt: null },
          order: { priority: 'DESC' },
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
    
    return this.cacheService.wrap(
      cacheKey,
      async () => {
        return this.repository.findOne({
          where: { id, deletedAt: null },
          relations: ['rolePermissions', 'rolePermissions.permission'],
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
    const existingPermissionIds = role.rolePermissions.map((rp) => rp.permissionId)
    const newPermissionIds = permissionIds.filter((id) => !existingPermissionIds.includes(id))

    if (newPermissionIds.length > 0) {
      await this.repository
        .createQueryBuilder()
        .insert()
        .into('role_permissions')
        .values(
          newPermissionIds.map((permissionId) => ({
            roleId,
            permissionId,
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
   * Soft delete a role
   */
  async softDelete(id: number): Promise<boolean> {
    const role = await this.findById(id)
    
    if (!role) {
      return false
    }

    if (role.isSystem) {
      throw new Error('Cannot delete system roles')
    }

    const result = await this.repository.update(
      { id },
      { deletedAt: new Date() }
    )

    if (result.affected && result.affected > 0) {
      await this.clearCache()
      return true
    }

    return false
  }

  /**
   * Clear all role-related caches
   */
  private async clearCache(): Promise<void> {
    const pattern = this.buildCacheKey('*')
    await this.cacheService.del(pattern)
  }
}
