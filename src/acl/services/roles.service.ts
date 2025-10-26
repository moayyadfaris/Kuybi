import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { RoleRepository } from '../../database/repositories/role.repository'
import { PermissionRepository } from '../../database/repositories/permission.repository'
import { CreateRoleDto } from '../dto/create-role.dto'
import { UpdateRoleDto } from '../dto/update-role.dto'
import { AssignPermissionsDto, RemovePermissionsDto } from '../dto/assign-permissions.dto'
import { Role } from '../entities/role.entity'

@Injectable()
export class RolesService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly permissionRepository: PermissionRepository
  ) {}

  /**
   * Create a new role
   */
  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    // Check if role name already exists
    const existingRole = await this.roleRepository.findByName(createRoleDto.name)
    
    if (existingRole) {
      throw new BadRequestException(`Role with name "${createRoleDto.name}" already exists`)
    }

    const role = await this.roleRepository.create({
      name: createRoleDto.name,
      description: createRoleDto.description,
      isSystem: createRoleDto.isSystem ?? false,
      isActive: createRoleDto.isActive ?? true,
      priority: createRoleDto.priority ?? 50,
    })

    return role
  }

  /**
   * Get all roles
   */
  async findAll(): Promise<Role[]> {
    return this.roleRepository.findAll()
  }

  /**
   * Get all active roles
   */
  async findActive(): Promise<Role[]> {
    return this.roleRepository.findActive()
  }

  /**
   * Get role by ID
   */
  async findOne(id: number): Promise<Role> {
    const role = await this.roleRepository.findById(id)
    
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }

    return role
  }

  /**
   * Get role with permissions
   */
  async findOneWithPermissions(id: number): Promise<Role> {
    const role = await this.roleRepository.findByIdWithPermissions(id)
    
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }

    return role
  }

  /**
   * Update a role
   */
  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id)

    // Prevent updating system roles' critical properties
    if (role.isSystem) {
      if (updateRoleDto.name && updateRoleDto.name !== role.name) {
        throw new BadRequestException('Cannot change the name of a system role')
      }
      if (updateRoleDto.isSystem === false) {
        throw new BadRequestException('Cannot change isSystem flag of a system role')
      }
    }

    // Check if new name already exists
    if (updateRoleDto.name && updateRoleDto.name !== role.name) {
      const existingRole = await this.roleRepository.findByName(updateRoleDto.name)
      if (existingRole) {
        throw new BadRequestException(`Role with name "${updateRoleDto.name}" already exists`)
      }
    }

    const updated = await this.roleRepository.update(id, updateRoleDto)
    
    if (!updated) {
      throw new NotFoundException(`Role with ID ${id} not found`)
    }

    return updated
  }

  /**
   * Delete a role (soft delete)
   */
  async remove(id: number): Promise<void> {
    try {
      const deleted = await this.roleRepository.softDelete(id)
      
      if (!deleted) {
        throw new NotFoundException(`Role with ID ${id} not found`)
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Cannot delete system roles') {
        throw new BadRequestException('Cannot delete system roles')
      }
      throw error
    }
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissions(id: number, assignPermissionsDto: AssignPermissionsDto): Promise<Role> {
    // Verify role exists
    const role = await this.findOne(id)

    // Verify all permissions exist
    const permissions = await this.permissionRepository.findByIds(assignPermissionsDto.permissionIds)
    
    if (permissions.length !== assignPermissionsDto.permissionIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid')
    }

    // Assign permissions
    await this.roleRepository.assignPermissions(id, assignPermissionsDto.permissionIds)

    // Return updated role with permissions
    return this.findOneWithPermissions(id)
  }

  /**
   * Remove permissions from a role
   */
  async removePermissions(id: number, removePermissionsDto: RemovePermissionsDto): Promise<Role> {
    // Verify role exists
    const role = await this.findOne(id)

    // Prevent removing all permissions from system roles
    if (role.isSystem) {
      const roleWithPermissions = await this.findOneWithPermissions(id)
      const remainingPermissions = roleWithPermissions.rolePermissions.length - removePermissionsDto.permissionIds.length
      
      if (remainingPermissions === 0) {
        throw new BadRequestException('Cannot remove all permissions from a system role')
      }
    }

    // Remove permissions
    await this.roleRepository.removePermissions(id, removePermissionsDto.permissionIds)

    // Return updated role with permissions
    return this.findOneWithPermissions(id)
  }

  /**
   * Get all permissions for a role
   */
  async getRolePermissions(id: number) {
    const role = await this.findOneWithPermissions(id)
    
    return role.rolePermissions.map((rp) => rp.permission)
  }
}
