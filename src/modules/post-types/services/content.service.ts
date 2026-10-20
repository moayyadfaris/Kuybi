import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { isUniqueViolation } from '@shared/utils/database-error.util'
import { slugify, uniqueSlug } from '@shared/utils/slug.util'

import { User } from '@modules/users/entities'

import { PostContent } from '../entities/post-content.entity'
import { PostType } from '../entities/post-type.entity'
import { ContentStatus } from '../enums/content-status.enum'
import { PostContentRepository } from '../repositories/post-content.repository'

import { ContentAccessPolicy } from './content-access.policy'
import { FieldDefinitionsService } from './field-definitions.service'
import { FieldValidationService } from './field-validation.service'
import { PostTypesService } from './post-types.service'

export interface ContentInput {
  title?: string
  excerpt?: string
  fieldData?: Record<string, unknown>
  status?: ContentStatus
  scheduledAt?: Date
}

/**
 * Entries of a post type: field_data validated against the type's field definitions,
 * the publishing workflow (draft, scheduled, published) and soft delete. Public readers
 * get published entries of active post types only (ContentAccessPolicy).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly postContentRepository: PostContentRepository,
    private readonly postTypesService: PostTypesService,
    private readonly fieldDefinitionsService: FieldDefinitionsService,
    private readonly fieldValidationService: FieldValidationService,
    private readonly accessPolicy: ContentAccessPolicy
  ) {}

  /** The post type behind a content route; an inactive one exists only for editors */
  async postTypeFor(slug: string, viewer?: User): Promise<PostType> {
    const postType = await this.postTypesService.findBySlug(slug)
    if (!postType.isActive && !this.accessPolicy.isEditor(viewer)) {
      throw new NotFoundException(`Post type with slug '${slug}' not found`)
    }
    return postType
  }

  async create(postType: PostType, data: ContentInput & { title: string }, author: User) {
    const status = data.status ?? ContentStatus.DRAFT
    this.accessPolicy.assertCanSetStatus(author, status)
    const fieldData = data.fieldData ?? {}
    await this.assertValidFieldData(postType.id, fieldData)

    // Generated slugs get a numeric suffix on collision (among live entries)
    const slug = await uniqueSlug(slugify(data.title, { fallback: 'content' }), candidate =>
      this.postContentRepository.slugExists(postType.id, candidate)
    )

    try {
      return await this.postContentRepository.save({
        postTypeId: postType.id,
        title: data.title,
        slug,
        excerpt: data.excerpt,
        fieldData,
        status,
        authorId: author.id,
        publishedAt: status === ContentStatus.PUBLISHED ? new Date() : undefined,
        scheduledAt: data.scheduledAt,
        createdBy: author.id
      })
    } catch (error) {
      // Another entry took the slug since the check
      if (isUniqueViolation(error)) throw new ConflictException('Slug already exists')
      throw error
    }
  }

  /** A page of entries with the total that matches the filters */
  async findAll(
    postTypeId: string,
    options: {
      status?: ContentStatus
      limit: number
      offset: number
      search?: string
      includeDeleted?: boolean
    }
  ): Promise<{ data: PostContent[]; total: number }> {
    const [data, total] = await this.postContentRepository.list(postTypeId, options)
    return { data, total }
  }

  /** A live entry of this post type, as the viewer may see it (404 otherwise) */
  async findVisible(postType: PostType, id: string, viewer?: User): Promise<PostContent> {
    return this.visible(await this.findOfType(postType, id), viewer)
  }

  async findVisibleBySlug(postType: PostType, slug: string, viewer?: User): Promise<PostContent> {
    const content = await this.postContentRepository.findBySlug(postType.id, slug)
    if (!content) throw new NotFoundException('Content not found')
    return this.visible(content, viewer)
  }

  /** A live entry of this post type, for changes (404 when missing or of another type) */
  async findOfType(postType: PostType, id: string): Promise<PostContent> {
    const content = await this.postContentRepository.findById(id)
    if (!content || content.deletedAt || content.postTypeId !== postType.id) {
      throw new NotFoundException('Content not found')
    }
    return content
  }

  /**
   * Changes the given fields. field_data is merged into the stored values: fields not sent
   * keep theirs, and values of fields removed from the post type are dropped.
   */
  async update(content: PostContent, data: ContentInput, editor: User): Promise<PostContent> {
    const changes: Partial<PostContent> = {}
    if (data.title !== undefined) changes.title = data.title
    if (data.excerpt !== undefined) changes.excerpt = data.excerpt
    if (data.scheduledAt !== undefined) changes.scheduledAt = data.scheduledAt

    if (data.status !== undefined && data.status !== content.status) {
      this.accessPolicy.assertCanSetStatus(editor, data.status)
      changes.status = data.status
      if (data.status === ContentStatus.PUBLISHED) changes.publishedAt = new Date()
    }

    if (data.fieldData) {
      const fields = await this.fieldDefinitionsService.findByPostType(content.postTypeId)
      const defined = new Set(fields.map(field => field.name))
      const kept = Object.fromEntries(
        Object.entries(content.fieldData ?? {}).filter(([name]) => defined.has(name))
      )
      changes.fieldData = { ...kept, ...data.fieldData }
      this.fieldValidationService.throwIfInvalid(
        await this.fieldValidationService.validateFieldData(fields, changes.fieldData)
      )
    }

    const updated = await this.postContentRepository.save({
      ...content,
      ...changes,
      updatedBy: editor.id,
      version: content.version + 1
    })
    return updated
  }

  /** Soft delete; the slug becomes free for a new entry */
  async remove(content: PostContent): Promise<void> {
    await this.postContentRepository.markDeleted(content.id)
  }

  async publish(content: PostContent): Promise<PostContent> {
    return this.postContentRepository.save({
      ...content,
      status: ContentStatus.PUBLISHED,
      publishedAt: new Date()
    })
  }

  /** Publishes at `scheduledFor` (ContentPublishingProcessor); needs Publish like publishing */
  async schedule(content: PostContent, scheduledFor: Date, editor: User): Promise<PostContent> {
    this.accessPolicy.assertCanSetStatus(editor, ContentStatus.SCHEDULED)
    if (scheduledFor <= new Date()) {
      throw new BadRequestException('Scheduled date must be in the future')
    }
    return this.postContentRepository.save({
      ...content,
      status: ContentStatus.SCHEDULED,
      scheduledAt: scheduledFor
    })
  }

  /** Publishes every scheduled entry whose time has come; returns how many */
  publishDue(now: Date): Promise<number> {
    return this.postContentRepository.publishScheduledBefore(now)
  }

  private visible(content: PostContent, viewer?: User): PostContent {
    if (content.status !== ContentStatus.PUBLISHED && !this.accessPolicy.isEditor(viewer)) {
      // Same answer as a missing entry: unpublished content does not exist publicly
      throw new NotFoundException('Content not found')
    }
    return content
  }

  private async assertValidFieldData(postTypeId: string, fieldData: Record<string, unknown>) {
    const fields = await this.fieldDefinitionsService.findByPostType(postTypeId)
    this.fieldValidationService.throwIfInvalid(
      await this.fieldValidationService.validateFieldData(fields, fieldData)
    )
  }
}
