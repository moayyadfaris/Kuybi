import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { EventBus } from '@core/events'

import { AssignPermissionsDto, RemovePermissionsDto } from '../dto/assign-permissions.dto'
import { CreateRoleDto } from '../dto/create-role.dto'
import { UpdateRoleDto } from '../dto/update-role.dto'
import { Role } from '../entities/role.entity'
import { AclChangedEvent } from '../events/acl-changed.event'
import { PermissionRepository } from '../repositories/permission.repository'
import { RoleRepository } from '../repositories/role.repository'
import { AclPrincipal } from '../types/acl-principal'

/**
 * Roles and the permissions granted to them (super-admin only, see RolesController).
 * System roles keep their name and at least one permission, and cannot be deleted. Every
 * change is published as AclChangedEvent (the audit module records it).
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository,
    private readonly eventBus: EventBus
  ) {}

  async create(createRoleDto: CreateRoleDto, actor: AclPrincipal): Promise<Role> {
    if (await this.roleRepository.findByName(createRoleDto.name)) {
      throw new BadRequestException(`Role with name "${createRoleDto.name}" already exists`)
    }

    const role = await this.roleRepository.create({
      name: createRoleDto.name,
      description: createRoleDto.description,
      isSystem: createRoleDto.isSystem ?? false,
      isActive: createRoleDto.isActive ?? true,
      priority: createRoleDto.priority ?? 50
    })
    await this.publish(role.id, 'create', actor, {
      name: role.name,
      priority: role.priority,
      isSystem: role.isSystem
    })
    return role
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepository.findAll()
  }

  async findAllWithPermissions(): Promise<Role[]> {
    return this.roleRepository.findAllWithPermissions()
  }

  async findActive(): Promise<Role[]> {
    return this.roleRepository.findActive()
  }

  async findOne(id: number): Promise<Role> {
    const role = await this.roleRepository.findById(id)
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }
    return role
  }

  async findOneWithPermissions(id: number): Promise<Role> {
    const role = await this.roleRepository.findByIdWithPermissions(id)
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }
    return role
  }

  async update(id: number, updateRoleDto: UpdateRoleDto, actor: AclPrincipal): Promise<Role> {
    const role = await this.findOne(id)

    if (role.isSystem) {
      if (updateRoleDto.name && updateRoleDto.name !== role.name) {
        throw new BadRequestException('Cannot change the name of a system role')
      }
      if (updateRoleDto.isSystem === false) {
        throw new BadRequestException('Cannot change isSystem flag of a system role')
      }
    }
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      if (await this.roleRepository.findByName(updateRoleDto.name)) {
        throw new BadRequestException(`Role with name "${updateRoleDto.name}" already exists`)
      }
    }

    const updated = await this.roleRepository.update(id, updateRoleDto)
    if (!updated) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }
    await this.publish(id, 'update', actor, { ...updateRoleDto })
    return updated
  }

  /** Soft delete; the role's holders lose its permissions at once */
  async remove(id: number, actor: AclPrincipal): Promise<void> {
    const role = await this.findOne(id)
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles')
    }
    if (!(await this.roleRepository.softDelete(id))) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }
    await this.publish(id, 'delete', actor, { name: role.name })
  }

  async assignPermissions(
    id: number,
    assignPermissionsDto: AssignPermissionsDto,
    actor: AclPrincipal
  ): Promise<Role> {
    await this.findOne(id)
    const permissions = await this.permissionRepository.findByIds(
      assignPermissionsDto.permissionIds
    )
    if (permissions.length !== assignPermissionsDto.permissionIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid')
    }

    await this.roleRepository.assignPermissions(id, assignPermissionsDto.permissionIds)
    await this.publish(id, 'permission_grant', actor, {
      permissions: permissions.map(p => `${p.action} ${p.subject}`),
      permissionIds: assignPermissionsDto.permissionIds
    })
    return this.findOneWithPermissions(id)
  }

  async removePermissions(
    id: number,
    removePermissionsDto: RemovePermissionsDto,
    actor: AclPrincipal
  ): Promise<Role> {
    const role = await this.findOneWithPermissions(id)

    if (role.isSystem) {
      const removing = new Set(removePermissionsDto.permissionIds)
      if (role.rolePermissions.every(rp => removing.has(rp.permissionId))) {
        throw new BadRequestException('Cannot remove all permissions from a system role')
      }
    }

    await this.roleRepository.removePermissions(id, removePermissionsDto.permissionIds)
    await this.publish(id, 'permission_revoke', actor, {
      permissionIds: removePermissionsDto.permissionIds
    })
    return this.findOneWithPermissions(id)
  }

  async getRolePermissions(id: number) {
    const role = await this.findOneWithPermissions(id)
    return role.rolePermissions.map(rp => rp.permission)
  }

  private publish(
    roleId: number,
    change: AclChangedEvent['change'],
    actor: AclPrincipal,
    details: Record<string, unknown>
  ): Promise<void> {
    return this.eventBus.publish(
      new AclChangedEvent('Role', roleId, change, { id: actor.id, email: actor.email }, details)
    )
  }
}
