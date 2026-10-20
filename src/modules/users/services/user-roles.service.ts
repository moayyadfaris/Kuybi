import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { isUniqueViolation } from '@shared/utils/database-error.util'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'

import { AssignRoleDto, RoleRepository, UserRoleRepository } from '@modules/acl'
import { UserRole } from '@modules/acl/entities'
import { AuditService } from '@modules/audit'
import { AuditAction, AuditSeverity } from '@modules/audit/entities'

import { User } from '../entities/user.entity'
import { UserRepository } from '../repositories/user.repository'

type RoleChange = 'assigned' | 'revoked' | 'activated' | 'deactivated'

/**
 * Additional roles of a user (on top of the primary role). Route guards check the
 * permission and that the role ranks below the caller's (RoleHierarchyGuard); here the
 * target user must rank below the caller too. Every change is audited and clears the
 * user's cached row, which embeds the roles.
 */
@Injectable()
export class UserRolesService {
  constructor(
    @InjectPinoLogger(UserRolesService.name)
    private readonly logger: PinoLogger,
    private readonly userRoleRepository: UserRoleRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly auditService: AuditService
  ) {}

  async getUserRoles(userId: string) {
    // Loaded with its role assignments (UserRepository relations)
    const user = await this.userRepository.findById(userId)
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roles: user.userRoles.map(ur => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        priority: ur.role.priority,
        isActive: ur.isActive,
        expiresAt: ur.expiresAt,
        assignedAt: ur.createdAt
      }))
    }
  }

  async assignRole(userId: string, assignRoleDto: AssignRoleDto, assignedBy: User) {
    const user = await this.manageableUser(userId, assignedBy)
    const role = await this.roleRepository.findById(assignRoleDto.roleId)
    if (!role) {
      throw new NotFoundException(`Role with ID ${assignRoleDto.roleId} not found`)
    }
    if (await this.userRoleRepository.findAssignment(userId, assignRoleDto.roleId)) {
      throw new ConflictException('Role is already assigned to this user')
    }
    if (assignRoleDto.expiresAt && new Date(assignRoleDto.expiresAt) <= new Date()) {
      throw new BadRequestException('Expiration date must be in the future')
    }

    let saved: UserRole
    try {
      saved = await this.userRoleRepository.create({
        userId,
        roleId: assignRoleDto.roleId,
        assignedBy: assignedBy.id,
        isActive: assignRoleDto.isActive ?? true,
        expiresAt: assignRoleDto.expiresAt ? new Date(assignRoleDto.expiresAt) : null
      })
    } catch (error) {
      // A concurrent request assigned it between the check above and the insert
      if (isUniqueViolation(error)) {
        throw new ConflictException('Role is already assigned to this user')
      }
      throw error
    }
    await this.userRepository.invalidateCacheByEntityId(userId)
    await this.record('assigned', { ...saved, role }, user, assignedBy)

    return {
      message: 'Role assigned successfully',
      userRole: {
        id: saved.id,
        userId: saved.userId,
        roleId: saved.roleId,
        roleName: role.name,
        isActive: saved.isActive,
        expiresAt: saved.expiresAt,
        createdAt: saved.createdAt
      }
    }
  }

  async revokeRole(userId: string, roleId: number, revokedBy: User): Promise<void> {
    const user = await this.manageableUser(userId, revokedBy)
    const userRole = await this.findAssignment(userId, roleId)

    await this.userRoleRepository.remove(userRole)
    await this.userRepository.invalidateCacheByEntityId(userId)
    await this.record('revoked', userRole, user, revokedBy)
  }

  async activateRole(userId: string, roleId: number, changedBy: User) {
    return this.setActive(userId, roleId, true, changedBy)
  }

  async deactivateRole(userId: string, roleId: number, changedBy: User) {
    return this.setActive(userId, roleId, false, changedBy)
  }

  private async setActive(userId: string, roleId: number, isActive: boolean, changedBy: User) {
    const user = await this.manageableUser(userId, changedBy)
    const userRole = await this.findAssignment(userId, roleId)

    userRole.isActive = isActive
    const updated = await this.userRoleRepository.save(userRole)
    await this.userRepository.invalidateCacheByEntityId(userId)
    await this.record(isActive ? 'activated' : 'deactivated', updated, user, changedBy)

    return {
      message: `Role ${isActive ? 'activated' : 'deactivated'} successfully`,
      userRole: {
        id: updated.id,
        userId: updated.userId,
        roleId: updated.roleId,
        roleName: updated.role.name,
        isActive: updated.isActive,
        expiresAt: updated.expiresAt
      }
    }
  }

  /** The target user, if the caller outranks them (super-admins manage everyone) */
  private async manageableUser(userId: string, caller: User): Promise<User> {
    // Fresh read: canManageUser and getHighestPriorityRole are entity methods
    const user = await this.userRepository.findById(userId, { bypassCache: true })
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`)
    }
    if (!caller.canManageUser(user)) {
      throw new ForbiddenException('Cannot change the roles of a user ranked at or above you')
    }
    return user
  }

  private async findAssignment(userId: string, roleId: number): Promise<UserRole> {
    const userRole = await this.userRoleRepository.findAssignment(userId, roleId, { role: true })
    if (!userRole) {
      throw new NotFoundException('User role assignment not found')
    }
    return userRole
  }

  /** Log and audit trail (critical: role changes change permissions) */
  private async record(change: RoleChange, userRole: UserRole, user: User, by: User) {
    const grants = change === 'assigned' || change === 'activated'
    this.logger.info(
      { action: `role_${change}`, userId: user.id, roleId: userRole.role.id, by: by.id },
      `Role "${userRole.role.name}" ${change} for user ${user.id}`
    )
    await this.auditService.logAction(
      { userId: by.id, username: by.name, email: by.email },
      {
        action: grants ? AuditAction.ROLE_ASSIGN : AuditAction.ROLE_REVOKE,
        entityType: 'UserRole',
        entityId: String(userRole.id),
        [grants ? 'newValues' : 'previousValues']: {
          userId: user.id,
          roleId: userRole.role.id,
          roleName: userRole.role.name,
          isActive: userRole.isActive,
          expiresAt: userRole.expiresAt
        },
        severity: AuditSeverity.CRITICAL,
        description: `Role "${userRole.role.name}" ${change} for user ${user.email}`,
        metadata: {
          change,
          targetUserId: user.id,
          targetUserEmail: user.email,
          rolePriority: userRole.role.priority
        }
      }
    )
  }
}
