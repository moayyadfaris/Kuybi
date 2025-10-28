import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PermissionRepository } from '@core/database/repositories/permission.repository'
import { CreatePermissionDto } from '../dto/create-permission.dto'
import { UpdatePermissionDto } from '../dto/update-permission.dto'
import { Permission } from '../entities/permission.entity'
import { Action } from '../types/actions.enum'
import { Subject } from '../types/subjects.enum'

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionRepository: PermissionRepository
  ) {}

  /**
   * Create a new permission
   */
  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    // Check if permission already exists
    const existing = await this.permissionRepository.findByActionAndSubject(
      createPermissionDto.action,
      createPermissionDto.subject
    )

    if (existing) {
      throw new BadRequestException(
        `Permission for action "${createPermissionDto.action}" on subject "${createPermissionDto.subject}" already exists`
      )
    }

    const permission = await this.permissionRepository.create({
      action: createPermissionDto.action,
      subject: createPermissionDto.subject,
      conditions: createPermissionDto.conditions ?? {},
      fields: createPermissionDto.fields ?? [],
      inverted: createPermissionDto.inverted ?? false,
      reason: createPermissionDto.reason,
    })

    return permission
  }

  /**
   * Get all permissions
   */
  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.findAll()
  }

  /**
   * Get permission by ID
   */
  async findOne(id: number): Promise<Permission> {
    const permission = await this.permissionRepository.findById(id)
    
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }

    return permission
  }

  /**
   * Find permissions by action
   */
  async findByAction(action: Action): Promise<Permission[]> {
    return this.permissionRepository.findByAction(action)
  }

  /**
   * Find permissions by subject
   */
  async findBySubject(subject: Subject): Promise<Permission[]> {
    return this.permissionRepository.findBySubject(subject)
  }

  /**
   * Find permission by action and subject
   */
  async findByActionAndSubject(action: Action, subject: Subject): Promise<Permission | null> {
    return this.permissionRepository.findByActionAndSubject(action, subject)
  }

  /**
   * Update a permission
   */
  async update(id: number, updatePermissionDto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id)

    // If action or subject is being changed, check for duplicates
    if (
      (updatePermissionDto.action && updatePermissionDto.action !== permission.action) ||
      (updatePermissionDto.subject && updatePermissionDto.subject !== permission.subject)
    ) {
      const action = updatePermissionDto.action ?? permission.action
      const subject = updatePermissionDto.subject ?? permission.subject

      const existing = await this.permissionRepository.findByActionAndSubject(action, subject)
      
      if (existing && existing.id !== id) {
        throw new BadRequestException(
          `Permission for action "${action}" on subject "${subject}" already exists`
        )
      }
    }

    const updated = await this.permissionRepository.update(id, updatePermissionDto)
    
    if (!updated) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }

    return updated
  }

  /**
   * Delete a permission
   */
  async remove(id: number): Promise<void> {
    const deleted = await this.permissionRepository.delete(id)
    
    if (!deleted) {
      throw new NotFoundException(`Permission with ID ${id} not found`)
    }
  }
}
