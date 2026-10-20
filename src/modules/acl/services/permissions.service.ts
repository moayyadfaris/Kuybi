import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { EventBus } from '@core/events'

import { CreatePermissionDto } from '../dto/create-permission.dto'
import { UpdatePermissionDto } from '../dto/update-permission.dto'
import { Permission } from '../entities/permission.entity'
import { AclChangedEvent } from '../events/acl-changed.event'
import { PermissionRepository } from '../repositories/permission.repository'
import { RoleRepository } from '../repositories/role.repository'
import { AclPrincipal } from '../types/acl-principal'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

/**
 * Permissions (CASL rules) that roles grant (super-admin only, see PermissionsController).
 * A permission is identified by action, subject and conditions together. Changes clear
 * the cached roles that embed it and are published as AclChangedEvent (audited).
 */
@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionRepository: PermissionRepository,
    private readonly roleRepository: RoleRepository,
    private readonly eventBus: EventBus
  ) {}

  async create(dto: CreatePermissionDto, actor: AclPrincipal): Promise<Permission> {
    await this.assertNoEquivalent(dto.action, dto.subject, dto.conditions ?? {})

    const permission = await this.permissionRepository.create({
      action: dto.action,
      subject: dto.subject,
      conditions: dto.conditions ?? {},
      fields: dto.fields ?? [],
      inverted: dto.inverted ?? false,
      reason: dto.reason
    })
    await this.publish(permission, 'create', actor, { ...dto })
    return permission
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.findAll()
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.permissionRepository.findById(id)
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }
    return permission
  }

  async findByAction(action: Action): Promise<Permission[]> {
    return this.permissionRepository.findByAction(action)
  }

  async findBySubject(subject: Subject): Promise<Permission[]> {
    return this.permissionRepository.findBySubject(subject)
  }

  async findByActionAndSubject(action: Action, subject: Subject): Promise<Permission | null> {
    return this.permissionRepository.findByActionAndSubject(action, subject)
  }

  async update(id: number, dto: UpdatePermissionDto, actor: AclPrincipal): Promise<Permission> {
    const permission = await this.findOne(id)
    const action = dto.action ?? permission.action
    const subject = dto.subject ?? permission.subject
    const conditions = dto.conditions ?? permission.conditions ?? {}
    if (
      action !== permission.action ||
      subject !== permission.subject ||
      JSON.stringify(conditions) !== JSON.stringify(permission.conditions ?? {})
    ) {
      await this.assertNoEquivalent(action, subject, conditions, id)
    }

    const updated = await this.permissionRepository.update(id, dto)
    if (!updated) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }
    // Roles are cached with their permissions embedded
    await this.roleRepository.invalidateCacheByTag()
    await this.publish(updated, 'update', actor, { ...dto })
    return updated
  }

  /** Deleting a permission also removes it from every role (cascade) */
  async remove(id: number, actor: AclPrincipal): Promise<void> {
    const permission = await this.findOne(id)
    if (!(await this.permissionRepository.delete(id))) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }
    await this.roleRepository.invalidateCacheByTag()
    await this.publish(permission, 'delete', actor, {})
  }

  private async assertNoEquivalent(
    action: Action,
    subject: Subject,
    conditions: Record<string, unknown>,
    exceptId?: number
  ): Promise<void> {
    const existing = await this.permissionRepository.findEquivalent(action, subject, conditions)
    if (existing && existing.id !== exceptId) {
      throw new BadRequestException(
        `Permission for action "${action}" on subject "${subject}" with these conditions already exists`
      )
    }
  }

  private publish(
    permission: Permission,
    change: AclChangedEvent['change'],
    actor: AclPrincipal,
    details: Record<string, unknown>
  ): Promise<void> {
    return this.eventBus.publish(
      new AclChangedEvent(
        'Permission',
        permission.id,
        change,
        { id: actor.id, email: actor.email },
        { rule: `${permission.action} ${permission.subject}`, ...details }
      )
    )
  }
}
