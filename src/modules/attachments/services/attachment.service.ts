import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { errorMessage } from '@shared/utils/error.util'
import * as crypto from 'crypto'
import { PinoLogger } from 'nestjs-pino'

import { Action } from '@modules/acl'
import { User } from '@modules/users/entities'

import { OutboxService } from '@core/outbox'
import { AttachmentJobType, QueueName } from '@core/queues/jobs/types'

import {
  AttachmentQueryDto,
  AttachmentResponseDto,
  AttachmentStatsDto,
  PresignedUrlDto,
  PresignedUrlResponseDto,
  UpdateAttachmentDto,
  UploadAttachmentDto
} from '../dto'
import { Attachment } from '../entities/attachment.entity'
import { AttachmentRepository } from '../repositories/attachment.repository'
import {
  AttachmentMetadata,
  extractFormatFromMime,
  mapFormatToContentType,
  resolveExtensionFromFormat
} from '../utils/attachment-image.util'

import { AttachmentAccessPolicy } from './attachment-access.policy'
import { AttachmentPresenter } from './attachment-presenter'
import { AttachmentVisibilityService, storageKeys } from './attachment-visibility.service'
import { FileValidationService, MulterFile } from './file-validation.service'
import { ImagePipelineService, PreparedImage } from './image-pipeline.service'
import { S3Service } from './s3.service'

/**
 * Multipart uploads (images stripped and optimized in the request, or queued with
 * `async`), reads, downloads, metadata and visibility changes, deletes. Someone else's
 * private file, and any soft-deleted one, answers 404. Direct uploads are in
 * DirectUploadService.
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly attachmentRepository: AttachmentRepository,
    private readonly fileValidationService: FileValidationService,
    private readonly imagePipeline: ImagePipelineService,
    private readonly s3Service: S3Service,
    private readonly accessPolicy: AttachmentAccessPolicy,
    private readonly presenter: AttachmentPresenter,
    private readonly logger: PinoLogger,
    private readonly outbox: OutboxService,
    private readonly visibility: AttachmentVisibilityService
  ) {
    this.logger.setContext(AttachmentService.name)
  }

  async uploadAttachment(
    file: MulterFile,
    dto: UploadAttachmentDto,
    userId: string
  ): Promise<AttachmentResponseDto> {
    const validationResult = await this.fileValidationService.validateFile(file)
    if (!validationResult.isValid) {
      throw new BadRequestException('File validation failed: ' + validationResult.errors.join(', '))
    }
    // From here on use the content-verified type, never the client-declared one
    file.mimetype = validationResult.verifiedMimeType ?? file.mimetype

    const isPublic = this.visibility.resolveRequested(dto.category, dto.isPublic)
    const isImage = file.mimetype.startsWith('image/')

    // Images are stored only after metadata stripping: a failure rejects the upload
    // instead of storing the original (which still carries GPS location and camera data)
    let prepared: PreparedImage | undefined
    if (isImage) {
      try {
        prepared = await this.imagePipeline.prepare(file.buffer)
      } catch (error) {
        this.logger.error({ error: errorMessage(error) }, 'Image processing failed')
        throw new BadRequestException('The image could not be processed')
      }
    }
    const processedBuffer = prepared?.buffer ?? file.buffer
    const processedFormat = prepared?.format ?? extractFormatFromMime(file.mimetype)

    const checksum = crypto.createHash('sha256').update(processedBuffer).digest('hex')

    const duplicate = await this.findDuplicate(userId, checksum, dto, isPublic)
    if (duplicate) return duplicate

    const storageExtension = resolveExtensionFromFormat(
      processedFormat,
      file.mimetype,
      file.originalname
    )
    const storageKey = this.s3Service.generateKey(userId, file.originalname, dto.category, {
      extension: storageExtension
    })

    await this.s3Service.upload({
      key: storageKey,
      buffer: processedBuffer,
      contentType: prepared?.contentType ?? file.mimetype,
      isPublic
    })

    const { metadata, thumbnailPath } = prepared
      ? await this.imagePipeline.storeDerivatives(storageKey, prepared, isPublic, {
          generateThumbnails: dto.generateThumbnails !== false
        })
      : { metadata: {} as AttachmentMetadata, thumbnailPath: undefined }
    const storedMimeType = prepared?.contentType ?? file.mimetype

    const attachment = await this.attachmentRepository.create({
      userId,
      originalName: file.originalname,
      mimeType: storedMimeType,
      size: processedBuffer.length,
      path: storageKey,
      category: dto.category,
      description: dto.description,
      tags: dto.tags || [],
      isPublic,
      checksum,
      // Stored as final: an image was stripped and optimized above
      securityStatus: 'completed',
      thumbnailPath,
      metadata
    } as Partial<Attachment>)

    return this.presenter.present(attachment)
  }

  /**
   * Stores the upload now and processes an image in the worker: the row and its job are
   * written together (outbox), and the raw image stays private until processed
   */
  async uploadAttachmentAsync(
    file: MulterFile,
    dto: UploadAttachmentDto,
    userId: string
  ): Promise<AttachmentResponseDto> {
    const validationResult = await this.fileValidationService.validateFile(file)
    if (!validationResult.isValid) {
      throw new BadRequestException('File validation failed: ' + validationResult.errors.join(', '))
    }
    // From here on use the content-verified type, never the client-declared one
    file.mimetype = validationResult.verifiedMimeType ?? file.mimetype

    const isPublic = this.visibility.resolveRequested(dto.category, dto.isPublic)
    const isImage = file.mimetype.startsWith('image/')
    const processedFormat = isImage ? extractFormatFromMime(file.mimetype) : undefined
    const storageExtension = resolveExtensionFromFormat(
      processedFormat,
      file.mimetype,
      file.originalname
    )
    const storageKey = this.s3Service.generateKey(userId, file.originalname, dto.category, {
      extension: storageExtension
    })

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex')
    const duplicate = await this.findDuplicate(userId, checksum, dto, isPublic)
    if (duplicate) return duplicate

    const storedMimeType = isImage ? mapFormatToContentType(processedFormat) : file.mimetype

    // An image keeps its metadata (GPS location, camera) until the processor has
    // stripped it: store it private, and the processor applies the requested visibility
    // to the processed copy. Other files are final as uploaded.
    await this.s3Service.upload({
      key: storageKey,
      buffer: file.buffer,
      contentType: storedMimeType,
      isPublic: isImage ? false : isPublic
    })

    // The record and its processing job commit together: no attachment can be left
    // "processing" forever because the job was lost (or queued for a rolled-back row)
    const attachment = await this.attachmentRepository.transaction(async manager => {
      const attachment = await manager.save(
        manager.create(Attachment, {
          userId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          path: storageKey,
          category: dto.category,
          description: dto.description,
          tags: dto.tags || [],
          isPublic,
          checksum,
          // Only images have background processing; anything else is done now
          securityStatus: isImage ? 'processing' : 'completed',
          metadata: { processingStatus: isImage ? 'queued' : 'completed' }
        } as Partial<Attachment>)
      )
      if (isImage) {
        await this.outbox.enqueue(
          {
            queue: QueueName.ATTACHMENT_PROCESSING,
            name: AttachmentJobType.PROCESS_IMAGE,
            data: {
              attachmentId: attachment.id,
              s3Key: storageKey,
              originalName: file.originalname,
              userId,
              category: dto.category,
              isPublic,
              generateThumbnails: dto.generateThumbnails !== false
            },
            options: {
              priority: 5,
              attempts: 2
            }
          },
          manager
        )
      }
      return attachment
    })

    if (isImage) {
      this.logger.info({ attachmentId: attachment.id }, 'Image processing job queued')
    }

    return this.presenter.present(attachment)
  }

  /**
   * The user's existing upload with the same content, if duplicates are not allowed.
   * The uploader decides visibility again, so the existing file takes the requested one.
   */
  private async findDuplicate(
    userId: string,
    checksum: string,
    dto: UploadAttachmentDto,
    isPublic: boolean
  ): Promise<AttachmentResponseDto | null> {
    if (dto.allowDuplicates) return null
    const existing = await this.attachmentRepository.findByChecksum(userId, checksum)
    if (!existing || existing.deletedAt) return null

    this.logger.info(
      { checksum, userId, existingId: existing.id },
      'Duplicate upload detected, returning existing attachment'
    )
    return this.presenter.present(await this.visibility.setVisibility(existing, isPublic))
  }

  async getById(id: string, currentUser: User): Promise<AttachmentResponseDto> {
    return this.presenter.present(await this.findReadable(id, currentUser))
  }

  /**
   * A live attachment the user may read. Someone else's private file answers 404, not
   * 403, so its existence is not revealed.
   */
  private async findReadable(id: string, currentUser: User): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findLive(id)
    if (!attachment || !this.accessPolicy.can(currentUser, Action.Read, attachment)) {
      throw new NotFoundException('Attachment not found')
    }
    return attachment
  }

  /** A live attachment the user may change (404 when they may not even read it) */
  private async findChangeable(id: string, currentUser: User, action: Action): Promise<Attachment> {
    const attachment = await this.findReadable(id, currentUser)
    this.accessPolicy.assertCan(currentUser, action, attachment, 'Access denied')
    return attachment
  }

  /**
   * Files the user may read: their own and public ones, or everyone's for roles that may
   * read all files. Only the latter may include soft-deleted files.
   */
  async listAll(query: AttachmentQueryDto, currentUser: User, ownerId?: string) {
    const readsAll = this.accessPolicy.canReadAll(currentUser)
    const result = await this.attachmentRepository.listAll({
      userId: ownerId,
      visibleToUserId: readsAll ? undefined : currentUser.id,
      category: query.category,
      mimeType: query.mimeType,
      isPublic: query.isPublic,
      securityStatus: query.securityStatus,
      minSize: query.minSize,
      maxSize: query.maxSize,
      startDate: query.startDate,
      endDate: query.endDate,
      includeDeleted: readsAll && query.includeDeleted,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    })

    return {
      data: result.data.map(attachment => this.presenter.present(attachment)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.ceil(result.total / result.limit)
    }
  }

  /** One user's files: your own, or anyone's for roles that may read all files */
  async getUserAttachments(userId: string, query: AttachmentQueryDto, currentUser: User) {
    if (userId !== currentUser.id && !this.accessPolicy.canReadAll(currentUser)) {
      throw new ForbiddenException("You cannot list another user's attachments")
    }
    return this.listAll(query, currentUser, userId)
  }

  async updateMetadata(
    id: string,
    dto: UpdateAttachmentDto,
    currentUser: User
  ): Promise<AttachmentResponseDto> {
    const attachment = await this.findChangeable(id, currentUser, Action.Update)

    // Visibility changes the stored objects' ACLs too, not just the flag
    const { isPublic, ...fields } = dto
    let current = attachment
    if (isPublic !== undefined) {
      current = await this.visibility.setVisibility(attachment, isPublic)
    }
    if (Object.keys(fields).length > 0) {
      current = (await this.attachmentRepository.update(id, fields)) ?? current
    }
    return this.presenter.present(current)
  }

  async softDelete(id: string, currentUser: User) {
    await this.findChangeable(id, currentUser, Action.Delete)
    await this.visibility.softDelete(id)
    return { message: 'Attachment deleted successfully' }
  }

  /** Removes the row and every stored object (original, thumbnails, placeholder) */
  async hardDelete(id: string, currentUser: User) {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Delete, attachment, 'Access denied')

    await Promise.all(storageKeys(attachment).map(key => this.s3Service.delete(key)))
    await this.attachmentRepository.delete(id)
    return { message: 'Attachment permanently deleted' }
  }

  async restore(id: string, currentUser: User): Promise<AttachmentResponseDto> {
    const attachment = await this.attachmentRepository.findById(id)
    if (!attachment) throw new NotFoundException('Attachment not found')
    this.accessPolicy.assertCan(currentUser, Action.Restore, attachment, 'Access denied')

    await this.visibility.restore(id)
    return this.presenter.present({ ...attachment, deletedAt: null })
  }

  async generatePresignedUrl(
    id: string,
    dto: PresignedUrlDto,
    currentUser: User
  ): Promise<PresignedUrlResponseDto> {
    const attachment = await this.findReadable(id, currentUser)
    const expiresIn = dto.expiresIn || 3600

    const url = await this.s3Service.getPresignedUrl(
      attachment.path,
      expiresIn,
      dto.downloadFilename
    )
    await this.attachmentRepository.recordAccess(id)
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000), expiresIn }
  }

  getStatistics(): Promise<AttachmentStatsDto> {
    return this.attachmentRepository.getStatistics()
  }

  async downloadAttachment(id: string, currentUser: User) {
    const attachment = await this.findReadable(id, currentUser)
    const buffer = await this.s3Service.download(attachment.path)
    await this.attachmentRepository.recordAccess(id)
    return { buffer, attachment }
  }
}
