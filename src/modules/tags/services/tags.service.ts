import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { versionConflict } from '@shared/errors'
import { isUniqueViolation } from '@shared/utils/database-error.util'

import { CreateTagDto, UpdateTagDto } from '../dto'
import { Tag } from '../entities/tag.entity'
import { normalizeTagName, TagListOptions, TagRepository } from '../repositories/tag.repository'

/** Who is changing tags, and whether they may manage system tags (super-admins) */
export interface TagEditor {
  id: string
  managesSystemTags: boolean
}

/**
 * Tags: names unique among live tags (409 on a clash, however the name is cased or
 * spaced), soft delete, and system tags that only super-admins may create, change or
 * delete (others get 403).
 */
@Injectable()
export class TagsService {
  constructor(private readonly tagRepository: TagRepository) {}

  async create(dto: CreateTagDto, editor: TagEditor): Promise<Tag> {
    if (dto.isSystem) this.assertManagesSystemTags(editor)
    await this.assertNameFree(dto.name)
    return this.nameSafe(dto.name, () =>
      this.tagRepository.create({
        ...dto,
        createdBy: editor.id,
        sortOrder: dto.sortOrder ?? 0,
        isSystem: dto.isSystem ?? false
      })
    )
  }

  findAll(options: TagListOptions): Promise<Tag[]> {
    return this.tagRepository.list(options)
  }

  /** A live tag (404 when missing or deleted) */
  async findOne(id: number): Promise<Tag> {
    const tag = await this.tagRepository.findById(id)
    if (!tag || tag.deletedAt) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }
    return tag
  }

  findSystemTags(): Promise<Tag[]> {
    return this.tagRepository.findSystemTags()
  }

  async update(id: number, dto: UpdateTagDto, editor: TagEditor): Promise<Tag> {
    const tag = await this.findOne(id)
    if (tag.isSystem || dto.isSystem !== undefined) this.assertManagesSystemTags(editor)
    if (dto.name !== undefined && normalizeTagName(dto.name) !== tag.name) {
      await this.assertNameFree(dto.name)
    }

    const { version, ...changes } = dto
    const updated = await this.nameSafe(dto.name ?? tag.name, () =>
      this.tagRepository.updateIfVersion(id, version ?? tag.version, {
        ...changes,
        updatedBy: editor.id
      })
    )
    // Changed (or deleted) since it was read
    if (!updated) throw versionConflict('tag')
    return updated
  }

  /** Soft delete; stories keep their links but no longer show the tag */
  async remove(id: number, editor: TagEditor): Promise<void> {
    const tag = await this.findOne(id)
    if (tag.isSystem) this.assertManagesSystemTags(editor)
    await this.tagRepository.update(id, { deletedAt: new Date(), deletedBy: editor.id })
  }

  /** Permanent delete (also of a soft-deleted tag); stories' links to it go with it */
  async hardDelete(id: number, editor: TagEditor): Promise<void> {
    const tag = await this.tagRepository.findById(id, { bypassCache: true })
    if (!tag) {
      throw new NotFoundException(`Tag with ID ${id} not found`)
    }
    if (tag.isSystem) this.assertManagesSystemTags(editor)
    await this.tagRepository.delete(id)
  }

  private assertManagesSystemTags(editor: TagEditor): void {
    if (!editor.managesSystemTags) {
      throw new ForbiddenException('System tags are managed by super-admins')
    }
  }

  private async assertNameFree(name: string): Promise<void> {
    if (await this.tagRepository.findByName(name)) {
      throw new ConflictException(`Tag "${normalizeTagName(name)}" already exists`)
    }
  }

  /** Runs a write; a live tag taking the name meanwhile (unique index) answers 409 */
  private async nameSafe<R>(name: string, write: () => Promise<R>): Promise<R> {
    try {
      return await write()
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      throw new ConflictException(`Tag "${normalizeTagName(name)}" already exists`)
    }
  }
}
