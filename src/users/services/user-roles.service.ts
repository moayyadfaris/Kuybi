import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserRole } from '../../acl/entities/user-role.entity'
import { User } from '../entities/user.entity'
import { Role } from '../../acl/entities/role.entity'
import { AssignRoleDto } from '../../acl/dto/assign-role.dto'

@Injectable()
export class UserRolesService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['userRoles', 'userRoles.role'],
    })

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        priority: ur.role.priority,
        isActive: ur.isActive,
        expiresAt: ur.expiresAt,
        assignedAt: ur.createdAt,
      })),
    }
  }

  /**
   * Assign a role to a user
   */
  async assignRole(userId: string, assignRoleDto: AssignRoleDto) {
    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    // Verify role exists
    const role = await this.roleRepository.findOne({
      where: { id: assignRoleDto.roleId },
    })

    if (!role) {
      throw new NotFoundException(`Role with ID ${assignRoleDto.roleId} not found`)
    }

    // Check if role is already assigned
    const existing = await this.userRoleRepository.findOne({
      where: { userId, roleId: assignRoleDto.roleId },
    })

    if (existing) {
      throw new ConflictException('Role is already assigned to this user')
    }

    // Validate expiration date if provided
    if (assignRoleDto.expiresAt) {
      const expirationDate = new Date(assignRoleDto.expiresAt)
      if (expirationDate <= new Date()) {
        throw new BadRequestException('Expiration date must be in the future')
      }
    }

    // Create role assignment
    const userRole = this.userRoleRepository.create({
      userId,
      roleId: assignRoleDto.roleId,
      isActive: assignRoleDto.isActive ?? true,
      expiresAt: assignRoleDto.expiresAt ? new Date(assignRoleDto.expiresAt) : null,
    })

    const saved = await this.userRoleRepository.save(userRole)

    return {
      message: 'Role assigned successfully',
      userRole: {
        id: saved.id,
        userId: saved.userId,
        roleId: saved.roleId,
        roleName: role.name,
        isActive: saved.isActive,
        expiresAt: saved.expiresAt,
        createdAt: saved.createdAt,
      },
    }
  }

  /**
   * Revoke a role from a user
   */
  async revokeRole(userId: string, roleId: number): Promise<void> {
    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId },
    })

    if (!userRole) {
      throw new NotFoundException('User role assignment not found')
    }

    await this.userRoleRepository.remove(userRole)
  }

  /**
   * Activate a user role assignment
   */
  async activateRole(userId: string, roleId: number) {
    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId },
      relations: ['role'],
    })

    if (!userRole) {
      throw new NotFoundException('User role assignment not found')
    }

    userRole.isActive = true
    const updated = await this.userRoleRepository.save(userRole)

    return {
      message: 'Role activated successfully',
      userRole: {
        id: updated.id,
        userId: updated.userId,
        roleId: updated.roleId,
        roleName: updated.role.name,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt,
      },
    }
  }

  /**
   * Deactivate a user role assignment
   */
  async deactivateRole(userId: string, roleId: number) {
    const userRole = await this.userRoleRepository.findOne({
      where: { userId, roleId },
      relations: ['role'],
    })

    if (!userRole) {
      throw new NotFoundException('User role assignment not found')
    }

    userRole.isActive = false
    const updated = await this.userRoleRepository.save(userRole)

    return {
      message: 'Role deactivated successfully',
      userRole: {
        id: updated.id,
        userId: updated.userId,
        roleId: updated.roleId,
        roleName: updated.role.name,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt,
      },
    }
  }
}
