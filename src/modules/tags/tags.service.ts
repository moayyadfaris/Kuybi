import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { Tag } from './entities/tag.entity'
import { TagRepository } from '@core/database/repositories/tag.repository'
import { CreateTagDto, UpdateTagDto } from './dto'

@Injectable()
export class TagsService {
  constructor(
    private readonly tagRepository: TagRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TagsService.name)
  }

  /**
   * Create a new tag
   */
  async create(createTagDto: CreateTagDto, userId: string): Promise<Tag> {
    this.logger.info({ action: 'create_tag', userId, name: createTagDto.name }, 'Creating tag')

    try {
      // Check if tag already exists
      const existing = await this.tagRepository.findByName(createTagDto.name)
      if (existing) {
        throw new ConflictException(`Tag with name "${createTagDto.name}" already exists`)
      }

      const tag = await this.tagRepository.create({
        ...createTagDto,
        name: createTagDto.name.toLowerCase().trim(),
        createdBy: userId,
        sortOrder: createTagDto.sortOrder ?? 0,
        isSystem: createTagDto.isSystem ?? false,
      })

      this.logger.info(
        { action: 'create_tag', tagId: tag.id, userId, name: tag.name },
        'Tag created successfully',
      )

      return tag
    } catch (error) {
      this.logger.error(
        { action: 'create_tag', userId, error: error.message },
        'Failed to create tag',
      )
      throw error
    }
  }

  /**
   * Find all tags
   */
  async findAll(options?: {
    sortBy?: 'name' | 'sortOrder' | 'createdAt'
    sortOrder?: 'ASC' | 'DESC'
  }): Promise<Tag[]> {
    return this.tagRepository.findAllActive(options)
  }

  /**
   * Find tag by ID
   */
  async findOne(id: number): Promise<Tag> {
    const tag = await this.tagRepository.findById(id)

    if (!tag || tag.deletedAt) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }

    return tag
  }

  /**
   * Find tag by name
   */
  async findByName(name: string): Promise<Tag | null> {
    return this.tagRepository.findByName(name)
  }

  /**
   * Find or create tag by name
   */
  async findOrCreate(name: string, userId: string): Promise<Tag> {
    const existing = await this.findByName(name)
    if (existing) {
      return existing
    }

    return this.create({ name: name.toLowerCase().trim() }, userId)
  }

  /**
   * Find system tags
   */
  async findSystemTags(): Promise<Tag[]> {
    return this.tagRepository.findSystemTags()
  }

  /**
   * Update tag
   */
  async update(id: number, updateTagDto: UpdateTagDto, userId: string): Promise<Tag> {
    this.logger.info({ action: 'update_tag', tagId: id, userId }, 'Updating tag')

    try {
      const tag = await this.findOne(id)

      // Check if new name conflicts with existing tag
      if (updateTagDto.name && updateTagDto.name.toLowerCase() !== tag.name) {
        const existing = await this.tagRepository.findByName(updateTagDto.name)
        if (existing) {
          throw new ConflictException(`Tag with name "${updateTagDto.name}" already exists`)
        }
      }

      // Prevent modification of system tags by non-admins (simplified)
      if (tag.isSystem) {
        throw new BadRequestException('Cannot modify system tags')
      }

      const updated = await this.tagRepository.update(id, {
        ...updateTagDto,
        updatedBy: userId,
        version: tag.version + 1,
      })

      this.logger.info(
        { action: 'update_tag', tagId: id, userId },
        'Tag updated successfully',
      )

      return updated
    } catch (error) {
      this.logger.error(
        { action: 'update_tag', tagId: id, userId, error: error.message },
        'Failed to update tag',
      )
      throw error
    }
  }

  /**
   * Soft delete tag
   */
  async remove(id: number, userId: string): Promise<void> {
    this.logger.info({ action: 'delete_tag', tagId: id, userId }, 'Deleting tag')

    try {
      const tag = await this.findOne(id)

      // Prevent deletion of system tags
      if (tag.isSystem) {
        throw new BadRequestException('Cannot delete system tags')
      }

      await this.tagRepository.update(id, {
        deletedAt: new Date(),
        deletedBy: userId,
      })

      this.logger.info({ action: 'delete_tag', tagId: id, userId }, 'Tag deleted successfully')
    } catch (error) {
      this.logger.error(
        { action: 'delete_tag', tagId: id, userId, error: error.message },
        'Failed to delete tag',
      )
      throw error
    }
  }

  /**
   * Permanently delete tag
   */
  async hardDelete(id: number, userId: string): Promise<void> {
    this.logger.warn({ action: 'hard_delete_tag', tagId: id, userId }, 'Permanently deleting tag')

    try {
      const tag = await this.tagRepository.findById(id)

      if (!tag) {
        throw new NotFoundException(`Tag with ID ${id} not found`)
      }

      // Prevent deletion of system tags
      if (tag.isSystem) {
        throw new BadRequestException('Cannot delete system tags')
      }

      const deleted = await this.tagRepository.delete(id)

      if (!deleted) {
        throw new NotFoundException(`Tag with ID ${id} not found`)
      }

      this.logger.info(
        { action: 'hard_delete_tag', tagId: id, userId },
        'Tag permanently deleted',
      )
    } catch (error) {
      this.logger.error(
        { action: 'hard_delete_tag', tagId: id, userId, error: error.message },
        'Failed to permanently delete tag',
      )
      throw error
    }
  }
}
